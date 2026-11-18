import React, { useRef } from 'react';
import {
  Download,
  Eraser,
  Plus,
  RotateCcw,
  Save,
  Square,
  Upload,
} from 'lucide-react';
import type { KernelLanguage, KernelStatus } from '../types/notebook';

interface NotebookToolbarProps {
  notebookName: string;
  isDirty: boolean;
  isSaving: boolean;
  cellCount: number;
  kernelLanguage: KernelLanguage;
  kernelStatus: KernelStatus;
  onAddCodeCell: () => void;
  onAddMarkdownCell: () => void;
  onSave: () => void;
  onClearOutputs: () => void;
  onRestartKernel: () => void;
  onInterruptKernel: () => void;
  onChangeKernel: (lang: KernelLanguage) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
}

export const NotebookToolbar: React.FC<NotebookToolbarProps> = ({
  notebookName,
  isDirty,
  isSaving,
  cellCount,
  kernelLanguage,
  kernelStatus,
  onAddCodeCell,
  onAddMarkdownCell,
  onSave,
  onClearOutputs,
  onRestartKernel,
  onInterruptKernel,
  onChangeKernel,
  onExport,
  onImportFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const btnClass =
    'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-[#C9D1D9] hover:text-[#F0F6FC] hover:bg-white/[0.06] transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

  const statusLabel =
    kernelStatus === 'busy'
      ? 'Executing'
      : kernelStatus === 'restarting'
      ? 'Restarting'
      : kernelStatus === 'error'
      ? 'Error'
      : 'Idle';

  const statusColor =
    kernelStatus === 'busy'
      ? 'text-amber-400'
      : kernelStatus === 'error'
      ? 'text-red-400'
      : 'text-emerald-400';

  return (
    <div className="px-4 py-1.5 bg-[#0E131B] border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0 overflow-x-auto">
      {/* Left: Active notebook title + unboxed metadata */}
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <h1 className="text-[13px] font-semibold text-[#F0F6FC] truncate">
          {notebookName}
        </h1>
        <div className="hidden 2xl:flex items-center gap-1.5 text-[11px] text-[#8B949E] font-mono tabular-nums whitespace-nowrap shrink-0">
          <span aria-hidden="true">·</span>
          <span>{isSaving ? 'Saving…' : isDirty ? 'Unsaved' : 'Saved'}</span>
          <span aria-hidden="true">·</span>
          <span>{cellCount} {cellCount === 1 ? 'cell' : 'cells'}</span>
          <span aria-hidden="true">·</span>
          <span className={statusColor}>{statusLabel}</span>
        </div>
      </div>

      {/* Right: Notebook & Kernel Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onAddCodeCell} className={btnClass}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Code</span>
        </button>
        <button type="button" onClick={onAddMarkdownCell} className={btnClass}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Markdown</span>
        </button>

        <div className="w-px h-4 bg-white/[0.08] mx-1 shrink-0" aria-hidden="true" />

        <button type="button" onClick={onSave} className={btnClass}>
          <Save className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Save</span>
        </button>
        <button type="button" onClick={onClearOutputs} className={btnClass}>
          <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Clear</span>
        </button>

        {kernelStatus === 'busy' ? (
          <button
            type="button"
            onClick={onInterruptKernel}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-colors whitespace-nowrap shrink-0"
          >
            <Square className="w-3 h-3 fill-current" aria-hidden="true" />
            <span>Interrupt</span>
          </button>
        ) : (
          <button type="button" onClick={onRestartKernel} className={btnClass}>
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Restart</span>
          </button>
        )}

        <div className="w-px h-4 bg-white/[0.08] mx-1 shrink-0" aria-hidden="true" />

        <label htmlFor="kernel-select" className="sr-only">
          Kernel Runtime
        </label>
        <select
          id="kernel-select"
          aria-label="Kernel Runtime"
          value={kernelLanguage}
          onChange={(e) => onChangeKernel(e.target.value as KernelLanguage)}
          className="bg-[#151B26] border border-white/[0.1] rounded-md px-2 py-1 text-xs font-mono text-[#E6EDF3] focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
        >
          <option value="python">Python 3.10</option>
          <option value="node">Node.js 22</option>
        </select>

        <button type="button" onClick={onExport} className={btnClass} aria-label="Export notebook" title="Export .ipynb">
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={btnClass}
          aria-label="Import .ipynb file"
          title="Import .ipynb"
        >
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ipynb,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onImportFile(file);
              e.target.value = '';
            }
          }}
        />
      </div>
    </div>
  );
};
