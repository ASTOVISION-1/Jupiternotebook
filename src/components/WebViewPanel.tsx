import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import type { PortStatusEntry } from '../types/notebook';

interface WebViewPanelProps {
  ports: PortStatusEntry[];
  activePort: number | null;
  isExpanded: boolean;
  onSelectPort: (port: number) => void;
  onAddPort: (port: number) => Promise<void>;
  onTogglePublic: (port: number, publicEnabled: boolean) => Promise<void>;
  onRemovePort: (port: number) => Promise<void>;
  onRefreshPorts: () => Promise<void>;
  onToggleExpand: () => void;
  onClose: () => void;
}

export const WebViewPanel: React.FC<WebViewPanelProps> = ({
  ports,
  activePort,
  isExpanded,
  onSelectPort,
  onAddPort,
  onTogglePublic,
  onRemovePort,
  onRefreshPorts,
  onToggleExpand,
  onClose,
}) => {
  const [portInput, setPortInput] = useState(activePort ? String(activePort) : '8000');
  const [pathInput, setPathInput] = useState('/');
  const [committedPath, setCommittedPath] = useState('/');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [copiedPort, setCopiedPort] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedEntry =
    ports.find((p) => p.port === activePort) ??
    (activePort
      ? {
          port: activePort,
          label: `localhost:${activePort}`,
          publicEnabled: false,
          createdAt: '',
          online: false,
          detected: false,
          localUrl: `http://localhost:${activePort}`,
          previewPath: `/preview/${activePort}/`,
          publicUrl: `${window.location.origin}/p/${activePort}/`,
        }
      : null);

  useEffect(() => {
    if (activePort !== null) {
      setPortInput(String(activePort));
      setPathInput('/');
      setCommittedPath('/');
      setReloadNonce((n) => n + 1);
    }
  }, [activePort]);

  const handleOpenPortSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(portInput.trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535 || parsed === 3000) {
      setFormError(
        parsed === 3000
          ? 'Port 3000 is reserved by Jupiter Notebook.'
          : 'Enter a valid TCP port (1–65535).'
      );
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      await onAddPort(parsed);
      onSelectPort(parsed);
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pathInput.trim();
    const normalized = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
    setPathInput(normalized);
    setCommittedPath(normalized);
    setReloadNonce((n) => n + 1);
  };

  const handleCopyUrl = async (url: string, port: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedPort(port);
      setTimeout(() => setCopiedPort((cur) => (cur === port ? null : cur)), 1800);
    } catch {
      // Clipboard may be restricted in non-HTTPS contexts
    }
  };

  const iframeSrc = selectedEntry
    ? `/preview/${selectedEntry.port}${committedPath}`
    : '';

  return (
    <aside
      aria-label="Localhost Web View"
      className={`${
        isExpanded ? 'flex-1' : 'w-[430px] lg:w-[480px] shrink-0'
      } bg-[#0E131B] border-l border-white/[0.08] flex flex-col min-h-0`}
    >
      {/* Header & Port Entry */}
      <div className="px-3 py-2 border-b border-white/[0.08] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold text-[#F0F6FC] whitespace-nowrap">
            Web View
          </span>
        </div>

        <form onSubmit={handleOpenPortSubmit} className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-[#8B949E] select-none">
            localhost:
          </span>
          <input
            type="number"
            min={1}
            max={65535}
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            aria-label="Localhost port number"
            placeholder="8000"
            className="w-20 px-2 py-1 rounded bg-[#0B0E14] border border-white/[0.1] font-mono text-xs text-[#F0F6FC] tabular-nums focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-medium text-white transition-colors"
          >
            Open
          </button>
        </form>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void onRefreshPorts()}
            aria-label="Refresh localhost ports"
            className="p-1.5 rounded text-[#8B949E] hover:text-[#F0F6FC] hover:bg-white/[0.06]"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={isExpanded ? 'Restore web view width' : 'Expand web view'}
            className="p-1.5 rounded text-[#8B949E] hover:text-[#F0F6FC] hover:bg-white/[0.06]"
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close web view"
            className="p-1.5 rounded text-[#8B949E] hover:text-[#F0F6FC] hover:bg-white/[0.06]"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {formError && (
        <div className="px-3 py-1.5 bg-red-950/60 border-b border-red-500/30 text-[11px] text-red-200 flex items-center justify-between gap-2 shrink-0">
          <span>{formError}</span>
          <button
            type="button"
            onClick={() => setFormError(null)}
            className="text-red-300 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Detected & Registered Ports Switcher */}
      {ports.length > 0 && (
        <div className="px-3 py-1.5 bg-[#0B0E14] border-b border-white/[0.08] flex items-center gap-1.5 overflow-x-auto shrink-0">
          {ports.map((entry) => {
            const isSelected = entry.port === selectedEntry?.port;
            return (
              <div
                key={entry.port}
                className={`inline-flex items-center rounded border text-[11px] font-mono tabular-nums transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-[#192231] border-blue-500/40 text-[#F0F6FC]'
                    : 'bg-[#111620] border-white/[0.06] text-[#8B949E] hover:text-[#E6EDF3]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectPort(entry.port)}
                  className="px-2 py-1 flex items-center gap-1.5"
                >
                  <span>:{entry.port}</span>
                  <span
                    className={entry.online ? 'text-emerald-400' : 'text-amber-300'}
                  >
                    {entry.online ? 'Online' : 'Offline'}
                  </span>
                  {entry.publicEnabled && (
                    <span className="text-blue-400">· Public</span>
                  )}
                </button>
                {!entry.detected && (
                  <button
                    type="button"
                    onClick={() => void onRemovePort(entry.port)}
                    aria-label={`Remove port ${entry.port}`}
                    className="pr-1.5 py-1 text-[#6E7681] hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Port Controls + Public Internet Deployment */}
      {selectedEntry ? (
        <>
          <div className="px-3 py-2 bg-[#111620] border-b border-white/[0.08] space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                <span className="text-[#F0F6FC] font-medium">
                  localhost:{selectedEntry.port}
                </span>
                <span
                  className={
                    selectedEntry.online ? 'text-emerald-400' : 'text-amber-300'
                  }
                >
                  {selectedEntry.online ? 'Online' : 'Offline'}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  void onTogglePublic(
                    selectedEntry.port,
                    !selectedEntry.publicEnabled
                  )
                }
                aria-label={
                  selectedEntry.publicEnabled
                    ? `Stop public internet deployment for port ${selectedEntry.port}`
                    : `Deploy localhost:${selectedEntry.port} on Internet`
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  selectedEntry.publicEnabled
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                    : 'bg-[#192231] text-[#E6EDF3] border border-white/[0.1] hover:bg-blue-600 hover:border-blue-500 hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {selectedEntry.publicEnabled
                    ? 'Deployed on Internet'
                    : 'Deploy on Internet'}
                </span>
              </button>
            </div>

            {selectedEntry.publicEnabled && (
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#0B0E14] border border-emerald-500/25">
                <span
                  className="font-mono text-[11px] text-emerald-300 truncate select-all"
                  title={selectedEntry.publicUrl}
                >
                  {selectedEntry.publicUrl}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyUrl(selectedEntry.publicUrl, selectedEntry.port)
                    }
                    aria-label="Copy public internet URL"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-[#E6EDF3]"
                  >
                    {copiedPort === selectedEntry.port ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" aria-hidden="true" />
                        <span>Copy URL</span>
                      </>
                    )}
                  </button>
                  <a
                    href={selectedEntry.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open public internet URL in new tab"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/35 text-[11px] text-blue-300"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    <span>Open</span>
                  </a>
                </div>
              </div>
            )}

            {/* Embedded Web View Path Bar */}
            <form onSubmit={handlePathSubmit} className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-[#6E7681] truncate max-w-[140px]">
                localhost:{selectedEntry.port}
              </span>
              <input
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                aria-label="Web view path"
                placeholder="/"
                className="flex-1 px-2 py-1 rounded bg-[#0B0E14] border border-white/[0.1] font-mono text-xs text-[#F0F6FC] focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="px-2 py-1 rounded bg-[#192231] hover:bg-[#223047] text-xs text-[#E6EDF3]"
              >
                Go
              </button>
              <button
                type="button"
                onClick={() => setReloadNonce((n) => n + 1)}
                aria-label="Reload web view"
                className="p-1.5 rounded bg-[#192231] hover:bg-[#223047] text-[#C9D1D9]"
              >
                <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </form>
          </div>

          <div className="flex-1 min-h-0 bg-[#0B0E14]">
            <iframe
              key={`${selectedEntry.port}-${reloadNonce}-${committedPath}`}
              title={`Localhost port ${selectedEntry.port} web view`}
              src={iframeSrc}
              className="w-full h-full border-0 bg-white"
            />
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
          <Globe className="w-8 h-8 text-[#6E7681]" aria-hidden="true" />
          <div className="space-y-1 max-w-xs">
            <h3 className="text-sm font-semibold text-[#F0F6FC]">
              Preview &amp; Deploy Localhost Ports
            </h3>
            <p className="text-xs text-[#8B949E] leading-relaxed">
              Start any server in the Integrated Terminal or a notebook cell (for example{' '}
              <code className="font-mono text-blue-300">
                python3 -m http.server 8000
              </code>
              ), enter its port above to open Web View, and click{' '}
              <strong className="text-[#E6EDF3]">Deploy on Internet</strong> to publish a public HTTPS link.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
};
