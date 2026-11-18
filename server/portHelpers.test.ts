import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProcNetTcpListeningPorts,
  rewriteHtmlForProxy,
  validatePortNumber,
} from './portHelpers';

test('validatePortNumber validates 1..65535 and rejects port 3000 or invalid values', () => {
  assert.deepEqual(validatePortNumber('8000'), { valid: true, port: 8000 });
  assert.deepEqual(validatePortNumber(5173), { valid: true, port: 5173 });
  assert.equal(validatePortNumber(3000).valid, false);
  assert.equal(validatePortNumber(0).valid, false);
  assert.equal(validatePortNumber(70000).valid, false);
  assert.equal(validatePortNumber('abc').valid, false);
});

test('rewriteHtmlForProxy rewrites root-relative attributes without breaking protocol-relative URLs', () => {
  const input =
    '<link rel="stylesheet" href="/app.css"><script src="/main.js"></script><a href="//cdn.example.com/a">ext</a><img src="/p/8000/logo.png">';
  const out = rewriteHtmlForProxy(input, 8000);
  assert.ok(out.includes('href="/p/8000/app.css"'));
  assert.ok(out.includes('src="/p/8000/main.js"'));
  assert.ok(out.includes('href="//cdn.example.com/a"'));
  assert.ok(out.includes('src="/p/8000/logo.png"'));
});

test('parseProcNetTcpListeningPorts extracts TCP_LISTEN ports excluding 3000', () => {
  const sample = [
    '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
    '   0: 0100007F:1F40 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12345',
    '   1: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12346',
    '   2: 0100007F:1388 0100007F:9999 01 00000000:00000000 00:00000000 00000000  1000        0 12347',
  ].join('\n');
  // 1F40 = 8000 (0A listen), 0BB8 = 3000 (excluded), 1388 = 5000 (01 established, not listen)
  assert.deepEqual(parseProcNetTcpListeningPorts(sample), [8000]);
});
