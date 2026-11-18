import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline';
import util from 'node:util';
import vm from 'node:vm';

const localRequire = createRequire(path.join(process.cwd(), 'package.json'));

let stdoutLines = [];
let stderrLines = [];
let displayQueue = [];

function createSandbox() {
  const sandbox = {
    console: {
      log: (...args) => stdoutLines.push(args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: 3 }))).join(' ')),
      info: (...args) => stdoutLines.push(args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: 3 }))).join(' ')),
      warn: (...args) => stderrLines.push(args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: 3 }))).join(' ')),
      error: (...args) => stderrLines.push(args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: 3 }))).join(' ')),
    },
    display: (obj) => {
      if (obj && typeof obj === 'object' && obj.__html) {
        displayQueue.push({ 'text/html': String(obj.__html), 'text/plain': '[HTML Output]' });
      } else if (obj && typeof obj === 'object' && obj.__svg) {
        displayQueue.push({ 'image/svg+xml': String(obj.__svg), 'text/plain': '[SVG Output]' });
      } else {
        displayQueue.push({ 'text/plain': util.inspect(obj, { depth: 4 }) });
      }
    },
    HTML: (content) => ({ __html: String(content) }),
    SVG: (content) => ({ __svg: String(content) }),
    require: localRequire,
    __dirname: process.cwd(),
    __filename: path.join(process.cwd(), 'cell.js'),
    fetch: globalThis.fetch,
    Headers: globalThis.Headers,
    Request: globalThis.Request,
    Response: globalThis.Response,
    FormData: globalThis.FormData,
    Blob: globalThis.Blob,
    File: globalThis.File,
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    Event: globalThis.Event,
    EventTarget: globalThis.EventTarget,
    ReadableStream: globalThis.ReadableStream,
    WritableStream: globalThis.WritableStream,
    TransformStream: globalThis.TransformStream,
    crypto: globalThis.crypto,
    performance: globalThis.performance,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    structuredClone: globalThis.structuredClone,
    queueMicrotask: globalThis.queueMicrotask,
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    Math,
    Date,
    JSON,
    Array,
    Object,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Number,
    String,
    Boolean,
    Symbol,
    BigInt,
    RegExp,
    Error,
    TypeError,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    Buffer,
    process,
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  return vm.createContext(sandbox);
}

let context = createSandbox();

const HIDDEN_KEYS = new Set([
  'console', 'display', 'HTML', 'SVG', 'require', '__dirname', '__filename',
  'fetch', 'Headers', 'Request', 'Response', 'FormData', 'Blob', 'File',
  'AbortController', 'AbortSignal', 'Event', 'EventTarget', 'ReadableStream',
  'WritableStream', 'TransformStream', 'crypto', 'performance', 'atob', 'btoa',
  'structuredClone', 'queueMicrotask', 'URL', 'URLSearchParams', 'TextEncoder',
  'TextDecoder', 'Math', 'Date', 'JSON', 'Array', 'Object', 'Map', 'Set',
  'WeakMap', 'WeakSet', 'Number', 'String', 'Boolean', 'Symbol', 'BigInt',
  'RegExp', 'Error', 'TypeError', 'Promise', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'Buffer',
  'process', 'global', 'globalThis',
]);

function getVariables() {
  const vars = [];
  for (const key of Object.keys(context)) {
    if (HIDDEN_KEYS.has(key) || key.startsWith('_')) continue;
    const val = context[key];
    const type = Array.isArray(val) ? 'Array' : val === null ? 'null' : typeof val;
    let preview = util.inspect(val, { depth: 1, breakLength: 100 });
    if (preview.length > 120) preview = preview.slice(0, 117) + '...';
    let size = '';
    if (Array.isArray(val)) size = `${val.length} items`;
    else if (typeof val === 'string') size = `${val.length} chars`;
    else if (val && typeof val === 'object') size = `${Object.keys(val).length} keys`;
    vars.push({ name: key, type, valuePreview: preview, size });
  }
  return vars;
}

async function execCode(code) {
  stdoutLines = [];
  stderrLines = [];
  displayQueue = [];
  const outputs = [];

  try {
    let result = vm.runInContext(code, context, { filename: 'cell.js' });
    if (result && typeof result.then === 'function') {
      result = await result;
    }
    if (stdoutLines.length > 0) {
      outputs.push({ output_type: 'stream', name: 'stdout', text: stdoutLines.join('\n') + '\n' });
    }
    if (stderrLines.length > 0) {
      outputs.push({ output_type: 'stream', name: 'stderr', text: stderrLines.join('\n') + '\n' });
    }
    for (const d of displayQueue) {
      outputs.push({ output_type: 'display_data', data: d });
    }
    if (result !== undefined) {
      const data = {};
      if (result && typeof result === 'object' && result.__html) {
        data['text/html'] = String(result.__html);
        data['text/plain'] = '[HTML Output]';
      } else if (result && typeof result === 'object' && result.__svg) {
        data['image/svg+xml'] = String(result.__svg);
        data['text/plain'] = '[SVG Output]';
      } else {
        data['text/plain'] = util.inspect(result, { depth: 4 });
      }
      outputs.push({ output_type: 'execute_result', data });
    }
  } catch (err) {
    if (stdoutLines.length > 0) {
      outputs.push({ output_type: 'stream', name: 'stdout', text: stdoutLines.join('\n') + '\n' });
    }
    if (stderrLines.length > 0) {
      outputs.push({ output_type: 'stream', name: 'stderr', text: stderrLines.join('\n') + '\n' });
    }
    outputs.push({
      output_type: 'error',
      ename: err?.name || 'Error',
      evalue: err?.message || String(err),
      traceback: String(err?.stack || err).split('\n'),
    });
  }
  return outputs;
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let resp;
  try {
    const req = JSON.parse(trimmed);
    if (req.action === 'exec') {
      resp = { id: req.id, ok: true, outputs: await execCode(req.code || '') };
    } else if (req.action === 'vars') {
      resp = { id: req.id, ok: true, variables: getVariables() };
    } else if (req.action === 'reset') {
      context = createSandbox();
      resp = { id: req.id, ok: true, outputs: [] };
    } else {
      resp = { id: req.id, ok: false, error: `Unknown action: ${req.action}` };
    }
  } catch (e) {
    resp = { id: null, ok: false, error: String(e) };
  }
  process.stdout.write(JSON.stringify(resp) + '\n');
});
