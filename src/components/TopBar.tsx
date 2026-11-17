import React from 'react';
import { Play } from 'lucide-react';

interface TopBarProps {
  sidebarOpen: boolean;
  sidebarTab: 'files' | 'outline' | 'variables';
  terminalOpen: boolean;
  isExecutingAll: boolean;
  onToggleFiles: () => void;
  onToggleVariables: () => void;
  onToggleTerminal: () => void;
  onOpenCommands: () => void;
  onRunAll: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  sidebarOpen,
  sidebarTab,
  terminalOpen,
  isExecutingAll,
  onToggleFiles,
  onToggleVariables,
  onToggleTerminal,
  onOpenCommands,
  onRunAll,
}) => {
  const linkBase =
    'text-[13px] font-medium transition-colors duration-150 whitespace-nowrap shrink-0 py-1 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm';

  return (
    <header className="h-12 px-5 bg-[#111620] border-b border-white/[0.08] flex items-center justify-between gap-8 shrink-0">
      {/* Zone 1: Single-line Brand Wordmark */}
      <span className="text-[15px] font-bold tracking-tight text-[#F0F6FC] whitespace-nowrap shrink-0">
        Jupiter Notebook
      </span>

      {/* Zone 2: 4 single-line workspace navigation controls */}
      <nav aria-label="Workspace panels" className="flex items-center gap-6 overflow-x-auto">
        <button
          type="button"
          onClick={onToggleFiles}
          className={`${linkBase} ${
            sidebarOpen && sidebarTab === 'files'
              ? 'text-[#F0F6FC] border-blue-500'
              : 'text-[#8B949E] border-transparent hover:text-[#E6EDF3]'
          }`}
        >
          Explorer
        </button>
        <button
          type="button"
          onClick={onToggleVariables}
          className={`${linkBase} ${
            sidebarOpen && sidebarTab === 'variables'
              ? 'text-[#F0F6FC] border-blue-500'
              : 'text-[#8B949E] border-transparent hover:text-[#E6EDF3]'
          }`}
        >
          Variables
        </button>
        <button
          type="button"
          onClick={onToggleTerminal}
          className={`${linkBase} ${
            terminalOpen
              ? 'text-[#F0F6FC] border-blue-500'
              : 'text-[#8B949E] border-transparent hover:text-[#E6EDF3]'
          }`}
        >
          Terminal
        </button>
        <button
          type="button"
          onClick={onOpenCommands}
          className={`${linkBase} text-[#8B949E] border-transparent hover:text-[#E6EDF3]`}
        >
          Commands
        </button>
      </nav>

      {/* Zone 3: 1 Primary CTA */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={onRunAll}
          disabled={isExecutingAll}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
          <span>{isExecutingAll ? 'Running All…' : 'Run All'}</span>
        </button>
      </div>
    </header>
  );
};
