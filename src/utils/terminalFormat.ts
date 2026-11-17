export interface AnsiSegment {
  text: string;
  colorClass?: string;
  bold?: boolean;
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: 'text-[#6E7681]',
  31: 'text-red-400',
  32: 'text-emerald-400',
  33: 'text-amber-300',
  34: 'text-blue-400',
  35: 'text-purple-400',
  36: 'text-cyan-400',
  37: 'text-[#E6EDF3]',
  90: 'text-[#8B949E]',
  91: 'text-red-300',
  92: 'text-emerald-300',
  93: 'text-amber-200',
  94: 'text-blue-300',
  95: 'text-purple-300',
  96: 'text-cyan-300',
  97: 'text-white',
};

export function normalizeTerminalChunk(chunk: string): string {
  // Normalize CRLF -> LF, and handle lone carriage returns (\r) overwriting the current line
  const crlfNormalized = chunk.replace(/\r\n/g, '\n');
  const lines = crlfNormalized.split('\n');
  const resolved = lines.map((line) => {
    if (!line.includes('\r')) return line;
    const parts = line.split('\r');
    return parts[parts.length - 1];
  });
  return resolved.join('\n');
}

export function parseAnsiSegments(input: string): AnsiSegment[] {
  const cleaned = normalizeTerminalChunk(input);
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  const segments: AnsiSegment[] = [];

  let lastIdx = 0;
  let colorClass: string | undefined;
  let bold = false;
  let match: RegExpExecArray | null;

  while ((match = ansiRegex.exec(cleaned)) !== null) {
    if (match.index > lastIdx) {
      segments.push({
        text: cleaned.slice(lastIdx, match.index),
        colorClass,
        bold,
      });
    }

    const codes = (match[1] || '0')
      .split(';')
      .map((c) => Number.parseInt(c || '0', 10));

    for (const code of codes) {
      if (code === 0) {
        colorClass = undefined;
        bold = false;
      } else if (code === 1) {
        bold = true;
      } else if (code === 22) {
        bold = false;
      } else if (code === 39) {
        colorClass = undefined;
      } else if (ANSI_COLOR_MAP[code]) {
        colorClass = ANSI_COLOR_MAP[code];
      }
    }

    lastIdx = ansiRegex.lastIndex;
  }

  if (lastIdx < cleaned.length) {
    segments.push({
      text: cleaned.slice(lastIdx),
      colorClass,
      bold,
    });
  }

  return segments.filter((s) => s.text.length > 0);
}
