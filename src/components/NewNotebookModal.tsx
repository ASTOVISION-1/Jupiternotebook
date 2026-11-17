import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { KernelLanguage } from '../types/notebook';
import { validateNotebookFilename } from '../utils/notebookLogic';

interface NewNotebookModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, kernel: KernelLanguage) => Promise<void>;
}

export const NewNotebookModal: React.FC<NewNotebookModalProps> = ({
  open,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [kernel, setKernel] = useState<KernelLanguage>('python');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setKernel('python');
      setError(null);
      setSubmitting(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateNotebookFilename(name);
    if (!check.valid) {
      setError(check.error ?? 'Invalid notebook name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(check.normalized, kernel);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create New Notebook"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#111620] border border-white/[0.12] rounded-lg shadow-2xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#F0F6FC]">New Notebook</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new notebook dialog"
            className="p-1 rounded text-[#8B949E] hover:text-[#F0F6FC]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="new-notebook-name"
              className="block text-xs font-medium text-[#C9D1D9] mb-1.5"
            >
              Filename
            </label>
            <input
              ref={inputRef}
              id="new-notebook-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. 03_experiment.ipynb"
              className="w-full bg-[#090C11] border border-white/[0.12] rounded-md px-3 py-2 font-mono text-xs text-[#F0F6FC] placeholder-[#4B5563] focus:outline-none focus:border-blue-500"
            />
            {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
          </div>

          <div>
            <label
              htmlFor="new-notebook-kernel"
              className="block text-xs font-medium text-[#C9D1D9] mb-1.5"
            >
              Kernel Runtime
            </label>
            <select
              id="new-notebook-kernel"
              value={kernel}
              onChange={(e) => setKernel(e.target.value as KernelLanguage)}
              className="w-full bg-[#090C11] border border-white/[0.12] rounded-md px-3 py-2 font-mono text-xs text-[#F0F6FC] focus:outline-none focus:border-blue-500"
            >
              <option value="python">Python 3.10</option>
              <option value="node">Node.js 22</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-md text-xs font-medium text-[#C9D1D9] hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-semibold text-white"
            >
              {submitting ? 'Creating…' : 'Create Notebook'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
