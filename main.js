'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');            // used by steamIconFor() / iconFileNear()
const scanner = require('./src/scanner');
const installer = require('./src/installer');
const logger = require('./src/logger');
/* Stamped at package time from a hash of the source files. It is logged on every start and shown
 * in Settings, so "which build am I running" is answerable from a log line instead of guesswork. */
const BUILD_ID = '08f0109f';
const BUILD_DATE = '2026-08-10 16:58';
const peicon = require('./src/peicon');   // reads an exe's embedded icon from its PE resources

/* ─────────────────────────── exhaustive IPC logging ───────────────────────────
 * Every call the UI makes crosses ipcMain, so wrapping it once records every user action:
 * which handler, the arguments, how long it took, and what came back. Noisy pollers are
 * summarised rather than skipped, so the log stays readable without losing anything.
 */
const IPC_QUIET = new Set(['appVersion', 'getSettings', 'logPaths', 'tailLog']);
function briefArg(v, depth) {
  if (v === null || v === undefined) return v;
  const t = typeof v;
  if (t === 'string') return v.length > 200 ? v.slice(0, 200) + '…(' + v.length + ')' : v;
  if (t === 'number' || t === 'boolean') return v;
  if (Array.isArray(v)) return v.length > 6 ? { array: v.length, first: briefArg(v[0], 1) } : v.map(x => briefArg(x, (depth || 0) + 1));
  if (t === 'object') {
    if ((depth || 0) > 2) return '{…}';
    const out = {};
    for (const k of Object.keys(v).slice(0, 14)) {
      if (/token|password|secret|authorization/i.test(k)) { out[k] = '[redacted]'; continue; }
      out[k] = briefArg(v[k], (depth || 0) + 1);
    }
    if (Object.keys(v).length > 14) out['…'] = Object.keys(v).length + ' keys';
    return out;
  }
  return String(t);
}
function briefResult(r) {
  if (r === null || r === undefined) return r;
  if (typeof r !== 'object') return briefArg(r);
  const out = {};
  for (const k of ['ok', 'error', 'note', 'tag', 'kind', 'code', 'update', 'latest', 'rateLimited',
                   'incompatible', 'conflict', 'website', 'envError', 'dir', 'removed', 'installed'])
    if (k in r) out[k] = briefArg(r[k]);
  if (Array.isArray(r)) return { array: r.length };
  for (const k of ['games', 'versions', 'mods', 'lines', 'cat', 'paths'])
    if (Array.isArray(r[k])) out[k] = r[k].length + ' items';
  if (!Object.keys(out).length) out.keys = Object.keys(r).slice(0, 10);
  return out;
}
const _rawHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function (channel, fn) {
  return _rawHandle(channel, async (evt, ...args) => {
    const quiet = IPC_QUIET.has(channel);
    const t0 = Date.now();
    if (!quiet) logger.app.info('IPC -> ' + channel, args.length ? { args: args.map(a => briefArg(a, 0)) } : undefined);
    try {
      const r = await fn(evt, ...args);
      const ms = Date.now() - t0;
      if (!quiet || ms > 400) logger.app.info('IPC <- ' + channel, { ms, result: briefResult(r) });
      return r;
    } catch (e) {
      logger.app.error('IPC !! ' + channel, { ms: Date.now() - t0, message: String((e && e.message) || e).slice(0, 400),
        stack: String((e && e.stack) || '').split('\n').slice(1, 4).join(' | ') });
      throw e;
    }
  });
};
process.on('uncaughtException', e => { try { logger.app.error('uncaughtException', { message: String(e && e.message), stack: String(e && e.stack || '').split('\n').slice(0, 6).join(' | ') }); } catch (_) {} });
process.on('unhandledRejection', e => { try { logger.app.error('unhandledRejection', { message: String((e && e.message) || e) }); } catch (_) {} });
const store = require('./src/store');
const cfg = require('./src/config');
const { MODS } = require('./src/mods');
const gamedb = require('./src/gamedb');

let win;
// Keep the app-data folder stable across the rename so existing library/settings/core cache are preserved.
try { app.setPath('userData', path.join(app.getPath('appData'), 'Stereo3D Manager')); } catch (_) {}
// Manual-core folder next to the app exe (dev falls back inside userData). Create the per-mod folders on boot.
try { installer.setManualCoreRoot(path.join(path.dirname(app.getPath('exe')), 'manual-core')); } catch (_) {}
try { installer.ensureManualCoreDirs(); } catch (_) {}
function createWindow() {
  const saved = (store.getSettings().windowBounds) || {};
  const opts = {
    width: saved.width || 1560, height: saved.height || 900, minWidth: 1180, minHeight: 680,
    backgroundColor: '#0e141b', title: 'Stereo 3D/6DoF Manager', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  };
  if (Number.isInteger(saved.x) && Number.isInteger(saved.y)) { opts.x = saved.x; opts.y = saved.y; }
  win = new BrowserWindow(opts);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // auto-save window size/position (debounced)
  let t = null;
  const saveBounds = () => { if (t) clearTimeout(t); t = setTimeout(() => { try { if (win && !win.isDestroyed()) store.setSettings({ windowBounds: win.getBounds() }); } catch (_) {} }, 400); };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('close', () => { try { if (win && !win.isDestroyed()) store.setSettings({ windowBounds: win.getBounds() }); } catch (_) {} });
}
app.whenReady().then(() => {
  try {
    logger.app.section('app start');
    logger.app.info('versions', { app: require('./package.json').version, build: BUILD_ID, built: BUILD_DATE,
      electron: process.versions.electron, node: process.versions.node, platform: process.platform, arch: process.arch });
    logger.app.info('log folder', logger.logPaths().root);
    logger.dl.section('app start');
  } catch (_) {} createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

function progress(p) { try { if (win && !win.isDestroyed()) win.webContents.send('progress', p); } catch (_) {} }
function scanProgress(p) { try { if (win && !win.isDestroyed()) win.webContents.send('scan-progress', p); } catch (_) {} }

/* ---- scan / games (non-blocking, progress-reporting) ---- */
ipcMain.handle('scan', async () => {
  const s = store.getSettings();
  const roots = s.scanRoots || [];
  const games = await scanner.scanGamesProgressive(roots, s.excluded || [], scanProgress);
  for (const g of games) { try { const d = installer.detectDetailed(g); g.inst = d.managed; g.found = d.found; } catch (_) { g.inst = []; g.found = []; } }
  return { drives: scanner.listDrives(), libraries: scanner.steamLibraries(), games, excluded: s.excluded || [] };
});
ipcMain.handle('drives', async () => scanner.listDrives());
ipcMain.handle('listExes', async (_e, dir) => {
  try { return { ok: true, exes: scanner.findAllExes(dir) }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('scanDrive', async (_e, drive) => {
  const s = store.getSettings();
  const games = await scanner.scanGamesProgressive([], s.excluded || [], scanProgress, { drive });
  for (const g of games) { try { const d = installer.detectDetailed(g); g.inst = d.managed; g.found = d.found; } catch (_) { g.inst = []; g.found = []; } }
  return { drive, games, excluded: s.excluded || [] };
});
ipcMain.handle('adoptMods', async (_e, game, ids) => { try { return installer.adoptMods(game, ids); } catch (e) { return { ok:false, error:String(e.message||e) }; } });
ipcMain.handle('detectGame', async (_e, game) => { try { return installer.detectDetailed(game); } catch (e) { return { managed: [], found: [], all: [] }; } });
ipcMain.handle('manualCoreStatus', async () => { try { installer.ensureManualCoreDirs(); return installer.manualCoreStatus(); } catch (e) { return []; } });
ipcMain.handle('openManualCore', async (_e, id) => { try { installer.ensureManualCoreDirs(); const d = id ? installer.manualCoreDir(id) : installer.manualCoreRoot(); await shell.openPath(d); return d; } catch (e) { return null; } });
ipcMain.handle('openFolder', async (_e, dir) => { if (dir) await shell.openPath(dir); return true; });
// For Steam games, prefer the real library icon over the (often generic) exe icon.
/** Every Steam installation root we can find - the main one holds the artwork cache. */
function steamInstallRoots() {
  const out = new Set();
  const env = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA];
  for (const base of env) if (base) out.add(path.join(base, 'Steam'));
  // the registry path Steam records on install
  try {
    const { execFileSync } = require('child_process');
    const q = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { encoding: 'utf8', timeout: 3000, windowsHide: true });
    const m = q.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (m) out.add(m[1].trim().replace(/\//g, path.sep));
  } catch (_) {}
  // and any library folder's parent, in case Steam itself lives in one
  try { for (const lib of scanner.steamLibraries()) out.add(lib); } catch (_) {}
  return [...out].filter(p => { try { return fs.existsSync(p); } catch (_) { return false; } });
}

function steamIconFor(exePath) {
  try {
    const parts = String(exePath || '').split(/[\\/]/);
    const ci = parts.findIndex(p => /^common$/i.test(p));
    if (ci < 1 || !parts[ci + 1]) return null;
    const installdir = parts[ci + 1];
    const steamapps = parts.slice(0, ci).join(path.sep);        // ...\Steam\steamapps
    const steamRoot = path.dirname(steamapps);                  // ...\Steam
    let appid = null;
    let acfs = []; try { acfs = fs.readdirSync(steamapps).filter(f => /^appmanifest_\d+\.acf$/i.test(f)); } catch (_) {}
    for (const acf of acfs) {
      let txt = ''; try { txt = fs.readFileSync(path.join(steamapps, acf), 'utf8'); } catch (_) { continue; }
      const m = txt.match(/"installdir"\s*"([^"]+)"/i);
      if (m && m[1].toLowerCase() === installdir.toLowerCase()) { const a = acf.match(/(\d+)/); appid = a && a[1]; break; }
    }
    if (!appid) return null;
    /* Steam keeps librarycache in the MAIN install only - never inside a secondary library folder.
     * Deriving it from the game's own path meant a game on D:\SteamLibrary looked for
     * "D:\SteamLibrary\appcache\librarycache", which does not exist, so every game outside the
     * drive Steam is installed on came back with no artwork. Collect every plausible cache root. */
    const libRoots = new Set([path.join(steamRoot, 'appcache', 'librarycache')]);
    for (const r of steamInstallRoots()) {
      libRoots.add(path.join(r, 'appcache', 'librarycache'));
      libRoots.add(path.join(r, 'userdata'));                 // grid art lives here per-user
    }
    // prefer square art: icon → logo → capsule → header → hero → box
    const order = ['_icon.jpg', '_icon.png', '/icon.jpg', '/logo.png', '_logo.png', '_capsule_231x87.jpg', '_header.jpg', '_library_600x900.jpg', '_library_hero.jpg'];
    for (const lib of libRoots) {
      for (const suf of order) {
        const p = suf.startsWith('/') ? path.join(lib, appid, suf.slice(1)) : path.join(lib, appid + suf);
        try { if (fs.existsSync(p)) return p; } catch (_) {}
      }
      // newer Steam: librarycache/<appid>/ with arbitrary names
      const sub = path.join(lib, appid);
      try { if (fs.existsSync(sub)) { const fl = fs.readdirSync(sub); const pick = fl.find(f => /icon/i.test(f)) || fl.find(f => /logo/i.test(f)) || fl.find(f => /capsule/i.test(f)) || fl.find(f => /\.(jpg|png|ico)$/i.test(f)); if (pick) return path.join(sub, pick); } } catch (_) {}
    }
    return null;
  } catch (_) { return null; }
}
// Look for a real .ico / icon image sitting in the game's folder (or exe folder).
function iconFileNear(exePath) {
  try {
    const exeDir = path.dirname(exePath);
    const exeName = path.basename(exePath).replace(/\.exe$/i, '');
    const dirs = [exeDir];
    // also the game root (parent of media/bin/win64 etc.)
    let up = exeDir; for (let i = 0; i < 3; i++) { up = path.dirname(up); if (up && dirs.indexOf(up) < 0) dirs.push(up); }
    for (const d of dirs) {
      let files = []; try { files = fs.readdirSync(d); } catch (_) { continue; }
      // exact-name icon first, then game-ish names, then any .ico
      const named = files.find(f => new RegExp('^' + exeName.replace(/[^a-z0-9]/gi, '.') + '\\.ico$', 'i').test(f));
      const gameish = files.find(f => /(game|icon|app|launcher)\.ico$/i.test(f));
      const anyIco = files.find(f => /\.ico$/i.test(f));
      const pick = named || gameish || anyIco;
      if (pick) return path.join(d, pick);
    }
    return null;
  } catch (_) { return null; }
}
function dataUrlFromPath(p) { try { const img = nativeImage.createFromPath(p); if (img && !img.isEmpty()) return img.toDataURL(); } catch (_) {} return null; }
/**
 * Best available artwork for a game, tried in order of quality.
 *
 * The old chain gave up after three attempts and returned null, which is why a chunk of the library
 * showed the generic placeholder: an executable buried in Binaries\Win64 frequently carries no icon
 * resource at all, while the pretty artwork sits in the game's own root, or in Steam's cache under a
 * different appid file, or on a sibling launcher exe that DOES have an icon.
 */
async function bestIconFor(exePath) {
  const tried = [];
  const tryPath = p => { if (!p || tried.includes(p)) return null; tried.push(p); return dataUrlFromPath(p); };

  // 1) Steam library art - always the nicest when it exists
  let u = tryPath(steamIconFor(exePath)); if (u) return u;

  // 2) an .ico / .png sitting next to the exe
  u = tryPath(iconFileNear(exePath)); if (u) return u;

  // 3) artwork in the GAME ROOT, not just beside the exe. For
  //    "Game\Binaries\Win64\Game-Win64-Shipping.exe" the icon is usually several levels up.
  try {
    let dir = path.dirname(exePath);
    for (let up = 0; up < 4; up++) {
      const parent = path.dirname(dir);
      if (!parent || parent === dir) break;
      dir = parent;
      u = tryPath(iconFileNear(path.join(dir, 'x.exe')));
      if (u) return u;
      for (const name of ['icon.ico', 'icon.png', 'game.ico', 'logo.png', 'app.ico', 'favicon.ico']) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) { u = tryPath(p); if (u) return u; }
      }
    }
  } catch (_) {}

  /* 4) read the icon straight out of the exe's PE resource section.
   *    This is the reliable path for non-Steam games: no artwork on disk, and the Windows shell
   *    often returns nothing (or only a 32px version) for a game's shipping binary. Parsing the
   *    file ourselves also lets us take the LARGEST icon it contains. */
  try {
    const png = peicon.extractLargestPng(exePath);
    if (png && png.length) return 'data:image/png;base64,' + png.toString('base64');
    const ico = peicon.extractIcon(exePath);
    if (ico && ico.length) {
      // hand the .ico to Electron so it decodes the best frame for us
      const img = nativeImage.createFromBuffer(ico);
      if (img && !img.isEmpty()) return img.toDataURL();
      return 'data:image/x-icon;base64,' + ico.toString('base64');
    }
  } catch (_) {}

  // 5) the shell's idea of the icon, as a fallback
  try {
    const img = await app.getFileIcon(exePath, { size: 'large' });
    if (img && !img.isEmpty()) return img.toDataURL();
  } catch (_) {}

  // 6) a SIBLING exe's icon. A shipping binary often has none while the launcher beside it does -
  //    the launcher's icon is the game's artwork, so it is a good answer even though we don't run it.
  try {
    const dir = path.dirname(exePath);
    const sibs = fs.readdirSync(dir).filter(f => /\.exe$/i.test(f) && f !== path.basename(exePath));
    for (const f of sibs.slice(0, 8)) {
      const img = await app.getFileIcon(path.join(dir, f), { size: 'large' });
      if (img && !img.isEmpty()) return img.toDataURL();
    }
    // and the game root's own exes, which is where a launcher usually lives
    const root = path.dirname(path.dirname(dir));
    if (root && fs.existsSync(root)) {
      const rootExes = fs.readdirSync(root).filter(f => /\.exe$/i.test(f));
      for (const f of rootExes.slice(0, 8)) {
        const img = await app.getFileIcon(path.join(root, f), { size: 'large' });
        if (img && !img.isEmpty()) return img.toDataURL();
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Fetch artwork for a game that has none, using Steam's public endpoints.
 *
 * SearchApps resolves a name to an appid without any key or login, and the CDN then serves the
 * store artwork for that appid. Nothing is scraped and nothing is authenticated - these are the
 * same URLs the store page itself uses.
 */
function fetchIconOnline(name) {
  return new Promise((resolve) => {
    const https = require('https');
    const q = encodeURIComponent(String(name || '').replace(/[\u2122\u00ae]/g, '').trim());
    if (!q) return resolve(null);
    const get = (url, cb) => {
      const req = https.get(url, { headers: { 'User-Agent': 'Stereo3DManager' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return get(res.headers.location, cb); }
        if (res.statusCode !== 200) { res.resume(); return cb(null); }
        const chunks = []; res.on('data', c => chunks.push(c));
        res.on('end', () => cb(Buffer.concat(chunks)));
      });
      req.setTimeout(9000, () => { try { req.destroy(); } catch (_) {} cb(null); });
      req.on('error', () => cb(null));
    };
    get('https://steamcommunity.com/actions/SearchApps/' + q, (body) => {
      let appid = null;
      try { const j = JSON.parse(String(body || '[]')); if (Array.isArray(j) && j[0] && j[0].appid) appid = String(j[0].appid); } catch (_) {}
      if (!appid) return resolve(null);
      // square-ish art first, then the wide capsule, then the header
      const urls = [
        'https://cdn.cloudflare.steamstatic.com/steam/apps/' + appid + '/library_600x900.jpg',
        'https://cdn.cloudflare.steamstatic.com/steam/apps/' + appid + '/capsule_231x87.jpg',
        'https://cdn.cloudflare.steamstatic.com/steam/apps/' + appid + '/header.jpg'
      ];
      const next = (i) => {
        if (i >= urls.length) return resolve(null);
        get(urls[i], (buf) => {
          if (buf && buf.length > 2000 && buf[0] === 0xff && buf[1] === 0xd8)      // a real JPEG
            return resolve({ appid, dataUrl: 'data:image/jpeg;base64,' + buf.toString('base64') });
          next(i + 1);
        });
      };
      next(0);
    });
  });
}

ipcMain.handle('fetchIcon', async (_e, name) => {
  try { const r = await fetchIconOnline(name); return r || { ok: false }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('icon', async (_e, exePath) => {
  try { return await bestIconFor(exePath); } catch { return null; }
});
ipcMain.handle('pickExe', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Select a game .exe', properties: ['openFile'], filters: [{ name: 'Executables', extensions: ['exe'] }] });
  if (r.canceled || !r.filePaths.length) return null;
  const exe = r.filePaths[0];
  return { exePath: exe, dir: path.dirname(exe), exe: path.basename(exe), api: scanner.detectApi(exe), bit: scanner.readBitness(exe), eng: scanner.detectEngine(path.dirname(exe), exe) };
});

/* ---- core cache + updates ---- */
ipcMain.handle('coreList', async () => installer.coreList());
// 3DVision4All ships EnableWindowed3D.exe, which must be run elevated once per game folder.
ipcMain.handle('postInstallInfo', async (_e, game, modId) => { try { return installer.postInstallInfo(game, modId); } catch (e) { return null; } });
ipcMain.handle('runPostInstall', async (_e, game, modId) => { try { return installer.runPostInstall(game, modId); } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('coreSources', async () => installer.coreSources());
ipcMain.handle('coreFetch', async (_e, modId, game) => { try { const r = await installer.ensureCore(modId, game, progress); if (r && r.website) return { ok: false, website: true, url: r.url, note: r.note }; return { ok: true, tag: r && r.tag }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('coreFetchAll', async () => { try { return { ok: true, results: await installer.coreFetchAll(progress) }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('coreUpdate', async (_e, modId, game) => { try { const r = await installer.updateCore(modId, game, progress); return { ok: true, tag: r && r.tag }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('checkUpdates', async () => { try { return { ok: true, rows: await installer.checkUpdates() }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('latest', async (_e, modId, game) => installer.latestRelease(modId, game));
ipcMain.handle('coreRoot', async () => installer.coreRoot());

/* ---- install / config ---- */
ipcMain.handle('install', async (_e, modId, game, opts) => {
  try {
    const r = await installer.install(modId, game, progress, opts || {});
    if (r && r.launch) { try { await shell.openPath(r.launch); } catch (_) {} }
    return r;
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('hubVersions', async (_e, game) => {
  try { return await installer.releasesForGame('BerZerker96/6DOF-Head-Tracking-Mods-Hub', game); }
  catch (e) { return { versions: [], error: String(e.message || e) }; }
});
ipcMain.handle('proxyState', async (_e, game) => { try { return installer.proxyState(game); } catch (e) { return { candidates: [], present: [], error: String(e.message || e) }; } });
ipcMain.handle('proxyRename', async (_e, game, toName, fromName) => { try { return installer.renameProxy(game, toName, fromName); } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('wizOutputs', async () => { try { return require('./src/mods').WIZ_OUTPUTS; } catch (e) { return {}; } });
ipcMain.handle('wizSetOutput', async (_e, game, mode) => { try { return installer.wizSetOutput(game, mode); } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('wizSetConfig', async (_e, game, settings) => { try { return installer.wizSetConfig(game, settings); } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('wizGetConfig', async (_e, game) => { try { return installer.wizGetConfig(game); } catch (e) { return { exists: false, values: {} }; } });
ipcMain.handle('hubAllReleases', async () => { try { return await installer.hubAllReleases('BerZerker96/6DOF-Head-Tracking-Mods-Hub'); } catch (e) { return { releases: [], error: String(e.message || e) }; } });
ipcMain.handle('hubDownloadAll', async () => { try { return await installer.hubDownloadAll('BerZerker96/6DOF-Head-Tracking-Mods-Hub', progress); } catch (err) { return { mods: [], error: String(err.message || err) }; } });
ipcMain.handle('hubPooled', async () => { try { return installer.hubPooled(); } catch (e) { return []; } });
ipcMain.handle('hubInstallInto', async (_e, game, tag) => { try { return installer.hubInstallInto(game, tag); } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('hubSuggest', async (_e, tags, games) => { try { const out = {}; for (const t of (tags || [])) out[t] = installer.suggestGameForTag(t, games || []); return out; } catch (e) { return {}; } });
ipcMain.handle('uninstall', async (_e, modId, game) => { try { return installer.uninstall(modId, game); } catch (e) { return { ok: false, error: String(e.message || e) }; } });
/* Remove every recorded mod for one game, in dependency order. Done in the main process because the
 * manifest is the only authority on what was placed - the renderer used to loop over its own list of
 * card ids, which matched no manifest record and deleted nothing while reporting success. */
ipcMain.handle('uninstallAll', async (_e, game) => { try { return installer.uninstallAll(game); } catch (e) { return { ok: false, error: String(e.message || e) }; } });
/* What the app actually records as installed for this game (the manifest), so the UI can show the
 * truth rather than its own in-memory guess. */
ipcMain.handle('installedMods', async (_e, game) => { try { return { ok: true, mods: installer.installedMods(game) }; } catch (e) { return { ok: false, error: String(e.message || e), mods: [] }; } });
ipcMain.handle('readConfig', async (_e, modId, game) => { const file = installer.resolveConfigPath(MODS[modId], game); if (!file) return { exists: false, sections: {} }; return Object.assign({ file }, cfg.readConfig(file)); });
ipcMain.handle('writeConfig', async (_e, modId, game, patch) => { const file = installer.resolveConfigPath(MODS[modId], game); if (!file) return { ok: false, error: 'no concrete config path' }; try { return cfg.writeConfig(file, patch); } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('list6dofMods', async () => { try { const [loop, bz] = await Promise.all([installer.loopAllMods(), installer.bzHubGames('BerZerker96/6DOF-Head-Tracking-Mods-Hub')]); return { loop, berzerker: bz, hubRepo:'BerZerker96/6DOF-Head-Tracking-Mods-Hub' }; } catch (e) { return { loop:[], berzerker:[] }; } });
/* Launch a game straight from the library. Started detached with the game's own folder as CWD -
 * many games resolve data paths relative to the working directory and break if it's wrong. */
ipcMain.handle('launchGame', async (_e, game) => {
  try {
    const g = game || {};
    const exePath = g.exePath || (g.exeDir && g.exe ? path.join(g.exeDir, g.exe) : null);
    if (!exePath || !fs.existsSync(exePath)) return { ok: false, error: 'Executable not found: ' + (exePath || '(unknown)') };
    const { spawn } = require('child_process');
    const child = spawn(exePath, [], { cwd: path.dirname(exePath), detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, exe: path.basename(exePath) };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('logPaths', async () => { try { return { ok: true, paths: logger.logPaths() }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('openLogs', async () => { try { await shell.openPath(logger.logPaths().root); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('clearLogs', async () => { try { return { ok: true, removed: logger.clearLogs() }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('tailLog', async (_e, which, lines) => { try { return { ok: true, lines: logger.tail(which, lines) }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('gameInfo', async (_e, exe, folder) => { try { return gamedb.lookupGame(exe, folder) || null; } catch (e) { return null; } });
/* Re-run the FULL auto-detection for one game and hand back what the scanner would have said if the
 * user had never overridden anything: PE headers first (the ground truth for this exact binary),
 * then the curated database, which is allowed to correct the headers because an exe that imports
 * d3d11.dll may still ship a DX12 renderer. Used by the "revert to auto-detect" button. */
ipcMain.handle('redetectGame', async (_e, game) => {
  try {
    const g = game || {};
    const exePath = g.exePath || (g.exeDir && g.exe ? path.join(g.exeDir, g.exe) : null);
    const out = { source: [] };
    if (exePath && fs.existsSync(exePath)) {
      try { const a = scanner.detectApi(exePath); if (a && a.length) { out.api = a; out.source.push('exe headers'); } } catch (_) {}
      try { const b = scanner.readBitness(exePath); if (b) out.bit = b; } catch (_) {}
      try { const e2 = scanner.detectEngine(path.dirname(exePath), path.basename(exePath)); if (e2) out.eng = e2; } catch (_) {}
    }
    // the curated db wins on API/engine when it knows this exe+folder pair
    try {
      const db = gamedb.lookupGame(g.exe || (exePath && path.basename(exePath)) || '', g.folder || g.n || '');
      if (db) {
        if (db.api && db.api.length) { out.api = db.api.slice(); out.source.push('game database'); }
        if (db.eng) out.eng = db.eng;
        out.dbMatch = true; out.dbName = db.n;
      }
    } catch (_) {}
    if (!out.api || !out.api.length) { out.api = ['DX11']; out.source.push('fallback'); }
    if (!out.bit) out.bit = 'x64';
    return out;
  } catch (e) { return { error: String(e.message || e) }; }
});
ipcMain.handle('analyzeConfigs', async (_e, game) => { try { return installer.analyzeConfigs(game); } catch (e) { return { files:[] }; } });
ipcMain.handle('readModAnalyzed', async (_e, game, modId) => { try { return installer.readModAnalyzed(game, modId); } catch (e) { return { settings:[], files:[] }; } });
ipcMain.handle('writeAnalyzed', async (_e, game, edits) => { try { return installer.writeAnalyzed(game, edits); } catch (e) { return { ok:false, error:String(e.message||e) }; } });
ipcMain.handle('readModFiles', async (_e, game, pairs) => { try { return installer.readModFiles(game, pairs); } catch (e) { return { data:{} }; } });
ipcMain.handle('writeModFiles', async (_e, game, patch) => { try { return installer.writeModFiles(game, patch); } catch (e) { return { ok:false, error:String(e.message||e) }; } });
ipcMain.handle('readModConfig', async (_e, game, modId) => { try { return installer.readModConfig(game, modId); } catch (e) { return { sections: {} }; } });
ipcMain.handle('writeModConfig', async (_e, game, modId, patch) => { try { return installer.writeModConfig(game, modId, patch); } catch (e) { return { ok:false, error:String(e.message||e) }; } });
ipcMain.handle('writeConfigFile', async (_e, game, rel, patch) => { const file = installer.resolveFile(game, rel); if (!file) return { ok: false, error: 'no path' }; try { return cfg.writeConfig(file, patch); } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('readConfigFile', async (_e, game, rel) => { const file = installer.resolveFile(game, rel); if (!file) return { exists: false, sections: {} }; return Object.assign({ file }, cfg.readConfig(file)); });

/* ---- head-tracking ini editor: find it next to the exe and read/write it ---- */
ipcMain.handle('readHtConfig', async (_e, game) => {
  const r = installer.htConfigPath(game);
  if (!r.path) return { ok: false, error: 'game has no folder' };
  const meta = { game: r.game, engine: r.engine, loader: r.loader, file: r.file };
  if (!r.exists) return { ok: true, exists: false, path: r.path, sections: {}, ...meta };
  try { const c = cfg.readConfig(r.path); return { ok: true, exists: true, path: r.path, sections: c.sections || {}, ...meta }; }
  catch (e) { return { ok: false, error: String(e.message || e), path: r.path, ...meta }; }
});
ipcMain.handle('writeHtConfig', async (_e, game, patch, p) => {
  const target = p || (installer.htConfigPath(game).path);
  if (!target) return { ok: false, error: 'no head-tracking config path' };
  try { const r = cfg.writeConfig(target, patch); return { ok: true, path: target, bak: r.file + '.bak' }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('openHtConfig', async (_e, game) => { const r = installer.htConfigPath(game); if (r && r.path && r.exists) { await shell.showItemInFolder(r.path); return true; } if (game && game.dir) { await shell.openPath(game.dir); } return false; });

/* ---- settings ---- */
// ---- export / import all settings (backup & restore) ----
ipcMain.handle('exportAllSettings', async () => {
  try {
    const data = store.exportAll();
    const def = 'stereo3d-manager-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    const r = await dialog.showSaveDialog(win, { title: 'Export all settings & library', defaultPath: def, filters: [{ name: 'JSON backup', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    require('fs').writeFileSync(r.filePath, JSON.stringify(data, null, 2));
    const counts = { games: (data.library || []).length, profiles: Object.keys(data.profiles || {}).length };
    return { ok: true, path: r.filePath, counts };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('importAllSettings', async (_e, opts) => {
  try {
    const r = await dialog.showOpenDialog(win, { title: 'Import settings & library backup', properties: ['openFile'], filters: [{ name: 'JSON backup', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
    const raw = require('fs').readFileSync(r.filePaths[0], 'utf8');
    let blob; try { blob = JSON.parse(raw); } catch (_) { return { ok: false, error: 'That file isn\u2019t valid JSON.' }; }
    const report = store.importAll(blob, opts || {});
    return { ok: true, path: r.filePaths[0], report };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('getSettings', async () => store.getSettings());
ipcMain.handle('setSettings', async (_e, patch) => store.setSettings(patch));
ipcMain.handle('configPath', async () => store.configPath());
/* ---- manually-added library (persisted) ---- */
ipcMain.handle('getManualGames', async () => store.getManualGames());
ipcMain.handle('addManualGame', async (_e, g) => store.addManualGame(g));
ipcMain.handle('removeManualGame', async (_e, idOrDir) => store.removeManualGame(idOrDir));
ipcMain.handle('getLibrary', async () => store.getLibrary());
ipcMain.handle('setLibrary', async (_e, games) => store.setLibrary(games));
ipcMain.handle('addScanRoot', async () => { const r = await dialog.showOpenDialog(win, { title: 'Add a folder to scan', properties: ['openDirectory'] }); if (r.canceled || !r.filePaths.length) return store.getSettings(); return store.addScanRoot(r.filePaths[0]); });
ipcMain.handle('removeScanRoot', async (_e, p) => store.removeScanRoot(p));
ipcMain.handle('openDataFolder', async () => { await shell.openPath(store.userData()); return true; });
ipcMain.handle('openExternal', async (_e, url) => { await shell.openExternal(url); return true; });
ipcMain.handle('gameModStatus', async (_e, game, opts) => { try { return { ok: true, rows: await installer.gameModStatus(game, opts || {}) }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('openHelixFix', async (_e, gameName) => { const { helixFixUrl } = require('./src/mods'); await shell.openExternal(helixFixUrl(gameName || '')); return true; });

/* ---- core location + open core folders ---- */
ipcMain.handle('pickCoreDir', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose where to store core files', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths.length) return store.getSettings();
  return store.setSettings({ coreDirOverride: r.filePaths[0] });
});
ipcMain.handle('resetCoreDir', async () => store.setSettings({ coreDirOverride: '' }));
ipcMain.handle('openCoreFolder', async (_e, id) => { await shell.openPath(id ? installer.coreFolder(id) : installer.coreRoot()); return true; });

/* ---- exclude games the user doesn't want ---- */
ipcMain.handle('excludeGame', async (_e, dir) => store.addExcluded(dir));
ipcMain.handle('unexcludeGame', async (_e, dir) => store.removeExcluded(dir));

/* ---- head-tracking update notifications ---- */
ipcMain.handle('htMatch', async (_e, games) => { try { const out = {}; for (const g of (games||[])) { try { const m = await installer.htMatchGame(g); if (m) out[(g.dir||g.folder||g.n||'').toLowerCase()] = m; } catch(_){} } return { ok: true, matches: out }; } catch (e) { return { ok: false, error: String(e.message||e) }; } });
ipcMain.handle('rateLimitState', async () => {
  try { return require('./src/ghfree').rateLimitState(); } catch (_) { return { blocked: false, minutes: 0 }; }
});
ipcMain.handle('clearGhCache', async () => {
  try {
    const g = require('./src/ghfree'); g.clearRateLimit();
    let n = 0;
    for (const f of fs.readdirSync(g.cacheDir())) { try { fs.rmSync(path.join(g.cacheDir(), f), { force: true }); n++; } catch (_) {} }
    return { ok: true, removed: n };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('buildInfo', async () => ({ id: BUILD_ID, date: BUILD_DATE, version: require('./package.json').version }));
ipcMain.handle('appVersion', async () => { try { return app.getVersion(); } catch (_) { try { return require('./package.json').version; } catch (_) { return '0.0.0'; } } });
ipcMain.handle('appUpdateCheck', async () => { try { return await installer.appUpdateCheck(); } catch (e) { return { update: false, error: String(e.message||e) }; } });
ipcMain.handle('appUpdateApply', async (_e, assetPath, opts) => {
  try { return await installer.appUpdateApply(assetPath, opts || {}); }
  catch (e) { return { ok: false, note: String(e.message || e) }; }
});
ipcMain.handle('appUpdateDownload', async (_e, asset) => { try { return await installer.appUpdateDownload(asset); } catch (e) { return { ok: false, note: String(e.message||e) }; } });
ipcMain.handle('setupDgVoodoo', async (e, game, opts) => {
  try {
    const send = (pr) => { try { e.sender.send('installProgress', { id: 'dgvoodoo', ...pr }); } catch (_) {} };
    return await installer.setupDgVoodoo(game, send, opts || {});
  } catch (err) { return { ok: false, note: String(err.message || err) }; }
});
ipcMain.handle('applyDx9Proxy', async (_e, game) => { try { return installer.applyDx9Proxy(game, { dx9Proxy: true }); } catch (e) { return { ok: false, note: String(e.message||e) }; } });
ipcMain.handle('htVersionsFor', async (_e, entry) => { try { return { ok: true, ...(await installer.htVersionsFor(entry)) }; } catch (e) { return { ok: false, error: String(e.message||e), versions: [] }; } });
ipcMain.handle('htInstallManual', async (_e, entry, game, version) => {
  try {
    // install a manually-chosen head-tracking mod onto the selected game
    const modId = entry.source === 'itsloopyo' ? 'track_loop' : 'track_bz';
    const g = Object.assign({}, game);
    if (entry.source === 'itsloopyo' && entry.repo) g.__loopRepo = entry.repo;   // pin the chosen repo
    if (entry.game) g.__htName = entry.game;                                     // pin the catalog name for matching
    if (entry.tag) g.__htTag = entry.tag;                                        // pin the EXACT release the user chose
    // `version` used to be a display string; it is now the chosen build. Pin its exact asset so the
    // installer downloads THAT file instead of trying to match a decorated label to a release.
    const chosen = (version && typeof version === 'object') ? version : null;
    const versionLabel = chosen ? (chosen.version || chosen.tag) : version;
    if (chosen) {
      if (chosen.tag) g.__htTag = chosen.tag;
      if (chosen.asset && chosen.asset.url) { g.__htAssetUrl = chosen.asset.url; g.__htAssetName = chosen.asset.name; }
      if (chosen.combo3d) g.__htCombo3d = true;
    }
    logger.app.info('manual 6DOF install requested', {
      mod: modId, source: entry.source, catalogGame: entry.game, tag: entry.tag, repo: entry.repo,
      version: versionLabel, asset: g.__htAssetName || null, targetGame: g.n || g.folder,
      exeDir: g.exeDir, api: g.api || [], bit: g.bit });
    if (!g.exeDir && !g.dir)
      return { ok: false, error: 'No game folder was passed to the installer — pick the game in the library first.' };
    // Report progress on the manual path too - this is the one that downloads a per-game mod,
    // so it is exactly where a user needs to see that something is still happening.
    const r = await installer.install(modId, g, progress, { version: versionLabel });
    logger.app.info('manual 6DOF install result', { mod: modId, ok: !!(r && r.ok), asset: g.__htAssetName || null, note: String((r && (r.note || r.error)) || '').slice(0, 300) });
    return r;
  } catch (e) { return { ok: false, error: String(e.message||e) }; }
});
ipcMain.handle('htCatalog', async (_e, force) => { try { return { ok: true, cat: await installer.htCatalog(force) }; } catch (e) { return { ok: false, error: String(e.message||e) }; } });
ipcMain.handle('checkHeadTracking', async (_e, games) => {
  try {
    const updates = await installer.checkHeadTracking(games || []);
    const real = updates.filter(u => u.update);
    if (real.length && Notification.isSupported()) {
      const n = new Notification({ title: 'Stereo 3D/6DoF Manager — head-tracking updates', body: real.length === 1 ? (real[0].name + ' has a new release') : (real.length + ' head-tracking mods have new releases') });
      n.on('click', () => { try { if (win && !win.isDestroyed()) { win.show(); win.webContents.send('ht-updates', real); } } catch (_) {} });
      n.show();
    }
    return { ok: true, updates };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('downloadHeadTracking', async (_e, ids) => {
  const out = [];
  for (const id of (ids || [])) {
    const baseId = id.split(':')[0];
    try { const r = await installer.ensureCore(baseId, null, progress); out.push({ id, ok: true, tag: r.tag }); }
    catch (e) { out.push({ id, ok: false, error: String(e.message || e) }); }
  }
  return { ok: true, results: out };
});

/* ---- profiles ---- */
ipcMain.handle('listProfiles', async () => store.listProfiles());
ipcMain.handle('saveProfile', async (_e, name, data) => store.saveProfile(name, data));
ipcMain.handle('loadProfile', async (_e, name) => store.loadProfile(name));
ipcMain.handle('deleteProfile', async (_e, name) => store.deleteProfile(name));

/* ---- mod registry (for the Mods page) ---- */
ipcMain.handle('mods', async () => Object.entries(MODS).map(([id, m]) => ({ id, name: m.name, kind: m.kind, requires: m.requires || [], lockedTo: m.lockedTo || null, needs: m.needs || [], fixLink: m.fixLink || null, perGame: !!m.perGame, configFile: typeof m.configFile === 'function' ? m.configFile('Unity', '<game>') : m.configFile })));
