'use strict';
/*
 * Logging.
 *
 * Two files, in a `logs` folder next to the executable (the same place `manual-core` lives, so a
 * user can find both without hunting through AppData):
 *
 *   logs/download.log  every network request the app makes - URL, status, redirects, bytes,
 *                      duration, retries and the exact failure reason. This is the file to read
 *                      when a mod won't download.
 *   logs/app.log       everything else - startup, scans, installs, config writes, uninstalls,
 *                      IPC errors, unhandled rejections. This is the file to read when the app
 *                      misbehaves in some other way.
 *
 * Both rotate at 5 MB, keeping one previous generation, so they can be left on indefinitely.
 * Logging never throws: a logging failure must not break an install.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 1;                       // download.log + download.1.log

let _root = null;

function userData() {
  try { return require('electron').app.getPath('userData'); }
  catch (_) { return path.join(os.homedir(), '.stereoscope'); }
}

/** `logs` beside the executable; in dev (or if that isn't writable) fall back to userData. */
function logRoot() {
  if (_root) return _root;
  const exe = process.execPath || '';
  const isDev = /node_modules[\\/]electron/i.test(exe) || /[\\/](electron|node)(\.exe)?$/i.test(exe);
  let root = isDev ? path.join(userData(), 'logs') : path.join(path.dirname(exe), 'logs');
  try { fs.mkdirSync(root, { recursive: true }); fs.accessSync(root, fs.constants.W_OK); }
  catch (_) {
    root = path.join(userData(), 'logs');
    try { fs.mkdirSync(root, { recursive: true }); } catch (_) {}
  }
  _root = root;
  return root;
}
function setLogRoot(p) { _root = p || null; if (p) { try { fs.mkdirSync(p, { recursive: true }); } catch (_) {} } }

function rotate(file) {
  try {
    const st = fs.statSync(file);
    if (st.size < MAX_BYTES) return;
    for (let i = KEEP; i >= 1; i--) {
      const older = file.replace(/\.log$/, '.' + i + '.log');
      const newer = i === 1 ? file : file.replace(/\.log$/, '.' + (i - 1) + '.log');
      if (fs.existsSync(newer)) { try { fs.rmSync(older, { force: true }); } catch (_) {} try { fs.renameSync(newer, older); } catch (_) {} }
    }
  } catch (_) {}
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
         p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' +
         String(d.getMilliseconds()).padStart(3, '0');
}

/** Never let a logging problem surface as an app problem. */
function write(file, line) {
  try {
    const p = path.join(logRoot(), file);
    rotate(p);
    fs.appendFileSync(p, line + os.EOL);
  } catch (_) {}
}

function fmt(level, msg, data) {
  let extra = '';
  if (data !== undefined && data !== null) {
    try {
      extra = typeof data === 'string' ? ' ' + data : ' ' + JSON.stringify(data, (k, v) => {
        if (typeof v === 'string' && v.length > 500) return v.slice(0, 500) + '…';
        // never write a token into a log file
        if (/token|authorization|password|secret/i.test(k)) return '[redacted]';
        return v;
      });
    } catch (_) { extra = ' [unserialisable]'; }
  }
  return '[' + stamp() + '] ' + String(level).toUpperCase().padEnd(5) + ' ' + msg + extra;
}

/* ---------- app.log ---------- */
const app = {
  info:  (msg, data) => write('app.log', fmt('info', msg, data)),
  warn:  (msg, data) => write('app.log', fmt('warn', msg, data)),
  error: (msg, data) => write('app.log', fmt('error', msg, data)),
  /** Section marker so a support log is easy to read. */
  section: (title) => write('app.log', os.EOL + '=== ' + title + ' — ' + stamp() + ' ===')
};

/* ---------- download.log ---------- */
const dl = {
  start:    (url, label) => write('download.log', fmt('start', (label || 'download'), { url })),
  redirect: (from, to, depth) => write('download.log', fmt('redir', 'redirect ' + (depth || 1), { from, to })),
  status:   (url, code, bytes) => write('download.log', fmt('http', 'HTTP ' + code, { url, contentLength: bytes || 0 })),
  progress: (label, pct) => write('download.log', fmt('prog', (label || 'download') + ' ' + pct + '%')),
  done:     (url, bytes, ms, label) => write('download.log',
              fmt('ok', (label || 'download') + ' complete', { url, bytes, ms, kbps: ms ? Math.round((bytes / 1024) / (ms / 1000)) : 0 })),
  fail:     (url, err, ms, label) => write('download.log',
              fmt('fail', (label || 'download') + ' FAILED', { url, ms, error: String((err && err.message) || err) })),
  note:     (msg, data) => write('download.log', fmt('info', msg, data)),
  section:  (title) => write('download.log', os.EOL + '=== ' + title + ' — ' + stamp() + ' ===')
};

/** Both log paths, for the "open logs folder" button and for support requests. */
function logPaths() {
  const root = logRoot();
  return { root, app: path.join(root, 'app.log'), download: path.join(root, 'download.log') };
}

/** Wipe both logs (Settings → Troubleshooting). */
function clearLogs() {
  const root = logRoot();
  let removed = 0;
  try {
    for (const f of fs.readdirSync(root)) if (/\.log$/i.test(f)) { try { fs.rmSync(path.join(root, f), { force: true }); removed++; } catch (_) {} }
  } catch (_) {}
  return removed;
}

/** Tail the last N lines of a log, for showing recent errors in-app. */
function tail(which, lines) {
  try {
    const p = logPaths()[which === 'download' ? 'download' : 'app'];
    const txt = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
    return txt.slice(-(lines || 200));
  } catch (_) { return []; }
}

module.exports = { app, dl, logRoot, setLogRoot, logPaths, clearLogs, tail };
