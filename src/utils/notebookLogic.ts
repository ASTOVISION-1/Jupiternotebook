import type {
  CellOutput,
  CellType,
  KernelLanguage,
  NotebookCellData,
  NotebookDocument,
  OutlineItem,
} from '../types/notebook';

export function createCellId(): string {
  return `cell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createEmptyCell(cellType: CellType = 'code', source = ''): NotebookCellData {
  return {
    id: createCellId(),
    cell_type: cellType,
    source,
    execution_count: null,
    outputs: [],
    execution_time_ms: null,
    metadata: {},
  };
}

export function createEmptyNotebook(kernel: KernelLanguage = 'python'): NotebookDocument {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        name: kernel,
        display_name: kernel === 'python' ? 'Python 3.10' : 'Node.js 22',
        language: kernel === 'python' ? 'python' : 'javascript',
      },
      language_info: {
        name: kernel === 'python' ? 'python' : 'javascript',
        version: kernel === 'python' ? '3.10' : '22',
      },
    },
    cells: [createEmptyCell('code', '')],
  };
}

export function insertCell(
  cells: NotebookCellData[],
  index: number,
  cellType: CellType = 'code',
  source = ''
): { cells: NotebookCellData[]; insertedId: string } {
  const newCell = createEmptyCell(cellType, source);
  const clamped = Math.max(0, Math.min(index, cells.length));
  const next = [...cells.slice(0, clamped), newCell, ...cells.slice(clamped)];
  return { cells: next, insertedId: newCell.id };
}

export function deleteCell(cells: NotebookCellData[], cellId: string): NotebookCellData[] {
  const filtered = cells.filter((c) => c.id !== cellId);
  if (filtered.length === 0) {
    return [createEmptyCell('code', '')];
  }
  return filtered;
}

export function moveCell(
  cells: NotebookCellData[],
  cellId: string,
  direction: 'up' | 'down'
): NotebookCellData[] {
  const idx = cells.findIndex((c) => c.id === cellId);
  if (idx === -1) return cells;
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= cells.length) return cells;
  const copy = [...cells];
  const [item] = copy.splice(idx, 1);
  copy.splice(targetIdx, 0, item);
  return copy;
}

export function toggleCellType(
  cells: NotebookCellData[],
  cellId: string,
  targetType?: CellType
): NotebookCellData[] {
  return cells.map((cell) => {
    if (cell.id !== cellId) return cell;
    const nextType: CellType =
      targetType ?? (cell.cell_type === 'code' ? 'markdown' : 'code');
    if (nextType === cell.cell_type) return cell;
    return {
      ...cell,
      cell_type: nextType,
      outputs: nextType === 'markdown' ? [] : cell.outputs,
      execution_count: nextType === 'markdown' ? null : cell.execution_count,
    };
  });
}

export function updateCellSource(
  cells: NotebookCellData[],
  cellId: string,
  source: string
): NotebookCellData[] {
  return cells.map((cell) => (cell.id === cellId ? { ...cell, source } : cell));
}

export function updateCellExecutionResult(
  cells: NotebookCellData[],
  cellId: string,
  outputs: CellOutput[],
  executionCount: number | null,
  executionTimeMs: number | null
): NotebookCellData[] {
  return cells.map((cell) =>
    cell.id === cellId
      ? {
          ...cell,
          outputs,
          execution_count: executionCount,
          execution_time_ms: executionTimeMs,
        }
      : cell
  );
}

export function clearCellOutput(cells: NotebookCellData[], cellId: string): NotebookCellData[] {
  return cells.map((cell) =>
    cell.id === cellId
      ? { ...cell, outputs: [], execution_count: null, execution_time_ms: null }
      : cell
  );
}

export function clearAllOutputs(cells: NotebookCellData[]): NotebookCellData[] {
  return cells.map((cell) => ({
    ...cell,
    outputs: [],
    execution_count: null,
    execution_time_ms: null,
  }));
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function extractMarkdownOutline(cells: NotebookCellData[]): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const cell of cells) {
    if (cell.cell_type !== 'markdown') continue;
    const lines = cell.source.split('\n');
    let inFence = false;
    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
      if (match) {
        const level = match[1].length as 1 | 2 | 3;
        const text = match[2].replace(/[*_`]/g, '').trim();
        if (text) {
          items.push({
            cellId: cell.id,
            level,
            text,
            anchorId: `${cell.id}-${slugifyHeading(text)}`,
          });
        }
      }
    }
  }
  return items;
}

function joinSourceField(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map((line) => String(line)).join('');
  return '';
}

function normalizeOutputs(rawOutputs: unknown): CellOutput[] {
  if (!Array.isArray(rawOutputs)) return [];
  const normalized: CellOutput[] = [];
  for (const out of rawOutputs) {
    if (!out || typeof out !== 'object') continue;
    const rec = out as Record<string, unknown>;
    if (rec.output_type === 'stream') {
      normalized.push({
        output_type: 'stream',
        name: rec.name === 'stderr' ? 'stderr' : 'stdout',
        text: joinSourceField(rec.text),
      });
    } else if (rec.output_type === 'execute_result' || rec.output_type === 'display_data') {
      const dataObj = (rec.data && typeof rec.data === 'object' ? rec.data : {}) as Record<
        string,
        unknown
      >;
      normalized.push({
        output_type: rec.output_type,
        execution_count:
          typeof rec.execution_count === 'number' ? rec.execution_count : null,
        data: {
          'text/plain':
            dataObj['text/plain'] !== undefined
              ? joinSourceField(dataObj['text/plain'])
              : undefined,
          'text/html':
            dataObj['text/html'] !== undefined
              ? joinSourceField(dataObj['text/html'])
              : undefined,
          'image/svg+xml':
            dataObj['image/svg+xml'] !== undefined
              ? joinSourceField(dataObj['image/svg+xml'])
              : undefined,
          'image/png':
            dataObj['image/png'] !== undefined
              ? joinSourceField(dataObj['image/png'])
              : undefined,
          'application/json': dataObj['application/json'],
        },
      });
    } else if (rec.output_type === 'error') {
      normalized.push({
        output_type: 'error',
        ename: String(rec.ename ?? 'Error'),
        evalue: String(rec.evalue ?? ''),
        traceback: Array.isArray(rec.traceback)
          ? rec.traceback.map((t) => String(t))
          : [],
      });
    }
  }
  return normalized;
}

export function parseIpynb(rawJson: string): NotebookDocument {
  const parsed = JSON.parse(rawJson) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cells)) {
    throw new Error('Invalid .ipynb file: missing cells array.');
  }

  const rawMeta = (parsed.metadata && typeof parsed.metadata === 'object'
    ? parsed.metadata
    : {}) as Record<string, unknown>;
  const rawKernel = (rawMeta.kernelspec && typeof rawMeta.kernelspec === 'object'
    ? rawMeta.kernelspec
    : {}) as Record<string, unknown>;
  const langName = String(rawKernel.name ?? rawKernel.language ?? 'python').toLowerCase();
  const kernel: KernelLanguage =
    langName.includes('node') || langName.includes('js') || langName.includes('javascript')
      ? 'node'
      : 'python';

  const cells: NotebookCellData[] = parsed.cells.map((rawCell, index) => {
    const c = (rawCell && typeof rawCell === 'object' ? rawCell : {}) as Record<
      string,
      unknown
    >;
    const cellType: CellType = c.cell_type === 'markdown' ? 'markdown' : 'code';
    return {
      id: typeof c.id === 'string' && c.id.trim() ? c.id : `cell-${index + 1}-${createCellId()}`,
      cell_type: cellType,
      source: joinSourceField(c.source),
      execution_count:
        cellType === 'code' && typeof c.execution_count === 'number'
          ? c.execution_count
          : null,
      outputs: cellType === 'code' ? normalizeOutputs(c.outputs) : [],
      execution_time_ms:
        typeof (c.metadata as Record<string, unknown> | undefined)?.execution_time_ms ===
        'number'
          ? ((c.metadata as Record<string, unknown>).execution_time_ms as number)
          : null,
      metadata:
        c.metadata && typeof c.metadata === 'object'
          ? (c.metadata as Record<string, unknown>)
          : {},
    };
  });

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        name: kernel,
        display_name: kernel === 'python' ? 'Python 3.10' : 'Node.js 22',
        language: kernel === 'python' ? 'python' : 'javascript',
      },
      language_info: {
        name: kernel === 'python' ? 'python' : 'javascript',
        version: kernel === 'python' ? '3.10' : '22',
      },
    },
    cells: cells.length > 0 ? cells : [createEmptyCell('code', '')],
  };
}

export function serializeIpynb(doc: NotebookDocument): string {
  const ipynb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: doc.metadata,
    cells: doc.cells.map((cell) => {
      const base: Record<string, unknown> = {
        id: cell.id,
        cell_type: cell.cell_type,
        metadata: {
          ...(cell.metadata ?? {}),
          ...(cell.execution_time_ms != null
            ? { execution_time_ms: cell.execution_time_ms }
            : {}),
        },
        source: cell.source
          .split(/(?<=\n)/)
          .filter((part, i, arr) => !(i === arr.length - 1 && part === '')),
      };
      if (cell.cell_type === 'code') {
        base.execution_count = cell.execution_count;
        base.outputs = cell.outputs;
      }
      return base;
    }),
  };
  return JSON.stringify(ipynb, null, 2);
}

export function validateNotebookFilename(name: string): { valid: boolean; normalized: string; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, normalized: '', error: 'Notebook name cannot be empty.' };
  }
  if (/[/\\]|\.\./.test(trimmed)) {
    return { valid: false, normalized: '', error: 'Notebook name cannot contain slashes or "..".' };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return {
      valid: false,
      normalized: '',
      error: 'Use only letters, numbers, dots, underscores, or hyphens.',
    };
  }
  const normalized = trimmed.endsWith('.ipynb') ? trimmed : `${trimmed}.ipynb`;
  return { valid: true, normalized };
}
