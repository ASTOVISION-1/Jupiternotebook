import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Code2,
  Eraser,
  FileText,
  Pencil,
  Play,
  TerminalSquare,
  Trash2,
} from 'lucide-react';
import type { NotebookCellData } from '../types/notebook';
import { renderMarkdownToHtml } from '../utils/markdown';

interface NotebookCellProps {
  cell: NotebookCellData;
  index: number;
  totalCells: number;
  isActive: boolean;
  isRunning: boolean;
  onFocus: () => void;
  onChangeSource: (source: string) => void;
  onRun: (advance: boolean) => void;
  onMove: (direction: 'up' | 'down') => void;
  onToggleType: () => void;
  onClearOutput: () => void;
  onDelete: () => void;
  onRunInTerminal: (code: string) => void;
}

export const NotebookCell: React.FC<NotebookCellProps> = ({
  cell,
  index,
  totalCells,
  isActive,
  isRunning,
  onFocus,
  onChangeSource,
  onRun,
  onMove,
  onToggleType,
  onClearOutput,
  onDelete,
  onRunInTerminal,
}) => {
  const [isEditingMarkdown, setIsEditingMarkdown] = useState(
    cell.cell_type === 'markdown' && cell.source.trim() === ''
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lineCount = useMemo(() => {
    const lines = cell.source.split('\n').length;
    return Math.max(2, lines);
  }, [cell.source]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 48)}px`;
  }, [cell.source, isEditingMarkdown, cell.cell_type]);

  useEffect(() => {
    if (isActive && cell.cell_type === 'markdown' && cell.source.trim() === '') {
      setIsEditingMarkdown(true);
    }
  }, [isActive, cell.cell_type, cell.source]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      if (cell.cell_type === 'markdown') {
        setIsEditingMarkdown(false);
      }
      onRun(true);
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (cell.cell_type === 'markdown') {
        setIsEditingMarkdown(false);
      }
      onRun(false);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (cell.cell_type === 'markdown') {
        setIsEditingMarkdown(false);
      }
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const nextValue =
        cell.source.slice(0, start) + '  ' + cell.source.slice(end);
      onChangeSource(nextValue);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  };

  const renderedMarkdown = useMemo(
    () =>
      cell.cell_type === 'markdown'
        ? renderMarkdownToHtml(cell.source, cell.id)
        : '',
    [cell.cell_type, cell.source, cell.id]
  );

  const cellNumber = index + 1;
  const execBadge = isRunning
    ? '[*]'
    : cell.execution_count !== null
    ? `[${cell.execution_count}]`
    : '[ ]';

  const actionBtn =
    'p-1.5 rounded text-[#8B949E] hover:text-[#F0F6FC] hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

  return (
    <section
      id={`cell-${cell.id}`}
      aria-label={`${cell.cell_type === 'code' ? 'Code' : 'Markdown'} cell ${cellNumber}`}
      onClick={onFocus}
      className={`group rounded-lg border transition-colors duration-150 ${
        isActive
          ? 'bg-[#151B26] border-blue-500/45'
          : 'bg-[#111620] border-white/[0.08] hover:border-white/[0.15]'
      }`}
    >
      {/* Cell Header Controls */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/[0.06] bg-[#0E131B]/60 rounded-t-lg">
        <div className="flex items-center gap-2.5 text-xs font-mono text-[#8B949E] tabular-nums">
          <span>
            {cell.cell_type === 'code' ? (
              <span className={isRunning ? 'text-amber-400 font-semibold' : ''}>
                In {execBadge}
              </span>
            ) : (
              <span>Markdown</span>
            )}
          </span>
          {cell.execution_time_ms != null && cell.cell_type === 'code' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[#6E7681]">{cell.execution_time_ms} ms</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {cell.cell_type === 'code' ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRun(false);
                }}
                aria-label={`Run cell ${cellNumber}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-blue-400 hover:bg-blue-500/15 transition-colors mr-1"
              >
                <Play className="w-3 h-3 fill-current" aria-hidden="true" />
                <span>{isRunning ? 'Running…' : 'Run'}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRunInTerminal(cell.source);
                }}
                aria-label={`Send cell ${cellNumber} to terminal`}
                title="Execute in integrated terminal"
                className={actionBtn}
              >
                <TerminalSquare className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              {cell.outputs.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearOutput();
                  }}
                  aria-label={`Clear output of cell ${cellNumber}`}
                  title="Clear cell output"
                  className={actionBtn}
                >
                  <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingMarkdown((v) => !v);
              }}
              aria-label={
                isEditingMarkdown
                  ? `Render markdown cell ${cellNumber}`
                  : `Edit markdown cell ${cellNumber}`
              }
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[#C9D1D9] hover:bg-white/[0.08] transition-colors mr-1"
            >
              {isEditingMarkdown ? (
                <>
                  <Check className="w-3 h-3" aria-hidden="true" />
                  <span>Done</span>
                </>
              ) : (
                <>
                  <Pencil className="w-3 h-3" aria-hidden="true" />
                  <span>Edit</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleType();
            }}
            aria-label={`Convert cell ${cellNumber} to ${
              cell.cell_type === 'code' ? 'markdown' : 'code'
            }`}
            title={
              cell.cell_type === 'code' ? 'Convert to Markdown' : 'Convert to Code'
            }
            className={actionBtn}
          >
            {cell.cell_type === 'code' ? (
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMove('up');
            }}
            aria-label={`Move cell ${cellNumber} up`}
            className={`${actionBtn} disabled:opacity-30`}
          >
            <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={index === totalCells - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMove('down');
            }}
            aria-label={`Move cell ${cellNumber} down`}
            className={`${actionBtn} disabled:opacity-30`}
          >
            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Delete cell ${cellNumber}`}
            className="p-1.5 rounded text-[#8B949E] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Cell Body */}
      {cell.cell_type === 'code' ? (
        <div className="flex items-stretch">
          {/* Line Numbers Gutter */}
          <div
            aria-hidden="true"
            className="w-10 py-3 pr-2.5 text-right font-mono text-[12px] leading-[1.6] text-[#4B5563] select-none bg-[#0D1117]/50 border-r border-white/[0.05] tabular-nums shrink-0"
          >
            {Array.from({ length: lineCount }, (_, idx) => (
              <div key={idx}>{idx + 1}</div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            aria-label={`Code cell ${cellNumber} editor`}
            value={cell.source}
            onFocus={onFocus}
            onChange={(e) => onChangeSource(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            placeholder="Write Python, Node.js, or magic commands (%who, !ls, %%bash)..."
            className="flex-1 w-full bg-transparent px-3.5 py-3 font-mono text-[13px] leading-[1.6] text-[#E6EDF3] placeholder-[#4B5563] resize-none focus:outline-none overflow-hidden"
            rows={lineCount}
          />
        </div>
      ) : isEditingMarkdown ? (
        <div className="p-3">
          <textarea
            ref={textareaRef}
            aria-label={`Markdown cell ${cellNumber} editor`}
            value={cell.source}
            onFocus={onFocus}
            onChange={(e) => onChangeSource(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write Markdown notes (# Heading, **bold**, `code`)..."
            className="w-full bg-[#090C11] border border-white/[0.08] rounded-md px-3.5 py-2.5 font-mono text-[13px] leading-[1.6] text-[#E6EDF3] placeholder-[#4B5563] resize-none focus:outline-none focus:border-blue-500/50"
            rows={Math.max(3, lineCount)}
          />
        </div>
      ) : (
        <div
          onDoubleClick={() => setIsEditingMarkdown(true)}
          className="px-5 py-4 nb-markdown cursor-text"
          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
        />
      )}

      {/* Code Outputs */}
      {cell.cell_type === 'code' && cell.outputs.length > 0 && (
        <div
          aria-label={`Output for cell ${cellNumber}`}
          className="border-t border-white/[0.08] bg-[#090C11] rounded-b-lg px-4 py-3 space-y-3"
        >
          {cell.outputs.map((out, outIdx) => {
            if (out.output_type === 'stream') {
              const isErr = out.name === 'stderr';
              return (
                <pre
                  key={outIdx}
                  className={`font-mono text-[12.5px] leading-[1.55] whitespace-pre-wrap break-words ${
                    isErr ? 'text-amber-300' : 'text-[#D0D7DE]'
                  }`}
                >
                  {out.text}
                </pre>
              );
            }

            if (out.output_type === 'error') {
              return (
                <div
                  key={outIdx}
                  className="rounded-md bg-red-950/35 border border-red-500/30 p-3 font-mono text-[12.5px]"
                >
                  <div className="font-semibold text-red-400 mb-1">
                    {out.ename}: {out.evalue}
                  </div>
                  {out.traceback.length > 0 && (
                    <pre className="text-red-200/85 whitespace-pre-wrap break-words leading-[1.5]">
                      {out.traceback.join('\n')}
                    </pre>
                  )}
                </div>
              );
            }

            // execute_result or display_data
            const svg = out.data['image/svg+xml'];
            const html = out.data['text/html'];
            const plain = out.data['text/plain'];

            return (
              <div key={outIdx} className="space-y-2">
                {svg ? (
                  <div
                    className="overflow-x-auto"
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                ) : html ? (
                  <div
                    className="nb-html-output overflow-x-auto text-[#E6EDF3]"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                ) : plain ? (
                  <div className="flex items-start gap-2.5 font-mono text-[12.5px] leading-[1.55]">
                    {out.output_type === 'execute_result' && (
                      <span className="text-[#6E7681] shrink-0 select-none tabular-nums">
                        Out[{out.execution_count ?? cell.execution_count ?? ''}]:
                      </span>
                    )}
                    <pre className="text-[#93C5FD] whitespace-pre-wrap break-words">
                      {plain}
                    </pre>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
