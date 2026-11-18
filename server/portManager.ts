import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import type { Request, Response } from 'express';
import {
  parseProcNetTcpListeningPorts,
  rewriteHtmlForProxy,
  validatePortNumber,
} from './portHelpers';

export interface PortRegistration {
  port: number;
  label: string;
  publicEnabled: boolean;
  createdAt: string;
}

export interface PortStatusEntry extends PortRegistration {
  online: boolean;
  detected: boolean;
  localUrl: string;
  previewPath: string;
  publicUrl: string;
}

export class PortManager {
  private ports = new Map<number, PortRegistration>();

  registerPort(rawPort: unknown, label?: string, publicEnabled = true): PortRegistration {
    const check = validatePortNumber(rawPort);
    if (!check.valid || !check.port) {
      throw new Error(check.error || 'Invalid port.');
    }
    const existing = this.ports.get(check.port);
    const entry: PortRegistration = {
      port: check.port,
      label: (label?.trim() || existing?.label || `localhost:${check.port}`),
      publicEnabled,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    this.ports.set(check.port, entry);
    return entry;
  }

  setPublicEnabled(rawPort: unknown, publicEnabled: boolean): PortRegistration {
    const check = validatePortNumber(rawPort);
    if (!check.valid || !check.port) {
      throw new Error(check.error || 'Invalid port.');
    }
    const existing = this.ports.get(check.port);
    if (!existing) {
      return this.registerPort(check.port, undefined, publicEnabled);
    }
    const updated: PortRegistration = { ...existing, publicEnabled };
    this.ports.set(check.port, updated);
    return updated;
  }

  removePort(rawPort: unknown): boolean {
    const check = validatePortNumber(rawPort);
    if (!check.valid || !check.port) return false;
    return this.ports.delete(check.port);
  }

  getPort(port: number): PortRegistration | undefined {
    return this.ports.get(port);
  }

  probePort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(350);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, '127.0.0.1');
    });
  }

  detectListeningPorts(): number[] {
    const found = new Set<number>();
    for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
      try {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf-8');
          for (const p of parseProcNetTcpListeningPorts(content)) {
            found.add(p);
          }
        }
      } catch {
        // Ignore if /proc/net/tcp is unavailable
      }
    }
    return Array.from(found).sort((a, b) => a - b);
  }

  async listPorts(publicBaseUrl: string): Promise<PortStatusEntry[]> {
    const detectedSet = new Set<number>(this.detectListeningPorts());
    const allPortNumbers = new Set<number>([
      ...this.ports.keys(),
      ...detectedSet,
    ]);

    const sortedPorts = Array.from(allPortNumbers).sort((a, b) => a - b);
    const results = await Promise.all(
      sortedPorts.map(async (port) => {
        const reg = this.ports.get(port);
        const online = await this.probePort(port);
        const base = publicBaseUrl.replace(/\/$/, '');
        return {
          port,
          label: reg?.label ?? `localhost:${port}`,
          publicEnabled: reg?.publicEnabled ?? false,
          createdAt: reg?.createdAt ?? new Date().toISOString(),
          online,
          detected: detectedSet.has(port),
          localUrl: `http://localhost:${port}`,
          previewPath: `/preview/${port}/`,
          publicUrl: `${base}/p/${port}/`,
        };
      })
    );

    return results;
  }

  proxyRequest(
    port: number,
    mountPrefix: string,
    req: Request,
    res: Response,
    requirePublic: boolean
  ): void {
    const check = validatePortNumber(port);
    if (!check.valid) {
      res.status(400).send(`Invalid port: ${check.error}`);
      return;
    }

    if (requirePublic) {
      const reg = this.ports.get(port);
      if (!reg || !reg.publicEnabled) {
        res.status(403).type('html').send(
          `<!doctype html><html><body style="background:#0B0E14;color:#E6EDF3;font-family:sans-serif;padding:40px;">
            <h2>Port ${port} is not deployed publicly</h2>
            <p style="color:#8B949E;">Enable <strong>Deploy on Internet</strong> for <code>localhost:${port}</code> in Jupiter Notebook to expose this URL publicly.</p>
          </body></html>`
        );
        return;
      }
    }

    // Extract target path after /p/:port or /preview/:port
    const originalUrl = req.originalUrl || '/';
    const prefixRegex = new RegExp(`^${mountPrefix.replace(/\//g, '\\/')}(?=/|\\?|$)`);
    let targetPath = originalUrl.replace(prefixRegex, '');
    if (!targetPath || targetPath.startsWith('?')) {
      targetPath = '/' + targetPath;
    }

    const headers: Record<string, string | string[] | undefined> = {
      ...req.headers,
      host: `127.0.0.1:${port}`,
      'accept-encoding': 'identity',
    };

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: targetPath,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        const status = proxyRes.statusCode ?? 200;
        const outHeaders: Record<string, string | string[]> = {};
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (v === undefined) continue;
          const lower = k.toLowerCase();
          if (lower === 'x-frame-options' || lower === 'content-security-policy') {
            continue; // Allow embedding in Jupiter Web View iframe
          }
          if (lower === 'location' && typeof v === 'string') {
            if (v.startsWith('/')) {
              outHeaders[k] = `${mountPrefix}${v}`;
              continue;
            }
            const localPrefix = `http://localhost:${port}`;
            const loopbackPrefix = `http://127.0.0.1:${port}`;
            if (v.startsWith(localPrefix)) {
              outHeaders[k] = `${mountPrefix}${v.slice(localPrefix.length) || '/'}`;
              continue;
            }
            if (v.startsWith(loopbackPrefix)) {
              outHeaders[k] = `${mountPrefix}${v.slice(loopbackPrefix.length) || '/'}`;
              continue;
            }
          }
          outHeaders[k] = v;
        }

        const contentType = String(proxyRes.headers['content-type'] ?? '');
        if (contentType.includes('text/html')) {
          const chunks: Buffer[] = [];
          proxyRes.on('data', (c: Buffer) => chunks.push(c));
          proxyRes.on('end', () => {
            const rawHtml = Buffer.concat(chunks).toString('utf-8');
            const rewritten =
              mountPrefix === `/p/${port}`
                ? rewriteHtmlForProxy(rawHtml, port)
                : rawHtml.replace(
                    /\b(href|src|action)=(["'])\/(?!\/|preview\/\d+\/)([^"']*)\2/gi,
                    (_m, attr, quote, rest) =>
                      `${attr}=${quote}${mountPrefix}/${rest}${quote}`
                  );
            delete outHeaders['content-length'];
            res.writeHead(status, outHeaders);
            res.end(rewritten);
          });
          return;
        }

        res.writeHead(status, outHeaders);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.status(502).type('html').send(
          `<!doctype html><html><body style="background:#0B0E14;color:#E6EDF3;font-family:system-ui,sans-serif;padding:32px;line-height:1.5;">
            <h2 style="margin:0 0 8px 0;color:#F0F6FC;">Nothing listening on localhost:${port}</h2>
            <p style="color:#8B949E;margin:0 0 16px 0;">Start a server on port <code>${port}</code> in the Integrated Terminal or a notebook cell, then refresh Web View.</p>
            <pre style="background:#111620;border:1px solid rgba(255,255,255,0.1);padding:12px 16px;border-radius:6px;color:#93C5FD;font-family:monospace;">python3 -m http.server ${port}</pre>
          </body></html>`
        );
      }
    });

    const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());
    if (hasBody) {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  }
}
