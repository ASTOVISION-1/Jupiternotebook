import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TerminalSessionInfo } from '../src/types/notebook';
import { buildUnrestrictedShellPrelude } from './kernelHelpers';

interface TerminalSession {
  id: string;
  title: string;
  cwd: string;
  env: Record<string, string>;
  busy: boolean;
  activeChild: ChildProcessWithoutNullStreams | null;
}

export interface StreamHandlers {
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
  onDone: (result: {
    exitCode: number;
    cwd: string;
    durationMs: number;
  }) => void;
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private rootDir: string;
  private counter = 0;
  private unrestricted = true;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
    this.createSession('Terminal 1');
  }

  setUnrestricted(allowAll: boolean): void {
    this.unrestricted = allowAll;
  }

  getUnrestricted(): boolean {
    return this.unrestricted;
  }

  listSessions(): TerminalSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      title: s.title,
      cwd: s.cwd,
      busy: s.busy,
    }));
  }

  createSession(customTitle?: string): TerminalSessionInfo {
    const num = ++this.counter;
    const id = `term-${num}`;
    const title = customTitle || `Terminal ${num}`;
    const baseEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) baseEnv[k] = v;
    }
    const session: TerminalSession = {
      id,
      title,
      cwd: this.rootDir,
      env: baseEnv,
      busy: false,
      activeChild: null,
    };
    this.sessions.set(id, session);
    return { id: session.id, title: session.title, cwd: session.cwd, busy: false };
  }

  closeSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    if (session.activeChild && !session.activeChild.killed) {
      session.activeChild.kill('SIGKILL');
    }
    this.sessions.delete(id);
    if (this.sessions.size === 0) {
      this.createSession('Terminal 1');
    }
    return true;
  }

  interruptSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    if (session.activeChild && !session.activeChild.killed) {
      session.activeChild.kill('SIGTERM');
      setTimeout(() => {
        if (session.activeChild && !session.activeChild.killed) {
          session.activeChild.kill('SIGKILL');
        }
      }, 400);
      return true;
    }
    return false;
  }

  sendInput(id: string, input: string, eof = false): boolean {
    const session = this.sessions.get(id);
    if (!session || !session.activeChild || session.activeChild.killed) {
      return false;
    }
    try {
      if (input.length > 0) {
        session.activeChild.stdin.write(input + '\n');
      } else if (!eof) {
        session.activeChild.stdin.write('\n');
      }
      if (eof) {
        session.activeChild.stdin.end();
      }
      return true;
    } catch {
      return false;
    }
  }

  executeStream(id: string, command: string, handlers: StreamHandlers): () => void {
    let session = this.sessions.get(id);
    if (!session) {
      const created = this.createSession();
      session = this.sessions.get(created.id)!;
    }

    const start = Date.now();
    session.busy = true;

    const metaFile = path.join(
      os.tmpdir(),
      `jupiter-term-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.meta`
    );

    const wrappedScript = `${buildUnrestrictedShellPrelude()}
${command}
__ec=$?
{
  printf "%s\\0" "$PWD"
  env -0
} > "${metaFile}" 2>/dev/null
exit $__ec`;

    const localBin = path.join(session.cwd, 'node_modules', '.bin');
    const basePath = session.env.PATH || process.env.PATH || '/usr/local/bin:/usr/bin:/bin';
    const fullPath = basePath.includes(localBin) ? basePath : `${localBin}:${basePath}`;

    const child = spawn('bash', ['-c', wrappedScript], {
      cwd: session.cwd,
      env: {
        DEBIAN_FRONTEND: 'noninteractive',
        APT_LISTCHANGES_FRONTEND: 'none',
        NEEDRESTART_MODE: 'a',
        ...session.env,
        PATH: fullPath,
        PYTHONUNBUFFERED: '1',
        TERM: 'xterm-256color',
        FORCE_COLOR: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    session.activeChild = child;

    let finished = false;
    let exitDrainTimer: NodeJS.Timeout | null = null;
    let exitCodeCaptured: number | null = null;

    const onStdout = (rawChunk: Buffer | string) => {
      if (!finished) handlers.onStdout(String(rawChunk));
    };
    const onStderr = (rawChunk: Buffer | string) => {
      if (!finished) handlers.onStderr(String(rawChunk));
    };

    const finalize = (code: number) => {
      if (finished) return;
      finished = true;
      if (exitDrainTimer) {
        clearTimeout(exitDrainTimer);
        exitDrainTimer = null;
      }
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);

      session!.activeChild = null;
      session!.busy = false;

      let nextCwd = session!.cwd;
      try {
        if (fs.existsSync(metaFile)) {
          const rawMeta = fs.readFileSync(metaFile, 'utf-8');
          fs.unlinkSync(metaFile);
          const parts = rawMeta.split('\0');
          const candidateCwd = parts[0]?.trim();
          if (candidateCwd && fs.existsSync(candidateCwd)) {
            const resolvedCandidate = path.resolve(candidateCwd);
            const allowed =
              this.unrestricted ||
              resolvedCandidate === this.rootDir ||
              resolvedCandidate.startsWith(this.rootDir + path.sep);
            if (allowed) {
              nextCwd = resolvedCandidate;
              session!.cwd = resolvedCandidate;
            } else {
              handlers.onStderr('Restricted mode: directory change outside workspace reverted.\n');
            }
          }

          const nextEnv: Record<string, string> = {};
          for (const entry of parts.slice(1)) {
            const eq = entry.indexOf('=');
            if (eq > 0) {
              const k = entry.slice(0, eq);
              const v = entry.slice(eq + 1);
              if (k !== '_' && k !== 'SHLVL') {
                nextEnv[k] = v;
              }
            }
          }
          if (Object.keys(nextEnv).length > 0) {
            session!.env = nextEnv;
          }
        }
      } catch {
        // Ignore meta cleanup failures
      }

      handlers.onDone({
        exitCode: code,
        cwd: nextCwd,
        durationMs: Date.now() - start,
      });
    };

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);

    child.on('exit', (code) => {
      exitCodeCaptured = code ?? 0;
      if (!finished && !exitDrainTimer) {
        // Allow stdout/stderr pipes to flush, while ensuring backgrounded `&` children don't hang the prompt
        exitDrainTimer = setTimeout(() => {
          finalize(exitCodeCaptured ?? 0);
        }, 120);
      }
    });

    child.on('close', (code) => {
      finalize(code ?? exitCodeCaptured ?? 0);
    });

    return () => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    };
  }

  async execute(
    id: string,
    command: string
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    cwd: string;
    durationMs: number;
  }> {
    let stdout = '';
    let stderr = '';
    return new Promise((resolve) => {
      this.executeStream(id, command, {
        onStdout: (chunk) => {
          stdout += chunk;
        },
        onStderr: (chunk) => {
          stderr += chunk;
        },
        onDone: (res) => {
          resolve({
            stdout,
            stderr,
            exitCode: res.exitCode,
            cwd: res.cwd,
            durationMs: res.durationMs,
          });
        },
      });
    });
  }

  complete(id: string, prefix: string): string[] {
    const session = this.sessions.get(id);
    const cwd = session ? session.cwd : this.rootDir;
    const token = prefix.trim().split(/\s+/).pop() ?? '';
    try {
      const dirPart = token.includes('/') ? path.dirname(token) : '.';
      const basePart = token.includes('/') ? path.basename(token) : token;
      const searchDir = path.resolve(cwd, dirPart);
      const entries = fs.readdirSync(searchDir, { withFileTypes: true });
      return entries
        .filter((e) => e.name.startsWith(basePart))
        .slice(0, 12)
        .map((e) => {
          const joined = dirPart === '.' ? e.name : `${dirPart}/${e.name}`;
          return e.isDirectory() ? `${joined}/` : joined;
        });
    } catch {
      return [];
    }
  }
}
