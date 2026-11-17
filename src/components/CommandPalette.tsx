import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { COMMAND_DEFINITIONS, filterCommands } from '../utils/commands';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onExecuteCommand: (commandId: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onExecuteCommand,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => filterCommands(COMMAND_DEFINITIONS, query),
    [query]
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(0);
    }
  }, [filtered.length, selectedIndex]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length === 0 ? 0 : (prev + 1) % filtered.length
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length === 0
          ? 0
          : (prev - 1 + filtered.length) % filtered.length
      );
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      onExecuteCommand(filtered[selectedIndex].id);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[12vh] px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl bg-[#111620] border border-white/[0.12] rounded-lg shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.08]">
          <Search className="w-4 h-4 text-[#8B949E] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            aria-label="Search commands"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command (e.g. Run All, Insert Code Cell, Restart Kernel, Terminal)..."
            className="flex-1 bg-transparent text-sm text-[#F0F6FC] placeholder-[#6E7681] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="p-1 rounded text-[#8B949E] hover:text-[#F0F6FC]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[#6E7681]">
              No matching commands found for "{query}".
            </div>
          ) : (
            <ul role="listbox" aria-label="Available commands">
              {filtered.map((cmd, idx) => {
                const active = idx === selectedIndex;
                return (
                  <li key={cmd.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onExecuteCommand(cmd.id);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                        active
                          ? 'bg-blue-600/20 text-[#F0F6FC]'
                          : 'text-[#C9D1D9] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[11px] font-mono text-[#8B949E] w-16 shrink-0">
                          {cmd.category}
                        </span>
                        <span className="text-xs font-medium truncate">{cmd.title}</span>
                      </div>
                      {cmd.shortcut && (
                        <kbd className="font-mono text-[11px] text-[#8B949E] shrink-0">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
