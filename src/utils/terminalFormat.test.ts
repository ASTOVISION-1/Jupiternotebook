import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTerminalChunk, parseAnsiSegments } from './terminalFormat';

test('normalizeTerminalChunk resolves CRLF and carriage return overwrites', () => {
  assert.equal(normalizeTerminalChunk('line1\r\nline2'), 'line1\nline2');
  assert.equal(normalizeTerminalChunk('loading 10%\rloading 100%'), 'loading 100%');
});

test('parseAnsiSegments extracts colored and bold spans and resets cleanly', () => {
  const segs = parseAnsiSegments('\x1b[1;32mOK\x1b[0m plain \x1b[31mERR\x1b[0m');
  assert.deepEqual(segs, [
    { text: 'OK', colorClass: 'text-emerald-400', bold: true },
    { text: ' plain ', colorClass: undefined, bold: false },
    { text: 'ERR', colorClass: 'text-red-400', bold: false },
  ]);
});
