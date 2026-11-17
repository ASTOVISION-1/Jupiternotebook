import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAllOutputs,
  createEmptyCell,
  createEmptyNotebook,
  deleteCell,
  extractMarkdownOutline,
  insertCell,
  moveCell,
  parseIpynb,
  serializeIpynb,
  toggleCellType,
  validateNotebookFilename,
} from './notebookLogic';

test('insertCell inserts at specified index and clamps bounds', () => {
  const initial = [createEmptyCell('code', 'x = 1')];
  const { cells: added, insertedId } = insertCell(initial, 1, 'markdown', '# Title');
  assert.equal(added.length, 2);
  assert.equal(added[1].id, insertedId);
  assert.equal(added[1].cell_type, 'markdown');
});

test('deleteCell keeps at least one empty cell when deleting the last cell', () => {
  const initial = [createEmptyCell('code', 'x = 1')];
  const next = deleteCell(initial, initial[0].id);
  assert.equal(next.length, 1);
  assert.equal(next[0].source, '');
});

test('moveCell swaps adjacent cells in the requested direction', () => {
  const c1 = createEmptyCell('code', 'first');
  const c2 = createEmptyCell('code', 'second');
  const movedUp = moveCell([c1, c2], c2.id, 'up');
  assert.equal(movedUp[0].id, c2.id);
  assert.equal(movedUp[1].id, c1.id);
  const unchanged = moveCell(movedUp, c2.id, 'up');
  assert.equal(unchanged[0].id, c2.id);
});

test('toggleCellType switches between code and markdown and clears outputs on markdown', () => {
  const c1 = createEmptyCell('code', 'print(1)');
  c1.execution_count = 3;
  c1.outputs = [{ output_type: 'stream', name: 'stdout', text: '1\n' }];
  const toggled = toggleCellType([c1], c1.id, 'markdown');
  assert.equal(toggled[0].cell_type, 'markdown');
  assert.equal(toggled[0].outputs.length, 0);
  assert.equal(toggled[0].execution_count, null);
});

test('serializeIpynb and parseIpynb round-trip notebook cells and outputs', () => {
  const doc = createEmptyNotebook('python');
  doc.cells[0].source = 'a = 42\na * 2';
  doc.cells[0].execution_count = 1;
  doc.cells[0].outputs = [
    {
      output_type: 'execute_result',
      execution_count: 1,
      data: { 'text/plain': '84' },
    },
  ];
  const json = serializeIpynb(doc);
  const parsed = parseIpynb(json);
  assert.equal(parsed.metadata.kernelspec.name, 'python');
  assert.equal(parsed.cells.length, 1);
  assert.equal(parsed.cells[0].source, 'a = 42\na * 2');
  assert.equal(parsed.cells[0].execution_count, 1);
  assert.equal(parsed.cells[0].outputs[0].output_type, 'execute_result');
});

test('extractMarkdownOutline ignores fenced code headings and extracts H1-H3', () => {
  const md = createEmptyCell(
    'markdown',
    '# Overview\n\n```bash\n# not a heading\n```\n\n## Metrics\n### Latency'
  );
  const outline = extractMarkdownOutline([md]);
  assert.equal(outline.length, 3);
  assert.deepEqual(
    outline.map((o) => ({ level: o.level, text: o.text })),
    [
      { level: 1, text: 'Overview' },
      { level: 2, text: 'Metrics' },
      { level: 3, text: 'Latency' },
    ]
  );
});

test('clearAllOutputs resets execution_count and outputs', () => {
  const c1 = createEmptyCell('code', '1+1');
  c1.execution_count = 1;
  c1.outputs = [{ output_type: 'stream', name: 'stdout', text: '2' }];
  const cleared = clearAllOutputs([c1]);
  assert.equal(cleared[0].execution_count, null);
  assert.equal(cleared[0].outputs.length, 0);
});

test('validateNotebookFilename rejects invalid names and appends .ipynb', () => {
  assert.equal(validateNotebookFilename('').valid, false);
  assert.equal(validateNotebookFilename('../secret').valid, false);
  assert.equal(validateNotebookFilename('bad name!').valid, false);
  const ok = validateNotebookFilename('analysis_01');
  assert.equal(ok.valid, true);
  assert.equal(ok.normalized, 'analysis_01.ipynb');
});
