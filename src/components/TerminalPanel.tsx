import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Square,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react';
import type { TerminalLogEntry, TerminalSessionInfo } from '../types/notebook';
import { parseAnsiSegments } from '../utils/terminalFormat';

interface TerminalPanelProps {
  sessions: TerminalSessionInfo[];
  activeSessionId: string;
  logsBySession: Record<string, TerminalLogEntry[]>;
  height: number;
  onResize: (nextHeight: number) => void;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onCloseSession: (id: string) => void;
  onExecuteCommand: (sessionId: string, command: string) => Promise<void>;
  onSendInput: (sessionId: string, input: string, eof?: boolean) => Promise<void>;
  onInterruptCommand: (sessionId: string) => Promise<void>;
  onClearLog: (sessionId: string) => void;
  onCompletePrefix: (sessionId: string, prefix: string) => Promise<string[]>;
  allowAllCommands: boolean;
  onTogglePermissions: () => void;
  onHide: () => void;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  sessions,
  activeSessionId,
  logsBySession,
  height,
  onResize,
  onSelectSession,
  onCreateSession,
  onCloseSession,
  onExecuteCommand,
  onSendInput,
  onInterruptCommand,
  onClearLog,
  onCompletePrefix,
  allowAllCommands,
  onTogglePermissions,
  onHide,
}) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isMaximized, setIsMaximized] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const entries = (activeSession ? logsBySession[activeSession.id] : []) ?? [];
  const lastEntryLength = entries[entries.length - 1]?.text.length ?? 0;
  const isBusy = Boolean(activeSession?.busy);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length, lastEntryLength, activeSessionId]);

  useEffect(() => {
    if (!isBusy) {
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 100);
    return () => clearInterval(timer);
  }, [isBusy, activeSessionId]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const onMove = (moveEvt: MouseEvent) => {
      const delta = startY - moveEvt.clientY;
      onResize(Math.max(160, Math.min(560, startH + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;

    if (isBusy) {
      const stdinVal = input;
      setInput('');
      await onSendInput(activeSession.id, stdinVal, false);
      inputRef.current?.focus();
      return;
    }

    const cmd = input.trim();
    if (!cmd) return;
    setSuggestions([]);
    if (cmd === 'clear') {
      onClearLog(activeSession.id);
      setInput('');
      return;
    }
    setHistory((prev) => [...prev, cmd]);
    setHistoryIdx(-1);
    setInput('');
    await onExecuteCommand(activeSession.id, cmd);
    inputRef.current?.focus();
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isBusy && e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      if (activeSession) await onInterruptCommand(activeSession.id);
      return;
    }
    if (isBusy && e.ctrlKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (activeSession) await onSendInput(activeSession.id, '', true);
      return;
    }
    if (isBusy) {
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(nextIdx);
      setInput(history[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      if (historyIdx >= history.length - 1) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setInput(history[nextIdx]);
      }
    } else if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (activeSession) onClearLog(activeSession.id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (!activeSession) return;
      const matches = await onCompletePrefix(activeSession.id, input);
      if (matches.length === 1) {
        const parts = input.split(/\s+/);
        parts[parts.length - 1] = matches[0];
        setInput(parts.join(' '));
        setSuggestions([]);
      } else if (matches.length > 1) {
        setSuggestions(matches);
      }
    } else if (suggestions.length > 0) {
      setSuggestions([]);
    }
  };

  const shortCwd = activeSession?.cwd.split('/').slice(-2).join('/') || 'workspace';
  const panelHeight = isMaximized ? 480 : height;

  return (
    <section
      aria-label="Integrated Terminal"
      style={{ height: `${panelHeight}px` }}
      className="bg-[#090C11] border-t border-white/[0.1] flex flex-col shrink-0"
    >
      {/* Drag Resize Handle */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal panel"
        onMouseDown={startResize}
        className="h-1.5 cursor-ns-resize hover:bg-blue-500/40 transition-colors shrink-0"
      />

      {/* Terminal Header & Tabs */}
      <div className="px-3 py-1.5 bg-[#0E131B] border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C9D1D9] mr-2 whitespace-nowrap">
            <TerminalSquare className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
            <span>Terminal</span>
          </span>

          {sessions.map((sess) => {
            const selected = sess.id === activeSession?.id;
            return (
              <div
                key={sess.id}
                className={`inline-flex items-center rounded text-xs transition-colors ${
                  selected
                    ? 'bg-[#192231] text-[#F0F6FC]'
                    : 'text-[#8B949E] hover:text-[#E6EDF3] hover:bg-white/[0.05]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(sess.id)}
                  className="px-2.5 py-1 font-mono text-[11px] whitespace-nowrap"
                >
                  {sess.title}
                </button>
                {sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onCloseSession(sess.id)}
                    aria-label={`Close ${sess.title}`}
                    className="pr-1.5 py-1 text-[#6E7681] hover:text-red-400"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={onCreateSession}
            aria-label="New terminal tab"
            className="p-1 rounded text-[#8B949E] hover:text-[#F0F6FC] hover:bg-white/[0.06]"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isBusy && (
            <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
              <span className="text-amber-300">
                Streaming · {(elapsedMs / 1000).toFixed(1)}s
              </span>
              <button
                type="button"
                onClick={() => activeSession && onSendInput(activeSession.id, '', true)}
                aria-label="Send EOF to running process"
                className="px-1.5 py-0.5 rounded text-[#C9D1D9] bg-white/[0.06] hover:bg-white/[0.12]"
              >
                EOF
              </button>
              <button
                type="button"
                onClick={() => activeSession && onInterruptCommand(activeSession.id)}
                aria-label="Interrupt running terminal command"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-amber-300 bg-amber-500/15 hover:bg-amber-500/25"
              >
                <Square className="w-2.5 h-2.5 fill-current" aria-hidden="true" />
                <span>Ctrl+C</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onTogglePermissions}
            aria-label={
              allowAllCommands
                ? 'Command permissions: All Allowed. Click to switch to workspace restricted.'
                : 'Command permissions: Workspace Restricted. Click to allow all commands.'
            }
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors whitespace-nowrap ${
              allowAllCommands
                ? 'text-emerald-400 hover:bg-emerald-500/10'
                : 'text-amber-300 hover:bg-amber-500/10'
            }`}
          >
            {allowAllCommands ? 'Permissions: All Allowed' : 'Permissions: Restricted'}
          </button>

          <span className="hidden md:inline font-mono text-[11px] text-[#6E7681] truncate max-w-[200px]">
            {shortCwd}
          </span>

          <button
            type="button"
            onClick={() => activeSession && onClearLog(activeSession.id)}
            aria-label="Clear terminal output"
            className="p-1 rounded text-[#8B949E] hover:text-[#F0F6FC] hover:bg-white/[0.06]"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setIsMaximized((v) => !v)}
            aria-label={isMaximized ? 'Restore terminal height' : 'Expand terminal'}
            className="p-1 rounded text-[#8B949E] hover:text-[#F0F6FC] hover:bg-white/[0.06]"
          >
            {isMaximized ? (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onHide}
            aria-label="Hide terminal panel"
            className="p-1 rounded text-[#8B949E] hover:text-[#F0F6FC] hover:bg-white/[0.06]"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Scrollable Live Output Log */}
      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[1.55] space-y-1 cursor-text min-h-0"
      >
        {entries.length === 0 ? (
          <div className="text-[#6E7681]">
            Live bash terminal ready in <span className="text-[#8B949E]">{activeSession?.cwd}</span>. Output streams in real time and accepts interactive stdin while commands run.
          </div>
        ) : (
          entries.map((entry) => {
            if (entry.type === 'command') {
              return (
                <div key={entry.id} className="flex items-baseline justify-between gap-3 pt-1.5">
                  <div className="text-[#F0F6FC]">
                    <span className="text-emerald-400 mr-2 select-none">$</span>
                    <span>{entry.text}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#6E7681] tabular-nums shrink-0">
                    {entry.exitCode !== undefined && entry.exitCode !== 0 && (
                      <span className="text-red-400">exit {entry.exitCode}</span>
                    )}
                    {entry.durationMs !== undefined ? (
                      <span>{entry.durationMs} ms</span>
                    ) : (
                      <span className="text-amber-300">live</span>
                    )}
                  </div>
                </div>
              );
            }
            if (entry.type === 'info') {
              return (
                <div key={entry.id} className="text-blue-300">
                  {entry.text}
                </div>
              );
            }
            const segments = parseAnsiSegments(entry.text);
            const fallbackColor = entry.type === 'stderr' ? 'text-amber-300' : 'text-[#D0D7DE]';
            return (
              <pre key={entry.id} className={`${fallbackColor} whitespace-pre-wrap break-words`}>
                {segments.length === 0
                  ? entry.text
                  : segments.map((seg, i) => (
                      <span
                        key={i}
                        className={`${seg.colorClass ?? ''} ${seg.bold ? 'font-semibold' : ''}`}
                      >
                        {seg.text}
                      </span>
                    ))}
              </pre>
            );
          })
        )}

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-1 text-blue-300 text-xs">
            {suggestions.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        )}
      </div>

      {/* Live Command & Stdin Input */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-2 border-t border-white/[0.08] bg-[#0B0E14] flex items-center gap-2 shrink-0"
      >
        <span
          className={`font-mono text-xs select-none shrink-0 ${
            isBusy ? 'text-amber-300' : 'text-emerald-400'
          }`}
        >
          {isBusy ? 'stdin >' : `${shortCwd} $`}
        </span>
        <input
          ref={inputRef}
          type="text"
          aria-label="Terminal command input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isBusy
              ? 'Send stdin line to running process (Enter) · Ctrl+C to interrupt'
              : 'Enter shell command (Tab to complete, Up/Down for history)'
          }
          className="flex-1 bg-transparent font-mono text-[12.5px] text-[#F0F6FC] placeholder-[#4B5563] focus:outline-none"
        />
      </form>
    </section>
  );
};
