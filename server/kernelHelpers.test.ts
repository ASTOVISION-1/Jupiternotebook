import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  parseCellMagic,
  resolveCommandTargetPath,
  resolveSafeWorkspacePath,
} from './kernelHelpers';

test('parseCellMagic recognizes bash, shell, cd, env, pip, writefile, who, reset, time, and plain code', () => {
  assert.deepEqual(parseCellMagic('%%bash\nls -la'), {
    kind: 'bash_cell',
    script: 'ls -la',
  });
  assert.deepEqual(parseCellMagic('%%shell\necho hi'), {
    kind: 'bash_cell',
    script: 'echo hi',
  });
  assert.deepEqual(parseCellMagic('%cd /tmp'), {
    kind: 'cd',
    target: '/tmp',
  });
  assert.deepEqual(parseCellMagic('%env API_MODE=dev'), {
    kind: 'env',
    assignment: { key: 'API_MODE', value: 'dev' },
  });
  assert.deepEqual(parseCellMagic('%pip list'), {
    kind: 'pip',
    args: 'list',
  });
  assert.deepEqual(parseCellMagic('%%writefile helper.py\nprint(1)'), {
    kind: 'writefile',
    filename: 'helper.py',
    content: 'print(1)',
  });
  assert.deepEqual(parseCellMagic('!pwd\nx = 1'), {
    kind: 'bash_line',
    command: 'pwd',
    remainingCode: 'x = 1',
  });
  assert.deepEqual(parseCellMagic('%who'), { kind: 'who' });
  assert.deepEqual(parseCellMagic('%reset'), { kind: 'reset' });
  assert.deepEqual(parseCellMagic('%time sum(range(100))'), {
    kind: 'time_line',
    code: 'sum(range(100))',
  });
  assert.deepEqual(parseCellMagic('x = 10\nx + 5'), {
    kind: 'code',
    code: 'x = 10\nx + 5',
  });
});

test('resolveSafeWorkspacePath blocks directory traversal', () => {
  const root = '/tmp/jupiter-workspace';
  const safe = resolveSafeWorkspacePath(root, 'demo.ipynb');
  assert.equal(safe, path.resolve(root, 'demo.ipynb'));
  assert.throws(() => resolveSafeWorkspacePath(root, '../../etc/passwd'));
});

test('resolveCommandTargetPath allows arbitrary paths when unrestricted and restricts when sandboxed', () => {
  const root = '/tmp/jupiter-workspace';
  assert.equal(
    resolveCommandTargetPath(root, '../other', true, root),
    path.resolve('/tmp/other')
  );
  assert.throws(() => resolveCommandTargetPath(root, '../other', false, root));
});

test('parseCellMagic supports single-line %bash, %sh, %npx, %sudo, %su, and %apt magics', () => {
  assert.deepEqual(parseCellMagic('%bash echo ok'), {
    kind: 'bash_line',
    command: 'echo ok',
    remainingCode: '',
  });
  assert.deepEqual(parseCellMagic('%sh pwd\n!ls'), {
    kind: 'bash_line',
    command: 'pwd',
    remainingCode: '!ls',
  });
  assert.deepEqual(parseCellMagic('%npx tsx -v'), {
    kind: 'npx',
    args: 'tsx -v',
  });
  assert.deepEqual(parseCellMagic('%apt update'), {
    kind: 'bash_line',
    command: 'apt update',
    remainingCode: '',
  });
  assert.deepEqual(parseCellMagic('%su -c id'), {
    kind: 'bash_line',
    command: 'su -c id',
    remainingCode: '',
  });
});

