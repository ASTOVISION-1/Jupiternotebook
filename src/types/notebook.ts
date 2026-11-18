export type KernelLanguage = 'python' | 'node';

export type CellType = 'code' | 'markdown';

export interface StreamOutput {
  output_type: 'stream';
  name: 'stdout' | 'stderr';
  text: string;
}

export interface ExecuteResultOutput {
  output_type: 'execute_result' | 'display_data';
  execution_count?: number | null;
  data: {
    'text/plain'?: string;
    'text/html'?: string;
    'image/svg+xml'?: string;
    'image/png'?: string;
    'application/json'?: unknown;
  };
}

export interface ErrorOutput {
  output_type: 'error';
  ename: string;
  evalue: string;
  traceback: string[];
}

export type CellOutput = StreamOutput | ExecuteResultOutput | ErrorOutput;

export interface NotebookCellData {
  id: string;
  cell_type: CellType;
  source: string;
  execution_count: number | null;
  outputs: CellOutput[];
  execution_time_ms?: number | null;
  metadata?: Record<string, unknown>;
}

export interface NotebookDocument {
  nbformat: 4;
  nbformat_minor: 5;
  metadata: {
    kernelspec: {
      name: KernelLanguage;
      display_name: string;
      language: string;
    };
    language_info: {
      name: string;
      version?: string;
    };
  };
  cells: NotebookCellData[];
}

export interface NotebookSummary {
  name: string;
  kernel: KernelLanguage;
  cellCount: number;
  updatedAt: string;
  sizeBytes: number;
}

export interface WorkspaceFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  updatedAt: string;
}

export type KernelStatus = 'idle' | 'busy' | 'restarting' | 'error';

export interface KernelVariable {
  name: string;
  type: string;
  valuePreview: string;
  size?: string;
}

export interface OutlineItem {
  cellId: string;
  level: 1 | 2 | 3;
  text: string;
  anchorId: string;
}

export interface TerminalLogEntry {
  id: string;
  type: 'command' | 'stdout' | 'stderr' | 'info';
  text: string;
  cwd?: string;
  exitCode?: number;
  durationMs?: number;
  timestamp: string;
}

export interface TerminalSessionInfo {
  id: string;
  title: string;
  cwd: string;
  busy: boolean;
}

export interface PortStatusEntry {
  port: number;
  label: string;
  publicEnabled: boolean;
  createdAt: string;
  online: boolean;
  detected: boolean;
  localUrl: string;
  previewPath: string;
  publicUrl: string;
}

