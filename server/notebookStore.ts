import fs from 'node:fs';
import path from 'node:path';
import type {
  KernelLanguage,
  NotebookDocument,
  NotebookSummary,
  WorkspaceFileEntry,
} from '../src/types/notebook';
import {
  createEmptyNotebook,
  parseIpynb,
  serializeIpynb,
  validateNotebookFilename,
} from '../src/utils/notebookLogic';
import { resolveSafeWorkspacePath } from './kernelHelpers';

const SAMPLE_CSV = `service,quarter,requests_k,p95_ms,error_rate
inference-api,Q1,1420,42.5,0.012
inference-api,Q2,1890,38.1,0.009
inference-api,Q3,2410,35.4,0.007
inference-api,Q4,3120,31.8,0.005
vector-index,Q1,980,18.2,0.004
vector-index,Q2,1340,16.9,0.003
vector-index,Q3,1720,15.5,0.003
vector-index,Q4,2180,14.1,0.002
`;

function buildStarterPythonNotebook(): NotebookDocument {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        name: 'python',
        display_name: 'Python 3.10',
        language: 'python',
      },
      language_info: {
        name: 'python',
        version: '3.10',
      },
    },
    cells: [
      {
        id: 'seed-md-1',
        cell_type: 'markdown',
        source:
          '# Telemetry & Latency Analysis\n\nThis notebook loads `metrics_2026.csv` from the shared workspace directory, computes per-service throughput and p95 latency trends, and renders both an HTML summary table and an SVG chart.\n\n- Press `Shift+Enter` to run a cell and advance\n- Press `Ctrl+Shift+P` (or click **Commands**) to open the Command Palette\n- Toggle the **Integrated Terminal** below to inspect workspace files with `ls` or `cat`',
        execution_count: null,
        outputs: [],
      },
      {
        id: 'seed-py-1',
        cell_type: 'code',
        source: `import csv, statistics

with open("metrics_2026.csv", "r", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

for row in rows:
    row["requests_k"] = int(row["requests_k"])
    row["p95_ms"] = float(row["p95_ms"])
    row["error_rate"] = float(row["error_rate"])

print(f"Loaded {len(rows)} telemetry records across {len({r['service'] for r in rows})} services.")
table(rows)`,
        execution_count: null,
        outputs: [],
      },
      {
        id: 'seed-py-2',
        cell_type: 'code',
        source: `# Aggregate quarterly throughput & render an inline SVG bar chart
quarters = ["Q1", "Q2", "Q3", "Q4"]
totals = {
    q: sum(r["requests_k"] for r in rows if r["quarter"] == q)
    for q in quarters
}
max_val = max(totals.values())
mean_p95 = statistics.mean(r["p95_ms"] for r in rows)

bars = []
for idx, q in enumerate(quarters):
    val = totals[q]
    bar_h = int((val / max_val) * 110)
    x = 52 + idx * 105
    y = 140 - bar_h
    bars.append(
        f'<rect x="{x}" y="{y}" width="54" height="{bar_h}" rx="4" fill="#3B82F6" />'
        f'<text x="{x + 27}" y="{y - 8}" text-anchor="middle" fill="#E6EDF3" font-size="11" font-family="JetBrains Mono, monospace">{val:,}k</text>'
        f'<text x="{x + 27}" y="162" text-anchor="middle" fill="#8B949E" font-size="11" font-family="JetBrains Mono, monospace">{q}</text>'
    )

svg = f'''<svg viewBox="0 0 480 185" width="480" height="185" xmlns="http://www.w3.org/2000/svg" style="background:#090C11;border:1px solid rgba(255,255,255,0.08);border-radius:8px;">
  <text x="20" y="24" fill="#F0F6FC" font-size="12" font-weight="600" font-family="Plus Jakarta Sans, sans-serif">Quarterly Request Volume (thousands) · Mean p95: {mean_p95:.1f} ms</text>
  <line x1="20" y1="140" x2="460" y2="140" stroke="rgba(255,255,255,0.12)" stroke-width="1" />
  {''.join(bars)}
</svg>'''

SVG(svg)`,
        execution_count: null,
        outputs: [],
      },
      {
        id: 'seed-py-3',
        cell_type: 'code',
        source: `%who`,
        execution_count: null,
        outputs: [],
      },
    ],
  };
}

function buildStarterShellNotebook(): NotebookDocument {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        name: 'node',
        display_name: 'Node.js 22',
        language: 'javascript',
      },
      language_info: {
        name: 'javascript',
        version: '22',
      },
    },
    cells: [
      {
        id: 'node-md-1',
        cell_type: 'markdown',
        source:
          '# Node.js Kernel & Magic Commands\n\nSwitch between **Python 3.10** and **Node.js 22** kernels or invoke shell magics (`!`, `%%bash`, `%time`, `%who`, `%reset`) directly inside cells.',
        execution_count: null,
        outputs: [],
      },
      {
        id: 'node-js-1',
        cell_type: 'code',
        source: `var endpoints = [
  { name: 'auth-gateway', rps: 4200, p99: 14.2 },
  { name: 'notebook-runner', rps: 1850, p99: 28.7 },
  { name: 'terminal-pty', rps: 940, p99: 9.4 }
];
var totalRps = endpoints.reduce((acc, e) => acc + e.rps, 0);
console.log('Node runtime:', process.version, '| Total RPS:', totalRps);
totalRps`,
        execution_count: null,
        outputs: [],
      },
      {
        id: 'node-bash-2',
        cell_type: 'code',
        source: `%%bash
echo "Working directory: $(pwd)"
ls -lh`,
        execution_count: null,
        outputs: [],
      },
    ],
  };
}

export class NotebookStore {
  readonly workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = path.resolve(workspaceDir);
    this.ensureSeeded();
  }

  private ensureSeeded() {
    if (!fs.existsSync(this.workspaceDir)) {
      fs.mkdirSync(this.workspaceDir, { recursive: true });
    }
    const csvPath = path.join(this.workspaceDir, 'metrics_2026.csv');
    if (!fs.existsSync(csvPath)) {
      fs.writeFileSync(csvPath, SAMPLE_CSV, 'utf-8');
    }

    const existingNotebooks = fs
      .readdirSync(this.workspaceDir)
      .filter((f) => f.endsWith('.ipynb'));

    if (existingNotebooks.length === 0) {
      fs.writeFileSync(
        path.join(this.workspaceDir, '01_python_analytics.ipynb'),
        serializeIpynb(buildStarterPythonNotebook()),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(this.workspaceDir, '02_node_and_magics.ipynb'),
        serializeIpynb(buildStarterShellNotebook()),
        'utf-8'
      );
    }
  }

  listNotebooks(): NotebookSummary[] {
    const files = fs
      .readdirSync(this.workspaceDir)
      .filter((f) => f.endsWith('.ipynb'))
      .sort();

    return files.map((name) => {
      const fullPath = path.join(this.workspaceDir, name);
      const stat = fs.statSync(fullPath);
      let kernel: KernelLanguage = 'python';
      let cellCount = 0;
      try {
        const doc = parseIpynb(fs.readFileSync(fullPath, 'utf-8'));
        kernel = doc.metadata.kernelspec.name;
        cellCount = doc.cells.length;
      } catch {
        // Fallback metadata if malformed
      }
      return {
        name,
        kernel,
        cellCount,
        updatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      };
    });
  }

  listWorkspaceFiles(): WorkspaceFileEntry[] {
    const entries = fs.readdirSync(this.workspaceDir, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((e) => {
        const fullPath = path.join(this.workspaceDir, e.name);
        const stat = fs.statSync(fullPath);
        return {
          name: e.name,
          path: e.name,
          isDirectory: e.isDirectory(),
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
        };
      });
  }

  readNotebook(name: string): NotebookDocument {
    const safePath = resolveSafeWorkspacePath(this.workspaceDir, name);
    if (!fs.existsSync(safePath)) {
      throw new Error(`Notebook "${name}" not found.`);
    }
    return parseIpynb(fs.readFileSync(safePath, 'utf-8'));
  }

  saveNotebook(name: string, doc: NotebookDocument): NotebookSummary {
    const check = validateNotebookFilename(name);
    if (!check.valid) {
      throw new Error(check.error || 'Invalid notebook name.');
    }
    const safePath = resolveSafeWorkspacePath(this.workspaceDir, check.normalized);
    const json = serializeIpynb(doc);
    fs.writeFileSync(safePath, json, 'utf-8');
    const stat = fs.statSync(safePath);
    return {
      name: check.normalized,
      kernel: doc.metadata.kernelspec.name,
      cellCount: doc.cells.length,
      updatedAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
    };
  }

  createNotebook(name: string, kernel: KernelLanguage = 'python', initialDoc?: NotebookDocument): NotebookSummary {
    const check = validateNotebookFilename(name);
    if (!check.valid) {
      throw new Error(check.error || 'Invalid notebook name.');
    }
    const safePath = resolveSafeWorkspacePath(this.workspaceDir, check.normalized);
    if (fs.existsSync(safePath)) {
      throw new Error(`Notebook "${check.normalized}" already exists.`);
    }
    const doc = initialDoc ?? createEmptyNotebook(kernel);
    return this.saveNotebook(check.normalized, doc);
  }

  deleteNotebook(name: string): void {
    const safePath = resolveSafeWorkspacePath(this.workspaceDir, name);
    if (!fs.existsSync(safePath)) {
      throw new Error(`Notebook "${name}" not found.`);
    }
    fs.unlinkSync(safePath);
  }
}
