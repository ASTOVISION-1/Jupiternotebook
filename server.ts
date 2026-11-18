import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { KernelManager } from './server/kernelManager';
import { NotebookStore } from './server/notebookStore';
import { PortManager } from './server/portManager';
import { TerminalManager } from './server/terminalManager';
import type { KernelLanguage, NotebookDocument } from './src/types/notebook';

const PORT = 3000;
const WORKSPACE_DIR = path.resolve(process.cwd(), 'workspace');

function getPublicBaseUrl(req: express.Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/$/, '');
  }
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use('/api', express.json({ limit: '5mb' }));

  const notebookStore = new NotebookStore(WORKSPACE_DIR);
  const kernelManager = new KernelManager(WORKSPACE_DIR);
  const terminalManager = new TerminalManager(WORKSPACE_DIR);
  const portManager = new PortManager();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, workspaceDir: WORKSPACE_DIR });
  });

  // Notebook & Workspace file endpoints
  app.get('/api/notebooks', (_req, res) => {
    try {
      res.json({
        notebooks: notebookStore.listNotebooks(),
        files: notebookStore.listWorkspaceFiles(),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/notebooks/:name', (req, res) => {
    try {
      const doc = notebookStore.readNotebook(req.params.name);
      res.json({ name: req.params.name, notebook: doc });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/notebooks', (req, res) => {
    try {
      const { name, kernel, notebook } = req.body as {
        name?: string;
        kernel?: KernelLanguage;
        notebook?: NotebookDocument;
      };
      if (!name) {
        return res.status(400).json({ error: 'Notebook name is required.' });
      }
      const summary = notebookStore.createNotebook(name, kernel ?? 'python', notebook);
      const doc = notebookStore.readNotebook(summary.name);
      return res.status(201).json({ summary, notebook: doc });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put('/api/notebooks/:name', (req, res) => {
    try {
      const { notebook } = req.body as { notebook?: NotebookDocument };
      if (!notebook) {
        return res.status(400).json({ error: 'Notebook payload is required.' });
      }
      const summary = notebookStore.saveNotebook(req.params.name, notebook);
      return res.json({ summary });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/notebooks/:name', (req, res) => {
    try {
      notebookStore.deleteNotebook(req.params.name);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Kernel execution endpoints
  app.post('/api/kernel/execute', async (req, res) => {
    try {
      const { notebookName, language, code } = req.body as {
        notebookName?: string;
        language?: KernelLanguage;
        code?: string;
      };
      if (!notebookName || !language) {
        return res.status(400).json({ error: 'notebookName and language are required.' });
      }
      const kernel = kernelManager.getKernel(notebookName, language);
      const result = await kernel.execute(code ?? '');
      const variables = await kernel.getVariables();
      return res.json({ ...result, variables });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/kernel/restart', async (req, res) => {
    try {
      const { notebookName, language } = req.body as {
        notebookName?: string;
        language?: KernelLanguage;
      };
      if (!notebookName || !language) {
        return res.status(400).json({ error: 'notebookName and language are required.' });
      }
      await kernelManager.restartKernel(notebookName, language);
      return res.json({ ok: true, variables: [] });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/kernel/interrupt', async (req, res) => {
    try {
      const { notebookName, language } = req.body as {
        notebookName?: string;
        language?: KernelLanguage;
      };
      if (!notebookName || !language) {
        return res.status(400).json({ error: 'notebookName and language are required.' });
      }
      await kernelManager.interruptKernel(notebookName, language);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/kernel/variables', async (req, res) => {
    try {
      const notebookName = String(req.query.notebookName ?? '');
      const language = (req.query.language === 'node' ? 'node' : 'python') as KernelLanguage;
      if (!notebookName) {
        return res.json({ variables: [] });
      }
      const kernel = kernelManager.getKernel(notebookName, language);
      const variables = await kernel.getVariables();
      return res.json({ variables });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Integrated Terminal endpoints
  app.get('/api/terminal/sessions', (_req, res) => {
    res.json({ sessions: terminalManager.listSessions() });
  });

  app.post('/api/terminal/sessions', (req, res) => {
    const { title } = (req.body ?? {}) as { title?: string };
    const session = terminalManager.createSession(title);
    res.status(201).json({ session, sessions: terminalManager.listSessions() });
  });

  app.delete('/api/terminal/sessions/:id', (req, res) => {
    terminalManager.closeSession(req.params.id);
    res.json({ sessions: terminalManager.listSessions() });
  });

  app.post('/api/terminal/exec', async (req, res) => {
    try {
      const { sessionId, command } = req.body as {
        sessionId?: string;
        command?: string;
      };
      if (!sessionId || typeof command !== 'string') {
        return res.status(400).json({ error: 'sessionId and command are required.' });
      }
      const result = await terminalManager.execute(sessionId, command);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/terminal/stream', (req, res) => {
    const { sessionId, command } = req.body as {
      sessionId?: string;
      command?: string;
    };
    if (!sessionId || typeof command !== 'string') {
      return res.status(400).json({ error: 'sessionId and command are required.' });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let closed = false;
    const sendEvent = (event: string, data: unknown) => {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const cleanup = terminalManager.executeStream(sessionId, command, {
      onStdout: (chunk) => sendEvent('stdout', { text: chunk }),
      onStderr: (chunk) => sendEvent('stderr', { text: chunk }),
      onDone: (result) => {
        sendEvent('done', result);
        if (!closed) {
          closed = true;
          res.end();
        }
      },
    });

    res.on('close', () => {
      if (!closed) {
        closed = true;
        cleanup();
      }
    });
  });

  app.post('/api/terminal/input', (req, res) => {
    const { sessionId, input, eof } = req.body as {
      sessionId?: string;
      input?: string;
      eof?: boolean;
    };
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required.' });
    }
    const sent = terminalManager.sendInput(sessionId, input ?? '', Boolean(eof));
    return res.json({ sent });
  });

  app.post('/api/terminal/interrupt', (req, res) => {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required.' });
    }
    const interrupted = terminalManager.interruptSession(sessionId);
    return res.json({ interrupted });
  });

  app.post('/api/terminal/complete', (req, res) => {
    const { sessionId, prefix } = req.body as { sessionId?: string; prefix?: string };
    const matches = terminalManager.complete(sessionId ?? 'term-1', prefix ?? '');
    return res.json({ matches });
  });

  app.get('/api/permissions', (_req, res) => {
    kernelManager.setUnrestricted(true);
    terminalManager.setUnrestricted(true);
    res.json({
      allowAllCommands: true,
      user: 'root',
      capabilities: ['apt', 'apt-get', 'dpkg', 'su', 'sudo', 'bash', 'sh', 'python3', 'node', 'npm', 'pip'],
    });
  });

  app.post('/api/permissions', (_req, res) => {
    kernelManager.setUnrestricted(true);
    terminalManager.setUnrestricted(true);
    res.json({
      allowAllCommands: true,
      user: 'root',
      capabilities: ['apt', 'apt-get', 'dpkg', 'su', 'sudo', 'bash', 'sh', 'python3', 'node', 'npm', 'pip'],
    });
  });

  // Localhost Port Registry & Public Internet Deployment endpoints
  app.get('/api/ports', async (req, res) => {
    try {
      const ports = await portManager.listPorts(getPublicBaseUrl(req));
      res.json({ ports });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/ports', async (req, res) => {
    try {
      const { port, label, publicEnabled } = (req.body ?? {}) as {
        port?: number | string;
        label?: string;
        publicEnabled?: boolean;
      };
      const entry = portManager.registerPort(
        port,
        label,
        publicEnabled !== false
      );
      const ports = await portManager.listPorts(getPublicBaseUrl(req));
      const enriched = ports.find((p) => p.port === entry.port);
      res.status(201).json({ entry: enriched ?? entry, ports });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch('/api/ports/:port', async (req, res) => {
    try {
      const { publicEnabled } = (req.body ?? {}) as { publicEnabled?: boolean };
      const entry = portManager.setPublicEnabled(req.params.port, Boolean(publicEnabled));
      const ports = await portManager.listPorts(getPublicBaseUrl(req));
      res.json({ entry, ports });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/ports/:port', async (req, res) => {
    portManager.removePort(req.params.port);
    const ports = await portManager.listPorts(getPublicBaseUrl(req));
    res.json({ ports });
  });

  // Public Internet proxy for deployed localhost:<port> services
  app.all(['/p/:port', '/p/:port/*'], (req, res) => {
    const port = Number(req.params.port);
    portManager.proxyRequest(port, `/p/${port}`, req, res, true);
  });

  // Embedded Web View proxy for localhost:<port> services
  app.all(['/preview/:port', '/preview/:port/*'], (req, res) => {
    const port = Number(req.params.port);
    portManager.proxyRequest(port, `/preview/${port}`, req, res, false);
  });

  // Vite middleware in dev, static assets in production
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist'));
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Jupiter Notebook server listening on http://localhost:${PORT}`);
  });
}

startServer();
