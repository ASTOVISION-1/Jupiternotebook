import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { CellOutput, KernelLanguage, KernelVariable } from '../src/types/notebook';
import {
  buildUnrestrictedShellPrelude,
  parseCellMagic,
  resolveCommandTargetPath,
} from './kernelHelpers';

interface PendingRequest {
  resolve: (value: { outputs?: CellOutput[]; variables?: KernelVariable[] }) => void;
  reject: (err: Error) => void;
  timer?: NodeJS.Timeout;
}

class KernelProcess {
  readonly language: KernelLanguage;
  readonly workspaceDir: string;
  private cwd: string;
  private envOverrides: Record<string, string> = {};
  private proc: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingRequest>();
  private executionCount = 0;
  private busy = false;
  private reqCounter = 0;
  private isUnrestricted: () => boolean;

  constructor(
    language: KernelLanguage,
    workspaceDir: string,
    isUnrestricted: () => boolean
  ) {
    this.language = language;
    this.workspaceDir = workspaceDir;
    this.cwd = workspaceDir;
    this.isUnrestricted = isUnrestricted;
    this.spawnWorker();
  }

  private spawnWorker() {
    const workerScript =
      this.language === 'python'
        ? path.resolve(process.cwd(), 'server/workers/python_kernel.py')
        : path.resolve(process.cwd(), 'server/workers/node_kernel.mjs');
    const cmd = this.language === 'python' ? 'python3' : 'node';
    const args = this.language === 'python' ? ['-u', workerScript] : [workerScript];

    const child = spawn(cmd, args, {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.envOverrides, PYTHONUNBUFFERED: '1' },
    });

    const rl = readline.createInterface({ input: child.stdout, terminal: false });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as {
          id?: string;
          ok?: boolean;
          outputs?: CellOutput[];
          variables?: KernelVariable[];
          error?: string;
        };
        if (msg.id && this.pending.has(msg.id)) {
          const entry = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (entry.timer) clearTimeout(entry.timer);
          if (msg.ok) {
            entry.resolve({ outputs: msg.outputs, variables: msg.variables });
          } else {
            entry.reject(new Error(msg.error || 'Kernel error'));
          }
        }
      } catch {
        // Ignore malformed worker output lines
      }
    });

    child.on('exit', () => {
      for (const [id, entry] of this.pending.entries()) {
        if (entry.timer) clearTimeout(entry.timer);
        entry.reject(new Error('Kernel process exited or was interrupted.'));
        this.pending.delete(id);
      }
      if (this.proc === child) {
        this.proc = null;
      }
    });

    this.proc = child;
  }

  private ensureRunning() {
    if (!this.proc || this.proc.killed) {
      this.spawnWorker();
    }
  }

  private sendRequest(
    action: 'exec' | 'vars' | 'reset',
    payload: Record<string, unknown> = {},
    timeoutMs?: number
  ): Promise<{ outputs?: CellOutput[]; variables?: KernelVariable[] }> {
    this.ensureRunning();
    return new Promise((resolve, reject) => {
      const id = `req-${++this.reqCounter}`;
      const timer =
        typeof timeoutMs === 'number' && timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id);
              reject(new Error(`Execution timed out after ${Math.round(timeoutMs / 1000)}s.`));
            }, timeoutMs)
          : undefined;

      this.pending.set(id, { resolve, reject, timer });
      try {
        this.proc!.stdin.write(JSON.stringify({ id, action, ...payload }) + '\n');
      } catch (err) {
        if (timer) clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private runShell(command: string): Promise<CellOutput[]> {
    return new Promise((resolve) => {
      const localBin = path.join(this.cwd, 'node_modules', '.bin');
      const basePath = this.envOverrides.PATH || process.env.PATH || '/usr/local/bin:/usr/bin:/bin';
      const fullPath = basePath.includes(localBin) ? basePath : `${localBin}:${basePath}`;
      const script = `${buildUnrestrictedShellPrelude()}\n${command}`;

      const child = spawn('bash', ['-c', script], {
        cwd: this.cwd,
        env: {
          DEBIAN_FRONTEND: 'noninteractive',
          APT_LISTCHANGES_FRONTEND: 'none',
          NEEDRESTART_MODE: 'a',
          ...process.env,
          ...this.envOverrides,
          PATH: fullPath,
        },
      });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('close', (code) => {
        const outputs: CellOutput[] = [];
        if (stdout) outputs.push({ output_type: 'stream', name: 'stdout', text: stdout });
        if (stderr) outputs.push({ output_type: 'stream', name: 'stderr', text: stderr });
        if (code && code !== 0) {
          outputs.push({
            output_type: 'stream',
            name: 'stderr',
            text: `Process exited with status ${code}\n`,
          });
        }
        resolve(outputs);
      });
    });
  }

  async execute(rawCode: string): Promise<{
    outputs: CellOutput[];
    executionCount: number;
    executionTimeMs: number;
  }> {
    this.busy = true;
    const start = Date.now();
    this.executionCount += 1;
    const execNum = this.executionCount;

    try {
      const outputs = await this.executeInner(rawCode, execNum);

      const finalOutputs = outputs.map((o) =>
        o.output_type === 'execute_result' ? { ...o, execution_count: execNum } : o
      );

      return {
        outputs: finalOutputs,
        executionCount: execNum,
        executionTimeMs: Date.now() - start,
      };
    } catch (err) {
      return {
        outputs: [
          {
            output_type: 'error',
            ename: 'KernelError',
            evalue: err instanceof Error ? err.message : String(err),
            traceback: [err instanceof Error ? err.message : String(err)],
          },
        ],
        executionCount: execNum,
        executionTimeMs: Date.now() - start,
      };
    } finally {
      this.busy = false;
    }
  }

  private async executeInner(rawCode: string, execNum: number): Promise<CellOutput[]> {
    const magic = parseCellMagic(rawCode);
    let outputs: CellOutput[] = [];

    if (magic.kind === 'bash_cell') {
      outputs = await this.runShell(magic.script);
    } else if (magic.kind === 'bash_line') {
      const shellOutputs = await this.runShell(magic.command);
      outputs.push(...shellOutputs);
      if (magic.remainingCode.trim()) {
        const more = await this.executeInner(magic.remainingCode, execNum);
        outputs.push(...more);
      }
    } else if (magic.kind === 'pwd') {
      outputs.push({
        output_type: 'execute_result',
        execution_count: execNum,
        data: { 'text/plain': JSON.stringify(this.cwd) },
      });
      } else if (magic.kind === 'cd') {
        const target = magic.target || this.workspaceDir;
        const resolved = resolveCommandTargetPath(
          this.cwd,
          target,
          this.isUnrestricted(),
          this.workspaceDir
        );
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
          throw new Error(`No such directory: ${resolved}`);
        }
        this.cwd = resolved;
        const syncCode =
          this.language === 'python'
            ? `import os as __nb_os; __nb_os.chdir(${JSON.stringify(resolved)})`
            : `process.chdir(${JSON.stringify(resolved)})`;
        await this.sendRequest('exec', { code: syncCode });
        outputs.push({
          output_type: 'stream',
          name: 'stdout',
          text: `${resolved}\n`,
        });
      } else if (magic.kind === 'env') {
        if (magic.assignment) {
          const { key, value } = magic.assignment;
          this.envOverrides[key] = value;
          const syncCode =
            this.language === 'python'
              ? `import os as __nb_os; __nb_os.environ[${JSON.stringify(key)}] = ${JSON.stringify(value)}`
              : `process.env[${JSON.stringify(key)}] = ${JSON.stringify(value)}`;
          await this.sendRequest('exec', { code: syncCode });
          outputs.push({
            output_type: 'stream',
            name: 'stdout',
            text: `env: ${key}=${value}\n`,
          });
        } else {
          const combined = { ...process.env, ...this.envOverrides };
          const text = Object.keys(combined)
            .sort()
            .map((k) => `${k}=${combined[k] ?? ''}`)
            .join('\n');
          outputs.push({
            output_type: 'stream',
            name: 'stdout',
            text: text + '\n',
          });
        }
      } else if (magic.kind === 'pip') {
        outputs = await this.runShell(`python3 -m pip ${magic.args}`.trim());
      } else if (magic.kind === 'npm') {
        outputs = await this.runShell(`npm ${magic.args}`.trim());
      } else if (magic.kind === 'npx') {
        outputs = await this.runShell(`npx ${magic.args}`.trim());
      } else if (magic.kind === 'writefile') {
        if (!magic.filename) {
          throw new Error('Usage: %%writefile <filename>');
        }
        const resolved = resolveCommandTargetPath(
          this.cwd,
          magic.filename,
          this.isUnrestricted(),
          this.workspaceDir
        );
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, magic.content, 'utf-8');
        outputs.push({
          output_type: 'stream',
          name: 'stdout',
          text: `Writing ${resolved}\n`,
        });
      } else if (magic.kind === 'ls') {
        outputs = await this.runShell(`ls -la ${magic.args}`.trim());
      } else if (magic.kind === 'reset') {
        await this.sendRequest('reset');
        outputs.push({
          output_type: 'stream',
          name: 'stdout',
          text: 'Kernel namespace cleared.\n',
        });
      } else if (magic.kind === 'who') {
        const res = await this.sendRequest('vars');
        const vars = res.variables ?? [];
        if (vars.length === 0) {
          outputs.push({
            output_type: 'stream',
            name: 'stdout',
            text: 'Interactive namespace is empty.\n',
          });
        } else {
          const lines = vars.map(
            (v) => `${v.name.padEnd(18)} ${v.type.padEnd(12)} ${v.valuePreview}`
          );
          outputs.push({
            output_type: 'stream',
            name: 'stdout',
            text: `${'Variable'.padEnd(18)} ${'Type'.padEnd(12)} Value\n${'-'.repeat(56)}\n${lines.join('\n')}\n`,
          });
        }
      } else if (magic.kind === 'time_cell' || magic.kind === 'time_line') {
        const t0 = performance.now();
        const res = await this.sendRequest('exec', { code: magic.code });
        const elapsed = performance.now() - t0;
        outputs.push({
          output_type: 'stream',
          name: 'stdout',
          text: `Wall time: ${elapsed.toFixed(2)} ms\n`,
        });
        outputs.push(...(res.outputs ?? []));
      } else {
        const res = await this.sendRequest('exec', { code: magic.code });
        outputs = res.outputs ?? [];
      }

      return outputs;
    }

  async getVariables(): Promise<KernelVariable[]> {
    try {
      const res = await this.sendRequest('vars', {}, 5000);
      return res.variables ?? [];
    } catch {
      return [];
    }
  }

  async restart(): Promise<void> {
    if (this.proc && !this.proc.killed) {
      this.proc.kill('SIGKILL');
    }
    this.proc = null;
    this.executionCount = 0;
    this.busy = false;
    this.spawnWorker();
  }

  async interrupt(): Promise<void> {
    if (this.proc && !this.proc.killed) {
      this.proc.kill('SIGKILL');
    }
    this.proc = null;
    this.busy = false;
    this.spawnWorker();
  }

  isBusy(): boolean {
    return this.busy;
  }
}

export class KernelManager {
  private kernels = new Map<string, KernelProcess>();
  private workspaceDir: string;
  private unrestricted = true;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  setUnrestricted(allowAll: boolean): void {
    this.unrestricted = allowAll;
  }

  getUnrestricted(): boolean {
    return this.unrestricted;
  }

  private key(notebookName: string, language: KernelLanguage): string {
    return `${notebookName}::${language}`;
  }

  getKernel(notebookName: string, language: KernelLanguage): KernelProcess {
    const k = this.key(notebookName, language);
    let proc = this.kernels.get(k);
    if (!proc) {
      proc = new KernelProcess(language, this.workspaceDir, () => this.unrestricted);
      this.kernels.set(k, proc);
    }
    return proc;
  }

  async restartKernel(notebookName: string, language: KernelLanguage): Promise<void> {
    const k = this.key(notebookName, language);
    const proc = this.kernels.get(k);
    if (proc) {
      await proc.restart();
    } else {
      this.kernels.set(
        k,
        new KernelProcess(language, this.workspaceDir, () => this.unrestricted)
      );
    }
  }

  async interruptKernel(notebookName: string, language: KernelLanguage): Promise<void> {
    const k = this.key(notebookName, language);
    const proc = this.kernels.get(k);
    if (proc) {
      await proc.interrupt();
    }
  }
}
