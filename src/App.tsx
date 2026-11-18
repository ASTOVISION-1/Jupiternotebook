import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { CommandPalette } from './components/CommandPalette';
import { NewNotebookModal } from './components/NewNotebookModal';
import { NotebookCell } from './components/NotebookCell';
import { NotebookToolbar } from './components/NotebookToolbar';
import { Sidebar } from './components/Sidebar';
import { TerminalPanel } from './components/TerminalPanel';
import { TopBar } from './components/TopBar';
import { WebViewPanel } from './components/WebViewPanel';
import type {
  CellOutput,
  KernelLanguage,
  KernelStatus,
  KernelVariable,
  NotebookDocument,
  NotebookSummary,
  PortStatusEntry,
  TerminalLogEntry,
  TerminalSessionInfo,
  WorkspaceFileEntry,
} from './types/notebook';
import {
  clearAllOutputs,
  clearCellOutput,
  createEmptyNotebook,
  deleteCell,
  extractMarkdownOutline,
  insertCell,
  moveCell,
  parseIpynb,
  serializeIpynb,
  toggleCellType,
  updateCellExecutionResult,
  updateCellSource,
} from './utils/notebookLogic';

export default function App() {
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileEntry[]>([]);
  const [activeNotebookName, setActiveNotebookName] = useState<string>('');
  const [notebook, setNotebook] = useState<NotebookDocument | null>(null);
  const [activeCellId, setActiveCellId] = useState<string>('');
  const [runningCellIds, setRunningCellIds] = useState<Record<string, boolean>>({});
  const [isExecutingAll, setIsExecutingAll] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingNotebook, setLoadingNotebook] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [kernelStatus, setKernelStatus] = useState<KernelStatus>('idle');
  const [variables, setVariables] = useState<KernelVariable[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'files' | 'outline' | 'variables'>('files');
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [terminalFullScreen, setTerminalFullScreen] = useState(false);

  const [webViewOpen, setWebViewOpen] = useState(false);
  const [webViewExpanded, setWebViewExpanded] = useState(false);
  const [ports, setPorts] = useState<PortStatusEntry[]>([]);
  const [activeWebViewPort, setActiveWebViewPort] = useState<number | null>(null);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [newNotebookOpen, setNewNotebookOpen] = useState(false);

  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionInfo[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>('');
  const [terminalLogs, setTerminalLogs] = useState<Record<string, TerminalLogEntry[]>>({});
  const [allowAllCommands, setAllowAllCommands] = useState<boolean>(true);

  const lastDKeyTimeRef = useRef<number>(0);

  const fetchWorkspaceList = useCallback(async () => {
    const res = await fetch('/api/notebooks');
    if (!res.ok) throw new Error('Failed to load workspace notebooks.');
    const data = (await res.json()) as {
      notebooks: NotebookSummary[];
      files: WorkspaceFileEntry[];
    };
    setNotebooks(data.notebooks);
    setWorkspaceFiles(data.files);
    return data.notebooks;
  }, []);

  const refreshVariables = useCallback(
    async (nbName: string, lang: KernelLanguage) => {
      if (!nbName) return;
      try {
        const res = await fetch(
          `/api/kernel/variables?notebookName=${encodeURIComponent(nbName)}&language=${lang}`
        );
        if (res.ok) {
          const data = (await res.json()) as { variables: KernelVariable[] };
          setVariables(data.variables ?? []);
        }
      } catch {
        // Ignore transient variable polling failures
      }
    },
    []
  );

  const openNotebook = useCallback(
    async (name: string) => {
      setLoadingNotebook(true);
      setErrorBanner(null);
      try {
        const res = await fetch(`/api/notebooks/${encodeURIComponent(name)}`);
        if (!res.ok) {
          throw new Error(`Could not open ${name}`);
        }
        const data = (await res.json()) as { name: string; notebook: NotebookDocument };
        setActiveNotebookName(data.name);
        setNotebook(data.notebook);
        setActiveCellId(data.notebook.cells[0]?.id ?? '');
        setIsDirty(false);
        await refreshVariables(data.name, data.notebook.metadata.kernelspec.name);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingNotebook(false);
      }
    },
    [refreshVariables]
  );

  const fetchTerminalSessions = useCallback(async () => {
    try {
      const [sessRes, permRes] = await Promise.all([
        fetch('/api/terminal/sessions'),
        fetch('/api/permissions'),
      ]);
      if (sessRes.ok) {
        const data = (await sessRes.json()) as { sessions: TerminalSessionInfo[] };
        setTerminalSessions(data.sessions);
        if (data.sessions.length > 0) {
          setActiveTerminalId((prev) =>
            data.sessions.some((s) => s.id === prev) ? prev : data.sessions[0].id
          );
        }
      }
      if (permRes.ok) {
        const permData = (await permRes.json()) as { allowAllCommands: boolean };
        setAllowAllCommands(permData.allowAllCommands);
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleTogglePermissions = useCallback(async () => {
    try {
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowAllCommands: true }),
      });
      if (res.ok) {
        setAllowAllCommands(true);
        setTerminalOpen(true);
        const target = activeTerminalId || terminalSessions[0]?.id || 'term-1';
        setTerminalLogs((prev) => ({
          ...prev,
          [target]: [
            ...(prev[target] ?? []),
            {
              id: `perm-${Date.now()}`,
              type: 'info',
              text: 'All permissions allowed: root (uid=0), su, sudo, apt, apt-get, dpkg, bash, sh, python3, node, pip, npm, filesystem, and network.',
              timestamp: new Date().toISOString(),
            },
          ],
        }));
      }
    } catch {
      // Ignore
    }
  }, [activeTerminalId, terminalSessions]);

  const fetchPorts = useCallback(async () => {
    try {
      const res = await fetch('/api/ports');
      if (res.ok) {
        const data = (await res.json()) as { ports: PortStatusEntry[] };
        setPorts(data.ports ?? []);
      }
    } catch {
      // Ignore transient port scan failures
    }
  }, []);

  const handleAddPort = useCallback(async (port: number) => {
    const res = await fetch('/api/ports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port, publicEnabled: false }),
    });
    const data = (await res.json()) as { ports?: PortStatusEntry[]; error?: string };
    if (!res.ok) {
      throw new Error(data.error || `Failed to open localhost:${port}`);
    }
    setPorts(data.ports ?? []);
    setActiveWebViewPort(port);
  }, []);

  const handleTogglePublicPort = useCallback(
    async (port: number, publicEnabled: boolean) => {
      const res = await fetch(`/api/ports/${port}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicEnabled }),
      });
      if (res.ok) {
        const data = (await res.json()) as { ports: PortStatusEntry[] };
        setPorts(data.ports ?? []);
      }
    },
    []
  );

  const handleRemovePort = useCallback(async (port: number) => {
    const res = await fetch(`/api/ports/${port}`, { method: 'DELETE' });
    if (res.ok) {
      const data = (await res.json()) as { ports: PortStatusEntry[] };
      setPorts(data.ports ?? []);
      setActiveWebViewPort((prev) =>
        prev === port ? data.ports?.[0]?.port ?? null : prev
      );
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await fetchWorkspaceList();
        if (!mounted) return;
        if (list.length > 0) {
          await openNotebook(list[0].name);
        } else {
          setLoadingNotebook(false);
        }
        await Promise.all([fetchTerminalSessions(), fetchPorts()]);
      } catch (err) {
        if (mounted) {
          setErrorBanner(err instanceof Error ? err.message : String(err));
          setLoadingNotebook(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fetchWorkspaceList, openNotebook, fetchTerminalSessions, fetchPorts]);

  useEffect(() => {
    if (!webViewOpen) return;
    void fetchPorts();
    const timer = setInterval(() => {
      void fetchPorts();
    }, 5000);
    return () => clearInterval(timer);
  }, [webViewOpen, fetchPorts]);

  const saveNotebook = useCallback(
    async (docOverride?: NotebookDocument, nameOverride?: string) => {
      const targetDoc = docOverride ?? notebook;
      const targetName = nameOverride ?? activeNotebookName;
      if (!targetDoc || !targetName) return;
      setIsSaving(true);
      setErrorBanner(null);
      try {
        const res = await fetch(`/api/notebooks/${encodeURIComponent(targetName)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notebook: targetDoc }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || 'Failed to save notebook.');
        }
        setIsDirty(false);
        await fetchWorkspaceList();
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSaving(false);
      }
    },
    [notebook, activeNotebookName, fetchWorkspaceList]
  );

  const runCellById = useCallback(
    async (cellId: string, advance: boolean, currentDoc?: NotebookDocument): Promise<NotebookDocument | null> => {
      const doc = currentDoc ?? notebook;
      if (!doc || !activeNotebookName) return null;
      const idx = doc.cells.findIndex((c) => c.id === cellId);
      if (idx === -1) return doc;
      const cell = doc.cells[idx];

      if (advance) {
        const nextCell = doc.cells[idx + 1];
        if (nextCell) {
          setActiveCellId(nextCell.id);
        } else {
          const inserted = insertCell(doc.cells, doc.cells.length, 'code', '');
          const updated = { ...doc, cells: inserted.cells };
          setNotebook(updated);
          setActiveCellId(inserted.insertedId);
          setIsDirty(true);
        }
      }

      if (cell.cell_type === 'markdown') {
        return doc;
      }

      setRunningCellIds((prev) => ({ ...prev, [cellId]: true }));
      setKernelStatus('busy');
      setErrorBanner(null);

      try {
        const res = await fetch('/api/kernel/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notebookName: activeNotebookName,
            language: doc.metadata.kernelspec.name,
            code: cell.source,
          }),
        });
        const data = (await res.json()) as {
          outputs?: CellOutput[];
          executionCount?: number;
          executionTimeMs?: number;
          variables?: KernelVariable[];
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || 'Kernel execution failed.');
        }

        const nextOutputs = data.outputs ?? [];
        const hasError = nextOutputs.some((o) => o.output_type === 'error');
        setKernelStatus(hasError ? 'error' : 'idle');
        if (data.variables) {
          setVariables(data.variables);
        }

        let updatedDoc: NotebookDocument | null = null;
        setNotebook((prev) => {
          const base = prev ?? doc;
          const nextCells = updateCellExecutionResult(
            base.cells,
            cellId,
            nextOutputs,
            data.executionCount ?? null,
            data.executionTimeMs ?? null
          );
          updatedDoc = { ...base, cells: nextCells };
          return updatedDoc;
        });
        setIsDirty(true);
        await fetchWorkspaceList();
        return updatedDoc;
      } catch (err) {
        setKernelStatus('error');
        setErrorBanner(err instanceof Error ? err.message : String(err));
        return doc;
      } finally {
        setRunningCellIds((prev) => {
          const copy = { ...prev };
          delete copy[cellId];
          return copy;
        });
      }
    },
    [notebook, activeNotebookName, fetchWorkspaceList]
  );

  const handleRunAll = useCallback(async () => {
    if (!notebook || isExecutingAll) return;
    setIsExecutingAll(true);
    let workingDoc = notebook;
    try {
      for (const cell of notebook.cells) {
        if (cell.cell_type === 'code') {
          setActiveCellId(cell.id);
          const nextDoc = await runCellById(cell.id, false, workingDoc);
          if (nextDoc) workingDoc = nextDoc;
        }
      }
    } finally {
      setIsExecutingAll(false);
    }
  }, [notebook, isExecutingAll, runCellById]);

  const handleRestartKernel = useCallback(async () => {
    if (!notebook || !activeNotebookName) return;
    setKernelStatus('restarting');
    try {
      await fetch('/api/kernel/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebookName: activeNotebookName,
          language: notebook.metadata.kernelspec.name,
        }),
      });
      setVariables([]);
      setKernelStatus('idle');
    } catch (err) {
      setKernelStatus('error');
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  }, [notebook, activeNotebookName]);

  const handleInterruptKernel = useCallback(async () => {
    if (!notebook || !activeNotebookName) return;
    await fetch('/api/kernel/interrupt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notebookName: activeNotebookName,
        language: notebook.metadata.kernelspec.name,
      }),
    });
    setRunningCellIds({});
    setIsExecutingAll(false);
    setKernelStatus('idle');
  }, [notebook, activeNotebookName]);

  const handleChangeKernel = useCallback(
    async (lang: KernelLanguage) => {
      if (!notebook) return;
      const updated: NotebookDocument = {
        ...notebook,
        metadata: {
          kernelspec: {
            name: lang,
            display_name: lang === 'python' ? 'Python 3.10' : 'Node.js 22',
            language: lang === 'python' ? 'python' : 'javascript',
          },
          language_info: {
            name: lang === 'python' ? 'python' : 'javascript',
            version: lang === 'python' ? '3.10' : '22',
          },
        },
      };
      setNotebook(updated);
      setIsDirty(true);
      await refreshVariables(activeNotebookName, lang);
    },
    [notebook, activeNotebookName, refreshVariables]
  );

  const appendTerminalLog = useCallback((sessionId: string, entry: TerminalLogEntry) => {
    setTerminalLogs((prev) => ({
      ...prev,
      [sessionId]: [...(prev[sessionId] ?? []), entry],
    }));
  }, []);

  const handleExecuteTerminalCommand = useCallback(
    async (sessionId: string, command: string) => {
      const targetId = sessionId || activeTerminalId || terminalSessions[0]?.id || 'term-1';
      const now = new Date().toISOString();
      const cmdEntryId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const stdoutEntryId = `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const stderrEntryId = `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      setTerminalSessions((prev) =>
        prev.map((s) => (s.id === targetId ? { ...s, busy: true } : s))
      );

      appendTerminalLog(targetId, {
        id: cmdEntryId,
        type: 'command',
        text: command,
        timestamp: now,
      });

      const appendChunk = (entryId: string, kind: 'stdout' | 'stderr', chunk: string) => {
        setTerminalLogs((prev) => {
          const list = [...(prev[targetId] ?? [])];
          const existingIdx = list.findIndex((e) => e.id === entryId);
          if (existingIdx !== -1) {
            list[existingIdx] = {
              ...list[existingIdx],
              text: list[existingIdx].text + chunk,
            };
          } else {
            list.push({
              id: entryId,
              type: kind,
              text: chunk,
              timestamp: new Date().toISOString(),
            });
          }
          return { ...prev, [targetId]: list };
        });
      };

      try {
        const res = await fetch('/api/terminal/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: targetId, command }),
        });

        if (!res.ok || !res.body) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error || 'Terminal streaming failed.');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundaryIdx = buffer.indexOf('\n\n');
          while (boundaryIdx !== -1) {
            const rawEvent = buffer.slice(0, boundaryIdx);
            buffer = buffer.slice(boundaryIdx + 2);
            boundaryIdx = buffer.indexOf('\n\n');

            let eventType = 'message';
            let dataLine = '';
            for (const line of rawEvent.split('\n')) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLine += line.slice(5).trim();
              }
            }
            if (!dataLine) continue;

            try {
              const payload = JSON.parse(dataLine) as {
                text?: string;
                exitCode?: number;
                cwd?: string;
                durationMs?: number;
              };
              if (eventType === 'stdout' && payload.text) {
                appendChunk(stdoutEntryId, 'stdout', payload.text);
              } else if (eventType === 'stderr' && payload.text) {
                appendChunk(stderrEntryId, 'stderr', payload.text);
              } else if (eventType === 'done') {
                setTerminalLogs((prev) => {
                  const list = [...(prev[targetId] ?? [])];
                  const cmdIdx = list.findIndex((e) => e.id === cmdEntryId);
                  if (cmdIdx !== -1) {
                    list[cmdIdx] = {
                      ...list[cmdIdx],
                      exitCode: payload.exitCode,
                      durationMs: payload.durationMs,
                    };
                  }
                  return { ...prev, [targetId]: list };
                });
                setTerminalSessions((prev) =>
                  prev.map((s) =>
                    s.id === targetId
                      ? { ...s, busy: false, cwd: payload.cwd ?? s.cwd }
                      : s
                  )
                );
              }
            } catch {
              // Ignore malformed SSE event
            }
          }
        }

        setTerminalSessions((prev) =>
          prev.map((s) => (s.id === targetId ? { ...s, busy: false } : s))
        );
        await Promise.all([fetchWorkspaceList(), fetchPorts()]);
      } catch (err) {
        appendTerminalLog(targetId, {
          id: `err-${Date.now()}`,
          type: 'stderr',
          text: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        });
        setTerminalSessions((prev) =>
          prev.map((s) => (s.id === targetId ? { ...s, busy: false } : s))
        );
      }
    },
    [activeTerminalId, terminalSessions, appendTerminalLog, fetchWorkspaceList, fetchPorts]
  );

  const handleSendTerminalInput = useCallback(
    async (sessionId: string, input: string, eof = false) => {
      if (!eof) {
        appendTerminalLog(sessionId, {
          id: `stdin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'info',
          text: `> ${input}`,
          timestamp: new Date().toISOString(),
        });
      } else {
        appendTerminalLog(sessionId, {
          id: `eof-${Date.now()}`,
          type: 'info',
          text: '^D (EOF sent)',
          timestamp: new Date().toISOString(),
        });
      }
      await fetch('/api/terminal/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, input, eof }),
      });
    },
    [appendTerminalLog]
  );

  const handleRunCodeInTerminal = useCallback(
    async (rawCode: string) => {
      setTerminalOpen(true);
      let targetSession = activeTerminalId || terminalSessions[0]?.id;
      if (!targetSession) {
        const res = await fetch('/api/terminal/sessions', { method: 'POST' });
        const data = (await res.json()) as {
          session: TerminalSessionInfo;
          sessions: TerminalSessionInfo[];
        };
        setTerminalSessions(data.sessions);
        targetSession = data.session.id;
        setActiveTerminalId(targetSession);
      }

      const trimmed = rawCode.trim();
      if (!trimmed) return;

      let shellCommand = trimmed;
      if (trimmed.startsWith('%%bash') || trimmed.startsWith('%%sh')) {
        shellCommand = trimmed.split('\n').slice(1).join('\n');
      } else if (trimmed.startsWith('!')) {
        shellCommand = trimmed.slice(1).trim();
      } else {
        const lang = notebook?.metadata.kernelspec.name ?? 'python';
        const escaped = trimmed.replace(/'/g, `'"'"'`);
        shellCommand = lang === 'node' ? `node -e '${escaped}'` : `python3 -c '${escaped}'`;
      }

      await handleExecuteTerminalCommand(targetSession, shellCommand);
    },
    [activeTerminalId, terminalSessions, notebook, handleExecuteTerminalCommand]
  );

  const handleCreateTerminalSession = useCallback(async () => {
    setTerminalOpen(true);
    const res = await fetch('/api/terminal/sessions', { method: 'POST' });
    if (!res.ok) return;
    const data = (await res.json()) as {
      session: TerminalSessionInfo;
      sessions: TerminalSessionInfo[];
    };
    setTerminalSessions(data.sessions);
    setActiveTerminalId(data.session.id);
  }, []);

  const handleCloseTerminalSession = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/terminal/sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { sessions: TerminalSessionInfo[] };
      setTerminalSessions(data.sessions);
      if (activeTerminalId === id && data.sessions[0]) {
        setActiveTerminalId(data.sessions[0].id);
      }
    },
    [activeTerminalId]
  );

  const handleInterruptTerminal = useCallback(async (sessionId: string) => {
    await fetch('/api/terminal/interrupt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    setTerminalSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, busy: false } : s))
    );
  }, []);

  const handleCompleteTerminal = useCallback(
    async (sessionId: string, prefix: string): Promise<string[]> => {
      const res = await fetch('/api/terminal/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, prefix }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { matches: string[] };
      return data.matches ?? [];
    },
    []
  );

  const handleCreateNotebook = useCallback(
    async (name: string, kernel: KernelLanguage) => {
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, kernel }),
      });
      const data = (await res.json()) as {
        summary?: NotebookSummary;
        notebook?: NotebookDocument;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create notebook.');
      }
      await fetchWorkspaceList();
      if (data.summary && data.notebook) {
        setActiveNotebookName(data.summary.name);
        setNotebook(data.notebook);
        setActiveCellId(data.notebook.cells[0]?.id ?? '');
        setIsDirty(false);
        setVariables([]);
      }
    },
    [fetchWorkspaceList]
  );

  const handleDeleteNotebook = useCallback(
    async (name: string) => {
      const res = await fetch(`/api/notebooks/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (!res.ok) return;
      const remaining = await fetchWorkspaceList();
      if (name === activeNotebookName && remaining[0]) {
        await openNotebook(remaining[0].name);
      }
    },
    [fetchWorkspaceList, activeNotebookName, openNotebook]
  );

  const handleExportNotebook = useCallback(() => {
    if (!notebook || !activeNotebookName) return;
    const json = serializeIpynb(notebook);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeNotebookName;
    a.click();
    URL.revokeObjectURL(url);
  }, [notebook, activeNotebookName]);

  const handleImportNotebook = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = parseIpynb(text);
        const targetName = file.name.endsWith('.ipynb')
          ? file.name
          : `${file.name}.ipynb`;
        const uniqueName = notebooks.some((n) => n.name === targetName)
          ? targetName.replace(/\.ipynb$/, `_${Date.now().toString().slice(-4)}.ipynb`)
          : targetName;

        const res = await fetch('/api/notebooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: uniqueName,
            kernel: parsed.metadata.kernelspec.name,
            notebook: parsed,
          }),
        });
        if (!res.ok) throw new Error('Failed to import .ipynb file.');
        await fetchWorkspaceList();
        await openNotebook(uniqueName);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : String(err));
      }
    },
    [notebooks, fetchWorkspaceList, openNotebook]
  );

  const insertCellRelative = useCallback(
    (position: 'above' | 'below' | 'end', type: 'code' | 'markdown') => {
      if (!notebook) return;
      const activeIdx = notebook.cells.findIndex((c) => c.id === activeCellId);
      const targetIdx =
        position === 'end'
          ? notebook.cells.length
          : activeIdx === -1
          ? notebook.cells.length
          : position === 'above'
          ? activeIdx
          : activeIdx + 1;
      const { cells, insertedId } = insertCell(notebook.cells, targetIdx, type, '');
      setNotebook({ ...notebook, cells });
      setActiveCellId(insertedId);
      setIsDirty(true);
    },
    [notebook, activeCellId]
  );

  const executePaletteCommand = useCallback(
    (commandId: string) => {
      if (!notebook) return;
      switch (commandId) {
        case 'cell.run_and_advance':
          if (activeCellId) void runCellById(activeCellId, true);
          break;
        case 'cell.run_in_place':
          if (activeCellId) void runCellById(activeCellId, false);
          break;
        case 'cell.run_all':
          void handleRunAll();
          break;
        case 'cell.insert_code_below':
          insertCellRelative('below', 'code');
          break;
        case 'cell.insert_code_above':
          insertCellRelative('above', 'code');
          break;
        case 'cell.insert_markdown_below':
          insertCellRelative('below', 'markdown');
          break;
        case 'cell.toggle_type':
          if (activeCellId) {
            setNotebook({
              ...notebook,
              cells: toggleCellType(notebook.cells, activeCellId),
            });
            setIsDirty(true);
          }
          break;
        case 'cell.move_up':
          if (activeCellId) {
            setNotebook({
              ...notebook,
              cells: moveCell(notebook.cells, activeCellId, 'up'),
            });
            setIsDirty(true);
          }
          break;
        case 'cell.move_down':
          if (activeCellId) {
            setNotebook({
              ...notebook,
              cells: moveCell(notebook.cells, activeCellId, 'down'),
            });
            setIsDirty(true);
          }
          break;
        case 'cell.send_to_terminal': {
          const active = notebook.cells.find((c) => c.id === activeCellId);
          if (active) void handleRunCodeInTerminal(active.source);
          break;
        }
        case 'cell.clear_all_outputs':
          setNotebook({ ...notebook, cells: clearAllOutputs(notebook.cells) });
          setIsDirty(true);
          break;
        case 'cell.delete':
          if (activeCellId) {
            const nextCells = deleteCell(notebook.cells, activeCellId);
            setNotebook({ ...notebook, cells: nextCells });
            setActiveCellId(nextCells[0]?.id ?? '');
            setIsDirty(true);
          }
          break;
        case 'kernel.restart':
          void handleRestartKernel();
          break;
        case 'kernel.interrupt':
          void handleInterruptKernel();
          break;
        case 'kernel.switch_python':
          void handleChangeKernel('python');
          break;
        case 'kernel.switch_node':
          void handleChangeKernel('node');
          break;
        case 'terminal.toggle':
          setTerminalOpen((v) => {
            if (v) setTerminalFullScreen(false);
            return !v;
          });
          break;
        case 'terminal.toggle_fullscreen':
          setTerminalOpen(true);
          setTerminalFullScreen((v) => !v);
          break;
        case 'terminal.new_session':
          void handleCreateTerminalSession();
          break;
        case 'terminal.clear':
          if (activeTerminalId) {
            setTerminalLogs((prev) => ({ ...prev, [activeTerminalId]: [] }));
          }
          break;
        case 'terminal.toggle_permissions':
          void handleTogglePermissions();
          break;
        case 'webview.toggle':
          setWebViewOpen((v) => !v);
          break;
        case 'ports.refresh':
          setWebViewOpen(true);
          void fetchPorts();
          break;
        case 'file.new_notebook':
          setNewNotebookOpen(true);
          break;
        case 'file.save':
          void saveNotebook();
          break;
        case 'file.export':
          handleExportNotebook();
          break;
        case 'view.toggle_sidebar':
          setSidebarOpen((v) => !v);
          break;
        case 'view.show_variables':
          setSidebarOpen(true);
          setSidebarTab('variables');
          break;
        case 'view.show_outline':
          setSidebarOpen(true);
          setSidebarTab('outline');
          break;
        default:
          break;
      }
    },
    [
      notebook,
      activeCellId,
      activeTerminalId,
      runCellById,
      handleRunAll,
      insertCellRelative,
      handleRunCodeInTerminal,
      handleRestartKernel,
      handleInterruptKernel,
      handleChangeKernel,
      handleCreateTerminalSession,
      handleTogglePermissions,
      fetchPorts,
      saveNotebook,
      handleExportNotebook,
    ]
  );

  // Global keyboard shortcuts (Command Palette, Save, Terminal toggle, Jupyter Command Mode)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNotebook();
        return;
      }
      if (mod && e.key === '`') {
        e.preventDefault();
        setTerminalOpen((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        return;
      }

      // Jupyter Command Mode shortcuts when not focused in an input/textarea/select
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        commandPaletteOpen ||
        newNotebookOpen ||
        !notebook
      ) {
        return;
      }

      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        insertCellRelative('above', 'code');
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        insertCellRelative('below', 'code');
      } else if (e.key === 'm' || e.key === 'M') {
        if (activeCellId) {
          e.preventDefault();
          setNotebook({
            ...notebook,
            cells: toggleCellType(notebook.cells, activeCellId, 'markdown'),
          });
          setIsDirty(true);
        }
      } else if (e.key === 'y' || e.key === 'Y') {
        if (activeCellId) {
          e.preventDefault();
          setNotebook({
            ...notebook,
            cells: toggleCellType(notebook.cells, activeCellId, 'code'),
          });
          setIsDirty(true);
        }
      } else if (e.key === 'd' || e.key === 'D') {
        const now = Date.now();
        if (now - lastDKeyTimeRef.current < 450 && activeCellId) {
          e.preventDefault();
          const nextCells = deleteCell(notebook.cells, activeCellId);
          setNotebook({ ...notebook, cells: nextCells });
          setActiveCellId(nextCells[0]?.id ?? '');
          setIsDirty(true);
          lastDKeyTimeRef.current = 0;
        } else {
          lastDKeyTimeRef.current = now;
        }
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        const idx = notebook.cells.findIndex((c) => c.id === activeCellId);
        if (idx !== -1 && idx < notebook.cells.length - 1) {
          e.preventDefault();
          setActiveCellId(notebook.cells[idx + 1].id);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        const idx = notebook.cells.findIndex((c) => c.id === activeCellId);
        if (idx > 0) {
          e.preventDefault();
          setActiveCellId(notebook.cells[idx - 1].id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    notebook,
    activeCellId,
    commandPaletteOpen,
    newNotebookOpen,
    saveNotebook,
    insertCellRelative,
  ]);

  const outline = useMemo(
    () => (notebook ? extractMarkdownOutline(notebook.cells) : []),
    [notebook]
  );

  const handleJumpToOutline = (cellId: string) => {
    setActiveCellId(cellId);
    const el = document.getElementById(`cell-${cellId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const activeDoc = notebook ?? createEmptyNotebook('python');

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B0E14] text-[#E6EDF3] overflow-hidden">
      <TopBar
        sidebarOpen={sidebarOpen}
        sidebarTab={sidebarTab}
        terminalOpen={terminalOpen}
        webViewOpen={webViewOpen}
        isExecutingAll={isExecutingAll}
        onToggleFiles={() => {
          if (sidebarOpen && sidebarTab === 'files') {
            setSidebarOpen(false);
          } else {
            setSidebarOpen(true);
            setSidebarTab('files');
          }
        }}
        onToggleVariables={() => {
          if (sidebarOpen && sidebarTab === 'variables') {
            setSidebarOpen(false);
          } else {
            setSidebarOpen(true);
            setSidebarTab('variables');
          }
        }}
        onToggleTerminal={() =>
          setTerminalOpen((v) => {
            if (v) setTerminalFullScreen(false);
            return !v;
          })
        }
        onToggleWebView={() => setWebViewOpen((v) => !v)}
        onOpenCommands={() => setCommandPaletteOpen(true)}
        onRunAll={() => void handleRunAll()}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {sidebarOpen && !(webViewOpen && webViewExpanded) && (
          <Sidebar
            activeTab={sidebarTab}
            onTabChange={setSidebarTab}
            notebooks={notebooks}
            workspaceFiles={workspaceFiles}
            activeNotebookName={activeNotebookName}
            outline={outline}
            variables={variables}
            onSelectNotebook={(name) => void openNotebook(name)}
            onNewNotebook={() => setNewNotebookOpen(true)}
            onDeleteNotebook={(name) => void handleDeleteNotebook(name)}
            onRefreshFiles={() => void fetchWorkspaceList()}
            onInspectFileInTerminal={(filename) => {
              setTerminalOpen(true);
              const target = activeTerminalId || terminalSessions[0]?.id || 'term-1';
              void handleExecuteTerminalCommand(target, `head -n 15 "${filename}"`);
            }}
            onJumpToOutline={handleJumpToOutline}
            onRefreshVariables={() =>
              void refreshVariables(
                activeNotebookName,
                activeDoc.metadata.kernelspec.name
              )
            }
          />
        )}

        <main
          className={
            webViewOpen && webViewExpanded && !terminalFullScreen
              ? 'hidden'
              : 'flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden'
          }
        >
          <NotebookToolbar
            notebookName={activeNotebookName || 'Untitled.ipynb'}
            isDirty={isDirty}
            isSaving={isSaving}
            cellCount={activeDoc.cells.length}
            kernelLanguage={activeDoc.metadata.kernelspec.name}
            kernelStatus={kernelStatus}
            onAddCodeCell={() => insertCellRelative('below', 'code')}
            onAddMarkdownCell={() => insertCellRelative('below', 'markdown')}
            onSave={() => void saveNotebook()}
            onClearOutputs={() => {
              if (!notebook) return;
              setNotebook({ ...notebook, cells: clearAllOutputs(notebook.cells) });
              setIsDirty(true);
            }}
            onRestartKernel={() => void handleRestartKernel()}
            onInterruptKernel={() => void handleInterruptKernel()}
            onChangeKernel={(lang) => void handleChangeKernel(lang)}
            onExport={handleExportNotebook}
            onImportFile={(file) => void handleImportNotebook(file)}
          />

          {errorBanner && (
            <div
              role="alert"
              className="px-4 py-2 bg-red-950/60 border-b border-red-500/30 text-xs text-red-200 flex items-center justify-between gap-4 shrink-0"
            >
              <span>{errorBanner}</span>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-red-300 hover:text-white font-medium"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Scrollable Notebook Canvas */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 min-h-0">
            {loadingNotebook ? (
              <div className="max-w-4xl mx-auto space-y-4">
                <div className="h-28 rounded-lg bg-[#111620] border border-white/[0.06] animate-pulse" />
                <div className="h-44 rounded-lg bg-[#111620] border border-white/[0.06] animate-pulse" />
              </div>
            ) : !notebook ? (
              <div className="max-w-lg mx-auto text-center py-16 space-y-4">
                <h2 className="text-lg font-semibold text-[#F0F6FC]">
                  No Notebook Open
                </h2>
                <p className="text-sm text-[#8B949E]">
                  Create a new Python or Node.js notebook or select one from the Explorer sidebar.
                </p>
                <button
                  type="button"
                  onClick={() => setNewNotebookOpen(true)}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
                >
                  Create Notebook
                </button>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-4 pb-10">
                {notebook.cells.map((cell, idx) => (
                  <NotebookCell
                    key={cell.id}
                    cell={cell}
                    index={idx}
                    totalCells={notebook.cells.length}
                    isActive={cell.id === activeCellId}
                    isRunning={Boolean(runningCellIds[cell.id])}
                    onFocus={() => setActiveCellId(cell.id)}
                    onChangeSource={(src) => {
                      setNotebook({
                        ...notebook,
                        cells: updateCellSource(notebook.cells, cell.id, src),
                      });
                      setIsDirty(true);
                    }}
                    onRun={(advance) => void runCellById(cell.id, advance)}
                    onMove={(dir) => {
                      setNotebook({
                        ...notebook,
                        cells: moveCell(notebook.cells, cell.id, dir),
                      });
                      setIsDirty(true);
                    }}
                    onToggleType={() => {
                      setNotebook({
                        ...notebook,
                        cells: toggleCellType(notebook.cells, cell.id),
                      });
                      setIsDirty(true);
                    }}
                    onClearOutput={() => {
                      setNotebook({
                        ...notebook,
                        cells: clearCellOutput(notebook.cells, cell.id),
                      });
                      setIsDirty(true);
                    }}
                    onDelete={() => {
                      const nextCells = deleteCell(notebook.cells, cell.id);
                      setNotebook({ ...notebook, cells: nextCells });
                      setActiveCellId(nextCells[0]?.id ?? '');
                      setIsDirty(true);
                    }}
                    onRunInTerminal={(code) => void handleRunCodeInTerminal(code)}
                  />
                ))}

                {/* Bottom Cell Adder */}
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => insertCellRelative('end', 'code')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-white/[0.08] bg-[#111620] hover:bg-[#151B26] text-xs font-medium text-[#C9D1D9] hover:text-[#F0F6FC] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Add Code Cell</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertCellRelative('end', 'markdown')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-white/[0.08] bg-[#111620] hover:bg-[#151B26] text-xs font-medium text-[#C9D1D9] hover:text-[#F0F6FC] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Add Markdown Cell</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {terminalOpen && terminalSessions.length > 0 && (
            <TerminalPanel
              sessions={terminalSessions}
              activeSessionId={activeTerminalId}
              logsBySession={terminalLogs}
              height={terminalHeight}
              isFullScreen={terminalFullScreen}
              onToggleFullScreen={() => setTerminalFullScreen((v) => !v)}
              onResize={setTerminalHeight}
              onSelectSession={setActiveTerminalId}
              onCreateSession={() => void handleCreateTerminalSession()}
              onCloseSession={(id) => void handleCloseTerminalSession(id)}
              onExecuteCommand={handleExecuteTerminalCommand}
              onSendInput={handleSendTerminalInput}
              onInterruptCommand={handleInterruptTerminal}
              onClearLog={(id) =>
                setTerminalLogs((prev) => ({ ...prev, [id]: [] }))
              }
              onCompletePrefix={handleCompleteTerminal}
              allowAllCommands={allowAllCommands}
              onTogglePermissions={() => void handleTogglePermissions()}
              onHide={() => {
                setTerminalFullScreen(false);
                setTerminalOpen(false);
              }}
            />
          )}
        </main>

        {webViewOpen && (
          <WebViewPanel
            ports={ports}
            activePort={activeWebViewPort}
            isExpanded={webViewExpanded}
            onSelectPort={setActiveWebViewPort}
            onAddPort={handleAddPort}
            onTogglePublic={handleTogglePublicPort}
            onRemovePort={handleRemovePort}
            onRefreshPorts={fetchPorts}
            onToggleExpand={() => setWebViewExpanded((v) => !v)}
            onClose={() => {
              setWebViewExpanded(false);
              setWebViewOpen(false);
            }}
          />
        )}
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onExecuteCommand={executePaletteCommand}
      />

      <NewNotebookModal
        open={newNotebookOpen}
        onClose={() => setNewNotebookOpen(false)}
        onCreate={handleCreateNotebook}
      />
    </div>
  );
}
