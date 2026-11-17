import React from 'react';
import {
  FileCode2,
  FileText,
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type {
  KernelVariable,
  NotebookSummary,
  OutlineItem,
  WorkspaceFileEntry,
} from '../types/notebook';

interface SidebarProps {
  activeTab: 'files' | 'outline' | 'variables';
  onTabChange: (tab: 'files' | 'outline' | 'variables') => void;
  notebooks: NotebookSummary[];
  workspaceFiles: WorkspaceFileEntry[];
  activeNotebookName: string;
  outline: OutlineItem[];
  variables: KernelVariable[];
  onSelectNotebook: (name: string) => void;
  onNewNotebook: () => void;
  onDeleteNotebook: (name: string) => void;
  onRefreshFiles: () => void;
  onInspectFileInTerminal: (filename: string) => void;
  onJumpToOutline: (cellId: string) => void;
  onRefreshVariables: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  notebooks,
  workspaceFiles,
  activeNotebookName,
  outline,
  variables,
  onSelectNotebook,
  onNewNotebook,
  onDeleteNotebook,
  onRefreshFiles,
  onInspectFileInTerminal,
  onJumpToOutline,
  onRefreshVariables,
}) => {
  const nonNotebookFiles = workspaceFiles.filter((f) => !f.name.endsWith('.ipynb'));

  return (
    <aside
      aria-label="Workspace Explorer"
      className="w-[264px] shrink-0 bg-[#0E131B] border-r border-white/[0.08] flex flex-col min-h-0"
    >
      {/* Segmented Control Tabs */}
      <div className="p-2 border-b border-white/[0.08]">
        <div role="tablist" aria-label="Explorer sections" className="grid grid-cols-3 gap-1 p-1 bg-[#090C11] rounded-md">
          {(['files', 'outline', 'variables'] as const).map((tab) => {
            const label = tab === 'files' ? 'Files' : tab === 'outline' ? 'Outline' : 'Variables';
            const selected = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onTabChange(tab)}
                className={`py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  selected
                    ? 'bg-[#192231] text-[#F0F6FC]'
                    : 'text-[#8B949E] hover:text-[#E6EDF3]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {activeTab === 'files' && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-[#8B949E]">Notebooks</h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onRefreshFiles}
                    aria-label="Refresh workspace files"
                    className="p-1 rounded text-[#8B949E] hover:text-[#F0F6FC] hover:bg-white/[0.06]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={onNewNotebook}
                    aria-label="New Notebook"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-blue-400 hover:bg-blue-500/10"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>New</span>
                  </button>
                </div>
              </div>

              {notebooks.length === 0 ? (
                <p className="text-xs text-[#6E7681] py-2">No notebooks in workspace.</p>
              ) : (
                <ul className="space-y-1">
                  {notebooks.map((nb) => {
                    const isActive = nb.name === activeNotebookName;
                    return (
                      <li key={nb.name} className="group flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectNotebook(nb.name)}
                          className={`flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-colors ${
                            isActive
                              ? 'bg-blue-600/15 text-[#F0F6FC] border border-blue-500/35'
                              : 'text-[#C9D1D9] hover:bg-white/[0.05] border border-transparent'
                          }`}
                        >
                          <FileCode2
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-blue-400' : 'text-[#8B949E]'
                            }`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">{nb.name}</div>
                            <div className="text-[11px] text-[#8B949E] font-mono tabular-nums truncate">
                              {nb.kernel === 'python' ? 'Python' : 'Node'} · {nb.cellCount} cells
                            </div>
                          </div>
                        </button>
                        {notebooks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onDeleteNotebook(nb.name)}
                            aria-label={`Delete ${nb.name}`}
                            className="p-1.5 rounded text-[#6E7681] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Workspace Data Files */}
            <div>
              <h2 className="text-xs font-semibold text-[#8B949E] mb-2">Workspace Data</h2>
              {nonNotebookFiles.length === 0 ? (
                <p className="text-xs text-[#6E7681]">No auxiliary files.</p>
              ) : (
                <ul className="space-y-1">
                  {nonNotebookFiles.map((file) => (
                    <li key={file.path}>
                      <button
                        type="button"
                        onClick={() => onInspectFileInTerminal(file.name)}
                        title="Preview file head in integrated terminal"
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs text-[#C9D1D9] hover:bg-white/[0.05] transition-colors text-left"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {file.isDirectory ? (
                            <FolderOpen className="w-3.5 h-3.5 text-[#8B949E] shrink-0" aria-hidden="true" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 text-[#8B949E] shrink-0" aria-hidden="true" />
                          )}
                          <span className="truncate font-mono text-[12px]">{file.name}</span>
                        </span>
                        <span className="text-[11px] text-[#6E7681] font-mono tabular-nums shrink-0">
                          {formatBytes(file.sizeBytes)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'outline' && (
          <div>
            <h2 className="text-xs font-semibold text-[#8B949E] mb-2">Notebook Outline</h2>
            {outline.length === 0 ? (
              <p className="text-xs text-[#6E7681] leading-relaxed">
                Add Markdown headings (<code className="font-mono"># Title</code>) to build a clickable document outline.
              </p>
            ) : (
              <ul className="space-y-1">
                {outline.map((item, idx) => (
                  <li key={`${item.anchorId}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => onJumpToOutline(item.cellId)}
                      style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                      className="w-full text-left py-1.5 pr-2 rounded text-xs text-[#C9D1D9] hover:text-[#F0F6FC] hover:bg-white/[0.05] truncate transition-colors"
                    >
                      {item.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'variables' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-[#8B949E]">Kernel Namespace</h2>
              <button
                type="button"
                onClick={onRefreshVariables}
                aria-label="Refresh variables"
                className="p-1 rounded text-[#8B949E] hover:text-[#F0F6FC] hover:bg-white/[0.06]"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            {variables.length === 0 ? (
              <p className="text-xs text-[#6E7681] leading-relaxed">
                No user variables in memory yet. Execute a code cell to inspect live values.
              </p>
            ) : (
              <div className="border border-white/[0.08] rounded-md overflow-hidden">
                <table className="w-full text-left border-collapse font-mono text-[11px] tabular-nums">
                  <thead>
                    <tr className="bg-[#151B26] border-b border-white/[0.08] text-[#8B949E]">
                      <th className="py-1.5 px-2 font-medium">Name</th>
                      <th className="py-1.5 px-2 font-medium">Type</th>
                      <th className="py-1.5 px-2 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variables.map((v) => (
                      <tr
                        key={v.name}
                        className="border-b last:border-b-0 border-white/[0.06] hover:bg-white/[0.03]"
                      >
                        <td className="py-1.5 px-2 text-blue-300 font-medium truncate max-w-[96px]" title={v.name}>
                          {v.name}
                        </td>
                        <td className="py-1.5 px-2 text-[#8B949E] truncate max-w-[54px]" title={v.type}>
                          {v.type}
                        </td>
                        <td className="py-1.5 px-2 text-[#C9D1D9] truncate max-w-[84px]" title={v.valuePreview}>
                          {v.valuePreview}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
