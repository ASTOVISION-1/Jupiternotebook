export function validatePortNumber(raw: unknown): {
  valid: boolean;
  port?: number;
  error?: string;
} {
  const num =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
      ? Number.parseInt(raw.trim(), 10)
      : Number.NaN;

  if (!Number.isInteger(num) || num < 1 || num > 65535) {
    return { valid: false, error: 'Port must be an integer between 1 and 65535.' };
  }
  if (num === 3000) {
    return {
      valid: false,
      error: 'Port 3000 is reserved by the Jupiter Notebook server.',
    };
  }
  return { valid: true, port: num };
}

export function rewriteHtmlForProxy(html: string, port: number): string {
  const prefix = `/p/${port}`;
  // Rewrite root-relative src="/...", href="/...", action="/..." (but not "//..." or already "/p/<port>/")
  return html.replace(
    /\b(href|src|action)=(["'])\/(?!\/|p\/\d+\/)([^"']*)\2/gi,
    (_m, attr, quote, rest) => `${attr}=${quote}${prefix}/${rest}${quote}`
  );
}

export function parseProcNetTcpListeningPorts(content: string): number[] {
  const ports = new Set<number>();
  const lines = content.split('\n').slice(1); // skip header
  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4) continue;
    const localAddr = cols[1];
    const state = cols[3];
    // 0A = TCP_LISTEN
    if (state !== '0A' || !localAddr) continue;
    const parts = localAddr.split(':');
    const hexPort = parts[parts.length - 1];
    if (!hexPort) continue;
    const port = Number.parseInt(hexPort, 16);
    if (Number.isInteger(port) && port > 0 && port !== 3000) {
      ports.add(port);
    }
  }
  return Array.from(ports).sort((a, b) => a - b);
}
