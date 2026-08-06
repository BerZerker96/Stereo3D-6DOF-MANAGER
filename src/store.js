'use strict';
/*
 * Portable persistence. Settings/profiles/library are written to a config
 * folder NEXT TO THE APP when that's writable (portable build), otherwise
 * to the per-user data dir (installed build / dev / sandbox).
 * Everything (theme, window bounds, scan roots, token, excluded, etc.) is
 * saved automatically as soon as it changes.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

let _dir = null;

/**
 * Where settings, profiles and the library live.
 *
 * These used to be written NEXT TO THE EXE, which meant an app update that replaced the program
 * folder could carry them away with it. They now live in the same per-user folder as the cached
 * cores (%APPDATA%\\Stereo3D Manager), so a settings file and the mods it refers to sit together
 * and both survive an update. Anything found in the old location is migrated once, automatically.
 */
function userDataDir() {
  try { return require('electron').app.getPath('userData'); }
  catch (_) { return path.join(os.homedir(), '.stereoscope'); }
}

/** The legacy portable location, kept only so existing installs can be migrated out of it. */
function legacyDir() {
  try {
    const { app } = require('electron');
    return app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
  } catch (_) { return null; }
}

const MIGRATE = ['settings.json', 'profiles.json', 'library.json', 'manifest.json'];
function migrateFromLegacy(target) {
  const from = legacyDir();
  if (!from || path.resolve(from) === path.resolve(target)) return;
  for (const name of MIGRATE) {
    const src = path.join(from, name), dst = path.join(target, name);
    try {
      if (!fs.existsSync(src) || fs.existsSync(dst)) continue;
      fs.copyFileSync(src, dst);
      fs.renameSync(src, src + '.migrated');     // keep the original as a fallback, out of the way
    } catch (_) {}
  }
}

function configDir() {
  if (_dir) return _dir;
  const dir = userDataDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  try { migrateFromLegacy(dir); } catch (_) {}
  return (_dir = dir);
}

function userData() { return configDir(); }
function file(name) { const d = configDir(); try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} return path.join(d, name); }
function configPath() { return file('settings.json'); }

function readJSON(f, fallback) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } }
function writeJSON(f, obj) { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); fs.renameSync(tmp, f); }

/* ---- settings (auto-saved) ---- */
const SETTINGS_DEFAULTS = {
  theme: 'steam', scanRoots: [], steamPathOverride: '', githubToken: '',
  coreDirOverride: '', excluded: [], htNotify: true,
  autoScan: false,                 // opt-in: app starts with an empty library
  autoUpdateCheck: true,           // on launch, background-check GitHub for new releases/files
  iconScale: 1,                    // game-icon size multiplier (0.6–1.6)
  detailWidth: 560,                // width (px) of the resizable setup/detail panel (drag to change)
  seenGuide: false,                // whether the quick-start guide has been shown once
  windowBounds: null               // {width,height,x,y} restored on launch
};
function getSettings() { return Object.assign({}, SETTINGS_DEFAULTS, readJSON(file('settings.json'), {})); }
function setSettings(patch) { const s = Object.assign(getSettings(), patch || {}); writeJSON(file('settings.json'), s); return s; }
function addScanRoot(p) { const s = getSettings(); if (p && !s.scanRoots.includes(p)) s.scanRoots.push(p); writeJSON(file('settings.json'), s); return s; }
function removeScanRoot(p) { const s = getSettings(); s.scanRoots = s.scanRoots.filter(x => x !== p); writeJSON(file('settings.json'), s); return s; }
function addExcluded(dir) { const s = getSettings(); if (dir && !s.excluded.includes(dir)) s.excluded.push(dir); writeJSON(file('settings.json'), s); return s; }
function removeExcluded(dir) { const s = getSettings(); s.excluded = s.excluded.filter(x => x !== dir); writeJSON(file('settings.json'), s); return s; }

/* ---- library (all games: scanned + manually-added, with their state) ---- */
function libraryFile() { return file('library.json'); }
const gkey = x => String((x && (x.dir || x.exePath || x.n)) || '').toLowerCase();
function getLibrary() { return readJSON(libraryFile(), { games: [] }).games || []; }
function setLibrary(arr) { writeJSON(libraryFile(), { games: arr || [] }); return arr || []; }
function getManualGames() { return getLibrary(); }            // back-compat (boot loads the whole saved library)
function setManualGames(arr) { return setLibrary(arr); }
function addManualGame(g) {
  if (!g) return getLibrary();
  const all = getLibrary();
  const i = all.findIndex(x => gkey(x) === gkey(g));
  if (i >= 0) all[i] = g; else all.push(g);
  return setLibrary(all);
}
function removeManualGame(idOrDir) {
  const k = String(idOrDir || '').toLowerCase();
  return setLibrary(getLibrary().filter(x => gkey(x) !== k));
}

/* ---- config profiles ---- */
function profilesFile() { return file('profiles.json'); }
function listProfiles() { return readJSON(profilesFile(), {}); }
function saveProfile(name, data) { const all = listProfiles(); all[name] = { data, when: new Date().toISOString() }; writeJSON(profilesFile(), all); return all; }
function loadProfile(name) { return (listProfiles()[name] || {}).data || null; }
function deleteProfile(name) { const all = listProfiles(); delete all[name]; writeJSON(profilesFile(), all); return all; }

// ---- full backup / restore of everything the app persists ------------------------------------
// Bundles settings + the whole game library (each game carries its per-mod config snapshot in .cfg)
// + saved profiles into one JSON blob the user can save anywhere and re-import later or on another PC.
function exportAll() {
  return {
    kind: 'stereo3d-manager-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    library: getLibrary(),
    profiles: listProfiles()
  };
}
function importAll(blob, opts) {
  opts = opts || {};
  if (!blob || typeof blob !== 'object') throw new Error('Not a valid backup file.');
  if (blob.kind && blob.kind !== 'stereo3d-manager-backup') throw new Error('This file is not a Stereo 3D/6DoF Manager backup.');
  const report = { settings: false, games: 0, profiles: 0, mode: opts.merge ? 'merge' : 'replace' };
  if (blob.settings && typeof blob.settings === 'object') {
    // never import window bounds / one-time flags — only real preferences
    const { windowBounds, seenGuide, ...prefs } = blob.settings;
    setSettings(prefs); report.settings = true;
  }
  if (Array.isArray(blob.library)) {
    if (opts.merge) {
      const cur = getLibrary(); const byKey = {};
      cur.forEach(g => { byKey[(g.dir || g.exePath || g.n || '').toLowerCase()] = g; });
      blob.library.forEach(g => { byKey[(g.dir || g.exePath || g.n || '').toLowerCase()] = g; });
      const merged = Object.values(byKey); setLibrary(merged); report.games = merged.length;
    } else { setLibrary(blob.library); report.games = blob.library.length; }
  }
  if (blob.profiles && typeof blob.profiles === 'object') {
    const cur = opts.merge ? listProfiles() : {};
    const all = Object.assign(cur, blob.profiles); writeJSON(profilesFile(), all); report.profiles = Object.keys(blob.profiles).length;
  }
  return report;
}

module.exports = {
  userData, configDir, configPath, getSettings, setSettings,
  addScanRoot, removeScanRoot, addExcluded, removeExcluded,
  getManualGames, setManualGames, addManualGame, removeManualGame, getLibrary, setLibrary,
  listProfiles, saveProfile, loadProfile, deleteProfile,
  exportAll, importAll
};
