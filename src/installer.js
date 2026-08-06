'use strict';
/* Real installer + core cache (multi-strategy downloads, placement, deps). */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
let AdmZip; try { AdmZip = require('adm-zip'); } catch (_) { AdmZip = null; }
let SevenZip; try { SevenZip = require('7zip-min'); } catch (_) { SevenZip = null; }
let UnRar; try { UnRar = require('node-unrar-js'); } catch (_) { UnRar = null; }
// When packaged, node_modules live inside app.asar but a native binary can't run from there.
// package.json asarUnpack ships 7zip-bin to app.asar.unpacked — point 7zip-min at that copy.
if (SevenZip && typeof SevenZip.config === 'function') {
  try {
    const p7 = require('7zip-bin').path7za.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep).replace('app.asar/', 'app.asar.unpacked/');
    SevenZip.config({ binaryPath: p7 });
  } catch (_) {}
}

/** Extract a downloaded archive. .zip via adm-zip, .7z via the bundled 7za (HelixMod ships geo-11 as .7z). */
function extractArchive(file, dir) {
  try { log.dl.note('extract', { file: path.basename(file), bytes: (fs.statSync(file) || {}).size, into: dir }); } catch (_) {}
  if (/\.(7z|exe)$/i.test(file)) {   // .exe = the ReShade setup tool, which 7za can open as an archive
    if (!SevenZip) throw new Error('7-Zip support missing (npm i 7zip-min) — needed for .7z downloads');
    return new Promise((res, rej) => SevenZip.unpack(file, dir, e => e ? rej(new Error('7z extract failed: ' + e)) : res()));
  }
  if (/\.rar$/i.test(file)) {
    // Some releases ship .rar. node-unrar-js is pure JS/wasm, so it works the same on every platform.
    if (!UnRar) throw new Error('RAR support missing (npm i node-unrar-js) — needed for .rar downloads');
    return (async () => {
      const buf = fs.readFileSync(file);
      const ex = await UnRar.createExtractorFromData({ data: Uint8Array.from(buf).buffer });
      const out = ex.extract();
      let wrote = 0;
      for (const f of [...out.files]) {
        const h = f.fileHeader; if (!h || h.flags.directory) continue;
        const target = path.join(dir, String(h.name).replace(/\\/g, '/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (f.extraction) { fs.writeFileSync(target, Buffer.from(f.extraction)); wrote++; }
      }
      if (!wrote) throw new Error('rar extract produced no files');
    })();
  }
  if (!AdmZip) throw new Error('zip support missing');
  new AdmZip(file).extractAllTo(dir, true);
  return Promise.resolve();
}
const { MODS, MOD_API, MOD_OUTPUTS, DEFAULTS, CORE_SOURCES, CORE_BY_ID, ASSET_MATCH, htSlug, WIZ_OUTPUTS, wizApiFolder } = require('./mods');
const cfg = require('./config');
const log = require('./logger');
const ghfree = require('./ghfree');   // unlimited endpoints + disk cache, so the API quota stops mattering

function userData() { try { return require('electron').app.getPath('userData'); } catch (_) { return path.join(os.homedir(), '.stereoscope'); } }
function coreRoot() {
  let override = '';
  try { override = require('./store').getSettings().coreDirOverride || ''; } catch (_) {}
  const d = override ? override : path.join(userData(), 'core');
  fs.mkdirSync(d, { recursive: true }); return d;
}

/* ---------- Manual core: a folder next to the app exe where users can drop mod files by hand ---------- */
let _manualRoot = null;
function setManualCoreRoot(p) { _manualRoot = p || null; }
function manualCoreRoot() {
  if (_manualRoot) { try { fs.mkdirSync(_manualRoot, { recursive: true }); } catch (_) {} return _manualRoot; }
  const exe = process.execPath || '';
  const isDev = /node_modules[\\/]electron/i.test(exe) || /[\\/](electron|node)(\.exe)?$/i.test(exe);
  let root = isDev ? path.join(userData(), 'manual-core') : path.join(path.dirname(exe), 'manual-core');
  try { fs.mkdirSync(root, { recursive: true }); } catch (_) { root = path.join(userData(), 'manual-core'); try { fs.mkdirSync(root, { recursive: true }); } catch (_) {} }
  _manualRoot = root; return root;
}
function manualCoreIds() {
  const ids = CORE_SOURCES.filter(s => s.strategy !== 'bundled' && (s.strategy !== 'website' || s.manualCore)).map(s => s.id);
  // itsloopyo's head-tracking mods live in one repo PER GAME, so they have no CORE_SOURCES entry -
  // but a user without GitHub access still needs somewhere to drop a build by hand, exactly like the
  // BerZerker hub already offers. Add it explicitly so the two 6DOF sources behave the same.
  for (const id of Object.keys(MODS)) if (MODS[id] && MODS[id].perGame && !ids.includes(id)) ids.push(id);
  return ids;
}
function manualCoreDir(id) { return path.join(manualCoreRoot(), id); }
function hasManualFiles(dir) { try { return fs.readdirSync(dir).some(f => f !== 'README.txt' && !f.startsWith('.')); } catch (_) { return false; } }
function manualCoreFor(id) { const d = manualCoreDir(id); return hasManualFiles(d) ? d : null; }
function ensureManualCoreDirs() {
  const root = manualCoreRoot();
  for (const id of manualCoreIds()) {
    const d = path.join(root, id);
    try { fs.mkdirSync(d, { recursive: true }); } catch (_) { continue; }
    const readme = path.join(d, 'README.txt');
    if (!fs.existsSync(readme)) {
      const src = CORE_SOURCES.find(s => s.id === id) || {};
      const lines = [
        '=== Manual core: ' + (src.name || id) + ' ===', '',
        'Drop the EXTRACTED mod files for ' + (src.name || id) + ' into THIS folder.',
        'The app will detect them and use these instead of downloading from the internet.', '',
        src.repo ? ('Download from: https://github.com/' + src.repo + '/releases') : (src.url ? ('Download from: ' + src.url) : ''),
        src.desc ? ('What it is: ' + src.desc) : '',
        '', 'How:',
        ' 1. Download the mod\u2019s release and UNZIP it.',
        ' 2. Copy the extracted files/folders directly into this folder (keep their layout).',
        ' 3. Reopen the app \u2014 this mod will show "manual core detected" and install from here.',
        '', 'To go back to auto-download, just delete everything in this folder (keep this README).', ''
      ].filter(x => x !== undefined && x !== '');
      try { fs.writeFileSync(readme, lines.join('\r\n') + '\r\n'); } catch (_) {}
    }
  }
  return root;
}
function manualCoreStatus() {
  const root = manualCoreRoot();
  return manualCoreIds().map(id => {
    const d = path.join(root, id);
    let count = 0; try { count = fs.readdirSync(d).filter(f => f !== 'README.txt' && !f.startsWith('.')).length; } catch (_) {}
    const src = CORE_SOURCES.find(s => s.id === id) || {};
    return { id, name: src.name || id, dir: d, hasFiles: count > 0, count };
  });
}

function headers() {
  const h = { 'User-Agent': 'Stereoscope', 'Accept': 'application/vnd.github+json' };
  let tok = process.env.GITHUB_TOKEN || '';
  try { tok = tok || (require('./store').getSettings().githubToken || ''); } catch (_) {}
  if (tok) h['Authorization'] = 'Bearer ' + tok;
  return h;
}
function isGithubHost(url) { try { const host = new URL(url).hostname; return /(^|\.)github\.com$/.test(host) || /(^|\.)githubusercontent\.com$/.test(host); } catch (_) { return false; } }
function headersFor(url) {
  // only attach the GitHub token / GitHub Accept to GitHub hosts; everything else (e.g. reshade.me) gets neutral headers
  if (isGithubHost(url)) return headers();
  return { 'User-Agent': 'Stereoscope', 'Accept': '*/*' };
}
const NET_TIMEOUT = 15000;   // no request may hang forever - a wedged socket used to freeze the UI
/**
 * JSON fetch with the GitHub quota designed around.
 *
 * Unauthenticated api.github.com allows 60 requests an hour. A library refresh asks for far more,
 * so the API starts refusing and every mod list comes back empty. Three things prevent that here:
 *
 *   1. results are cached on disk, so browsing re-reads files instead of re-fetching
 *   2. once the API says 403/429 we stop calling it for the reset window rather than burning
 *      request after request on an endpoint that is already refusing
 *   3. when it is blocked, a stale cache entry is returned in preference to nothing
 *
 * The callers that matter most (release lists) have HTML fallbacks that carry no quota at all, so
 * a blocked API degrades into a slower path rather than an empty list.
 */
function getJSON(url, depth) {
  const isApi = /api\.github\.com/.test(String(url));
  if (isApi && !depth) {
    const fresh = ghfree.cacheGet('json:' + url, 10 * 60 * 1000);
    if (fresh) return Promise.resolve(fresh.value);
    if (ghfree.apiIsBlocked()) {
      const stale = ghfree.cacheGet('json:' + url, 0, true);
      if (stale) { log.app.info('API blocked, using cached copy', { url, ageMin: Math.round(stale.age / 60000) }); return Promise.resolve(stale.value); }
      /* Resolve with the SHAPE the callers already understand rather than rejecting. Every call
       * site checks `__status === 403` and falls through to the atom feed or the HTML release
       * pages; throwing here would skip that logic and turn a recoverable throttle into a dead end.
       * No request is made either way - this just keeps the existing fallback path intact. */
      return Promise.resolve({ __status: 403, message: 'API rate limit exceeded (cached block)' });
    }
  }
  return new Promise((resolve, reject) => {
    if ((depth || 0) > 5) return reject(new Error('too many redirects'));
    let done = false;
    const fail = e => { if (!done) { done = true; reject(e); } };
    const ok = v => { if (!done) { done = true; resolve(v); } };
    const req = https.get(url, { headers: headers() }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return ok(getJSON(res.headers.location, (depth || 0) + 1)); }
      if (isApi && (res.statusCode === 403 || res.statusCode === 429)) {
        ghfree.markRateLimited(res.headers['x-ratelimit-reset']);
        log.app.warn('GitHub API rate-limited', { url, resetIn: ghfree.rateLimitState().minutes + ' min' });
        const stale = ghfree.cacheGet('json:' + url, 0, true);
        res.resume();
        if (stale) return ok(stale.value);
        return ok({ __status: 403, message: 'API rate limit exceeded' });   // callers fall through
      }
      let data = ''; res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j && typeof j === 'object') j.__status = res.statusCode;
          // cache successful API answers so the next hundred lookups cost nothing
          if (isApi && res.statusCode === 200) ghfree.cachePut('json:' + url, j);
          ok(j);
        } catch (e) { fail(e); }
      });
      res.on('error', fail);
    });
    req.setTimeout(NET_TIMEOUT, () => { try { req.destroy(); } catch (_) {} fail(new Error('timeout after ' + NET_TIMEOUT + 'ms: ' + url)); });
    req.on('error', fail);
  });
}
/** Fetch raw text (follows redirects). Used for the releases.atom feed — plain github.com, not the rate-limited API. */
function getText(url, depth) {
  return new Promise((resolve) => {
    if ((depth || 0) > 5) return resolve({ __status: 508, text: '' });
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const req = https.get(url, { headers: { 'User-Agent': 'Stereoscope' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return finish(getText(res.headers.location, (depth || 0) + 1)); }
      if (res.statusCode !== 200) { res.resume(); return finish({ __status: res.statusCode, text: '' }); }
      let data = ''; res.on('data', d => data += d);
      res.on('end', () => finish({ __status: 200, text: data }));
      res.on('error', () => finish({ __status: 0, text: '' }));
    });
    req.setTimeout(NET_TIMEOUT, () => { try { req.destroy(); } catch (_) {} finish({ __status: 0, text: '' }); });
    req.on('error', () => finish({ __status: 0, text: '' }));
  });
}
/** HEAD a URL - used to probe whether a specific build exists on a host. Resolves {ok, status, size}. */
function headOk(url, depth) {
  return new Promise((resolve) => {
    if ((depth || 0) > 4) return resolve({ ok: false, status: 508, size: 0 });
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const req = https.request(url, { method: 'HEAD', headers: { 'User-Agent': 'Stereoscope' } }, res => {
        res.resume();
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return finish(headOk(res.headers.location, (depth || 0) + 1));
        }
        finish({ ok: res.statusCode === 200, status: res.statusCode, size: parseInt(res.headers['content-length'] || '0', 10) || 0 });
      });
      req.setTimeout(7000, () => { try { req.destroy(); } catch (_) {} finish({ ok: false, status: 0, size: 0 }); });
      req.on('error', () => finish({ ok: false, status: 0, size: 0 }));
      req.end();
    } catch (_) { finish({ ok: false, status: 0, size: 0 }); }
  });
}

/** Newest release tag via the atom feed (reliable even when the API is rate-limited). */
async function latestTagAtom(repo) {
  const r = await getText('https://github.com/' + repo + '/releases.atom');
  if (!r || r.__status !== 200 || !r.text) return null;
  const m = r.text.match(/releases\/tag\/([^"'<>\s]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/* ===================== geo-11 (official / HelixMod) latest-version discovery =====================
 * There is no release API for the official driver, and the announcement post on the blog is frozen at
 * the version it launched with - newer builds (0.6.82, 0.6.109, 0.7.x ...) are published by dropping a
 * new archive on bo3b's S3 host and linking it from newer posts. So we find the newest build the way
 * it is actually published, in order of reliability:
 *
 *   1) Blogger JSON feed API  - helixmod.blogspot.com/feeds/posts/default?alt=json&q=geo-11
 *      A real public API (no key, no auth). We search every post for geo-11_vX.Y.Z archive links, which
 *      catches versions announced in per-game fix posts, not just the original announcement.
 *   2) Direct probe of the S3 filename pattern - geo-11/geo-11_v<major>.<minor>.<patch>.7z
 *      The naming scheme is stable, so we HEAD upward from the newest version we know about. This keeps
 *      working even if the bucket forbids listing and the blog markup changes.
 *   3) S3 ListObjectsV2 on the geo-11/ prefix, when the bucket permits anonymous listing.
 *   4) The pinned known-good version that ships in CORE_SOURCES.
 *
 * Whatever wins, we verify the archive actually exists (HEAD 200) before reporting it, so we never hand
 * the installer a dead URL. Result is cached for the session. */
const GEO11_BUCKET = 'https://bo3b.s3.us-east-1.amazonaws.com';
const GEO11_KEY = (v) => '/geo-11/geo-11_v' + v + '.7z';
const GEO11_FEED = 'https://helixmod.blogspot.com/feeds/posts/default?alt=json&q=geo-11&max-results=50&orderby=updated';
const GEO11_ARCHIVE_RE = /https?:\/\/[^"'\s<>\\]*geo-11[_+\-\s]*v?(\d+\.\d+(?:\.\d+)?)[^"'\s<>\\]*\.(?:7z|zip)/gi;
let _geo11Latest = null, _geo11At = 0;   // { version, url, source } | null
const DISCOVERY_TTL = 30 * 60 * 1000;   // a real discovery is good for half an hour
const FALLBACK_TTL  = 60 * 1000;        // a pinned/offline fallback is retried a minute later

function geo11VerNum(v) {
  const m = String(v || '').match(/(\d+)\.(\d+)\.?(\d+)?/);
  return m ? (parseInt(m[1], 10) * 1e6 + parseInt(m[2], 10) * 1e3 + (parseInt(m[3], 10) || 0)) : 0;
}
function geo11Parts(v) {
  const m = String(v || '').match(/(\d+)\.(\d+)\.?(\d+)?/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10) || 0] : [0, 0, 0];
}

/** Candidate versions just past `from`, ordered nearest-first: patch bumps, then minor, then major. */
function geo11Candidates(from, budget) {
  const [MA, MI, PA] = geo11Parts(from); const out = [];
  for (let p = PA + 1; p <= PA + 12; p++) out.push(MA + '.' + MI + '.' + p);
  for (let mi = MI + 1; mi <= MI + 4; mi++) { out.push(MA + '.' + mi + '.0'); out.push(MA + '.' + mi + '.1'); }
  out.push((MA + 1) + '.0.0');
  return out.slice(0, budget || 30);
}

/** Newest official geo-11 archive, discovered live. Always falls back to the pinned build. */
async function geo11LatestHelix(force) {
  const ttl = (_geo11Latest && _geo11Latest.source === 'pinned') ? FALLBACK_TTL : DISCOVERY_TTL;
  if (_geo11Latest && !force && (Date.now() - _geo11At) < ttl) return _geo11Latest;
  const src = CORE_BY_ID.geo11 || {};
  const pinned = { version: String(src.version || 'v0.7.9').replace(/^v/, ''), url: src.url, source: 'pinned' };
  const best = (list) => list.reduce((a, c) => (!a || geo11VerNum(c.version) > geo11VerNum(a.version)) ? c : a, null);
  let found = [];

  // 1) Blogger JSON feed - the blog's own public API. Finds archives linked from ANY post.
  try {
    const r = await getText(GEO11_FEED);
    if (r && r.__status === 200 && r.text) {
      GEO11_ARCHIVE_RE.lastIndex = 0;
      for (const m of r.text.matchAll(GEO11_ARCHIVE_RE)) {
        // JSON-escaped slashes come back as \/ - normalise before use
        found.push({ version: m[1], url: m[0].replace(/\\\//g, '/'), source: 'helixmod-feed' });
      }
    }
  } catch (_) {}

  // 2) S3 ListObjectsV2, if the bucket allows anonymous listing
  try {
    const r = await getText(GEO11_BUCKET + '/?list-type=2&prefix=geo-11/&max-keys=1000');
    if (r && r.__status === 200 && r.text) {
      for (const m of r.text.matchAll(/<Key>([^<]*geo-11[_-]v?(\d+\.\d+(?:\.\d+)?)[^<]*\.(?:7z|zip))<\/Key>/gi)) {
        found.push({ version: m[2], url: GEO11_BUCKET + '/' + m[1].split('/').map(encodeURIComponent).join('/'), source: 's3-list' });
      }
    }
  } catch (_) {}

  // Take the best of what we discovered. Prefer a link we can actually verify, but do NOT throw an
  // unverifiable one away: hosts that refuse HEAD (or a transient hiccup) would otherwise cost us the
  // blog's own authoritative link and drop us all the way back to the pinned build. Keep it as a
  // fallback and let probing try to beat it.
  let winner = best(found.filter(c => geo11VerNum(c.version) >= geo11VerNum(pinned.version)));
  let unverified = null;
  if (winner) {
    const h = await headOk(winner.url);
    if (!h.ok) { unverified = { ...winner, source: winner.source + '-unverified' }; winner = null; }
  }

  // 3) Probe the stable S3 filename pattern upward from the best version we trust so far.
  //    Hard-bounded by BOTH a probe count and a wall-clock deadline so a stalled network can never
  //    hang the UI - whatever we have when the budget runs out is what we report.
  const DEADLINE = Date.now() + 12000;
  const base = winner || pinned;
  let cursor = base.version, hops = 0, misses = 0;
  for (let round = 0; round < 4 && hops < 30 && Date.now() < DEADLINE; round++) {
    let advanced = false;
    for (const cand of geo11Candidates(cursor, 30 - hops)) {
      if (Date.now() >= DEADLINE) break;
      hops++;
      const url = GEO11_BUCKET + GEO11_KEY(cand);
      const h = await headOk(url);
      if (h.ok) { winner = { version: cand, url, source: 's3-probe' }; cursor = cand; advanced = true; misses = 0; break; }
      if (++misses > 24) break;
    }
    if (!advanced) break;                            // nothing newer than `cursor` exists
  }

  // probing beat everything > verified feed link > unverified feed link > pinned
  _geo11Latest = winner || unverified || pinned; _geo11At = Date.now();
  return _geo11Latest;
}

/* ===================== ReShade latest-version discovery =====================
 * reshade.me has no release API either - the home page simply links the current setup tool as
 * ReShade_Setup_<version>.exe (and _Addon.exe for the add-on build the stereo mods require).
 * Same tiering as geo-11 so a new upstream release is picked up instead of staying pinned:
 *   1) scrape the home page for a ReShade_Setup_X.Y.Z_Addon.exe link
 *   2) probe the predictable /downloads/ filename upward from the newest version we know
 *   3) fall back to the pinned known-good build
 * The winner is HEAD-checked; an unverifiable link is kept as a ranked fallback rather than dropped. */
const RESHADE_SITE = 'https://reshade.me/';
const RESHADE_DL = 'https://reshade.me/downloads/ReShade_Setup_';
const RESHADE_RE = /ReShade_Setup_(\d+\.\d+(?:\.\d+)?)(_Addon)?\.exe/gi;
let _reshadeLatest = null, _reshadeAt = 0;

/** Candidate versions just past `from`, nearest first (patch bumps, then minor, then major). */
function reshadeCandidates(from, budget) {
  const m = String(from || '').match(/(\d+)\.(\d+)\.?(\d+)?/);
  const MA = m ? +m[1] : 6, MI = m ? +m[2] : 0, PA = m ? (+m[3] || 0) : 0;
  const out = [];
  for (let p = PA + 1; p <= PA + 8; p++) out.push(MA + '.' + MI + '.' + p);
  for (let mi = MI + 1; mi <= MI + 3; mi++) { out.push(MA + '.' + mi + '.0'); out.push(MA + '.' + mi + '.1'); }
  out.push((MA + 1) + '.0.0');
  return out.slice(0, budget || 20);
}

/** Newest ReShade **add-on** build, discovered live. Falls back to the pinned URL. */
async function reshadeLatest(force) {
  const ttl = (_reshadeLatest && _reshadeLatest.source === 'pinned') ? FALLBACK_TTL : DISCOVERY_TTL;
  if (_reshadeLatest && !force && (Date.now() - _reshadeAt) < ttl) return _reshadeLatest;
  const src = CORE_BY_ID.reshade || {};
  const pinnedVer = String(src.version || '6.7.3');
  const pinned = { version: pinnedVer, url: src.url || (RESHADE_DL + pinnedVer + '_Addon.exe'), source: 'pinned' };
  const num = (v) => { const x = String(v).match(/(\d+)\.(\d+)\.?(\d+)?/); return x ? (+x[1] * 1e6 + +x[2] * 1e3 + (+x[3] || 0)) : 0; };

  // 1) the home page lists the current setup tool
  let found = [];
  try {
    const r = await getText(RESHADE_SITE);
    if (r && r.__status === 200 && r.text) {
      RESHADE_RE.lastIndex = 0;
      for (const m of r.text.matchAll(RESHADE_RE)) {
        found.push({ version: m[1], addon: !!m[2], url: RESHADE_DL + m[1] + '_Addon.exe', source: 'reshade-site' });
      }
    }
  } catch (_) {}
  let winner = found.filter(c => num(c.version) >= num(pinned.version))
                    .reduce((a, c) => (!a || num(c.version) > num(a.version)) ? c : a, null);
  let unverified = null;
  if (winner) { const h = await headOk(winner.url); if (!h.ok) { unverified = { ...winner, source: 'reshade-site-unverified' }; winner = null; } }

  // 2) probe the predictable filename, bounded by count and wall clock
  const DEADLINE = Date.now() + 10000;
  let cursor = (winner || pinned).version, hops = 0;
  for (let round = 0; round < 3 && hops < 20 && Date.now() < DEADLINE; round++) {
    let advanced = false;
    for (const cand of reshadeCandidates(cursor, 20 - hops)) {
      if (Date.now() >= DEADLINE) break;
      hops++;
      const url = RESHADE_DL + cand + '_Addon.exe';
      const h = await headOk(url);
      if (h.ok) { winner = { version: cand, url, addon: true, source: 'reshade-probe' }; cursor = cand; advanced = true; break; }
    }
    if (!advanced) break;
  }
  _reshadeLatest = winner || unverified || pinned; _reshadeAt = Date.now();
  return _reshadeLatest;
}

// The app's own GitHub repo — used for the self-update check.
const APP_REPO = 'BerZerker96/Stereo3D-6DOF-MANAGER';

/** Normalize a version-ish tag to comparable numeric parts: 'v1.2.3' -> [1,2,3]. */
function verParts(v) {
  const m = String(v || '').match(/(\d+(?:\.\d+)*)/);
  return m ? m[1].split('.').map(function (n) { return parseInt(n, 10) || 0; }) : [0];
}
/** Compare two versions. Returns 1 if a>b, -1 if a<b, 0 if equal. */
function verCmp(a, b) {
  const pa = verParts(a), pb = verParts(b); const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x > y) return 1; if (x < y) return -1; }
  return 0;
}

/**
 * Check whether a newer build of the app itself has been published on its GitHub releases page.
 * Uses the atom feed first (no API rate limit), falling back to the API for the asset + notes.
 * Returns { current, latest, update, url, notes, asset:{name,url,size}|null, rateLimited, error }.
 */
async function appUpdateCheck() {
  let current = '0.0.0';
  try { current = require('electron').app.getVersion(); }
  catch (_) { try { current = require(path.join(__dirname, '..', 'package.json')).version || current; } catch (_) {} }
  const releasesUrl = 'https://github.com/' + APP_REPO + '/releases';
  let latest = null;
  try { latest = await latestTagAtom(APP_REPO); } catch (_) {}
  let asset = null, notes = '', rateLimited = false, apiTag = null;
  try {
    const rj = await getJSON('https://api.github.com/repos/' + APP_REPO + '/releases/latest');
    if (rj && rj.__status === 403) rateLimited = true;
    else if (rj && rj.tag_name) {
      apiTag = rj.tag_name; notes = rj.body || '';
      const assets = (rj.assets || []).filter(function (a) { return /\.(exe|zip|7z|msi|appimage|dmg)$/i.test(a.name); });
      const pick = assets.find(function (a) { return /(setup|installer)\.exe$/i.test(a.name); })
        || assets.find(function (a) { return /\.exe$/i.test(a.name); })
        || assets.find(function (a) { return /\.zip$/i.test(a.name); })
        || assets[0];
      if (pick) asset = { name: pick.name, url: pick.browser_download_url, size: pick.size };
    }
  } catch (_) {}
  if (!latest && apiTag) latest = apiTag;
  if (!latest) {
    return { current: current, latest: null, update: false, url: releasesUrl, notes: '', asset: null,
      // Same rule everywhere: only mention the throttle when we actually came up empty. The atom
      // feed answers without a quota, so a successful fallback must not read as a failure.
      rateLimited: rateLimited && !latest,
      error: (rateLimited && !latest) ? 'GitHub is throttling the API; the app is using the public release pages instead.' : null };
  }
  const update = verCmp(latest, current) > 0;
  return { current: current, latest: latest, update: update, url: releasesUrl,
    notes: String(notes || '').slice(0, 2000), asset: asset,
    // we have a version, so the throttle is not the user's problem - don't surface it
    rateLimited: false, error: null };
}

/** Download an app-update asset to the user's Downloads folder and reveal it. Returns { ok, path, note }. */
/**
 * Self-update for an unpacked (portable) build.
 *
 * Electron can't overwrite its own running files on Windows, so the swap is handed to a batch
 * script: the app downloads the new build, writes a .bat, launches it detached and quits. The
 * script waits for the process to actually exit, replaces the files, relaunches the app and
 * deletes itself. Everything it does is written to logs/update.log so a failed swap is diagnosable
 * rather than silent, and the previous build is kept until the new one has started.
 */
async function appUpdateApply(assetPath, opts) {
  opts = opts || {};
  const electron = require('electron');
  const exePath = process.execPath;                 // ...\Stereo 3D 6DoF Manager.exe
  const appDir  = path.dirname(exePath);
  const logDir  = (() => { try { return require('./logger').logPaths().root; } catch (_) { return os.tmpdir(); } })();

  if (!assetPath || !fs.existsSync(assetPath)) return { ok: false, note: 'The downloaded update could not be found.' };
  if (process.platform !== 'win32') return { ok: false, note: 'Automatic replacement is Windows-only. The download is in your Downloads folder.' };

  // Unpack the new build next to the app so the swap is a local move, not a cross-volume copy.
  const staging = path.join(appDir, '.update-staging');
  try {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    if (/\.(zip|7z|rar)$/i.test(assetPath)) await extractArchive(assetPath, staging);
    else return { ok: false, note: 'This release ships an installer (' + path.basename(assetPath) + ') rather than a portable archive. Run it to update.', installer: true, path: assetPath };
  } catch (e) {
    return { ok: false, note: 'Could not unpack the update: ' + String(e.message || e) };
  }

  // A release archive usually wraps everything in one folder - swap that, not the wrapper.
  const srcDir = unwrapStaging(staging);
  if (!fs.existsSync(path.join(srcDir, path.basename(exePath)))) {
    const found = (() => { try { return fs.readdirSync(srcDir).filter(f => /\.exe$/i.test(f)); } catch (_) { return []; } })();
    if (!found.length) { try { fs.rmSync(staging, { recursive: true, force: true }); } catch (_) {} 
      return { ok: false, note: 'The update archive does not contain the application executable.' }; }
  }

  const bat = path.join(appDir, 'apply-update.bat');
  const q = (p) => '"' + String(p).replace(/"/g, '') + '"';
  const script = [
    '@echo off',
    'setlocal enableextensions',
    'set "LOG=' + path.join(logDir, 'update.log') + '"',
    'echo [%DATE% %TIME%] update starting, pid=%1 >> %LOG%',
    // wait for the app to release its files (up to ~60s), then confirm with a rename probe
    'set /a tries=0',
    ':waitloop',
    'set /a tries+=1',
    'tasklist /FI "PID eq %1" 2>nul | find "%1" >nul',
    'if errorlevel 1 goto gone',
    'if %tries% GEQ 120 goto timeout',
    'ping -n 2 127.0.0.1 >nul',
    'goto waitloop',
    ':timeout',
    'echo [%DATE% %TIME%] the app did not exit in 60s - aborting, nothing changed >> %LOG%',
    'goto cleanup',
    ':gone',
    'ping -n 3 127.0.0.1 >nul',
    'echo [%DATE% %TIME%] copying new build >> %LOG%',
    // /XD keeps the user's own data out of the swap; the old build stays until the copy succeeds
    'robocopy ' + q(srcDir) + ' ' + q(appDir) + ' /E /IS /IT /R:3 /W:2 /XD ' + q(staging) + ' ' + q(path.join(appDir, 'logs')) + ' ' + q(path.join(appDir, 'manual-core')) + ' >> %LOG% 2>&1',
    'if errorlevel 8 (',
    '  echo [%DATE% %TIME%] ROBOCOPY FAILED - the previous build is untouched >> %LOG%',
    '  start "" ' + q(exePath),
    '  goto cleanup',
    ')',
    'echo [%DATE% %TIME%] copy ok, relaunching >> %LOG%',
    'start "" ' + q(exePath),
    ':cleanup',
    'rmdir /S /Q ' + q(staging) + ' >nul 2>&1',
    'echo [%DATE% %TIME%] done >> %LOG%',
    'del "%~f0" >nul 2>&1'
  ].join('\r\n');

  try { fs.writeFileSync(bat, script, 'utf8'); }
  catch (e) { return { ok: false, note: 'Could not write the update script: ' + String(e.message || e) }; }

  try { require('./logger').app.info('self-update: launching swap script', { bat, staging, srcDir, appDir }); } catch (_) {}
  if (opts.dryRun) return { ok: true, dryRun: true, bat, staging, srcDir, script };

  const { spawn } = require('child_process');
  const child = spawn('cmd.exe', ['/c', 'start', '""', '/min', bat, String(process.pid)],
    { detached: true, stdio: 'ignore', windowsHide: true, cwd: appDir });
  child.unref();

  setTimeout(() => { try { electron.app.quit(); } catch (_) {} }, 400);
  return { ok: true, restarting: true, note: 'Installing the update and restarting\u2026' };
}

/** Descend a lone wrapper folder inside the extracted update. */
function unwrapStaging(dir) {
  let cur = dir;
  for (let i = 0; i < 3; i++) {
    let ents = []; try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { return cur; }
    if (ents.some(e => e.isFile() && /\.exe$/i.test(e.name))) return cur;
    const dirs = ents.filter(e => e.isDirectory());
    if (dirs.length !== 1) return cur;
    cur = path.join(cur, dirs[0].name);
  }
  return cur;
}

async function appUpdateDownload(asset) {
  if (!asset || !asset.url) return { ok: false, note: 'No downloadable installer on the latest release - opening the releases page instead.' };
  let dir;
  try { dir = require('electron').app.getPath('downloads'); } catch (_) { dir = os.tmpdir(); }
  const dest = path.join(dir, asset.name || ('Stereo3D-Manager-update-' + Date.now()));
  try {
    await downloadWithMirrors(asset.url, dest, null, 'App update ' + (asset.name || ''));
    try { require('electron').shell.showItemInFolder(dest); } catch (_) {}
    return { ok: true, path: dest, note: 'Downloaded ' + path.basename(dest) + ' to your Downloads folder.' };
  } catch (e) { return { ok: false, note: 'Download failed: ' + (e.message || e) }; }
}
/** All release tags via the atom feed (for the 6DOF hub / itsloopyo per-game repos). */
async function allTagsAtom(repo) {
  const r = await getText('https://github.com/' + repo + '/releases.atom');
  if (!r || r.__status !== 200 || !r.text) return [];
  return [...new Set([...r.text.matchAll(/releases\/tag\/([^"'<>\s]+)/g)].map(m => decodeURIComponent(m[1])))];
}
/** EVERY release tag — paginates the releases page HTML (the atom feed & tags page only show the latest ~10). */
async function hubAllTags(repo) {
  const tags = []; const seen = new Set();
  for (let page = 1; page <= 10; page++) {
    let r; try { r = await getText('https://github.com/' + repo + '/releases?page=' + page); } catch (_) { break; }
    if (!r || r.__status !== 200 || !r.text) break;
    let added = 0;
    for (const m of r.text.matchAll(/\/releases\/tag\/([^"'#?<>\s]+)/g)) { let t; try { t = decodeURIComponent(m[1]); } catch (_) { t = m[1]; } if (t && !seen.has(t)) { seen.add(t); tags.push(t); added++; } }
    if (!added) break;   // no new tags on this page → done
  }
  const clean = tags.filter(t => t && !/^(page|latest)$/i.test(t));   // keep everything real (odd tags like "1"/"s1" are real mods)
  if (clean.length) return clean;
  try { return await allTagsAtom(repo); } catch (_) { return []; }
}
/**
 * Every release on the hub as { tag, name }.
 *
 * These are NOT the same thing, and assuming they were is what broke Assassin's Creed Unity and
 * Syndicate. The hub titles a release "ACSyndicate" but its git tag is "s1"; "ACOrigins" is tagged
 * "1". Downloads address the TAG, humans recognise the NAME, so both have to be carried.
 * The releases page links each title to its tag: <a href="/…/releases/tag/s1">ACSyndicate</a>.
 */
async function hubAllReleaseRefs(repo) {
  const out = []; const seen = new Set();
  for (let page = 1; page <= 10; page++) {
    let r; try { r = await getText('https://github.com/' + repo + '/releases?page=' + page); } catch (_) { break; }
    if (!r || r.__status !== 200 || !r.text) break;
    let added = 0;
    // href gives the tag, the anchor text gives the release title
    for (const m of r.text.matchAll(/\/releases\/tag\/([^"'#?<>\s]+)"[^>]*>\s*([^<]{1,90}?)\s*</g)) {
      let tag; try { tag = decodeURIComponent(m[1]); } catch (_) { tag = m[1]; }
      const name = String(m[2] || '').trim();
      if (!tag || /^(page|latest)$/i.test(tag) || seen.has(tag)) continue;
      seen.add(tag);
      out.push({ tag, name: (name && !/^latest$/i.test(name)) ? name : tag });
      added++;
    }
    if (!added) break;
  }
  if (out.length) return out;
  // no page markup (offline / blocked) → fall back to bare tags from the atom feed
  let tags = []; try { tags = await allTagsAtom(repo); } catch (_) {}
  return tags.map(t => ({ tag: t, name: t }));
}

/** Asset name+download-URL list for a release, scraped from the expanded_assets page (no API, no token). */
async function assetsViaExpanded(repo, tag) {
  const r = await getText('https://github.com/' + repo + '/releases/expanded_assets/' + encodeURIComponent(tag));
  if (!r || r.__status !== 200 || !r.text) return [];
  const seen = new Set(); const out = [];
  for (const m of r.text.matchAll(/href="(\/[^"]*\/releases\/download\/[^"]+)"/g)) {
    const href = m[1]; if (seen.has(href)) continue; seen.add(href);
    out.push({ name: decodeURIComponent(href.split('/').pop()), url: 'https://github.com' + href, size: 0 });
  }
  return out;
}
/** Download to `dest`. Redirects are followed, but only so far: a host that redirects in a loop
 *  used to recurse until the process ran out of memory. getJSON already capped at 5; this didn't. */
/** Mirrors to try for a URL, in order. Every github.com / githubusercontent.com asset also exists,
 *  more often than not, in the Wayback Machine - a free fallback for when GitHub is down or is
 *  rate-limiting this IP. Costs nothing when the primary works. */
/** Cheap sanity check on a downloaded file: non-empty, and if it claims to be an archive the
 *  magic bytes must agree. A CDN answering 200 with an HTML error page is the case this catches -
 *  without it the download "succeeds" and only fails later, at extraction, with no mirror retry. */
function archiveLooksValid(file) {
  let st; try { st = fs.statSync(file); } catch (_) { return false; }
  if (!st.size) return false;
  const ext = (String(file).match(/\.([a-z0-9]+)$/i) || [])[1];
  if (!/^(zip|7z|rar)$/i.test(ext || '')) return true;          // not an archive we can vet
  let head;
  try { const fd = fs.openSync(file, 'r'); head = Buffer.alloc(8); fs.readSync(fd, head, 0, 8, 0); fs.closeSync(fd); }
  catch (_) { return false; }
  const e = String(ext).toLowerCase();
  const magic = (bytes) => bytes.every((b, i) => head[i] === b);
  if (e === 'zip') return magic([0x50, 0x4B]);                                  // PK
  if (e === '7z')  return magic([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]);          // 7z¼¯'
  if (e === 'rar') return magic([0x52, 0x61, 0x72, 0x21]);                      // Rar!
  return true;
}

function mirrorsFor(url) {
  const out = [url];
  if (/^https?:\/\/(github\.com|[^/]*\.githubusercontent\.com)\//i.test(url))
    out.push('https://web.archive.org/web/0/' + url);
  return out;
}

/** Try each mirror in turn; the first that lands wins. */
/** A pinned asset URL can 404 when an author re-tags or renames a release. Ask the API for the
 *  repo's releases and find the asset again by NAME. Deliberately conservative, newest release
 *  first: exact filename, then same leading word + same extension, then a release whose only asset
 *  has that extension. Anything ambiguous is left alone rather than guessed at. */
async function reresolveAssetUrl(url) {
  const m = String(url).match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/[^/]+\/(.+)$/i);
  if (!m) return null;
  const [, owner, repo, rawName] = m;
  let want; try { want = decodeURIComponent(rawName); } catch (_) { want = rawName; }
  const ext = (want.match(/\.[a-z0-9]+$/i) || [''])[0];
  const prefix = (want.match(/^([A-Za-z]{4,})/) || [])[1] || '';
  let rels = null;
  try { rels = await getJSON('https://api.github.com/repos/' + owner + '/' + repo + '/releases?per_page=100'); } catch (_) {}
  if (!Array.isArray(rels)) return null;
  const live = rels.filter(r => r && !r.draft && Array.isArray(r.assets));
  const pick = (fn) => { for (const r of live) { const a = r.assets.find(fn); if (a) return a; } return null; };
  let hit = pick(a => a.name === want);
  if (!hit && prefix && ext) hit = pick(a => a.name.startsWith(prefix) && a.name.toLowerCase().endsWith(ext.toLowerCase()));
  if (!hit && ext) {
    for (const r of live) {
      const cand = r.assets.filter(a => a.name.toLowerCase().endsWith(ext.toLowerCase()));
      if (cand.length === 1) { hit = cand[0]; break; }
    }
  }
  if (hit && hit.browser_download_url && hit.browser_download_url !== url) {
    log.dl.note('re-resolved a renamed release asset', { was: want, now: hit.name, url: hit.browser_download_url });
    return hit.browser_download_url;
  }
  return null;
}

async function downloadWithMirrors(url, dest, onProgress, label) {
  const urls = mirrorsFor(url);
  let lastErr = null;
  for (let i = 0; i < urls.length; i++) {
    try {
      if (i) log.dl.note('primary failed, trying mirror ' + i, { url: urls[i] });
      const got = await download(urls[i], dest, onProgress, label);
      if (!archiveLooksValid(dest)) throw new Error('downloaded file is not a readable archive');
      return got;
    } catch (e) {
      lastErr = e;
      try { fs.rmSync(dest, { force: true }); } catch (_) {}   // never leave a partial file behind
    }
  }
  // Every mirror failed. The asset may simply have been renamed - look it up again by name.
  try {
    const fresh = await reresolveAssetUrl(url);
    if (fresh) {
      try {
        const got = await download(fresh, dest, onProgress, label);
        if (!archiveLooksValid(dest)) throw new Error('re-resolved file is not a readable archive');
        return got;
      } catch (e) { lastErr = e; try { fs.rmSync(dest, { force: true }); } catch (_) {} }
    }
  } catch (_) {}
  throw lastErr || new Error('download failed: ' + url);
}

function download(url, dest, onProgress, label, depth) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = e => { if (!settled) { settled = true; reject(e); } };
    const done = v => { if (!settled) { settled = true; try { req && req.__clearIdle && req.__clearIdle(); } catch (_) {} resolve(v); } };
    const t0 = Date.now();
    if (!depth) log.dl.start(url, label);
    if ((depth || 0) > 5) { const e = new Error('too many redirects while downloading ' + (label || url)); log.dl.fail(url, e, Date.now() - t0, label); return fail(e); }
    const req = https.get(url, { headers: headersFor(url) }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        log.dl.redirect(url, res.headers.location, (depth || 0) + 1);
        res.resume(); return done(download(res.headers.location, dest, onProgress, label, (depth || 0) + 1));
      }
      log.dl.status(url, res.statusCode, parseInt(res.headers['content-length'] || '0', 10));
      if (res.statusCode !== 200) { res.resume(); const e = new Error('HTTP ' + res.statusCode + ' for ' + url); log.dl.fail(url, e, Date.now() - t0, label); return fail(e); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0, lastPct = -1;
      const file = fs.createWriteStream(dest);
      // Progress carries MB counters and a live rate. Without the rate a slow source looks like an
      // app that has frozen; with it, the user can see the transfer is simply slow.
      let lastTick = 0;
      res.on('data', chunk => {
        got += chunk.length;
        const now = Date.now();
        const secs = Math.max(0.001, (now - t0) / 1000);
        const mbps = (got / 1048576) / secs;
        const rate = mbps >= 1 ? (mbps.toFixed(1) + ' MB/s') : (Math.round(mbps * 1024) + ' KB/s');
        const gotMB = +(got / 1048576).toFixed(1), totalMB = total ? +(total / 1048576).toFixed(1) : 0;
        if (!onProgress) return;
        // Throttle to ~4 updates/sec so a fast transfer doesn't flood the UI - but ALWAYS emit the
        // first chunk, or a download that finishes inside one window would show no progress at all.
        const first = lastTick === 0;
        if (!first && (now - lastTick) < 250) return;
        lastTick = now;
        if (total) {
          const pct = Math.floor(got / total * 100);
          lastPct = pct;
          onProgress({ label, pct, got, total, gotMB, totalMB, rate, mbps });
        } else {
          onProgress({ label, got, total: 0, gotMB, totalMB: 0, rate, mbps });
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        try { const b = fs.statSync(dest).size, ms = Date.now() - t0; log.dl.done(url, b, ms, label); } catch (_) {}
        file.close(() => done(dest));
      });
      file.on('error', e => { file.close(); fail(e); });
      res.on('data', () => { try { req.__armIdle && req.__armIdle(); } catch (_) {} });
      res.on('end', () => {
        try { req.__clearIdle && req.__clearIdle(); } catch (_) {}
        if (onProgress) {                       // always close the bar out at 100%
          const secs = Math.max(0.001, (Date.now() - t0) / 1000);
          const mbps = (got / 1048576) / secs;
          onProgress({ label, pct: 100, got, total: total || got,
            gotMB: +(got / 1048576).toFixed(1), totalMB: +((total || got) / 1048576).toFixed(1),
            rate: mbps >= 1 ? (mbps.toFixed(1) + ' MB/s') : (Math.round(mbps * 1024) + ' KB/s'), mbps, done: true });
        }
      });
      res.on('error', e => { try { req.__clearIdle && req.__clearIdle(); } catch (_) {} fail(e); });
    });
    // stall guard: resets on every received chunk, so a big download is fine but a dead socket isn't
    // A flat 60s cap punished big legitimate downloads while still letting a wedged socket freeze
    // the UI for a minute. Cap INACTIVITY instead: as long as bytes keep arriving the download runs
    // as long as it needs, but a stalled connection is dropped after 20s of silence.
    const IDLE_MS = 20000;
    let idle = null;
    const armIdle = () => {
      if (settled) return;                       // finished transfers don't need a stall guard
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => {
        if (settled) return;                     // BUG WAS HERE: this fired 20s AFTER a successful
        try { req.destroy(); } catch (_) {}      // download and logged a bogus FAILURE every time.
        const e = new Error('download stalled (no data for ' + (IDLE_MS / 1000) + 's): ' + url);
        log.dl.fail(url, e, Date.now() - t0, label);
        fail(e);
      }, IDLE_MS);
    };
    const clearIdle = () => {
      if (idle) { clearTimeout(idle); idle = null; }
      try { req.setTimeout(0); } catch (_) {}     // disarm the request-level timer as well
    };
    req.__armIdle = armIdle; req.__clearIdle = clearIdle;
    armIdle();
    req.setTimeout(IDLE_MS, () => { if (settled) return; try { req.destroy(); } catch (_) {} fail(new Error('download stalled: ' + url)); });
    req.on('error', fail);
  });
}

function sourceFor(id, game) {
  if (CORE_BY_ID[id]) return CORE_BY_ID[id];
  const m = MODS[id];
  if (m && m.perGame && typeof m.repo === 'function') { const nm = (game && (game.__htName || game.n)) || ''; const repo = (game && game.__loopRepo) || m.repo(nm); return { id, name: m.name, strategy: 'github-release', repo }; }
  return null;
}

/** Newest release INCLUDING pre-releases. GitHub's /releases/latest deliberately skips them, so a
 *  repo that only ever published pre-releases (several itsloopyo mods) looked completely empty. */
async function newestReleaseAnyKind(repo) {
  try {
    const rels = await getJSON('https://api.github.com/repos/' + repo + '/releases?per_page=100');
    if (Array.isArray(rels)) {
      const live = rels.filter(r => !r.draft && (r.assets || []).length);
      if (live.length) {
        live.sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
        return live[0];
      }
    }
  } catch (_) {}
  return null;
}

async function latestRelease(id, game) {
  const src = sourceFor(id, game);
  if (!src || !src.repo) return null;
  try {
    const rel = await getJSON('https://api.github.com/repos/' + src.repo + '/releases/latest');
    const limited = !!(rel && rel.__status === 403 && /rate limit/i.test(rel.message || ''));
    if (!limited && rel && (rel.message === 'Not Found' || rel.__status === 404)) {
      // /releases/latest deliberately SKIPS pre-releases, so a repo that only ever published
      // pre-releases 404s here and looked as if it had no downloads at all. Many itsloopyo mods
      // are pre-release only. Fall back to the full list and take the newest of any kind.
      const any = await newestReleaseAnyKind(src.repo);
      if (any && any.tag_name) return { repo: src.repo, tag: any.tag_name, prerelease: !!any.prerelease,
        assets: (any.assets || []).map(a => ({ name: a.name, url: a.browser_download_url, size: a.size })) };
      return { repo: src.repo, tag: null, assets: [], notFound: true };
    }
    if (!limited && rel && rel.tag_name) return { repo: src.repo, tag: rel.tag_name, assets: (rel.assets || []).map(a => ({ name: a.name, url: a.browser_download_url, size: a.size })) };
    // The API threw or gave nothing usable. Before scraping, try the full release list: a repo whose
    // releases are ALL pre-releases 404s on /releases/latest but lists fine here.
    if (!limited) {
      const any = await newestReleaseAnyKind(src.repo);
      if (any && any.tag_name) return { repo: src.repo, tag: any.tag_name, prerelease: !!any.prerelease,
        assets: (any.assets || []).map(a => ({ name: a.name, url: a.browser_download_url, size: a.size })) };
    }
    // still nothing → tag from atom feed + assets scraped from expanded_assets (no token needed)
    const tag = await latestTagAtom(src.repo);
    if (!tag) return { repo: src.repo, tag: null, assets: [], rateLimited: limited };
    const assets = await assetsViaExpanded(src.repo, tag);
    return { repo: src.repo, tag, assets, viaScrape: true };
  } catch (_) {
    try { const tag = await latestTagAtom(src.repo); if (tag) return { repo: src.repo, tag, assets: await assetsViaExpanded(src.repo, tag), viaScrape: true }; } catch (_) {}
    return null;
  }
}

const HT_VER_RE = /[\s._\-]*\(?(v\d+(?:\.\d+)*|\d+\.\d+(?:\.\d+)*)\)?\s*$/i;   // trailing v2 / 1.0 / v1.2.3 (NOT a bare sequel number)
function htNorm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function stripVer(s) { const m = String(s || '').match(HT_VER_RE); return m ? String(s).slice(0, m.index).trim() : String(s || '').trim(); }

/** Score how well gameKey identifies text: exact=100, prefix=80, suffix=50, sequel-safe mid=30, else 0. */
function htMatchScore(text, gameKey) {
  const t = htNorm(text); if (!t || !gameKey) return 0;
  if (t === gameKey) return 100;
  if (t.startsWith(gameKey)) { const a = t[gameKey.length]; if (a === undefined || !/[0-9]/.test(a)) return 80; }
  if (t.endsWith(gameKey)) return 50;
  let i = t.indexOf(gameKey); while (i >= 0) { const a = t[i + gameKey.length]; if (a === undefined || !/[0-9]/.test(a)) return 30; i = t.indexOf(gameKey, i + 1); }
  return 0;
}
/* ---- name "understanding": acronyms, roman↔arabic numerals, and exe-name keys, so abbreviated hub tags (MGSV, RDR2, GTAIV) correlate to games ---- */
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15 };
/** Convert a trailing roman numeral in an already-normalized string to arabic: "mgsv"→"mgs5", "gtaiv"→"gta4". */
// Canonicalise a TRAILING roman numeral to its arabic form so "Final Fantasy VII" and "FF7" compare
// equal. Guard: only do it when at least 3 characters precede the numeral. Without that guard the last
// letter of a short acronym gets eaten - e.g. "REV" (Resident Evil Village) became "RE5", an exact
// collision with Resident Evil 5. Real sequel names always have a longer stem than that.
function numCanon(norm) {
  const s = String(norm || '');
  return s.replace(/(xv|xiv|xiii|xii|xi|ix|viii|vii|vi|iv|iii|ii|i|x|v)$/, (m, _g, off) =>
    (off >= 3 ? String(ROMAN[m] || m) : m));
}
/** Initialism of a game name, keeping roman numerals/numbers: "Metal Gear Solid V"→"MGSV", "Red Dead Redemption 2"→"RDR2". */
function acronym(name) {
  const words = String(name || '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const skip = new Set(['the', 'of', 'a', 'an', 'and', 'de', 'la', 'el']);
  let ac = '';
  for (const w of words) {
    if (/^[ivxlc]+$/i.test(w) && ROMAN[w.toLowerCase()]) ac += w.toUpperCase();
    else if (/^\d+$/.test(w)) ac += w;
    else if (!skip.has(w.toLowerCase())) ac += w[0].toUpperCase();
  }
  return ac;
}
/** All the normalized keys that identify a game: slug, name, folder, exe basename, and acronym. */
function gameFolderFromExePath(exePath) { // the real game folder from the library, not a media/build subfolder
  const parts = String(exePath || '').split(/[\\/]/).filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) { if (/^(common|installed|manifests)$/i.test(parts[i]) && parts[i + 1]) return parts[i + 1]; }
  const bi = parts.findIndex(p => /^binaries$/i.test(p)); if (bi >= 2) return parts[bi - 2];
  const GEN = /^(win64|win32|wingdk|win|bin|binaries|x64|x86|retail|release|shipping|game|games|redist|application|app|media|data|content|contents|runtime|exe|launcher)$/i;
  for (let i = parts.length - 2; i >= 0; i--) { if (!GEN.test(parts[i])) return parts[i]; }
  return parts[parts.length - 2] || '';
}
function gameKeys(game) {
  const set = new Set(); const add = s => { const n = htNorm(s); if (n && n.length >= 2) set.add(n); };
  // a manually-chosen mod pins the catalog name — match on THAT, not the (possibly unrelated) game name
  if (game && game.__htName) { add(game.__htName); add(htSlug(game.__htName)); }
  add(htSlug(game && (game.n || game.folder))); add(game && game.n); add(game && game.folder);
  add(gameFolderFromExePath(game && (game.exePath || ''))); // real game folder (skips media/Win64/etc.)
  const exe = String((game && game.exe) || '').replace(/\.exe$/i, '').replace(/[-_ ]?(win64|win32|wingdk|shipping|final|retail|x64|x86|dx1[012]?|dx9|vulkan)$/gi, '');
  if (exe && exe.length >= 3 && !/^(game|launcher|start|play|bin|app|client|steam)$/i.test(exe)) add(exe);
  const ac = acronym(game && game.n); if (ac.length >= 3) add(ac);
  return [...set].filter(k => k.length >= 3);
}
/** Best match score between a release's text and a game key, both directions + roman↔arabic (so an abbreviated tag that's a prefix of the exe/acronym still matches). */
function bestScore(rawText, normKey) {
  const t = htNorm(rawText);
  const fwd = Math.max(htMatchScore(t, normKey), htMatchScore(numCanon(t), numCanon(normKey)));
  const rev = Math.max(htMatchScore(normKey, t), htMatchScore(numCanon(normKey), numCanon(t)));  // key (exe/acronym) may be longer than an abbreviated tag
  let sc = Math.max(fwd, rev);
  // A short key that merely PREFIXES a longer name is only evidence if it lines up with a real word
  // boundary in that name. "GTAV" + "Enhanced" does ("GTAV Enhanced"); "Tra" + "ilsFC" does not
  // ("TrailsFC"), and that bogus 80 is what mapped Tomb Raider: Anniversary onto Trails FC.
  if (normKey.length <= 4 && sc < 100 && t.length > normKey.length && t.startsWith(normKey)
      && !endsAtWordBoundary(rawText, normKey.length)) sc = 0;
  return sc;
}

/** After consuming `n` alphanumeric characters of `raw`, is that a word boundary (separator or camelCase)? */
function endsAtWordBoundary(raw, n) {
  const str = String(raw || '');
  let seen = 0, i = 0;
  for (; i < str.length && seen < n; i++) if (/[A-Za-z0-9]/.test(str[i])) seen++;
  if (seen < n) return true;                       // key covered the whole string
  if (i >= str.length) return true;                // ended exactly at the end
  if (!/[A-Za-z0-9]/.test(str[i])) return true;    // next char is a separator
  const prev = str[i - 1], next = str[i];
  return /[a-z0-9]/.test(prev) && /[A-Z]/.test(next);   // camelCase transition
}
/** Best-matching game index for a hub tag, using the full understanding (≥60 = confident). */
function suggestGameForTag(tag, games) {
  let best = -1, bestSc = 0;
  (games || []).forEach((g, i) => { const keys = gameKeys(g); let sc = 0; for (const k of keys) sc = Math.max(sc, bestScore(tag, k)); if (sc > bestSc) { bestSc = sc; best = i; } });
  return bestSc >= 60 ? best : -1;
}
/** Every release on a hub repo that belongs to THIS game, as version choices (newest first). */
/**
 * Guarantee every option in a version picker is visually distinct. Authors sometimes ship two
 * archives whose names parse to the same label (e.g. a re-upload with no version bump). Rather than
 * hide one, append the distinguishing part of the filename so the user can still choose.
 */
function disambiguateVersions(list) {
  // Two assets can share a base name and differ only by extension (Mod-v1.2.7z / Mod-v1.2.rar).
  // Without the extension in play their labels collide and the picker looks like it has duplicates.
  {
    const seen = {};
    for (const v of (list || [])) {
      const k = String(v.version || '');
      seen[k] = (seen[k] || 0) + 1;
    }
    for (const v of (list || [])) {
      if (seen[String(v.version || '')] > 1) {
        const ext = String((v.asset && v.asset.name) || '').match(/\.([a-z0-9]+)$/i);
        if (ext) v.version = v.version + ' (' + ext[1].toLowerCase() + ')';
      }
    }
  }
  const byLabel = {};
  for (const v of (list || [])) (byLabel[v.version] = byLabel[v.version] || []).push(v);
  for (const [label, group] of Object.entries(byLabel)) {
    if (group.length < 2) continue;
    for (const v of group) {
      const stem = String((v.asset && v.asset.name) || '').replace(/\.(zip|7z|rar)$/i, '');
      // Keep only the part of the filename that actually DIFFERS between these builds, so the
      // dropdown reads "v2.1 (Steam)" instead of "v2.1 (v2.1-Steam)" or "v2.1 (BatmanArkhamKnight-Ste)".
      // Split on - and _ only ('.' would tear "v2.1" into "v2"+"1"), then drop every part that carries
      // no information: the version itself, bare numbers, and the release tag / game name.
      const verBare = String(label).replace(/^v/i, '').split(/[^\d.]/)[0];
      const tagKey = String(v.tag || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const parts = stem.split(/[-_]/).filter(Boolean).filter(pt => {
        const p = pt.toLowerCase().replace(/^v/, '');
        if (p === verBare || /^\d+(\.\d+)*$/.test(p)) return false;
        const pk = pt.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (pk && tagKey && (tagKey.includes(pk) || pk.includes(tagKey))) return false;
        return true;
      });
      const tail = parts.slice(-2).join('-');
      v.version = tail ? (label + ' (' + tail.slice(0, 22) + ')') : label;
    }
  }
  return list;
}

async function releasesForGame(repo, game) {
  try {
    const keys = gameKeys(game);
    const rels = await getJSON('https://api.github.com/repos/' + repo + '/releases?per_page=100');
    const limited = !!(rels && rels.__status === 403 && /rate limit/i.test(rels.message || ''));
    let releaseList = null; // normalized [{tag,name,prerelease,date,archives:[{name,url,size}]}]
    if (!limited && Array.isArray(rels) && rels.length) {
      releaseList = rels.filter(r => !r.draft).map(r => ({ tag: r.tag_name, name: r.name, prerelease: !!r.prerelease, date: r.published_at || '',
        archives: (r.assets || []).filter(a => /\.(zip|7z|rar)$/i.test(a.name) && !/source|readme|\.md$/i.test(a.name)).map(a => ({ name: a.name, url: a.browser_download_url, size: a.size })) }));
    }
    if (!releaseList || !releaseList.length) {
      // API rate-limited / empty / errored → scrape ALL tags, then check assets of plausible + odd tags
      const tags = await hubAllTags(repo);
      if (!tags.length) return { rateLimited: limited, versions: [] };
      const oddTag = t => /^[a-z]{0,2}\d+$/i.test(t) || t.length <= 2;   // misnamed tags (e.g. "1","s1") — check their asset filename
      const candidateTags = tags.filter(t => { let sc = 0; for (const k of keys) sc = Math.max(sc, bestScore(t, k)); const mapped = BZ_HUB_GAMES[t]; if (mapped) for (const k of keys) sc = Math.max(sc, bestScore(mapped, k)); return sc > 0 || oddTag(t); });
      // Probing tags one at a time was unbounded: with a slow or rate-limited host each probe can
      // burn the full network timeout, so 20+ candidates meant minutes of apparent hang. Cap the
      // list, run a few in parallel, and stop at a hard wall-clock deadline.
      const PROBE_MAX = 12, PROBE_LANES = 4, PROBE_DEADLINE = Date.now() + 20000;
      const probe = (candidateTags.length ? candidateTags : tags.slice(0, 8)).slice(0, PROBE_MAX);
      releaseList = [];
      let next = 0;
      const lane = async () => {
        while (next < probe.length && Date.now() < PROBE_DEADLINE) {
          const tag = probe[next++];
          let assets = []; try { assets = await assetsViaExpanded(repo, tag); } catch (_) {}
          releaseList.push({ tag, name: tag, prerelease: false, date: '',
            archives: assets.filter(a => /\.(zip|7z|rar)$/i.test(a.name) && !/source|readme|\.md$/i.test(a.name)) });
        }
      };
      await Promise.all(Array.from({ length: Math.min(PROBE_LANES, probe.length) }, lane));
    }
    const scored = [];
    for (const r of releaseList) {
      const archives = r.archives;
      if (!archives.length) continue;   // only real uploaded mod archives are installable (never the source zip / README)
      const idText = [r.tag, r.name, BZ_HUB_GAMES[r.tag], ...archives.map(a => a.name.replace(/\.(zip|7z|rar)$/i, ''))].filter(Boolean);
      let score = 0; for (const t of idText) for (const k of keys) score = Math.max(score, bestScore(t, k));
      if (!score) continue;
      // this game's matching archives (a release can ship V1 + V2, or Steam/Epic editions) → one option each
      const matching = archives.filter(a => keys.some(k => bestScore(a.name, k) >= 50) || /head\s*track|6dof|tracking/i.test(a.name));
      const useAssets = matching.length ? matching : [archives[0]];
      for (const asset of useAssets) {
        const av = parseAssetVersion(asset.name);
        scored.push({ score, tag: r.tag || r.name, version: av.label, verNum: av.num, sortNum: av.sortNum, variant: av.variant, combo3d: av.combo3d, kind: av.kind, name: r.name || r.tag, asset, date: r.date || '', prerelease: r.prerelease });
      }
    }
    const strong = scored.some(s => s.score >= 80);
    let out = scored.filter(s => strong ? s.score >= 80 : s.score > 0);
    // dedupe identical asset URLs, then newest version first (V2 before V1), base edition before variant editions
    const seen = new Set(); out = out.filter(s => { const k = (s.asset && s.asset.url) || s.asset.name; if (seen.has(k)) return false; seen.add(k); return true; });
    // sortNum carries the fractional part, so v1.1 correctly sorts above v1 (verNum alone ties them)
    out.sort((a, b) => ((b.sortNum || b.verNum) - (a.sortNum || a.verNum)) || (a.variant ? 1 : 0) - (b.variant ? 1 : 0) || (b.date || '').localeCompare(a.date || ''));
    return { versions: disambiguateVersions(out.map(({ score, ...r }) => r)) };
  } catch (_) { return { versions: [] }; }
}
// Parse a version / edition from a mod asset filename: "...-HeadTracking.V2.zip", "...---V2.zip", "...-.steam.zip"
// BerZerker has started shipping all-in-one builds (e.g. BatmanArkhamKnight-3D-6DOF.zip) carrying BOTH
// the stereoscopic 3D injector AND 6DOF head tracking. Those need NO separate 3D mod. More are coming
// per game, so a game can have a 6DOF-only build and a 3D+6DOF build side by side — the asset name is
// the only reliable tell, so classify on it.
/* An asset that bundles the stereo mod WITH the 6DOF mod, so no separate 3D mod is needed.
 * \b is useless here: '_' is a word character, so \b3d never fired on 'Game_3D-6DOF.zip' - which
 * is exactly how the hub names these files. Use explicit non-alphanumeric boundaries instead, and
 * accept every separator the releases actually use ( + & - _ . space ). */
const COMBO_3D_RE = /(?:^|[^a-z0-9])(?:3d[-_.+& ]*(?:and[-_.+& ]*)?6dof|6dof[-_.+& ]*(?:and[-_.+& ]*)?3d)(?:$|[^a-z0-9])/i;
function parseAssetVersion(name) {
  const base = String(name || '').replace(/\.(zip|7z|rar)$/i, '');
  // Capture the FULL version string. Authors write it several ways in the same hub:
  //   "...HeadTracking.v3"        -> v-prefixed
  //   "...-3D-6DOF.1.1"           -> bare dotted version at the end (no 'v' at all)
  //   "...HeadTracking-v1.2.0"    -> v-prefixed multi-part
  let num = 1, verStr = '';
  const vm = base.match(/[-_.\s]v[.\s]?(\d+(?:\.\d+)*)/i)          // v-prefixed anywhere
          || base.match(/[-_.\s](\d+\.\d+(?:\.\d+)*)\s*$/)          // bare dotted version at the end
          || base.match(/[-_.\s](\d+)\s*$/);                        // bare trailing integer
  if (vm) { verStr = vm[1]; num = parseInt(verStr.split('.')[0], 10) || 1; }
  // sortable numeric: 1.1 -> 1.01, 2 -> 2 (so newer sorts above older within a repo)
  let sortNum = num;
  if (verStr) { const parts = verStr.split('.').map(n => parseInt(n, 10) || 0); sortNum = parts[0] + (parts[1] || 0) / 100 + (parts[2] || 0) / 10000; }
  // Two kinds of qualifier appear in these filenames: which STORE build it targets, and which
  // BUILD VARIANT it is (Smooth, Fast, Alt...). Both must reach the label or two different
  // downloads end up looking identical in the picker.
  const store = (base.match(/\b(steam|epic|gog|game\s*pass|gamepass|xbox|ms\s*store|windows\s*store|remaster(?:ed)?|definitive|goty|complete)\b/i) || [])[1] || '';
  const build = (base.match(/[-_.\s](smooth|fast|slow|alt(?:ernate)?|beta|test|exp(?:erimental)?|legacy|old|new|fix(?:ed)?|hotfix|patched|lite|full)\b/i) || [])[1] || '';
  const variant = [store, build].filter(Boolean).map(x => x.toLowerCase().replace(/\s+/g, '')).join(' · ');
  const combo3d = COMBO_3D_RE.test(base);
  const kind = combo3d ? '3d6dof' : '6dof';
  const label = 'v' + (verStr || num) + (combo3d ? ' · 3D + 6DOF' : '') + (variant ? (' · ' + variant) : '');
  return { num, verStr, sortNum, variant, store, build, label, combo3d, kind };
}

/** One release for the game — the requested version/tag if given, else the newest. */
async function releaseForGame(repo, game, version) {
  // The user picked an exact release in the manual picker, so the tag is authoritative. Re-running
  // the name matcher here was the same mistake the version list made: for hub tags the matcher
  // can't reach from the game name ("Assassin's Creed Unity" -> ACUnity) it found nothing and the
  // install failed with "No auto-download found" even though the version list had just shown it.
  const pinned = game && game.__htTag;
  if (pinned) {
    const v = await versionsForHubTag(repo, pinned);
    if (v.rateLimited) return { rateLimited: true };
    if (!v.versions.length) return { notFound: true };
    const p = version ? (v.versions.find(x => x.version === version || x.tag === version) || v.versions[0]) : v.versions[0];
    return { tag: p.tag, asset: p.asset, version: p.version, variant: p.variant,
             combo3d: !!p.combo3d, kind: p.kind, versions: v.versions };
  }
  const r = await releasesForGame(repo, game);
  if (r.rateLimited) return { rateLimited: true };
  if (!r.versions.length) return { notFound: true };
  const pick = version ? (r.versions.find(v => v.version === version || v.tag === version) || r.versions[0]) : r.versions[0];
  return { tag: pick.tag, asset: pick.asset, version: pick.version, variant: pick.variant, combo3d: !!pick.combo3d, kind: pick.kind, versions: r.versions };
}

/** Prettify a concatenated hub tag for display: "RiseOfTheTombRaider" → "Rise Of The Tomb Raider". */
function prettyTag(t) { return String(t || '').replace(/[-_]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/\s+/g, ' ').trim(); }

/* ===== Audited 6DOF catalogs (labels + offline fallback). Live lists refresh from GitHub. ===== */
const BZ_HUB_GAMES = {
  '1':"Assassin's Creed Origins", s1:"Assassin's Creed Syndicate",
  // Keyed by the release TITLE shown on the hub, which for these is NOT the git tag
  // (ACSyndicate is tagged "s1", ACOrigins is tagged "1"). hubAllReleaseRefs carries both.
  ACUnity:"Assassin's Creed Unity", ACSyndicate:"Assassin's Creed Syndicate",
  ACOrigins:"Assassin's Creed Origins", ACOdyssey:"Assassin's Creed Odyssey",
  ACValhalla:"Assassin's Creed Valhalla", ACBrotherhood:"Assassin's Creed Brotherhood",
  ACRevelations:"Assassin's Creed Revelations", ACBlackFlag:"Assassin's Creed IV: Black Flag",
  ACRogue:"Assassin's Creed Rogue", ACMirage:"Assassin's Creed Mirage", AlanWake2:'Alan Wake 2', AlanWakeRemastered:'Alan Wake Remastered',
  BatmanAA:'Batman: Arkham Asylum', BatmanArkhamCity:'Batman: Arkham City', BatmanArkhamKnight:'Batman: Arkham Knight', BatmanArkhamOrigins:'Batman: Arkham Origins',
  Control:'Control', CrimsonDesert:'Crimson Desert', Crysis3:'Crysis 3', DeadSpaceRemake:'Dead Space (Remake)',
  'DeusEx-HumanRevolution':'Deus Ex: Human Revolution', 'DeusEx-MankindDivided':'Deus Ex: Mankind Divided',
  DragonAge2:'Dragon Age II', DragonAgeInquisition:'Dragon Age: Inquisition', DragonAgeOrigins:'Dragon Age: Origins',
  GTAIVComplete:'GTA IV: Complete Edition', GuardiansOfTheGalaxy:'Marvel\u2019s Guardians of the Galaxy',
  MGSV:'Metal Gear Solid V', MetalGearRising:'Metal Gear Rising: Revengeance', NieRAutomata:'NieR: Automata', NieRReplicant:'NieR Replicant ver.1.22474487139',
  NinoKuni:'Ni no Kuni', Persona4Golden:'Persona 4 Golden', Persona5Royal:'Persona 5 Royal',
  RDR2:'Red Dead Redemption 2', RE5:'Resident Evil 5', RiseOfTheTombRaider:'Rise of the Tomb Raider', ShadowOfTheTombRaider:'Shadow of the Tomb Raider',
  TheWitcher2:'The Witcher 2: Assassins of Kings', TheWitcher3:'The Witcher 3: Wild Hunt', TombRaider2013:'Tomb Raider (2013)',
  Yakuza6:'Yakuza 6: The Song of Life', YakuzaKiwami2:'Yakuza Kiwami 2', YakuzaLikeADragon:'Yakuza: Like a Dragon'
};
// Loop's full catalogue, transcribed from https://github.com/itsloopyo/itsloopyo (the profile README
// is his source of truth). Used as the fallback; loopAllMods() re-reads that README so new games and
// promotions from pre-release appear automatically.
const LOOP_MODS = [
  // released
  { repo:'itsloopyo/black-and-white-headtracking', game:'Black and White', loader:'DLL wrapper' },
  { repo:'itsloopyo/bioshock-remastered-headtracking', game:'BioShock Remastered', loader:'DLL wrapper' },
  { repo:'itsloopyo/dying-light-2-headtracking', game:'Dying Light 2', loader:'DLL wrapper' },
  { repo:'itsloopyo/easy-delivery-co-headtracking', game:'Easy Delivery Co', loader:'BepInEx' },
  { repo:'itsloopyo/eternal-afternoon-headtracking', game:'Eternal Afternoon', loader:'BepInEx' },
  { repo:'itsloopyo/firewatch-headtracking', game:'Firewatch', loader:'BepInEx' },
  { repo:'itsloopyo/gone-home-headtracking', game:'Gone Home', loader:'BepInEx' },
  { repo:'itsloopyo/green-hell-headtracking', game:'Green Hell', loader:'BepInEx' },
  { repo:'itsloopyo/outer-wilds-headtracking', game:'Outer Wilds', loader:'OWML' },
  { repo:'itsloopyo/peak-headtracking', game:'PEAK', loader:'BepInEx' },
  { repo:'itsloopyo/resident-evil-requiem-headtracking', game:'Resident Evil Requiem', loader:'REFramework' },
  { repo:'itsloopyo/obra-dinn-headtracking', game:'Return of the Obra Dinn', loader:'BepInEx' },
  { repo:'itsloopyo/skyrim-special-edition-headtracking', game:'Skyrim Special Edition', loader:'Ultimate ASI Loader' },
  { repo:'itsloopyo/subnautica-headtracking', game:'Subnautica', loader:'BepInEx' },
  { repo:'itsloopyo/subnautica-2-headtracking', game:'Subnautica 2', loader:'DLL wrapper' },
  { repo:'itsloopyo/valheim-headtracking', game:'Valheim', loader:'BepInEx' },
  // pre-release (playable, dev builds on each repo's releases page)
  { repo:'itsloopyo/abzu-headtracking', game:'Abzu', loader:'', pre:true },
  { repo:'itsloopyo/assassins-creed-unity-headtracking', game:"Assassin's Creed Unity", loader:'', pre:true },
  { repo:'itsloopyo/cyberpunk-2077-headtracking', game:'Cyberpunk 2077', loader:'', pre:true },
  { repo:'itsloopyo/fallout-new-vegas-headtracking', game:'Fallout: New Vegas', loader:'', pre:true },
  { repo:'itsloopyo/resident-evil-2-headtracking', game:'Resident Evil 2', loader:'REFramework', pre:true },
  { repo:'itsloopyo/resident-evil-3-headtracking', game:'Resident Evil 3', loader:'REFramework', pre:true },
  { repo:'itsloopyo/resident-evil-4-headtracking', game:'Resident Evil 4', loader:'REFramework', pre:true },
  { repo:'itsloopyo/resident-evil-7-headtracking', game:'Resident Evil 7', loader:'REFramework', pre:true },
  { repo:'itsloopyo/resident-evil-village-headtracking', game:'Resident Evil Village', loader:'REFramework', pre:true },
  { repo:'itsloopyo/sons-of-the-forest-headtracking', game:'Sons of the Forest', loader:'', pre:true },
  { repo:'itsloopyo/the-painscreek-killings-headtracking', game:'The Painscreek Killings', loader:'', pre:true },
  { repo:'itsloopyo/wobbly-life-headtracking', game:'Wobbly Life', loader:'', pre:true },
  { repo:'itsloopyo/yakuza-0-headtracking', game:'Yakuza 0', loader:'', pre:true },
  { repo:'itsloopyo/yapyap-headtracking', game:'YAPYAP', loader:'', pre:true }
];

function loopGameName(n){ return String(n).replace(/-?headtracking$/i,'').replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim()||n; }
// dynamic: list itsloopyo's *-headtracking repos so new games appear automatically; audited list is the fallback
async function loopAllMods() {
  // 1) Loop's profile README lists every mod (released + pre-release) and he updates it per launch.
  try {
    const r = await getText('https://raw.githubusercontent.com/itsloopyo/itsloopyo/main/README.md');
    const md = r && r.text;
    if (md && /headtracking/i.test(md)) {
      const out = []; const seen = new Set();
      let pre = false;
      for (const line of md.split(/\r?\n/)) {
        if (/^#+\s*Pre-?release/i.test(line)) { pre = true; continue; }
        if (/^#+\s*Released/i.test(line)) { pre = false; continue; }
        if (/^#+\s/.test(line) && !/mods/i.test(line)) { /* other section */ }
        const m = line.match(/^\|\s*([^|]+?)\s*\|.*?github\.com\/(itsloopyo\/[a-z0-9._-]*headtracking)/i);
        if (!m) continue;
        const game = m[1].trim(), repo = m[2];
        if (!game || /^game$/i.test(game) || seen.has(repo.toLowerCase())) continue;
        seen.add(repo.toLowerCase());
        const known = LOOP_MODS.find(x => x.repo.toLowerCase() === repo.toLowerCase());
        out.push({ repo, game, loader: known ? known.loader : '', pre, latest: null });
      }
      if (out.length >= LOOP_MODS.length - 4) return out;   // sanity: only trust a plausible parse
    }
  } catch (_) {}
  // 2) the API lists his repos (rate-limited, so only a secondary source)
  try {
    const repos = await getJSON('https://api.github.com/users/itsloopyo/repos?per_page=100&sort=updated');
    if (Array.isArray(repos) && repos.length) {
      const live = repos.filter(r => /headtracking/i.test(r.name || '')).map(r => {
        const known = LOOP_MODS.find(m => m.repo.toLowerCase() === String(r.full_name).toLowerCase());
        return { repo: r.full_name, game: known ? known.game : loopGameName(r.name), loader: known ? known.loader : '', pre: known ? !!known.pre : false, updated: r.updated_at, latest: null };
      });
      if (live.length) return live;
    }
  } catch (_) {}
  // 3) audited fallback
  return LOOP_MODS.map(m => ({ ...m }));
}

// dynamic: BerZerker hub game list (live tags + audited display names)
async function bzHubGames(repo) {
  let refs = []; try { refs = await hubAllReleaseRefs(repo); } catch (_) {}
  if (!refs.length) refs = Object.keys(BZ_HUB_GAMES).map(t => ({ tag: t, name: t }));
  // The friendly name can be keyed off either side: BZ_HUB_GAMES holds release TITLES like
  // "ACUnity", while the tag may be a bare "u1". Try the title first, then the tag, then prettify.
  return refs.map(r => ({
    tag: r.tag,
    name: r.name,
    game: BZ_HUB_GAMES[r.name] || BZ_HUB_GAMES[r.tag] || prettyTag(r.name || r.tag)
  }));
}
/** List EVERY release on the hub (batch), archive assets only — no per-game filtering. */
async function hubAllReleases(repo) {
  const rels = await getJSON('https://api.github.com/repos/' + repo + '/releases?per_page=100');
  const limited = !!(rels && rels.__status === 403 && /rate limit/i.test(rels.message || ''));
  const out = [];
  if (!limited && Array.isArray(rels)) {
    for (const r of rels) {
      if (r.draft) continue;
      const archives = (r.assets || []).filter(a => /\.(zip|7z|rar)$/i.test(a.name) && !/source|readme|\.md$/i.test(a.name));
      if (!archives.length) continue;
      const asset = archives[0];   // no heuristics: the picker lists them all, the user chooses
      out.push({ tag: r.tag_name || r.name, name: r.name || r.tag_name, label: prettyTag(r.tag_name || r.name), asset: { name: asset.name, url: asset.browser_download_url, size: asset.size }, date: r.published_at || '' });
    }
  } else {
    // API unavailable → atom tags + scraped assets (no token needed)
    const tags = await hubAllTags(repo);
    if (!tags.length) return { rateLimited: limited, releases: [] };
    for (const tag of tags) {
      const assets = (await assetsViaExpanded(repo, tag)).filter(a => /\.(zip|7z|rar)$/i.test(a.name) && !/source|readme|\.md$/i.test(a.name));
      if (!assets.length) continue;
      const asset = assets[0];     // no heuristics: the picker lists them all, the user chooses
      out.push({ tag, name: tag, label: prettyTag(tag), asset, date: '' });
    }
  }
  out.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  return { releases: out };
}
/** Download every hub release into a pooled cache (track_bz#<tag>), for later manual assignment. */
async function hubDownloadAll(repo, onProgress) {
  const list = await hubAllReleases(repo);
  if (list.rateLimited) return { rateLimited: true, mods: [] };
  const mods = [];
  for (let i = 0; i < list.releases.length; i++) {
    const rel = list.releases[i]; const cacheId = 'track_bz#' + rel.tag;
    const dir = coreDir(cacheId, rel.tag); const stamp = path.join(dir, '.ok');
    if (fs.existsSync(stamp)) { mods.push({ tag: rel.tag, label: rel.label, asset: rel.asset.name, dir, cached: true }); continue; }
    if (!/\.(zip|7z|rar)$/i.test(rel.asset.name)) { mods.push({ tag: rel.tag, label: rel.label, asset: rel.asset.name, cached: false, error: 'not an extractable archive — get it from the releases page' }); continue; }
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(os.tmpdir(), 'st-hub-' + Date.now() + '-' + i + '.zip');
    try {
      onProgress && onProgress({ label: rel.label + ' (' + (i + 1) + '/' + list.releases.length + ')', phase: 'download', pct: 0 });
      await downloadWithMirrors(rel.asset.url, tmp, onProgress, rel.label + ' — ' + rel.asset.name);
      onProgress && onProgress({ label: rel.label, phase: 'extract' });
      await extractArchive(tmp, dir); fs.writeFileSync(stamp, new Date().toISOString()); try { fs.unlinkSync(tmp); } catch (_) {}
      mods.push({ tag: rel.tag, label: rel.label, asset: rel.asset.name, dir, cached: true });
    } catch (e) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} mods.push({ tag: rel.tag, label: rel.label, asset: rel.asset.name, cached: false, error: String(e.message || e) }); }
  }
  return { mods };
}
/** The pooled (batch-downloaded) hub mods currently on disk. */
function hubPooled() {
  return coreList().filter(c => String(c.id).startsWith('track_bz#')).map(c => ({ tag: c.tag, label: prettyTag(c.tag), dir: c.path, bytes: c.bytes })).sort((a, b) => a.label.localeCompare(b.label));
}
/** Install a pooled hub release (by tag) into a specific game — the manual "which mod → which game" assignment. */
function hubInstallInto(game, tag) {
  if (!game || !game.dir) throw new Error('That game has no folder on disk.');
  const cacheId = 'track_bz#' + tag;
  const c = coreList().find(x => x.id === cacheId);
  if (!c) throw new Error('That 6DOF mod is not downloaded yet — run "Download all 6DOF mods" first.');
  const mod = MODS.track_bz; const base = gameBase(game);
  const m = readManifest(game);
  const files = claimFiles(m, 'track_bz', placeInto({ dir: c.path, tag }, game, mod), null);
  m.mods['track_bz'] = { tag, files, when: new Date().toISOString(), assignedFrom: tag };
  writeManifest(game, m);
  const guidance = [];
  if (typeof mod.loader === 'function') { const lid = mod.loader(game.eng); const lm = MODS[lid]; if (lm && lm.guide) { const s = CORE_BY_ID[lid]; guidance.push({ name: lm.name, url: lm.site || (s && s.url), note: lm.note }); } }
  return { ok: true, tag, files: files.length, base, guidance };
}

function coreDir(id, tag) { return path.join(coreRoot(), id + '@' + (tag || 'manual')); }
function dirSize(d) { let n = 0; try { for (const e of fs.readdirSync(d)) { const p = path.join(d, e); const s = fs.statSync(p); n += s.isDirectory() ? dirSize(p) : s.size; } } catch (_) {} return n; }
function coreList() {
  const out = []; let entries = []; try { entries = fs.readdirSync(coreRoot()); } catch (_) {}
  for (const e of entries) {
    const full = path.join(coreRoot(), e);
    try { if (!fs.statSync(full).isDirectory()) continue; } catch { continue; }
    const at = e.lastIndexOf('@'); if (at < 0) continue;
    // only count a core as cached if the completion stamp exists AND real files were extracted
    if (!fs.existsSync(path.join(full, '.ok'))) continue;
    if (fs.existsSync(path.join(full, '.launch'))) continue;   // installer kept for manual launch, not a usable core
    let real = 0; try { real = fs.readdirSync(full).filter(f => f !== '.ok' && f !== '.launch').length; } catch (_) {}
    if (!real) continue;
    out.push({ id: e.slice(0, at), tag: e.slice(at + 1), bytes: dirSize(full), path: full });
  }
  return out;
}
function effectiveRoot(dir) {
  let entries = []; try { entries = fs.readdirSync(dir).filter(e => e !== '.ok'); } catch { return dir; }
  if (entries.length === 1) {
    const name = entries[0]; const p = path.join(dir, name);
    // a lone wrapper folder from a github zip (e.g. "repo-main") — unwrap it,
    // but NOT a meaningful game-structure folder that must be preserved.
    if (!/^(BepInEx|Mods|MelonLoader|plugins|Binaries|bin|x64|Win64|reshade-shaders|UserData)$/i.test(name)) {
      try { if (fs.statSync(p).isDirectory()) return p; } catch (_) {}
    }
  }
  return dir;
}

/* ---------------- the core download ---------------- */
async function ensureCore(id, game, onProgress, opts) {
  opts = opts || {};
  /* The user picked an exact build in the manual picker and its download URL travelled with it.
   * That is authoritative - fetch THAT file. Previously only a display label was passed
   * ("v0.1.2 (zip) (BlackAndWhiteHeadTrack)"), which matched no release, so the resolver fell
   * through to matching the GAME name and reported "No auto-download found for RDR". */
  if (game && game.__htAssetUrl && (id === 'track_bz' || id === 'track_loop')) {
    const url = game.__htAssetUrl, name = game.__htAssetName || 'mod.zip';
    const tag = game.__htTag || 'picked';
    const dir = path.join(coreRoot(), id + '@' + String(tag).replace(/[^A-Za-z0-9._-]/g, '_'));
    const stamp = path.join(dir, '.ok');
    if (fs.existsSync(stamp)) { log.app.info('core cache hit (pinned asset) ' + id, { tag, name }); return { dir, tag, cached: true }; }
    log.app.info('core pinned asset ' + id, { tag, name, url });
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(os.tmpdir(), 'st-' + id + '-' + Date.now() + (path.extname(name) || '.zip'));
    await downloadWithMirrors(url, tmp, onProgress, name);
    await extractArchive(tmp, dir);
    fs.writeFileSync(stamp, new Date().toISOString());
    try { fs.unlinkSync(tmp); } catch (_) {}
    log.app.info('core pinned asset ready ' + id, { tag, dir });
    return { dir, tag, cached: false };
  }
  log.app.info('core resolve ' + id, { game: (game && (game.n || game.folder)) || null,
    api: (game && game.api) || [], bit: game && game.bit, output: opts && opts.output, version: opts && opts.version });
  const src = sourceFor(id, game);
  if (!src) throw new Error('unknown core ' + id);
  // Manual core: if the user dropped files into manual-core/<id>/, use those instead of downloading.
  // (checked first, so an official HelixMod geo-11 build dropped in here installs like any other mod)
  const mc = manualCoreFor(id);
  if (mc) { if (onProgress) onProgress({ phase: 'manual', pct: 100 }); return { dir: mc, tag: 'manual', cached: true, manual: true }; }

  if (src.strategy === 'website') return { website: true, url: src.url, note: src.note };

  if (src.strategy === 'bundled') {
    // ships inside the app — no download; find the bundled folder wherever this build placed it
    const cand = [
      path.join(__dirname, '..', src.dir),
      process.resourcesPath ? path.join(process.resourcesPath, src.dir) : null,
      process.resourcesPath ? path.join(process.resourcesPath, 'app', src.dir) : null,
      process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', src.dir) : null,
    ].filter(Boolean);
    const dir = cand.find(d => { try { return fs.existsSync(d) && fs.readdirSync(d).length; } catch (_) { return false; } });
    if (!dir) throw new Error('Bundled files for ' + id + ' are missing from this build (looked in: ' + cand.join(' , ') + ').');
    return { dir, tag: 'bundled', cached: true, bundled: true };
  }

  if (src.strategy === 'url') {
    const tag = src.version || 'file';
    const dir = coreDir(id, tag); const stamp = path.join(dir, '.ok');
    const file = path.join(dir, src.filename || path.basename(src.url));
    if (fs.existsSync(stamp) && fs.existsSync(file)) return { dir, tag, file, launch: !!src.launch, cached: true };
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    onProgress && onProgress({ label: src.name, pct: 0, phase: 'download' });
    await downloadWithMirrors(src.url, file, onProgress, src.name);
    fs.writeFileSync(stamp, new Date().toISOString());
    return { dir, tag, file, launch: !!src.launch, cached: false };
  }

  // archive-url: a fixed download link to a .zip/.7z (e.g. the official geo-11 build on the HelixMod S3 bucket)
  if (src.strategy === 'archive-url') {
    // geo-11 (official) has no release API - discover the newest archive on the HelixMod/S3 host so a
    // new upstream build is picked up automatically instead of staying pinned to a baked-in version.
    let url = src.url, tag = src.version || 'latest';
    if (id === 'geo11') {
      try {
        const latest = await geo11LatestHelix();
        if (latest && latest.url) { url = latest.url; tag = 'v' + String(latest.version).replace(/^v/, ''); }
      } catch (_) {}
    }
    if (id === 'reshade') {
      try {
        const latest = await reshadeLatest();
        if (latest && latest.url) { url = latest.url; tag = String(latest.version); }
      } catch (_) {}
    }
    const dir = coreDir(id, tag); const stamp = path.join(dir, '.ok');
    if (fs.existsSync(stamp)) return { dir, tag, cached: true };
    const existing = coreList().find(c => c.id === id);
    const tmp = path.join(os.tmpdir(), 'st-' + id + '-' + Date.now() + path.extname(url || '.7z'));
    onProgress && onProgress({ label: src.name + ' ' + tag, pct: 0, phase: 'download' });
    try { await downloadWithMirrors(url, tmp, onProgress, src.name + ' ' + tag); }
    catch (e) {
      if (existing) return (log.app.info('core cache hit (offline) ' + id, { tag: existing.tag, dir: existing.path }), { dir: existing.path, tag: existing.tag, cached: true, offline: true });
      // geo-11: the official HelixMod/S3 host is the default. If it can't be reached, fall back to the
      // GitHub mirror automatically (the secondary source) so a one-click install still succeeds.
      if (id === 'geo11' && !opts.__noMirror) {
        try {
          onProgress && onProgress({ label: 'geo-11 \u2014 official host unreachable, trying GitHub mirror', phase: 'download', pct: 0 });
          const mir = await ensureCore('geo11_github', game, onProgress, Object.assign({}, opts, { __noMirror: true }));
          if (mir && mir.dir) return Object.assign({}, mir, { viaMirror: true });
        } catch (_) {}
      }
      throw new Error('Could not download ' + src.name + ' from ' + src.url + ' — ' + (e.message || e) + '. You can also grab it from the HelixMod blog and drop it into this mod\u2019s Manual core folder.');
    }
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    onProgress && onProgress({ label: src.name, phase: 'extract' });
    try { await extractArchive(tmp, dir); }
    catch (e) {
      // Couldn't unpack (e.g. the installer format changed) — keep the file so the user can still run
      // it by hand. Deliberately do NOT write the .ok stamp: nothing usable was extracted, so this is
      // not a complete core. Stamping it made the Core Library report ReShade as "cached / CURRENT"
      // with no download button, even though the payload had never been unpacked.
      if (src.fallbackLaunch) {
        const kept = path.join(dir, src.filename || path.basename(url));
        try { fs.copyFileSync(tmp, kept); } catch (_) {}
        try { fs.unlinkSync(tmp); } catch (_) {}
        try { fs.writeFileSync(path.join(dir, '.launch'), new Date().toISOString()); } catch (_) {}
        return { dir, tag, cached: false, complete: false, file: kept, launch: true, extractFailed: String(e.message || e) };
      }
      try { fs.unlinkSync(tmp); } catch (_) {} throw e;
    }
    fs.writeFileSync(stamp, new Date().toISOString()); try { fs.unlinkSync(tmp); } catch (_) {}
    return { dir, tag, cached: false };
  }

  if (src.strategy === 'github-repo') {
    const tag = src.branch || 'main'; const dir = coreDir(id, tag); const stamp = path.join(dir, '.ok');
    if (fs.existsSync(stamp)) return { dir, tag, cached: true };
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(os.tmpdir(), 'st-' + id + '-' + Date.now() + '.zip');
    onProgress && onProgress({ label: src.name + ' (' + tag + ')', pct: 0, phase: 'download' });
    const branches = [tag, tag === 'main' ? 'master' : 'main'];   // tolerate either default branch
    let got = false, lastErr = null;
    for (const br of branches) {
      try { await download('https://codeload.github.com/' + src.repo + '/zip/refs/heads/' + br, tmp, onProgress, src.name + ' (' + src.repo + '@' + br + ')'); got = true; break; }
      catch (e) { lastErr = e; }
    }
    if (!got) { const existing = coreList().find(c => c.id === id); if (existing) return (log.app.info('core cache hit (offline) ' + id, { tag: existing.tag, dir: existing.path }), { dir: existing.path, tag: existing.tag, cached: true, offline: true }); throw lastErr || new Error('download failed'); }
    onProgress && onProgress({ label: src.name, phase: 'extract' });
    await extractArchive(tmp, dir); fs.writeFileSync(stamp, new Date().toISOString()); try { fs.unlinkSync(tmp); } catch (_) {}
    // remember which commit this snapshot came from, so a moved branch shows up as an update
    try { const t = await getText('https://github.com/' + src.repo + '/commits/' + tag + '.atom');
      const mm = (t.text || '').match(/\/commit\/([0-9a-f]{7,40})/i);
      if (mm) fs.writeFileSync(path.join(dir, '.sha'), mm[1].slice(0, 7)); } catch (_) {}
    return { dir, tag, cached: false };
  }

  // release-hub: one repo, a separate release per game — match this game, then download its asset
  if (src.strategy === 'release-hub') {
    const rel = await releaseForGame(src.repo, game, opts.version);
    const verKey = rel && rel.version ? '@' + String(rel.version).replace(/[^a-z0-9]/gi, '') : '';
    const cacheId = id + ':' + htSlug(game ? (game.n || game.folder) : '') + verKey;
    const existing = coreList().find(c => c.id === cacheId);
    if (!rel || rel.rateLimited || rel.notFound || !rel.asset) {
      if (existing) return (log.app.info('core cache hit (offline) ' + id, { tag: existing.tag, dir: existing.path }), { dir: existing.path, tag: existing.tag, cached: true, offline: true });
      if (rel && rel.rateLimited) throw new Error('GitHub API rate limit hit. Add a token in Settings (or set GITHUB_TOKEN).');
      throw new Error('No release for ' + (game && game.n) + ' in ' + src.repo);
    }
    const dir = coreDir(cacheId, rel.tag || 'rel'); const stamp = path.join(dir, '.ok');
    if (fs.existsSync(stamp)) return { dir, tag: rel.tag, cached: true, combo3d: !!rel.combo3d, assetName: rel.asset.name };
    if (!/\.(zip|7z|rar)$/i.test(rel.asset.name)) { if (existing) return (log.app.info('core cache hit (offline) ' + id, { tag: existing.tag, dir: existing.path }), { dir: existing.path, tag: existing.tag, cached: true, offline: true }); throw new Error('Release asset ' + rel.asset.name + ' is not an extractable archive; get it from ' + src.repo + '/releases.'); }
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(os.tmpdir(), 'st-' + id + '-' + Date.now() + (path.extname(rel.asset.name) || '.zip'));
    onProgress && onProgress({ label: src.name + ' — ' + (game && game.n), pct: 0, phase: 'download' });
    try {
      await downloadWithMirrors(rel.asset.url, tmp, onProgress, src.name + ' ' + (rel.tag || '') + ' — ' + rel.asset.name);
      onProgress && onProgress({ label: src.name, phase: 'extract' });
      await extractArchive(tmp, dir); fs.writeFileSync(stamp, new Date().toISOString()); try { fs.unlinkSync(tmp); } catch (_) {}
      return { dir, tag: rel.tag, cached: false, combo3d: !!rel.combo3d, assetName: rel.asset.name };
    } catch (e) {
      try { fs.rmSync(dir, { recursive: true, force: true }); fs.unlinkSync(tmp); } catch (_) {}
      if (existing) return (log.app.info('core cache hit (offline) ' + id, { tag: existing.tag, dir: existing.path }), { dir: existing.path, tag: existing.tag, cached: true, offline: true });
      throw e;
    }
  }

  // github-release
  // If this source ships a bundled fallback (e.g. the VR-Export addons + geod3d9.dll), prefer a cached
  // copy but fall back to the bundle whenever GitHub is unreachable, so the addon always installs.
  const bundledFb = () => {
    if (!src.bundledFallback) return null;
    const cand = [ path.join(__dirname, '..', src.bundledFallback),
      process.resourcesPath ? path.join(process.resourcesPath, src.bundledFallback) : null,
      process.resourcesPath ? path.join(process.resourcesPath, 'app', src.bundledFallback) : null,
      process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', src.bundledFallback) : null,
    ].filter(Boolean);
    const d = cand.find(x => { try { return fs.existsSync(x) && fs.readdirSync(x).length; } catch (_) { return false; } });
    return d ? { dir: d, tag: 'bundled', cached: true, bundled: true } : null;
  };
  const rel = await latestRelease(id, game);
  // wiz3D and 3DVision4All ship different assets per bitness, so cache per-bitness to avoid reusing the
  // wrong-architecture build for a differently-bitted game.
  const bitScoped = (id === 'v4a' || id === 'wiz3d') && game ? (':' + (game.bit === 'x64' ? 'x64' : 'x86')) : '';
  const cacheId = (MODS[id] && MODS[id].perGame && game) ? id + ':' + htSlug(game.n || game.folder || '') : (id + bitScoped);
  const existing = coreList().find(c => c.id === cacheId);
  if (!rel || rel.rateLimited || rel.notFound || !rel.assets.length) {
    if (existing) return (log.app.info('core cache hit (offline) ' + id, { tag: existing.tag, dir: existing.path }), { dir: existing.path, tag: existing.tag, cached: true, offline: true }); // use what we have
    const fb = bundledFb(); if (fb) return fb;                                                   // ship-with-app fallback
    if (rel && rel.rateLimited) throw new Error('GitHub API rate limit hit. Add a token in Settings (or set GITHUB_TOKEN).');
    throw new Error('No GitHub release asset for ' + src.name + ' (' + src.repo + ')');
  }
  const dir = coreDir(cacheId, rel.tag); const stamp = path.join(dir, '.ok');
  if (fs.existsSync(stamp)) return { dir, tag: rel.tag, cached: true };
  const am = ASSET_MATCH[id] || src.asset;
  const matcher = (typeof am === 'function') ? am(game ? game.api : ['DX11'], game ? game.bit : 'x64', opts.output) : (am || /\.zip$/i);
  const zips = rel.assets.filter(a => /\.zip$/i.test(a.name));
  const asset = zips.find(a => /-nexus\.zip$/i.test(a.name))          // clean mod-files-only archive
             || zips.find(a => matcher.test(a.name))                   // whatever the mod declares
             || zips.find(a => /-installer\.zip$/i.test(a.name))       // pre-release mods ship only this
             || zips[0] || rel.assets[0];
  const KIND = (String(asset.name).match(/\.(zip|7z|rar)$/i) || [])[1];
  const HAVE = { zip: !!AdmZip, '7z': !!SevenZip, rar: !!UnRar };
  if (!KIND || !HAVE[String(KIND).toLowerCase()]) {
    if (existing) return (log.app.info('core cache hit (offline) ' + id, { tag: existing.tag, dir: existing.path }), { dir: existing.path, tag: existing.tag, cached: true, offline: true });
    const e = new Error(KIND
      ? ('This build ships as .' + KIND + ' and that extractor is unavailable in this build. Download it from ' + asset.url)
      : ('Release asset ' + asset.name + ' is not an archive the app can extract. Get it from ' + asset.url));
    e.manualArchive = true; e.url = asset.url; e.assetName = asset.name;
    throw e;
  }
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(os.tmpdir(), 'st-' + id + '-' + Date.now() + '.' + String(KIND).toLowerCase());
  onProgress && onProgress({ label: src.name + ' ' + rel.tag, pct: 0, phase: 'download' });
  try {
    await downloadWithMirrors(asset.url, tmp, onProgress, src.name + ' ' + rel.tag + ' — ' + asset.name);
    onProgress && onProgress({ label: src.name, phase: 'extract' });
    await extractArchive(tmp, dir); fs.writeFileSync(stamp, new Date().toISOString()); try { fs.unlinkSync(tmp); } catch (_) {}
    return { dir, tag: rel.tag, cached: false };
  } catch (e) {
    try { fs.rmSync(dir, { recursive: true, force: true }); fs.unlinkSync(tmp); } catch (_) {}
    if (existing) return (log.app.info('core cache hit (offline) ' + id, { tag: existing.tag, dir: existing.path }), { dir: existing.path, tag: existing.tag, cached: true, offline: true }); // download blocked but we have a copy
    const fb = bundledFb(); if (fb) return fb;                                                   // ship-with-app fallback
    throw e;
  }
}

async function updateCore(id, game, onProgress) { for (const c of coreList()) if (c.id === id) fs.rmSync(c.path, { recursive: true, force: true }); return ensureCore(id, game, onProgress); }

async function coreFetchAll(onProgress) {
  const results = [];
  for (const src of CORE_SOURCES) {
    if (src.strategy === 'website') { results.push({ id: src.id, name: src.name, website: true, url: src.url }); continue; }
    try { const r = await ensureCore(src.id, null, onProgress); results.push({ id: src.id, name: src.name, ok: true, tag: r.tag, cached: r.cached }); }
    catch (e) { results.push({ id: src.id, name: src.name, ok: false, error: String(e.message || e) }); }
  }
  return results;
}
function coreSources() {
  const cached = {}; for (const c of coreList()) cached[c.id] = c;
  return CORE_SOURCES.map(s => {
    // per-game hubs (release-hub) are downloaded per title under "<id>:<slug>@tag" — a bare "<id>@tag" is stale, so never report it as a shared cache
    const perGame = s.strategy === 'release-hub' || !!s.headTracking;
    const hit = perGame ? null : cached[s.id];
    const mDir = manualCoreDir(s.id); const mHas = hasManualFiles(mDir); const mAvail = s.strategy !== 'bundled' && s.strategy !== 'website';
    return { id: s.id, name: s.name, desc: s.desc || '', strategy: s.strategy, repo: s.repo, url: s.url, site: s.site, official: s.official || null, note: s.note, branch: s.branch, version: s.version, launch: !!s.launch, headTracking: !!s.headTracking, bundled: s.strategy === 'bundled', perGame, manualAvailable: mAvail, manualDir: mAvail ? mDir : null, manualHasFiles: mHas, cachedTag: hit ? hit.tag : null, bytes: hit ? hit.bytes : 0, path: hit ? hit.path : null,
      cachedAt: hit ? (() => { try { return fs.statSync(path.join(hit.path, '.ok')).mtime.toISOString(); } catch (_) { return null; } })() : null,
      branchTracking: s.strategy === 'github-repo' };
  });
}

/** Folder for a cached core id (or the core root if not cached yet). */
function coreFolder(id) { for (const c of coreList()) if (c.id === id) return c.path; return coreRoot(); }

/* wiz3D ships different config names per build: wiz3D_Config.xml (dx7/8/9/10-11/opengl),
   HD3D_Config.xml (AMD HD3D builds) and 3DVision_Config.xml (3D Vision Direct builds). */
const WIZ_CFG_RE = /^(wiz3D|HD3D|3DVision)_Config\.xml$/i;
function wizConfigIn(dir) {
  try { const f = fs.readdirSync(dir).find(n => WIZ_CFG_RE.test(n)); return f ? path.join(dir, f) : null; } catch (_) { return null; }
}
/* Find the release subfolder matching a game's API + bitness (the folder holding wiz3D_Config.xml). */
function wizFindFolder(root, apiFolder, bit, opts) {
  opts = opts || {};
  // The release also ships variant trees (3d-vision-direct/<dx9|dx10|dx11>/<bit>, hd3d/<bit>) whose
  // paths ALSO end in ".../dx9/x86". Only match the variant the game actually asked for, otherwise a
  // plain DX9 game would get the 3D Vision Direct build (which needs 3D Vision hw + a different config).
  const wantTdv = !!opts.tdv && apiFolder !== 'hd3d';
  let wants = [apiFolder + '/' + bit, apiFolder];              // dx8/dx7 have no bitness split
  if (wantTdv) {
    const a = String(apiFolder).toLowerCase();
    const tdvApi = a === 'dx10-11' ? ['dx11', 'dx10'] : [a];
    wants = tdvApi.map(x => '3d-vision-direct/' + x + '/' + bit);
  }
  let best = null;
  (function walk(d) {
    let entries = []; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    const hasCfg = entries.some(e => e.isFile() && WIZ_CFG_RE.test(e.name));
    if (hasCfg) {
      const rel = path.relative(root, d).replace(/\\/g, '/').toLowerCase();
      const is3dv = /(^|\/)3d-vision-direct(\/|$)/.test(rel);
      const isHd  = /(^|\/)hd3d(\/|$)/.test(rel);
      const variantOk = wantTdv ? is3dv : (apiFolder === 'hd3d' ? isHd : (!is3dv && !isHd));
      if (variantOk) for (let i = 0; i < wants.length; i++) { if (rel.endsWith(wants[i].toLowerCase())) { if (best === null || i < best.rank) best = { dir: d, rank: i }; } }
    }
    for (const e of entries) if (e.isDirectory()) walk(path.join(d, e.name));
  })(root);
  return best ? best.dir : null;
}

/* Set the wiz3D output method (writes OutputMethodDll into wiz3D_Config.xml, with a .bak). */
function wizSetOutput(game, mode) {
  const base = gameBase(game);
  const cfg = wizConfigIn(base);
  if (!cfg) return { ok: false, error: 'wiz3D config (wiz3D_Config.xml / HD3D_Config.xml / 3DVision_Config.xml) not found — install wiz3D first.' };
  const dll = (WIZ_OUTPUTS[mode] && WIZ_OUTPUTS[mode].dll) || (Object.values(WIZ_OUTPUTS).find(o => o.dll === mode) ? mode : 'InterlacedOutput');
  let xml = fs.readFileSync(cfg, 'utf8');
  try { fs.writeFileSync(cfg + '.bak', xml); } catch (_) {}
  if (/<OutputMethodDll\s+Value="[^"]*"\s*\/>/i.test(xml)) xml = xml.replace(/<OutputMethodDll\s+Value="[^"]*"\s*\/>/i, '<OutputMethodDll Value="' + dll + '"/>');
  else xml = xml.replace(/(<GlobalSettings>)/i, '$1\n\t\t<OutputMethodDll Value="' + dll + '"/>');
  fs.writeFileSync(cfg, xml);
  return { ok: true, dll, mode };
}
/* wiz3D full config — separation (StereoBase), convergence (One_div_ZPS), swap-eyes, scale, frustum, OSD, laser, auto-focus, black border. */
const WIZ_PRESET_TAGS = new Set(['StereoBase', 'One_div_ZPS', 'AutoFocusEnable']); // these live inside each <Preset> (x3) — patch all
function wizSetConfig(game, settings) {
  const base = gameBase(game);
  const cfg = wizConfigIn(base);
  if (!cfg) return { ok: false, error: 'wiz3D config (wiz3D_Config.xml / HD3D_Config.xml / 3DVision_Config.xml) not found — install wiz3D first.' };
  let xml = fs.readFileSync(cfg, 'utf8');
  try { fs.writeFileSync(cfg + '.bak', xml); } catch (_) {}
  const changed = [];
  for (const [tag, val] of Object.entries(settings || {})) {
    if (!/^[A-Za-z_]+$/.test(tag)) continue;
    const all = WIZ_PRESET_TAGS.has(tag);
    const re = new RegExp('(<' + tag + '\\s+Value=")[^"]*("\\s*/>)', all ? 'gi' : 'i');
    if (re.test(xml)) { xml = xml.replace(re, '$1' + String(val) + '$2'); changed.push(tag); }
  }
  fs.writeFileSync(cfg, xml);
  return { ok: true, changed };
}
function wizGetConfig(game) {
  const base = gameBase(game);
  const cfg = wizConfigIn(base) || path.join(base, 'wiz3D_Config.xml');
  if (!fs.existsSync(cfg)) return { exists: false, values: {} };
  const xml = fs.readFileSync(cfg, 'utf8');
  const tags = ['StereoBase', 'One_div_ZPS', 'AutoFocusEnable', 'SwapEyes', 'SeparationScale', 'ScaleSeparationForSmallViewPorts', 'EnableStereo', 'ShowFPS', 'ShowOSD', 'LaserSightEnable', 'FrustumAdjustMode', 'SeparationMode', 'BlackAreaWidth', 'ForceVSyncOff', 'ShutterMode', 'ScreenshotType', 'Max_ABS_rZPS', 'OutputMode', 'OutputMethodDll', 'ShowWizardAtStartup', 'LockCursor'];
  const values = {};
  for (const t of tags) { const m = xml.match(new RegExp('<' + t + '\\s+Value="([^"]*)"', 'i')); if (m) values[t] = m[1]; }
  return { exists: true, values };
}

/** Locate a game's head-tracking config and identify the game/engine/loader it belongs to. */
function htConfigPath(game) {
  const bases = gameBases(game); const base = bases[0] || '';
  if (!base) return { path: null, exists: false };
  const sl = htSlug(game.n || game.folder || '');

  /* AUTHORITATIVE FIRST: whatever this app actually placed for the head-tracking mod. The name
   * heuristics below can only find configs called *headtracking / *6dof / *cameraunlock, so a hub
   * release that ships its config as plain "ht.cfg" or "settings.ini" was invisible and its editor
   * opened empty. The manifest records the exact file list, so there is nothing to guess. */
  try {
    const man = readManifest(game);
    for (const id of ['track_bz', 'track_loop']) {
      const rec = (man.mods || {})[id]; if (!rec) continue;
      const cfgs = (rec.files || [])
        .filter(f => /\.(ini|cfg|txt|json|xml)$/i.test(f) && !/readme|licen[sc]e|changelog|credits/i.test(f));
      if (!cfgs.length) continue;
      // a head-tracking-looking name wins; otherwise take the first config the mod shipped
      const pick = cfgs.find(f => /(head[\s_-]?tracking|6dof|camera[\s_-]?unlock)/i.test(f)) || cfgs[0];
      for (const b of bases) {
        const p = path.join(b, String(pick).replace(/[\\/]/g, path.sep));
        try { if (fs.existsSync(p)) return { path: p, exists: true, game: game.n, engine: game.eng,
          loader: /BepInEx/i.test(pick) ? 'BepInEx' : (/UserData|Mods\//i.test(pick) ? 'MelonLoader' : 'ASI'),
          file: path.basename(p), source: 'manifest', mod: id,
          all: cfgs.map(f => path.join(b, String(f).replace(/[\\/]/g, path.sep))).filter(x => { try { return fs.existsSync(x); } catch (_) { return false; } }) }; } catch (_) {}
      }
    }
  } catch (_) {}
  const found = [];
  const nameRe = /(head[\s_-]?tracking|6dof|cameraunlock|camera[\s_-]?unlock)\.(ini|cfg|txt)$/i;
  const scan = (dir, loader, depth) => {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth > 0 && /^(BepInEx|config|UserData|Mods|plugins|scripts|HeadTracking|6dof|CameraUnlock|data)$/i.test(e.name)) scan(p, loader, depth - 1); }
      else if (nameRe.test(e.name)) found.push({ p, loader });
    }
  };
  for (const b of bases) {
    // Combined 3D+6DOF hub builds ship "3D-6DOF config.ini" (note the space) beside a version.dll
    // proxy, not HeadTracking.ini beside an .asi — look for both spellings.
    for (const name of ['HeadTracking.ini', 'headtracking.ini', 'HeadTracking.cfg', 'head-tracking.ini', 'HeadTracking.txt', 'CameraUnlock.ini', '6DOF.ini', '6dof.ini',
                        '3D-6DOF config.ini', '3D-6DOF Config.ini', '3D-6DOF.ini', '3d-6dof config.ini']) { const p = path.join(b, name); try { if (fs.existsSync(p)) found.push({ p, loader: 'ASI' }); } catch (_) {} }
    // and anything matching the pattern, so a renamed variant still resolves
    try {
      for (const f of fs.readdirSync(b))
        if (/^3d[\s._-]*6dof.*\.ini$/i.test(f)) { const p = path.join(b, f); if (!found.some(x => x.p === p)) found.push({ p, loader: 'proxy' }); }
    } catch (_) {}
    const bep = path.join(b, 'BepInEx', 'config'); try { if (fs.existsSync(bep)) for (const f of fs.readdirSync(bep)) if (/(headtracking|cameraunlock|6dof).*\.(cfg|ini)$/i.test(f)) found.push({ p: path.join(bep, f), loader: 'BepInEx' }); } catch (_) {}
    const ud = path.join(b, 'UserData'); try { if (fs.existsSync(ud)) for (const f of fs.readdirSync(ud)) if (/headtrack.*\.(cfg|ini)$/i.test(f)) found.push({ p: path.join(ud, f), loader: 'MelonLoader' }); } catch (_) {}
    scan(b, 'ASI', 2);
  }
  const uniq = []; const seen = new Set(); for (const h of found) { const k = h.p.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(h); } }
  const hit = uniq[0];
  if (hit) return { path: hit.p, exists: true, game: game.n, engine: game.eng, loader: hit.loader, file: path.basename(hit.p), all: uniq.map(u => u.p) };
  const def = game.eng === 'Unity' ? path.join(base, 'BepInEx', 'config', `com.cameraunlock.${sl}.headtracking.cfg`) : path.join(base, 'HeadTracking.ini');
  return { path: def, exists: false, game: game.n, engine: game.eng, loader: game.eng === 'Unity' ? 'BepInEx' : 'ASI', file: path.basename(def) };
}

/** Check head-tracking sources for updates vs cache: itsloopyo + BerZerker hub, per installed game. */
async function checkHeadTracking(games) {
  const cached = {}; for (const c of coreList()) cached[c.id] = c.tag;
  const rows = [];
  let hubTags = null; // load the hub's release tags once (atom feed)
  for (const g of (games || [])) {
    const inst = (g.inst || g.found || []);
    if (inst.includes('track_loop')) {
      const repo = (MODS.track_loop && MODS.track_loop.repo) ? MODS.track_loop.repo(g.n) : ('itsloopyo/' + htSlug(g.n) + '-headtracking');
      const tag = await latestTagAtom(repo); const id = 'track_loop:' + htSlug(g.n);
      if (tag) rows.push({ id, name: 'Head-Tracking (itsloopyo) — ' + g.n, latest: tag, cached: cached[id] || null, update: !!(tag && cached[id] && tag !== cached[id]), game: g.n });
    }
    if (inst.includes('track_bz')) {
      if (hubTags === null) hubTags = await hubAllTags('BerZerker96/6DOF-Head-Tracking-Mods-Hub');
      const id = 'track_bz:' + htSlug(g.n);
      let best = null, bestSc = 0; const keys = gameKeys(g);
      for (const t of hubTags) { let sc = 0; for (const k of keys) sc = Math.max(sc, bestScore(t, k)); if (sc > bestSc) { bestSc = sc; best = t; } }
      if (best && bestSc >= 60) rows.push({ id, name: '6DOF Hub (BerZerker96) — ' + g.n, latest: best, cached: cached[id] || null, update: !!(cached[id] && best !== cached[id]), game: g.n });
    }
  }
  return rows.filter(r => r.update || r.rateLimited);
}

/* ---------------- placement ---------------- */
// Source trees / build scripts that some mod zips ship alongside the built mod — never copy these into a game folder.
const NOISE_DIR = /^(src|source|obj|build|\.git|\.github|\.vs|x64_Debug|Debug|Release)$/i;
const NOISE_FILE = /^(build\.(sh|bat|cmd)|CMakeLists\.txt|Makefile|\.gitignore|\.gitattributes)$/i;
/**
 * Copy a mod file into the game, preserving anything already there. If the destination exists and we
 * have not already stashed a copy, it is saved as <file>.bak first - so a user's own DLL (or another
 * mod's) is never destroyed. First backup wins, so repeat installs can't overwrite the true original.
 */
function copyPreserving(src, dest) {
  try {
    if (fs.existsSync(dest) && !fs.existsSync(dest + '.bak')) fs.copyFileSync(dest, dest + '.bak');
  } catch (_) {}
  fs.copyFileSync(src, dest);
  /* Verify the bytes are actually there. Antivirus routinely deletes or truncates a freshly written
   * .asi/.dll within milliseconds, and copyFileSync has already returned success by then - so the
   * install looked fine and the mod simply never loaded. Checking the size here turns that silent
   * failure into a real error naming antivirus as the likely cause. */
  try {
    const want = fs.statSync(src).size, got = fs.existsSync(dest) ? fs.statSync(dest).size : -1;
    if (got !== want) {
      const e = new Error('File did not survive being written: ' + path.basename(dest)
        + (got < 0 ? ' (it was removed immediately after copying)' : ' (expected ' + want + ' bytes, found ' + got + ')')
        + '. This is almost always antivirus quarantining the mod. Add the game folder to your antivirus'
        + ' exclusions, then install again.');
      e.code = 'EANTIVIRUS'; e.antivirus = true;
      throw e;
    }
  } catch (e) { if (e && e.antivirus) throw e; }
}

/** The folder in an extracted tree that actually holds mod files. Only used as a rescue when the
 *  normal placement rules wrote nothing, e.g. because the archive layout changed. */
function deepPayloadRoot(root) {
  const PAYLOAD = /\.(dll|asi|addon\d*|fx|fxh|ini|xml|cfg|exe|json)$/i;
  let best = null, bestScore = 0;
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    const hits = ents.filter(e => e.isFile() && PAYLOAD.test(e.name)).length;
    if (hits > bestScore) { bestScore = hits; best = dir; }
    for (const e of ents) if (e.isDirectory() && !/^\./.test(e.name)) walk(path.join(dir, e.name), depth + 1);
  };
  walk(root, 0);
  return bestScore > 0 ? best : null;
}

/* ─────────────── environment failures a real install actually hits ───────────────
 * A game folder can be read-only, the game can be running with its DLLs locked, antivirus can
 * delete an .asi microseconds after it lands, and the disk can fill up mid-extract. Node reports
 * all of these as terse errno strings, which surfaced to the user as "EPERM" and nothing else.
 * These helpers turn them into something a person can act on.
 */
function classifyFsError(e, target) {
  const code = String((e && e.code) || '').toUpperCase();
  const where = target ? (' (' + target + ')') : '';
  switch (code) {
    case 'EACCES': case 'EPERM':
      return { code, kind: 'permission',
        note: 'Windows refused to write to the game folder' + where + '. It is usually one of: the game is in '
            + 'Program Files and needs the app run as administrator, the folder is read-only, or antivirus is '
            + 'blocking it. Right-click the app and choose "Run as administrator", then try again.' };
    case 'EBUSY': case 'ETXTBSY':
      return { code, kind: 'locked',
        note: 'A file is locked' + where + ' — the game (or its launcher/anti-cheat) is still running. '
            + 'Close the game completely, wait a few seconds, then install again.' };
    case 'ENOSPC':
      return { code, kind: 'diskfull',
        note: 'The drive is full' + where + '. Free up some space and try again; a partly written mod has been removed.' };
    case 'EROFS':
      return { code, kind: 'readonly', note: 'That drive is read-only' + where + '.' };
    case 'ENAMETOOLONG':
      return { code, kind: 'path', note: 'The install path is too long for Windows' + where + '. Move the game closer to the drive root.' };
    case 'EMFILE': case 'ENFILE':
      return { code, kind: 'handles', note: 'Too many files are open at once' + where + '. Close other programs and try again.' };
    default:
      return code ? { code, kind: 'io', note: 'A file error (' + code + ') occurred' + where + '.' } : null;
  }
}

/** Can we actually write here? Cheaper and clearer than discovering it halfway through a copy. */
function preflightWritable(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return classifyFsError(e, dir); }
  const probe = path.join(dir, '.stereo-write-test');
  try { fs.writeFileSync(probe, 'x'); fs.rmSync(probe, { force: true }); return null; }
  catch (e) { return classifyFsError(e, dir); }
}

/** Bytes free on the volume holding `dir`, or null when it can't be determined. */
function freeSpace(dir) {
  try { const st = fs.statfsSync(dir); return st.bsize * st.bavail; } catch (_) { return null; }
}

function copyDir(srcDir, destDir, gameDir, opts) {
  opts = opts || {};
  const written = [];
  (function walk(s, d) {
    let entries = []; try { entries = fs.readdirSync(s); } catch { return; }
    for (const e of entries) {
      if (e === '.ok') continue;
      // an -installer.zip carries install.cmd / uninstall.cmd beside the payload; the app places
      // the mod files itself, so those wrappers must never land in the game folder
      if (opts.skipNames && opts.skipNames.test(e)) continue;
      if (opts.skipNoise) {
        let isDir = false; try { isDir = fs.statSync(path.join(s, e)).isDirectory(); } catch (_) {}
        if (isDir && NOISE_DIR.test(e)) continue;
        if (!isDir && NOISE_FILE.test(e)) continue;
      }
      const sp = path.join(s, e), dp = path.join(d, e);
      if (fs.statSync(sp).isDirectory()) walk(sp, dp);
      else { fs.mkdirSync(path.dirname(dp), { recursive: true }); copyPreserving(sp, dp); written.push(path.relative(gameDir, dp)); }
    }
  })(srcDir, destDir);
  return written;
}
function copyMatching(srcDir, destDir, regex, gameDir) {
  const written = [];
  (function walk(s) {
    let entries = []; try { entries = fs.readdirSync(s); } catch { return; }
    for (const e of entries) { const sp = path.join(s, e); if (fs.statSync(sp).isDirectory()) walk(sp); else if (regex.test(e)) { const dp = path.join(destDir, e); fs.mkdirSync(path.dirname(dp), { recursive: true }); copyPreserving(sp, dp); written.push(path.relative(gameDir, dp)); } }
  })(srcDir);
  return written;
}
/** Head-tracking zips vary: some are flat, some wrap the mod in a folder (bak-headtracking/,
 *  w3-headtracking/), and some also ship a src/ tree. Find the folder that actually holds the
 *  loadable mod (the .asi, or failing that the proxy DLL) so it lands NEXT TO the game exe. */
const INSTALLER_NOISE = /^(install|uninstall|setup)\.(cmd|bat|ps1|exe)$|^readme|^license|^third-party/i;
/** Locate a directory called `name` at or under `root` (breadth-first, shallow depths win).
 *  Handles the wrapper folder that GitHub repo archives always add. */
function findNamedDir(root, name) {
  const want = String(name).replace(/[\\/]+$/, '').toLowerCase();
  const parts = want.split(/[\\/]/).filter(Boolean);
  // exact relative hit first (from:'Shaders' or even from:'a/b')
  try { const direct = path.join(root, ...parts); if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct; } catch (_) {}
  const leaf = parts[parts.length - 1];
  const queue = [[root, 0]];
  while (queue.length) {
    const [dir, depth] = queue.shift();
    if (depth > 4) continue;
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of ents) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.name.toLowerCase() === leaf) {
        // if `from` had several segments, confirm the tail matches
        if (parts.length === 1) return p;
        const full = path.join(dir, ...parts.slice(0, -1), e.name);
        if (fs.existsSync(full)) return full;
        return p;
      }
      queue.push([p, depth + 1]);
    }
  }
  return null;
}

function findAsiRoot(root) {
  const hits = [];
  (function walk(d, depth) {
    if (depth > 4) return;
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    if (es.some(e => e.isFile() && /\.asi$/i.test(e.name))) hits.push({ dir: d, depth, rank: 0 });
    else if (es.some(e => e.isFile() && /^(dinput8|version|winmm|dsound|xinput1_3)\.dll$/i.test(e.name))) hits.push({ dir: d, depth, rank: 1 });
    for (const e of es) if (e.isDirectory() && !/^(src|source|\.git|obj|build)$/i.test(e.name)) walk(path.join(d, e.name), depth + 1);
  })(root, 0);
  if (!hits.length) return null;
  hits.sort((a, b) => a.rank - b.rank || a.depth - b.depth);
  return hits[0].dir;
}
function placeInto(core, game, mod) {
  const base = gameBase(game);
  const root = effectiveRoot(core.dir);
  const p = (mod && mod.place) || { root: true };
  // flatten: scatter specific files anywhere in the archive to their correct destinations (e.g. Geo3D: addon→root, shader→reshade-shaders/Shaders)
  if (p.flatten) {
    const written = [];
    (function walk(s) { let entries = []; try { entries = fs.readdirSync(s); } catch { return; } for (const e of entries) { const sp = path.join(s, e); let st; try { st = fs.statSync(sp); } catch { continue; } if (st.isDirectory()) walk(sp); else { for (const rule of p.flatten) { if (rule.match.test(e)) { const dp = path.join(base, rule.to === '.' ? '' : rule.to, e); fs.mkdirSync(path.dirname(dp), { recursive: true }); copyPreserving(sp, dp); written.push(path.relative(base, dp)); break; } } } } })(root);
    return written;
  }
  let srcDir = root;
  if (p.asiRoot) { const d = findAsiRoot(root); if (d) srcDir = d; }
  else if (p.subdirByApiBit && mod.sourceSubdir) { const s = path.join(root, mod.sourceSubdir(game.api, game.bit)); if (fs.existsSync(s)) srcDir = s; }
  else if (p.from) {
    // A GitHub repo zip wraps everything in one folder ("Depth3D-master/"), so `from:'Shaders'`
    // never matched at the top level. The old code silently fell back to copying the WHOLE tree,
    // which is how SuperDepth3D ended up at
    //   reshade-shaders/Shaders/Depth3D-master/Shaders/SuperDepth3D.fx
    // instead of the flat path ReShade actually scans. Find the folder wherever it really is.
    const d = findNamedDir(root, p.from);
    if (d) srcDir = d;
  }
  let destRel = (p.to && p.to !== '.') ? p.to : '';
  if (mod && mod.toBin && game.eng === 'Source') destRel = path.join('bin', destRel);
  const destDir = path.join(base, destRel);
  if (p.match) return copyMatching(srcDir, destDir, p.match, base);
  const written = copyDir(srcDir, destDir, base, { skipNoise: !!p.asiRoot, skipNames: INSTALLER_NOISE });
  log.app.info('placement', { mod: (mod && mod.name) || '?', from: path.basename(srcDir), to: path.basename(destDir),
    files: (written || []).length, sample: (written || []).slice(0, 6) });

  /* Safety re-copy. If a mod author restructures an archive, the placement rules can match nothing
   * and the install "succeeds" having written no payload at all. Verify something actually landed;
   * if not, find the real payload folder in the extracted tree and copy from there instead. */
  if (!written || !written.length) {
    const rescue = deepPayloadRoot(root);
    if (rescue && rescue !== srcDir) {
      log.app.warn('placement wrote nothing - engaging safety re-copy', { from: rescue });
      const second = copyDir(rescue, destDir, base, { skipNoise: true, skipNames: INSTALLER_NOISE });
      if (second && second.length) { log.app.info('safety re-copy placed ' + second.length + ' file(s)'); return second; }
    }
    log.app.warn('placement wrote nothing and no payload folder was found', { root });
  }
  return written;
}

/** Where mods load from — the folder holding the real game exe (Unreal: Binaries/Win64; else the game folder). */
function gameBase(game) { if (!game) return ''; if (game.exeDir) return game.exeDir; if (game.dir) return game.dir; if (game.exePath) { try { return path.dirname(game.exePath); } catch (_) {} } return ''; }
// every folder a config might live in — the exe folder, the stored dir, the exePath's dir
function gameBases(game) { const out = []; const add = d => { if (d && !out.includes(d)) out.push(d); }; if (game) { add(game.exeDir); if (game.exePath) { try { add(path.dirname(game.exePath)); } catch (_) {} } add(game.dir); } return out.length ? out : ['']; }

function manifestPath(game) { return path.join(gameBase(game), '.stereoscope', 'manifest.json'); }
function readManifest(game) { try { return JSON.parse(fs.readFileSync(manifestPath(game), 'utf8')); } catch { return { mods: {} }; } }
function writeManifest(game, m) {
  try {
    log.app.info('manifest write', { game: (game && (game.n || game.folder)) || '?',
      mods: Object.keys((m && m.mods) || {}),
      files: Object.values((m && m.mods) || {}).reduce((a, r) => a + ((r && r.files) || []).length, 0) });
  } catch (_) {}
  // A mod can place the same path more than once (geo-11 ships parallel 32/64 trees that collapse
  // onto one destination), which used to record duplicate entries. Dedupe centrally so ownership
  // accounting and uninstall are exact no matter which install path wrote the record.
  try {
    for (const rec of Object.values((m && m.mods) || {}))
      if (rec && Array.isArray(rec.files)) rec.files = [...new Set(rec.files.map(f => String(f)))];
  } catch (_) {}
  fs.mkdirSync(path.dirname(manifestPath(game)), { recursive: true });
  fs.writeFileSync(manifestPath(game), JSON.stringify(m, null, 2));
}
/** Auto-manage: record already-on-disk mods in the manifest so the app treats them as managed (config, updates). Files aren't tracked (we didn't place them), so uninstall won't delete hand-placed files. */
function adoptMods(game, modIds) {
  const m = readManifest(game); m.mods = m.mods || {};
  const managed = new Set(Object.keys(m.mods));
  let added = 0, collapsed = 0;
  // Never adopt BOTH packagings of one mod: the files on disk are a single physical install, so a
  // second manifest entry would give the user two config cards and two update rows for one thing.
  for (const raw of (modIds || [])) {
    const id = resolveAlias(raw, managed);
    if (m.mods[id]) continue;
    if ((ALIAS_SIBLINGS[id] || []).some(sib => m.mods[sib])) continue;   // the twin already covers it
    m.mods[id] = { adopted: true, when: new Date().toISOString(), files: [], tag: 'adopted' };
    managed.add(id); added++;
  }
  // Heal manifests written before this rule that already carry both twins: keep the preferred one.
  for (const [id, sibs] of Object.entries(ALIAS_SIBLINGS)) {
    if (!m.mods[id]) continue;
    for (const sib of sibs) {
      if (!m.mods[sib]) continue;
      const keep = ALIAS_PREFERRED[id] || id;
      const drop = keep === id ? sib : id;
      // only ever drop an ADOPTED record - a real install owns files and must be uninstalled properly
      if (m.mods[drop] && m.mods[drop].adopted && !(m.mods[drop].files || []).length) { delete m.mods[drop]; collapsed++; }
    }
  }
  if (added || collapsed) writeManifest(game, m);
  // Make the adopted mod's editor immediately useful. A pre-installed mod that has never been run
  // has no settings block yet (Geo3D writes [Geo3D] into ReShade.ini at runtime, the preset appears
  // on first launch), so the Configure card opened completely empty. Seed ONLY the keys that are
  // absent - an existing value the user tuned is never touched.
  const seeded = [];
  for (const id of Object.keys(m.mods)) {
    if (!m.mods[id] || !m.mods[id].adopted || m.mods[id].seeded) continue;
    const def = DEFAULTS[id]; if (!def) continue;
    let wrote = false;
    for (const [section, kv] of Object.entries(def)) {
      let file = null; try { file = modSectionFile(game, id, section); } catch (_) {}
      if (!file) continue;
      let existing = {};
      try {
        const cur = /\.xml$/i.test(file) ? (parseWizXml(file) || {}) : (cfg.readConfig(file).sections || {});
        const k = Object.keys(cur).find(x => x.toLowerCase() === section.toLowerCase());
        existing = k ? cur[k] : {};
      } catch (_) {}
      const patch = {};
      for (const [k, v] of Object.entries(kv)) if (existing[k] === undefined) patch[k] = v;
      if (!Object.keys(patch).length) continue;
      try { cfg.writeConfig(file, { [section]: patch }); wrote = true; } catch (_) {}
    }
    if (wrote) { m.mods[id].seeded = new Date().toISOString(); seeded.push(id); }
  }
  if (seeded.length) writeManifest(game, m);
  return { ok: true, added, collapsed, seeded, managed: Object.keys(m.mods) };
}
function resolveConfigPath(mod, game) { let f = typeof mod.configFile === 'function' ? mod.configFile(game.eng, game.n) : mod.configFile; if (!f || f.includes('*')) return null; return path.join(gameBase(game), f); }

/* ---------- Real per-mod config read/write (resolves the ACTIVE ReShade preset, whatever it's named) ---------- */
function activePresetPath(game) {
  const bases = gameBases(game);
  // find ReShade.ini in any candidate folder, resolve its active preset
  for (const base of bases) {
    const rip = path.join(base, 'ReShade.ini');
    try {
      if (!fs.existsSync(rip)) continue;
      const ri = cfg.readConfig(rip).sections || {};
      const gen = ri.GENERAL || ri.General || {};
      let pp = gen.PresetPath || gen.CurrentPresetPath || gen.CurrentPreset || gen.Preset || '';
      if (pp) { pp = pp.replace(/^[.][\\/]/, '').trim(); const abs = path.isAbsolute(pp) ? pp : path.join(base, pp); if (fs.existsSync(abs)) return abs; }
    } catch (_) {}
  }
  // fallbacks: a named preset, or any *.ini holding a known shader section
  for (const base of bases) {
    for (const f of ['ReShadePreset.ini', 'ReShadePreset.txt']) { const p = path.join(base, f); try { if (fs.existsSync(p)) return p; } catch (_) {} }
    try { for (const f of fs.readdirSync(base)) { if (/\.ini$/i.test(f) && !/^(ReShade|d3dx|d3dxdm|dgVoodoo)/i.test(f)) { const s = cfg.readConfig(path.join(base, f)).sections || {}; if (s['SuperDepth3D.fx'] || s['3DToElse.fx']) return path.join(base, f); } } } catch (_) {}
  }
  return path.join(gameBase(game) || bases[0], 'ReShadePreset.ini');
}
// which real file holds a given [section] for a mod (presets resolved dynamically)
function modSectionFile(game, modId, section) {
  const base = gameBase(game); const s = String(section || '');
  if (modId === 'geo11' || modId === 'geo11_github') {                    // same driver, same files
    // [Device]/[Stereo] live in d3dxdm.ini; the 3Dmigoto base keys live in d3dx.ini
    if (/^(rendering|loader|logging|include|profile)$/i.test(s)) return path.join(base, 'd3dx.ini');
    const dm = path.join(base, 'd3dxdm.ini');
    if (fs.existsSync(dm)) return dm;
    const dx = path.join(base, 'd3dx.ini');
    return fs.existsSync(dx) ? dx : dm;
  }
  if (modId === 'reshade') return path.join(base, 'ReShade.ini');
  if (modId === 'sd3d') return activePresetPath(game);                    // [SuperDepth3D.fx]
  if (modId === 'geo3d' || modId === 'geo3d_legacy') {
    if (/geo3d/i.test(s)) return path.join(base, 'ReShade.ini');          // [Geo3D]
    if (/3dtoelse/i.test(s)) return activePresetPath(game);               // [3DToElse.fx]
    if (/folder/i.test(s)) return path.join(base, 'FOLDERs.txt');
    return path.join(base, 'ReShade.ini');
  }
  if (modId === 'v4a') return path.join(base, '3dvision4all.ini');        // [stereo] [render] [debug]
  // dgVoodoo2 writes dgVoodoo.conf beside the exe. It had DEFAULTS and a declared section list but
  // no path here, so readModConfig resolved nothing and the app offered no editor for OutputAPI -
  // the one setting that decides whether the DX-to-DX11 conversion works at all.
  if (modId === 'dgvoodoo') {
    for (const n of ['dgVoodoo.conf', 'dgvoodoo.conf', 'dgVoodoo.ini'])
      { const p = path.join(base, n); try { if (fs.existsSync(p)) return p; } catch (_) {} }
    return path.join(base, 'dgVoodoo.conf');
  }
  // wiz3D ships its config under three different names depending on the build (plain / AMD HD3D /
  // 3D Vision Direct). Resolve whichever one is actually there, or the editor points at a file that
  // doesn't exist and writes land in a bogus one.
  if (modId === 'wiz3d') return wizConfigIn(base) || path.join(base, 'wiz3D_Config.xml');
  if (modId === 'track_loop' || modId === 'track_bz') {                   // per-game ini / BepInEx cfg
    try { const r = htConfigPath(game); if (r && r.path) return r.path; } catch (_) {}
    return path.join(base, 'HeadTracking.ini');
  }
  return null;
}

/* Which [sections] each mod's editor surfaces. Read and write BOTH resolve them through
 * modSectionFile(), so the two can never disagree about where a setting actually lives —
 * wiz3D, 3DVision4All and both head-tracking mods used to be missing from the read side
 * entirely, so their config editors opened empty even though writing worked. */
/* Does this mod own its config file outright, or does it share one with other mods?
 * Exclusive files (d3dxdm.ini, d3dx.ini, 3dvision4all.ini, the wiz3D XML, HeadTracking.ini) are shown
 * IN FULL, so every option the real file contains reaches the editor even if this app never seeded it.
 * Shared files (ReShade.ini, ReShadePreset.ini) are filtered to the declared sections, otherwise the
 * Geo3D editor would list SuperDepth3D's uniforms and ReShade's own [GENERAL] block. */
const MOD_CONFIG_EXCLUSIVE = { geo11: 1, geo11_github: 1, v4a: 1, wiz3d: 1, track_loop: 1, track_bz: 1 };
const MOD_SECTIONS = {
  geo11:        ['Device', 'Stereo', 'Rendering'],
  geo11_github: ['Device', 'Stereo', 'Rendering'],
  reshade:      ['GENERAL'],
  sd3d:         ['SuperDepth3D.fx'],
  geo3d:        ['Geo3D', '3DToElse.fx'],
  geo3d_legacy: ['Geo3D', '3DToElse.fx'],
  v4a:          ['stereo', 'render', 'debug'],
  wiz3d:        ['wiz3D'],
  // dgVoodoo2 had DEFAULTS but no section list, so readModConfig returned nothing and the app
  // offered no editor for the one setting that decides whether the conversion works at all.
  dgvoodoo:     ['General', 'DirectX', 'GLIDE', 'Glide', 'DirectXExt'],
  track_loop:   ['Pose', 'FOV', 'HeadTracking', 'Connection', 'Sensitivity', 'Tracking', 'Network', 'Position', 'General'],
  /* Plain 6DOF hub mods ship HeadTracking.ini. The COMBINED 3D+6DOF builds are a different animal:
   * a version.dll proxy with its own DX11 stereo (no ReShade, no geo-11) and a much wider config
   * called "3D-6DOF config.ini". Its stereo, rotation, Z-axis and cull-guard sections were not in
   * this list, so the editor silently hid every 3D setting the build has - separation, convergence,
   * output mode, eye swap. */
  track_bz:     ['Pose', 'FOV', 'HeadTracking', 'Connection', 'Sensitivity', 'Tracking', 'Network', 'Position', 'General',
                 'Stereo3D', 'Rotation', 'ZAxis', 'CullGuard', 'Advanced']
};
// read a mod's real settings from disk → { sections: { SectionName: {key:val} } }
function readModConfig(game, modId) {
  const out = {};
  const wanted = MOD_SECTIONS[modId];
  if (!wanted) return { sections: out, preset: null, files: [] };
  const cache = {}; const files = [];
  const load = (file) => {
    if (!(file in cache)) {
      files.push(file);
      try { cache[file] = /\.xml$/i.test(file) ? (parseWizXml(file) || {}) : (cfg.readConfig(file).sections || {}); }
      catch (_) { cache[file] = {}; }
    }
    return cache[file];
  };
  // declared sections first, so the familiar options stay at the top of the editor
  for (const want of wanted) {
    let file = null; try { file = modSectionFile(game, modId, want); } catch (_) {}
    if (!file) continue;
    const secs = load(file);
    const key = Object.keys(secs).find(x => x.toLowerCase() === want.toLowerCase());
    if (key) out[want] = Object.assign(out[want] || {}, secs[key]);
  }
  // then everything else the real file actually contains (exclusive configs only)
  if (MOD_CONFIG_EXCLUSIVE[modId]) {
    const seen = new Set(Object.keys(out).map(k => k.toLowerCase()));
    for (const file of files.slice()) {
      for (const [sec, kv] of Object.entries(load(file))) {
        if (!sec || seen.has(sec.toLowerCase())) continue;
        seen.add(sec.toLowerCase()); out[sec] = Object.assign({}, kv);
      }
    }
  }
  return { sections: out, files: files.filter(f => { try { return fs.existsSync(f); } catch (_) { return false; } }),
           preset: (modId === 'sd3d' || /geo3d/.test(modId)) ? path.basename(activePresetPath(game)) : null };
}
// write a section-keyed patch to the right real files (presets resolved) with .bak backups
function writeModConfig(game, modId, patch) {
  try {
    const secs = Object.keys(patch || {});
    log.app.info('config write ' + modId, { game: (game && (game.n || game.folder)) || '?', sections: secs,
      keys: secs.reduce((a, k) => a.concat(Object.keys(patch[k] || {}).map(x => k + '.' + x)), []).slice(0, 20) });
  } catch (_) {}
  const byFile = {};
  for (const [section, kv] of Object.entries(patch || {})) {
    const file = modSectionFile(game, modId, section); if (!file) continue;
    byFile[file] = byFile[file] || {}; byFile[file][section] = kv;
  }
  const results = [];
  for (const [file, secs] of Object.entries(byFile)) {
    try {
      // wiz3D stores its settings as XML elements (<StereoBase Value="..."/>), not INI keys - route it
      // to the XML writer exactly like writeAnalyzed does, or the write silently no-ops.
      if (WIZ_CFG_RE.test(path.basename(file))) {
        const kv = {}; for (const sec of Object.values(secs)) Object.assign(kv, sec || {});
        wizSetConfigFile(file, kv);
        results.push({ file: path.basename(file), ok: true });
      } else {
        const r = cfg.writeConfig(file, secs);
        results.push({ file: path.basename(file), ok: !!(r && r.ok !== false) });
      }
    } catch (e) { results.push({ file: path.basename(file), ok: false, error: String(e.message || e) }); }
  }
  return { ok: results.length > 0 && results.every(r => r.ok), results };
}
/* Generic, schema-driven read/write: the renderer passes (fileToken, section) pairs; '@preset' = active ReShade preset.
   This handles mods with MULTIPLE files that share section names (e.g. geo-11's d3dxdm.ini AND d3dx.ini both have [Device]/[Stereo]). */
function resolveFileToken(game, token) { if (token === '@preset') return activePresetPath(game); const bases = gameBases(game); for (const b of bases) { const p = path.join(b, token); try { if (fs.existsSync(p)) return p; } catch (_) {} } return path.join(gameBase(game) || (bases[0] || ''), token); }
function readModFiles(game, pairs) {
  const out = {}; const cache = {}; const files = {};
  for (const pr of (pairs || [])) {
    const token = pr[0], section = pr[1]; const file = resolveFileToken(game, token); files[token] = file;
    if (!(file in cache)) { try { cache[file] = cfg.readConfig(file).sections || {}; } catch (_) { cache[file] = {}; } }
    const s = cache[file]; const key = Object.keys(s).find(x => x.toLowerCase() === String(section).toLowerCase());
    out[token + '||' + section] = key ? s[key] : {};
  }
  return { data: out, files, preset: path.basename(activePresetPath(game)) };
}
function writeModFiles(game, patch) {
  const byFile = {};
  for (const [ts, kv] of Object.entries(patch || {})) {
    const i = ts.indexOf('||'); if (i < 0) continue; const token = ts.slice(0, i), section = ts.slice(i + 2);
    const file = resolveFileToken(game, token); byFile[file] = byFile[file] || {}; byFile[file][section] = Object.assign(byFile[file][section] || {}, kv);
  }
  const results = [];
  for (const [file, secs] of Object.entries(byFile)) { try { const r = cfg.writeConfig(file, secs); results.push({ file: path.basename(file), ok: !!(r && r.ok !== false) }); } catch (e) { results.push({ file: path.basename(file), ok: false, error: String(e.message || e) }); } }
  return { ok: results.length > 0 && results.every(r => r.ok), results };
}
/** Resolve any relative config file inside a game's folder (for multi-file mods like Geo3D). */
function resolveFile(game, rel) { if (!rel || String(rel).includes('*')) return null; return path.join(gameBase(game), rel); }

/* ================= DYNAMIC CONFIG ANALYZER =================
   Scan the game folder for EVERY config file, parse it, and tag it to a mod by signature
   (section names, key patterns, filename) — so settings are found even when files/keys are named differently. */
function parseWizXml(p) { try { const xml = fs.readFileSync(p, 'utf8'); const kv = {}; for (const m of xml.matchAll(/<([A-Za-z_0-9]+)\s+Value="([^"]*)"/g)) { if (!(m[1] in kv)) kv[m[1]] = m[2]; } return Object.keys(kv).length ? { wiz3D: kv } : null; } catch (_) { return null; } }
function detectConfigMods(name, secNames, keys) {
  const secHas = re => secNames.some(s => re.test(s));
  const keyHas = re => keys.some(k => re.test(k));
  const out = [];
  // a single file can legitimately serve two mods (e.g. ReShade.ini holds ReShade's own keys AND [Geo3D])
  if (WIZ_CFG_RE.test(name)) out.push('wiz3d');
  // 3DVision4All: its ini is named 3dvision4all.ini and has [stereo]/[render] with a 'mode' + capture keys.
  if (/^3dvision4all\.ini$/i.test(name) || (secHas(/^stereo$/i) && keyHas(/^(swap_eyes|defeat_directflip|alternate_capture_mode)$/i))) out.push('v4a');
  if (/^d3dxdm\.ini$/i.test(name) || keyHas(/^dm_/i)) out.push('geo11');
  if (secHas(/^Geo3D$/i)) out.push('geo3d');
  if (secHas(/^SuperDepth3D/i)) out.push('sd3d');
  if (secHas(/^3DToElse/i)) out.push('geo3d');
  if (secHas(/^(Pose|FOV|OpenTrack|HeadTracking)$/i) || keyHas(/^(ScaleX|ScaleY|ScaleZ|YawSens|PitchSens|SmoothPosHz|SmoothRotHz|EnableOnStart|YawSensitivity|PitchSensitivity|RollSensitivity)$/i)) out.push('track_bz');
  if (secHas(/^(Connection|Sensitivity|Tracking|Network|Position|General)$/i) && (keyHas(/(yaw|pitch|roll)\s*sensitivity/i) || keyHas(/^(YawSensitivity|PitchSensitivity|AimDecoupling|WorldSpaceYaw|EnableOnStartup|ShowReticle)$/i) || keyHas(/udp\s*port/i) || keyHas(/position\s*(sensitivity|limit)/i))) out.push('track_loop');
  if (/^d3dx\.ini$/i.test(name) || (keyHas(/^force_stereo$/i) && secHas(/^Rendering$/i))) out.push('geo11_d3dx');
  if (/^ReShade\.ini$/i.test(name)) out.push('reshade');
  // BerZerker ships per-game configs whose SECTIONS vary a lot ([Pose]/[FOV], [HeadTracking],
  // or even [Network]/[Sensitivity] which look like Loop's) — the filename is the reliable tell,
  // so tag it additively rather than only as a fallback.
  if (/head[\s_-]?tracking|6dof|cameraunlock/i.test(name) && !out.includes('track_bz')) out.push('track_bz');
  return [...new Set(out)];
}
function detectConfigMod(name, secNames, keys) { return detectConfigMods(name, secNames, keys)[0] || null; }

function analyzeConfigs(game) {
  const bases = gameBases(game); const seen = new Set(); const out = [];
  const scan = (dir, depth) => {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth > 0 && /^(reshade-shaders|BepInEx|config|UserData|Mods|plugins|scripts|bin|win64|win32|x64|shaderfixes|data)$/i.test(e.name)) scan(p, depth - 1); continue; }
      if (!/\.(ini|txt|conf|cfg|xml)$/i.test(e.name)) continue;
      if (/\.xml$/i.test(e.name) && !WIZ_CFG_RE.test(e.name)) continue;
      const key = p.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
      let sections = null;
      if (/\.xml$/i.test(e.name)) sections = parseWizXml(p);
      else { try { const c = cfg.readConfig(p); if (c.exists) sections = c.sections; } catch (_) {} }
      if (!sections) continue;
      const secNames = Object.keys(sections).filter(s => s);
      const keys = []; for (const s of secNames) for (const k of Object.keys(sections[s] || {})) keys.push(k);
      if (!keys.length) continue;
      const mods = detectConfigMods(e.name, secNames, keys);
      out.push({ path: p, name: e.name, mod: mods[0] || null, mods, sections, secNames });
    }
  };
  for (const b of bases) scan(b, 2);
  return { files: out };
}
// which analyzer tags feed a given mod's editor
const MOD_TAGS = { geo11: ['geo11', 'geo11_d3dx'], geo11_github: ['geo11', 'geo11_d3dx'], geo3d: ['geo3d'], geo3d_legacy: ['geo3d'], sd3d: ['sd3d'], reshade: ['reshade'], wiz3d: ['wiz3d'], v4a: ['v4a'], track_bz: ['track_bz', 'track_loop'], track_loop: ['track_bz', 'track_loop'],
  // the VR-export add-ons have no config of their own - their switches live in the host mod's preset
  supervrexport: ['sd3d'], geovrexport: ['geo3d'] };

/** Which shader files ReShade actually has ENABLED (from ReShade.ini Techniques / TechniqueSorting). */
function reshadeEnabledTechniques(game) {
  const set = new Set();
  for (const b of gameBases(game)) {
    const p = path.join(b, 'ReShade.ini');
    try {
      if (!fs.existsSync(p)) continue;
      const sec = cfg.readConfig(p).sections || {};
      const gen = sec.GENERAL || sec.General || {};
      for (const k of ['Techniques', 'TechniqueSorting']) {
        const v = gen[k]; if (!v) continue;
        for (const t of String(v).split(',')) { const at = t.indexOf('@'); if (at >= 0) set.add(t.slice(at + 1).trim().toLowerCase()); }
      }
      if (set.size) break;
    } catch (_) {}
  }
  return set;
}
/** Shader family of a preset section: SuperDepth3D_Plus.fx and SuperDepth3D.fx are the same shader. */
function fxFamily(section) {
  const m = String(section || '').match(/^(.*)\.fx$/i);
  if (!m) return null;
  return m[1].split('_')[0].toLowerCase();
}
function readModAnalyzed(game, modId) {
  const wants = MOD_TAGS[modId] || [modId];
  const { files } = analyzeConfigs(game);
  const enabled = reshadeEnabledTechniques(game);
  const used = []; const rows = [];
  for (const f of files) {
    const tags = f.mods || (f.mod ? [f.mod] : []);
    if (!tags.some(t => wants.includes(t))) continue; used.push(f.path);
    for (const [section, kv] of Object.entries(f.sections)) {
      if (!section) continue;
      for (const [key, value] of Object.entries(kv)) rows.push({ file: f.path, section, key, value });
    }
  }
  // A ReShade preset carries one section per shader VARIANT of the same effect (SuperDepth3D.fx,
  // SuperDepth3D_Plus.fx, SuperDepth3D_AI.fx ...), and every variant declares the same uniform names.
  // Listing them all showed the user "3D output format" four times over. Only the technique ReShade
  // has ENABLED is actually live, so sort enabled variants first and keep one row per shader family.
  rows.sort((a, b) => {
    const rank = r => (fxFamily(r.section) && enabled.has(String(r.section).toLowerCase())) ? 0 : 1;
    return rank(a) - rank(b);   // stable sort: file order is preserved within each rank
  });
  const settings = []; const seen = new Set();
  for (const r of rows) {
    const fam = fxFamily(r.section);
    // shader sections dedupe per FAMILY (variants collapse); everything else stays section-scoped
    // Lowercase the section too. INI section names are case-insensitive in practice, and two copies
    // of a config that disagree on case ([GENERAL] vs [General] - different ReShade installers write
    // both) made every shared setting appear twice in the editor.
    const sig = (fam ? ('fx:' + fam) : ('s:' + String(r.section).toLowerCase())) + '||' + String(r.key).toLowerCase();
    if (seen.has(sig)) continue; seen.add(sig);
    settings.push(r);
  }
  return { settings, files: used };
}
function writeAnalyzed(game, edits) {
  const byFile = {};
  for (const ed of (edits || [])) { if (!ed || !ed.file) continue; byFile[ed.file] = byFile[ed.file] || {}; (byFile[ed.file][ed.section || ''] = byFile[ed.file][ed.section || ''] || {})[ed.key] = String(ed.value); }
  const results = [];
  for (const [file, secs] of Object.entries(byFile)) {
    try { if (WIZ_CFG_RE.test(path.basename(file))) { wizSetConfigFile(file, secs.wiz3D || {}); results.push({ file: path.basename(file), ok: true }); } else { const r = cfg.writeConfig(file, secs); results.push({ file: path.basename(file), ok: !!(r && r.ok !== false) }); } }
    catch (e) { results.push({ file: path.basename(file), ok: false, error: String(e.message || e) }); }
  }
  return { ok: results.length > 0 && results.every(r => r.ok), results };
}
function wizSetConfigFile(file, kv) { let xml = fs.readFileSync(file, 'utf8'); try { fs.copyFileSync(file, file + '.bak'); } catch (_) {} for (const [tag, val] of Object.entries(kv)) { const re = new RegExp('(<' + tag + '\\s+Value=")[^"]*(")', 'g'); xml = xml.replace(re, '$1' + String(val) + '$2'); } fs.writeFileSync(file, xml); }


/* ---- ReShade one-click: right DLL for the game's API/bitness + shaders + textures + preset ---- */
function findFileRec(root, re) {
  let hit = null;
  (function walk(d) {
    if (hit) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of es) { if (hit) return; const p2 = path.join(d, e.name); if (e.isDirectory()) walk(p2); else if (re.test(e.name)) hit = p2; }
  })(root);
  return hit;
}
function copyTree(src, dest) {
  const out = [];
  (function walk(s, d) {
    let es = []; try { es = fs.readdirSync(s, { withFileTypes: true }); } catch (_) { return; }
    fs.mkdirSync(d, { recursive: true });
    for (const e of es) { const sp = path.join(s, e.name), dp = path.join(d, e.name); if (e.isDirectory()) walk(sp, dp); else { try { copyPreserving(sp, dp); out.push(dp); } catch (_) {} } }
  })(src, dest);
  return out;
}
/** Pick the proxy DLL name ReShade should use, avoiding a clash with a stereo driver already installed. */
function reshadeDllName(game, base) {
  const api = (game && game.api) || ['DX11'];
  let name = MODS.reshade.proxyDLL(api);                 // DX10/11/12 -> dxgi.dll, DX9 -> d3d9.dll, OpenGL -> opengl32.dll
  const taken = f => { try { return fs.existsSync(path.join(base, f)); } catch (_) { return false; } };
  if (taken(name)) {                                     // e.g. geo-11 owns d3d11.dll, Geo3D owns dxgi.dll
    const alts = /DX1[012]/.test(api[0]) ? ['dxgi.dll', 'd3d11.dll', 'd3d12.dll', 'd3d10.dll'] : (api[0] === 'DX9' ? ['d3d9.dll'] : ['opengl32.dll']);
    const free = alts.find(a => !taken(a));
    if (free) name = free;
  }
  return name;
}
/** Install ReShade fully: DLL (API+bitness aware) + reshade-shaders/Shaders + Textures + ReShade.ini + preset. */
/** Find a file that ships inside the app's bundled/ folders (e.g. bundled/vrexport/geod3d9.dll). */
function bundledFile(relDir, fileName) {
  const cand = [
    path.join(__dirname, '..', relDir, fileName),
    process.resourcesPath ? path.join(process.resourcesPath, relDir, fileName) : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app', relDir, fileName) : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', relDir, fileName) : null,
  ].filter(Boolean);
  return cand.find(f => { try { return fs.existsSync(f); } catch (_) { return false; } }) || null;
}

/** Is this a D3D9 game? (first/best API is DX9, or only DX9 in the list). */
function isDx9(game) { const api = (game && game.api) || []; return api[0] === 'DX9' || (api.length === 1 && api[0] === 'DX9'); }
function isDx10(game) { const api = (game && game.api) || []; return api[0] === 'DX10'; }

/**
 * Set up the NATIVE D3D9 fast path documented in the Super-VRExport README ("D3D9 + SuperDepth3D or
 * Geo-3D — Native Fast Path"). The GeoVrExport release ships geod3d9.dll; this proxy sits in front of
 * ReShade and upgrades the game's device to IDirect3DDevice9Ex so the addon's GPU shared-surface path
 * works (no CPU readback). Required layout (verbatim from the README):
 *   <game>\<exe>
 *   <game>\d3d9.dll            <- geod3d9.dll renamed to d3d9.dll (ONLY DirectX dll beside the exe)
 *   <game>\ReShade\d3d9.dll   <- ReShade itself, keeps the d3d9.dll name so it detects D3D9
 *   <game>\ReShade\<addon>.addon32 / Geo3D.addon32 / ReShade.ini / ReShadePreset.ini
 * The proxy chainloads ReShade\d3d9.dll. Returns { ok, files:[relPaths], note }.
 */
/**
 * MANUAL, standalone D3D9 proxy setup. Called from the manual section's own button. Runs the geod3d9.dll
 * layout for whatever VR-Export addon (+ its 3D mod: Geo3D or SuperDepth3D) is present on a D3D9 game,
 * and records the extra files under each affected mod in the manifest so uninstall stays exact.
 * Returns { ok, files, note, applied:[modIds] }.
 */

/* ============================ dgVoodoo2 (DX8/9/10 -> DX11) ============================
 * dgVoodoo2 is closed-source freeware by Dege. Its license permits redistribution ONLY as the
 * original unmodified package, so — like WidescreenFixesPack — we DOWNLOAD it from the official
 * source at setup time rather than bundling it. We then place the correct DLL for the game's API +
 * bitness next to the exe (no MS/x86 subfolder) alongside dgVoodooCpl.exe + a DX11-configured
 * dgVoodoo.conf, so the game is presented to ReShade/geo-11/etc. as a DirectX 11 application.
 */
// Official source, in priority order. dege-diosg/dgVoodoo2 is Dege's own release repo
// (https://github.com/dege-diosg/dgVoodoo2/releases) - the package is fetched from there unmodified,
// never bundled, per its redistribution terms. The second entry is only a fallback mirror.
const DGVOODOO_SOURCES = [
  { repo: 'dege-diosg/dgVoodoo2', official: true },
  { repo: 'lutris/dgvoodoo2' },
];

// Which dgVoodoo DLL(s) wrap each API. Verified against the real package (v2.87.3): dgVoodoo ships
// ONLY DDraw.dll, D3DImm.dll, D3D8.dll, D3D9.dll under MS\<bit>\ (plus Glide under 3Dfx\<bit>\).
// It *outputs* to D3D11/D3D12 - that is the OutputAPI setting, not an input wrapper - so there is no
// D3D10.dll / D3D11.dll to install and DX10+ games must not be offered it.
function dgVoodooDllsFor(api) {
  const a = String((api && api[0]) || 'DX9').toUpperCase();
  if (a === 'DX9')  return ['D3D9.dll'];
  if (a === 'DX8')  return ['D3D8.dll'];
  if (a === 'DX7' || a === 'DX6' || a === 'DX5' || a === 'DDRAW') return ['DDraw.dll', 'D3DImm.dll'];
  if (a === 'GLIDE') return ['Glide.dll', 'Glide2x.dll', 'Glide3x.dll'];
  return [];   // DX10/DX11/DX12/Vulkan/OpenGL - dgVoodoo does not wrap these
}
/** True if dgVoodoo can wrap this game's API at all. */
function dgVoodooSupports(api) { return dgVoodooDllsFor(api).length > 0; }

// A dgVoodoo.conf tuned for translating to DX11: pick a modern output API, windowed-friendly,
// watermark off, sensible VRAM. Written fresh so the user doesn't have to open the control panel.
function dgVoodooConf(opts) {
  opts = opts || {};
  // Every key + value below is verified against a real dgVoodoo.conf shipped by Dege.
  //   OutputAPI:         "d3d11warp" | "d3d11_fl10_0" | "d3d11_fl10_1" | "d3d11_fl11_0"
  //                      | "d3d12_fl11_0" | "d3d12_fl12_0" | "bestavailable"
  //   ScalingMode:       "unspecified" | "centered" | "stretched" | "centered_ar" | "stretched_ar" | ...
  //   Filtering:         "appdriven" | "pointsampled" | "bilinear" | "pointmip" | "linearmip" | "trilinear" | 1-16
  //   VideoCard:         "internal3D" (the DirectX virtual card) - the voodoo_* names are Glide-only
  //   PresentationModel: "auto" | "discard" | "seq" | "flip_discard" | "flip_seq"
  const outputApi = opts.dx12 ? 'd3d12_fl12_0' : 'd3d11_fl11_0';
  return [
    '[General]',
    'OutputAPI                           = ' + outputApi,
    'Adapters                            = all',
    'FullScreenOutput                    = default',
    'FullScreenMode                      = false',
    'ScalingMode                         = stretched_ar',
    'Brightness                          = 100',
    'KeepWindowAspectRatio               = true',
    '',
    '[GeneralExt]',
    'PresentationModel                   = flip_discard',
    'Resampling                          = bilinear',
    '',
    '[DirectX]',
    'DisableAndPassThru                  = false',
    'VideoCard                           = internal3D',
    'VRAM                                = 1024',
    'Filtering                           = appdriven',
    'Mipmapping                          = appdriven',
    'Resolution                          = unforced',
    'Antialiasing                        = appdriven',
    'AppControlledScreenMode             = true',
    'ForceVerticalSync                   = false',
    'FastVideoMemoryAccess               = true',
    'dgVoodooWatermark                   = false',
    ''
  ].join('\r\n');
}

/** Download the official dgVoodoo2 zip (unmodified) and cache it. Returns the extracted dir. */
async function ensureDgVoodoo(onProgress) {
  const id = 'dgvoodoo';
  /* Manual core first, like every other mod: if the user has dropped an unzipped dgVoodoo2 package
   * into manual-core/dgvoodoo/, use it. dgVoodoo was the one core that skipped this and always
   * went to the network, so an offline or rate-limited machine could never install it by hand. */
  try {
    const md = manualCoreDir(id);
    if (fs.existsSync(md) && (fs.existsSync(path.join(md, 'MS')) || findFileRec(md, /^dgVoodooCpl\.exe$/i))) {
      log.app.info('dgVoodoo2 from manual-core', { dir: md });
      return { dir: md, tag: 'manual', cached: true, manual: true };
    }
  } catch (_) {}
  // reuse a cached copy if present
  const existing = coreList().find(c => c.id === id);
  if (existing && fs.existsSync(existing.path)) {
    const hasMs = (() => { try { return fs.existsSync(path.join(existing.path, 'MS')) || findFileRec(existing.path, /^dgVoodooCpl\.exe$/i); } catch (_) { return false; } })();
    if (hasMs) return { dir: existing.path, tag: existing.tag, cached: true };
  }
  let lastErr = null;
  for (const src of DGVOODOO_SOURCES) {
    try {
      // Resolve exactly like the mod sources do: atom feed first (never rate-limited), then scrape the
      // release's asset list, and only fall back to the API. Keeps dgVoodoo working when the API is 403.
      let rel = null;
      try {
        const tag = await latestTagAtom(src.repo);
        if (tag) {
          const assets = await assetsViaExpanded(src.repo, tag);
          if (assets && assets.length) rel = { tag: tag, assets: assets };
        }
      } catch (_) {}
      if (!rel) {
        let rj = null; try { rj = await getJSON('https://api.github.com/repos/' + src.repo + '/releases/latest'); } catch (_) {}
        if (!rj || rj.__status === 403 || !Array.isArray(rj.assets) || !rj.assets.length) {
          let list = null; try { list = await getJSON('https://api.github.com/repos/' + src.repo + '/releases?per_page=5'); } catch (_) {}
          rj = Array.isArray(list) ? list.find(r => (r.assets || []).length) : null;
        }
        if (!rj || !Array.isArray(rj.assets) || !rj.assets.length) continue;
        rel = { tag: rj.tag_name, assets: rj.assets.map(a => ({ name: a.name, url: a.browser_download_url, size: a.size })) };
      }
      // the official package is a single .zip like dgVoodoo2_83_1.zip
      // pick the main package: dgVoodoo2_XX_X.zip - NOT the _dbg / _dev64 / API-only variants
      const asset = rel.assets.find(a => /^dgvoodoo2?_[\d_]+\.zip$/i.test(a.name))
        || rel.assets.find(a => /dgvoodoo/i.test(a.name) && /\.zip$/i.test(a.name) && !/(dbg|dev\d*|api)/i.test(a.name))
        || rel.assets.find(a => /\.zip$/i.test(a.name) && !/(dbg|dev\d*|api)/i.test(a.name));
      if (!asset) continue;
      const dir = coreDir(id, rel.tag || 'latest'); const stamp = path.join(dir, '.ok');
      if (fs.existsSync(stamp) && (fs.existsSync(path.join(dir, 'MS')) || findFileRec(dir, /^dgVoodooCpl\.exe$/i))) return { dir, tag: rel.tag, cached: true };
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      const tmp = path.join(os.tmpdir(), 'dgv-' + Date.now() + '.zip');
      onProgress && onProgress({ label: 'dgVoodoo2 ' + (rel.tag || ''), phase: 'download', pct: 0 });
      await downloadWithMirrors(asset.url, tmp, onProgress, 'dgVoodoo2 ' + (rel.tag || ''));
      await extractArchive(tmp, dir); fs.writeFileSync(stamp, new Date().toISOString());
      try { fs.unlinkSync(tmp); } catch (_) {}
      return { dir, tag: rel.tag || 'latest', cached: false };
    } catch (e) { lastErr = e; }
  }
  throw new Error('Could not download dgVoodoo2 from its official mirrors' + (lastErr ? (' — ' + (lastErr.message || lastErr)) : '') + '. Check your connection or add a GitHub token in Settings.');
}

/**
 * Install dgVoodoo2 into a game to convert its legacy DirectX to DX11, so DX11-class mods (geo-11,
 * ReShade add-ons, etc.) can run. Places the correct DLL for the game's API + bitness next to the exe
 * (no MS subfolder), plus dgVoodooCpl.exe and a DX11-tuned dgVoodoo.conf. Records everything in the
 * manifest so uninstall is exact. Returns { ok, files, dlls, bit, note }.
 */
async function setupDgVoodoo(game, onProgress, opts) {
  opts = opts || {};
  const base = gameBase(game);
  if (!base) return { ok: false, note: 'This game has no folder on disk.' };
  const core = await ensureDgVoodoo(onProgress);
  // dgVoodoo ships DLLs under MS\x86 and MS\x64 — pick by the GAME's bitness (app type, not OS).
  const bit = (game && game.bit === 'x64') ? 'x64' : 'x86';
  const msRoot = (() => {
    for (const c of [path.join(core.dir, 'MS'), core.dir]) { try { if (fs.existsSync(path.join(c, bit))) return c; } catch (_) {} }
    // some packages nest under a version folder
    try { for (const e of fs.readdirSync(core.dir, { withFileTypes: true })) { if (e.isDirectory() && fs.existsSync(path.join(core.dir, e.name, 'MS', bit))) return path.join(core.dir, e.name, 'MS'); } } catch (_) {}
    return path.join(core.dir, 'MS');
  })();
  const srcBitDir = path.join(msRoot, bit);
  if (!fs.existsSync(srcBitDir)) return { ok: false, note: 'dgVoodoo ' + bit + ' folder not found in the download (looked in ' + srcBitDir + ').' };

  const written = [];
  // 1) copy the API-appropriate DLL(s) straight into the game folder (NO MS/x86 subfolder)
  const dlls = dgVoodooDllsFor(game && game.api);
  { const own = proxySlotOwner(game, 'dgvoodoo', dlls.map(d => d.toLowerCase()));
    if (own) return { ok: false, conflict: own.id,
      note: 'dgVoodoo2 needs ' + dlls.join('/') + ', but ' + ((MODS[own.id] || {}).name || own.id) + ' already owns that entry point. '
          + 'Uninstall it first - two wrappers cannot share a DirectX DLL.' }; }
  if (!dlls.length) {
    return { ok: false, note: 'dgVoodoo2 only wraps DirectX 1-9 and Glide. This game uses '
      + (((game && game.api) || [])[0] || 'a modern API') + ', which already runs natively on DX11-class mods.' };
  }
  /* Copy the WHOLE wrapper set for this bitness, not just the one DLL the detected API needs.
   * A game reported as DX9 will often also create a DirectDraw or Direct3D 8 device somewhere
   * (intros, movie playback, older subsystems), and dgVoodoo can only wrap what it is present for.
   * Shipping the full MS\<bit> set beside the real executable is what Dege's own instructions say
   * to do, and it costs a few hundred KB. The 3Dfx/Glide tree stays out unless the game needs it. */
  /* On a DX9 game ReShade proxies d3d9.dll, and dgVoodoo2's wrapper is also called D3D9.dll - the
   * same filename, two different DLLs. Installing dgVoodoo over the top silently replaces ReShade's
   * proxy and both stop working. Detect it and say so instead of clobbering; ReShade can move to
   * dxgi AFTER conversion, but it cannot share d3d9.dll before it. */
  {
    const clash = proxySlotOwner(game, 'dgvoodoo', dlls.map(d => String(d).toLowerCase()));
    if (clash && clash.id !== 'dgvoodoo') {
      const other = (MODS[clash.id] || {}).name || clash.id;
      log.app.warn('dgVoodoo2 refused: ' + clash.file + ' is owned by ' + clash.id, { game: game && game.n });
      return { ok: false, conflict: clash.id,
        note: 'dgVoodoo2 needs ' + clash.file + ', but ' + other + ' already owns that file for this game. '
            + 'On a DirectX 9 title both want the same entry point, so they cannot coexist. '
            + 'Uninstall ' + other + ' first, convert with dgVoodoo2, then reinstall ' + other
            + ' - it will use the DirectX 11 path afterwards.' };
    }
  }

  const copiedDlls = [];
  const wanted = new Set(dlls.map(d => d.toLowerCase()));
  let available = [];
  try { available = fs.readdirSync(srcBitDir).filter(f => /\.dll$/i.test(f)); } catch (_) {}
  for (const from of available) {
    const dest = path.join(base, from);
    try { if (fs.existsSync(dest)) fs.copyFileSync(dest, dest + '.bak'); } catch (_) {}
    try {
      fs.copyFileSync(path.join(srcBitDir, from), dest);
      written.push(from);
      if (wanted.has(from.toLowerCase())) copiedDlls.push(from);   // the one the API actually needs
    } catch (_) {}
  }
  if (!copiedDlls.length) {
    // The x64 package only ships D3D9.dll. But DirectX 7/8 predate 64-bit gaming entirely, so a title
    // reported as DX7/DX8 + 64-bit is almost always a bitness misdetection - say so, since overriding
    // the bitness in the picker is what actually fixes it.
    const legacyApi = /^(DX[5-8]|DDRAW)$/i.test(String((game.api || [])[0] || ''));
    if (bit === 'x64' && legacyApi) {
      return { ok: false, misdetect: true,
        note: 'This game is listed as ' + ((game.api || [])[0] || 'legacy DirectX') + ' but 64-bit, and DirectX 7/8 titles are always 32-bit '
            + '- the bitness was probably detected wrong. Set Bitness to 32-bit in the picker above the game name, then convert again. '
            + '(dgVoodoo2\u2019s 64-bit package only ships D3D9.dll.)' };
    }
    return { ok: false, note: 'dgVoodoo2 has no ' + dlls.join('/') + ' in its ' + bit + ' package'
      + (bit === 'x64' ? ' (the 64-bit build only ships D3D9.dll).' : '.') };
  }

  // 2) copy the control panel exe (handy) and write a DX11-tuned conf
  /* The package ships dgVoodooCpl.exe at the root (x86) AND under Cpl\arm64. A plain recursive
   * search can return the ARM64 one depending on directory order, which would be useless on an
   * x86/x64 machine. Prefer the root copy, then an explicitly x86/x64 one, and only then anything. */
  const cpl = (() => {
    const rootCpl = path.join(core.dir, 'dgVoodooCpl.exe');
    if (fs.existsSync(rootCpl)) return rootCpl;
    for (const sub of [path.join('Cpl', bit), path.join('Cpl', 'x64'), path.join('Cpl', 'x86')]) {
      const p = path.join(core.dir, sub, 'dgVoodooCpl.exe');
      if (fs.existsSync(p)) return p;
    }
    // last resort: a recursive find, but never an ARM build on an Intel/AMD machine
    const any = findFileRec(core.dir, /^dgVoodooCpl\.exe$/i);
    return (any && /arm/i.test(any)) ? null : any;
  })();
  if (cpl) { try { fs.copyFileSync(cpl, path.join(base, 'dgVoodooCpl.exe')); written.push('dgVoodooCpl.exe'); } catch (_) {} }
  try { fs.writeFileSync(path.join(base, 'dgVoodoo.conf'), dgVoodooConf(opts)); written.push('dgVoodoo.conf'); } catch (_) {}

  // 3) record in the manifest (own mod id) so it can be cleanly removed
  const m = readManifest(game); const now = new Date().toISOString();
  m.mods.dgvoodoo = { tag: core.tag || 'latest', files: written, when: now, api: (game.api && game.api[0]) || null, bit, dlls: copiedDlls };
  addHistory(m, 'dgvoodoo', core.tag, 'dgVoodoo2 ' + copiedDlls.join('+') + ' (' + bit + ') \u2014 legacy DX \u2192 DX11');
  writeManifest(game, m);

  return { ok: true, files: written, dlls: copiedDlls, bit, tag: core.tag,
    note: 'dgVoodoo2 ' + copiedDlls.join(' + ') + ' (' + bit + ') installed \u2192 game now presents as DirectX 11. Install ReShade / geo-11 for DX10/11/12 next.' };
}

function applyDx9Proxy(game, opts) {

  opts = opts || {};
  if (!isDx9(game)) return { ok: false, note: 'This is not a D3D9 game — the geod3d9 proxy is only for Direct3D 9 titles.' };
  const m = readManifest(game);
  const hasSuper = !!m.mods.supervrexport, hasGeo = !!m.mods.geovrexport;
  if (!hasSuper && !hasGeo) return { ok: false, note: 'Install SuperVrExport (SuperDepth3D) or GeoVrExport (Geo3D) first, then apply the D3D9 proxy.' };
  const px = setupDx9VrProxy(game, opts);
  if (!px.ok) return px;
  // attribute the proxy + moved files to the mods that are present, so uninstalling them cleans up too
  const applied = [];
  const attachTo = (modId) => {
    if (!m.mods[modId]) return;
    const set = new Set(m.mods[modId].files || []);
    px.files.forEach(f => set.add(f));
    m.mods[modId].files = [...set];
    m.mods[modId].dx9Proxy = true;
    applied.push(modId);
  };
  // record under the VR addon + its locked 3D mod + reshade (all moved into ReShade\)
  if (hasSuper) { attachTo('supervrexport'); attachTo('sd3d'); }
  if (hasGeo) { attachTo('geovrexport'); attachTo('geo3d'); attachTo('geo3d_legacy'); }
  attachTo('reshade');
  addHistory(m, applied[0] || 'reshade', null, 'D3D9 geod3d9 proxy applied (manual)');
  writeManifest(game, m);
  return { ok: true, files: px.files, note: px.note, applied };
}

function setupDx9VrProxy(game, opts) {
  opts = opts || {};
  const base = gameBase(game);
  const bit = (game && game.bit === 'x64') ? '64' : '32';   // most D3D9 games are 32-bit
  const geo = bundledFile('bundled/vrexport', 'geod3d9.dll');
  if (!geo) return { ok: false, note: 'geod3d9.dll is missing from this build (bundled/vrexport/).' };
  const written = [];
  const reshadeDir = path.join(base, 'ReShade');
  try { fs.mkdirSync(reshadeDir, { recursive: true }); } catch (_) {}

  // 1) Move an existing ReShade d3d9.dll (and its ini/preset/addons) from beside the exe INTO ReShade\.
  //    (installReShade may have just placed d3d9.dll next to the exe; the proxy must own that slot.)
  const moveIntoReshade = (name) => {
    const from = path.join(base, name), to = path.join(reshadeDir, name);
    try { if (fs.existsSync(from)) { fs.copyFileSync(from, to); fs.unlinkSync(from); written.push(path.join('ReShade', name)); return true; } } catch (_) {}
    return false;
  };
  ['d3d9.dll', 'ReShade.ini', 'ReShadePreset.ini', 'GeoVrExport.addon32', 'GeoVrExport.addon64',
   'SuperVrExport.addon32', 'SuperVrExport.addon64', 'Geo3D.addon32', 'Geo3D.addon64'].forEach(moveIntoReshade);

  // 2) ReShade.ini now lives in ReShade\ but the shaders/preset stay in the game root, so its relative
  //    search paths must point UP one level (..\) or ReShade won't find the shaders after the move.
  const movedIni = path.join(reshadeDir, 'ReShade.ini');
  try {
    if (fs.existsSync(movedIni)) {
      const c = cfg.readConfig(movedIni); const gen = (c.sections && c.sections.GENERAL) || {};
      gen.EffectSearchPaths = '..\\reshade-shaders\\Shaders\\**';
      gen.TextureSearchPaths = '..\\reshade-shaders\\Textures\\**';
      if (gen.PresetPath && /^\.\\/.test(gen.PresetPath)) gen.PresetPath = gen.PresetPath.replace(/^\.\\/, '..\\');
      cfg.writeConfig(movedIni, { GENERAL: gen });
    }
  } catch (_) {}

  // 3) The proxy is the ONLY DirectX dll beside the exe. The shipped file is named geod3d9.dll; per the
  //    README it MUST be renamed to d3d9.dll beside the exe so the game loads it as its D3D9 entry point.
  //    We copy the bundled geod3d9.dll straight to <game>\d3d9.dll (i.e. the rename happens here), and
  //    make sure no stray geod3d9.dll is left lying beside the exe under its original name.
  const proxyDest = path.join(base, 'd3d9.dll');
  try { if (fs.existsSync(proxyDest)) fs.copyFileSync(proxyDest, proxyDest + '.bak'); } catch (_) {}
  fs.copyFileSync(geo, proxyDest); written.push('d3d9.dll');           // geod3d9.dll  ->  d3d9.dll (renamed)
  try { const stray = path.join(base, 'geod3d9.dll'); if (fs.existsSync(stray)) fs.unlinkSync(stray); } catch (_) {}

  const warn = (bit === '64')
    ? ' NOTE: this is the 32-bit proxy; for a 64-bit D3D9 game rebuild geod3d9 with /MACHINE:X64 (see the addon\u2019s GeoD3D9Proxy README).'
    : '';
  return { ok: true, files: written, reshadeDir, bit,
    note: 'geod3d9.dll renamed to d3d9.dll beside ' + (game.exe || 'the game') + '; ReShade moved into ReShade\\ (chainloaded). Fast D3D9Ex shared path.' + warn };
}

/** The technique name declared inside a ReShade .fx file. Read it rather than guess: 3DToElse.fx
 *  declares `technique To_Else`, not `3DToElse`, so a guessed name would silently never enable. */
function fxTechniqueName(fxAbs, fallback) {
  try {
    const src = fs.readFileSync(fxAbs, 'utf8');
    const m = src.match(/^[ \t]*technique[ \t]+([A-Za-z_][A-Za-z0-9_]*)/m);
    if (m) return m[1];
  } catch (_) {}
  return fallback;
}

/** Add a shader to the active preset's enabled-technique list so it is ON without the user
 *  opening the ReShade overlay. Existing entries are preserved and never duplicated. */
function enableReShadeTechnique(game, fxRel, fallbackName) {
  try {
    const base = gameBase(game);
    const fxAbs = path.join(base, String(fxRel).replace(/[\\/]/g, path.sep));
    if (!fs.existsSync(fxAbs)) return null;
    const entry = fxTechniqueName(fxAbs, fallbackName) + '@' + path.basename(fxAbs);
    const preset = activePresetPath(game);
    let cur = {};
    try { cur = (cfg.readConfig(preset).sections || {})[''] || {}; } catch (_) {}
    const merge = (val) => {
      const list = String(val || '').split(',').map(x => x.trim()).filter(Boolean);
      if (!list.some(x => x.toLowerCase() === entry.toLowerCase())) list.push(entry);
      return list.join(',');
    };
    cfg.writeConfig(preset, { '': { Techniques: merge(cur.Techniques), TechniqueSorting: merge(cur.TechniqueSorting) } });
    return entry;
  } catch (_) { return null; }
}

/* Which shader section a freshly-created ReShade preset should be seeded with, per mod. */
const PRESET_SEED = { sd3d: '[SuperDepth3D.fx]\n', geo3d: '[3DToElse.fx]\n', geo3d_legacy: '[3DToElse.fx]\n' };
async function installReShade(core, game, onProgress, opts) {
  opts = opts || {};
  const base = gameBase(game);
  const api = (game && game.api) || ['DX11'];
  // Vulkan can't be injected with a DLL — ReShade installs itself as a Vulkan layer via its setup tool
  if (api[0] === 'Vulkan') {
    const file = core.file || findFileRec(core.dir, /ReShade_Setup.*\.exe$/i);
    return { ok: false, launch: true, file, note: 'Vulkan can\u2019t be injected via a DLL \u2014 ReShade must register a Vulkan layer. Launching the official setup tool: tick this game and enable Vulkan.' };
  }
  if (core.launch && core.file) return { ok: false, launch: true, file: core.file, note: 'Could not unpack the ReShade setup tool (' + (core.extractFailed || 'unknown') + ') \u2014 launching it so you can install manually.' };

  const bit = (game && game.bit === 'x86') ? '32' : '64';
  let dll = findFileRec(core.dir, new RegExp('^ReShade' + bit + '\\.dll$', 'i'));
  if (!dll) dll = findFileRec(core.dir, /^ReShade(64|32)\.dll$/i);
  if (!dll) {
    const file = core.file || findFileRec(core.dir, /ReShade_Setup.*\.exe$/i);
    return { ok: false, launch: !!file, file, note: 'ReShade DLL not found inside the download \u2014 launching the official setup tool instead.' };
  }
  const written = [];
  onProgress && onProgress({ label: 'ReShade', phase: 'install', pct: 40 });
  const name = reshadeDllName(game, base);
  const dest = path.join(base, name);
  try { if (fs.existsSync(dest)) fs.copyFileSync(dest, dest + '.bak'); } catch (_) {}
  fs.copyFileSync(dll, dest); written.push(name);

  // shaders + textures (official repo, already a managed core)
  let shaderDir = null;
  try { const sc = await ensureCore('reshade-shaders', game, onProgress, {}); shaderDir = effectiveRoot(sc.dir); } catch (_) {}
  if (shaderDir) {
    onProgress && onProgress({ label: 'ReShade shaders', phase: 'install', pct: 70 });
    const sSrc = fs.existsSync(path.join(shaderDir, 'Shaders')) ? path.join(shaderDir, 'Shaders') : null;
    const tSrc = fs.existsSync(path.join(shaderDir, 'Textures')) ? path.join(shaderDir, 'Textures') : null;
    if (sSrc) copyTree(sSrc, path.join(base, 'reshade-shaders', 'Shaders')).forEach(f => written.push(path.relative(base, f)));
    if (tSrc) copyTree(tSrc, path.join(base, 'reshade-shaders', 'Textures')).forEach(f => written.push(path.relative(base, f)));
  }
  // ReShade.ini pointing at those folders + the preset
  const presetName = opts.presetName || 'ReShadePreset.ini';
  const iniPath = path.join(base, 'ReShade.ini');
  cfg.writeConfig(iniPath, {
    GENERAL: {
      EffectSearchPaths: '.\\reshade-shaders\\Shaders\\**',
      TextureSearchPaths: '.\\reshade-shaders\\Textures\\**',
      PresetPath: '.\\' + presetName,
      PerformanceMode: '0'
    },
    // Open the ReShade overlay with SPACE instead of ReShade's default Home. Format is
    // <virtual-key>,<ctrl>,<shift>,<alt>; VK_SPACE is 0x20 = 32. Home is awkward to reach on
    // laptops and on compact keyboards, and it collides with a lot of games' own bindings.
    INPUT: { KeyOverlay: '32,0,0,0' }
  });
  written.push('ReShade.ini');
  const presetPath = path.join(base, presetName);
  if (!fs.existsSync(presetPath)) { fs.writeFileSync(presetPath, (opts.presetBody || '[SuperDepth3D.fx]\n') ); written.push(presetName); }
  onProgress && onProgress({ label: 'ReShade', phase: 'install', pct: 100 });
  return { ok: true, dll: name, api: api[0], bit: 'x' + (bit === '32' ? '86' : '64'), shaders: !!shaderDir, preset: presetName, files: written };
}


/* ---- keep the user's tuning across updates ------------------------------------------------
 * Re-installing a mod overwrites its config files with the author's defaults. Snapshot the
 * user's real values first (relative paths, so they survive), then re-apply any key that still
 * exists afterwards. Keys the new version dropped are simply skipped; new keys keep their new
 * defaults. Every install is also appended to the manifest's history.                        */
function snapshotModConfig(game, modId) {
  try {
    const base = gameBase(game);
    const r = readModAnalyzed(game, modId);
    return (r.settings || []).map(x => ({ rel: path.relative(base, x.file), section: x.section, key: x.key, value: x.value }));
  } catch (_) { return []; }
}
function restoreModConfig(game, modId, snap) {
  if (!snap || !snap.length) return { restored: 0, skipped: 0 };
  let restored = 0, skipped = 0;
  try {
    const base = gameBase(game);
    const now = readModAnalyzed(game, modId);
    const edits = [];
    for (const s of snap) {
      const abs = path.join(base, s.rel);
      const hit = (now.settings || []).find(x => x.key === s.key && x.section === s.section && path.resolve(x.file) === path.resolve(abs));
      if (!hit) {
        // The key isn't in the author's fresh config. That used to mean "drop the user's value", which
        // silently threw away tuning for every key the app doesn't ship a default for (3DVision4All's
        // [stereo] separation, say). Re-add it instead: the file still exists, and a mod ignores keys
        // it doesn't recognise, so keeping the user's intent is strictly safer than losing it.
        let exists = false; try { exists = fs.existsSync(abs); } catch (_) {}
        if (!exists) { skipped++; continue; }
        edits.push({ file: abs, section: s.section, key: s.key, value: s.value }); restored++;
        continue;
      }
      if (String(hit.value) === String(s.value)) { restored++; continue; }   // already identical
      edits.push({ file: abs, section: s.section, key: s.key, value: s.value }); restored++;
    }
    if (edits.length) writeAnalyzed(game, edits);
  } catch (_) {}
  return { restored, skipped };
}
function addHistory(m, modId, tag, note) {
  m.history = m.history || [];
  m.history.push({ mod: modId, tag: tag || null, when: new Date().toISOString(), note: note || null });
  if (m.history.length > 200) m.history = m.history.slice(-200);
  return m;
}


/** Apply the one-click output choice to the mod's REAL config:
 *  geo-11 -> d3dxdm.ini [Device] direct_mode ; Geo3D/SD3D -> the preset's shader section
 *  Stereoscopic_Mode ; wiz3D is handled by its own installer branch (OutputMethodDll).
 *  The VR options are add-on driven (GeoVrExport / SuperVrExport) and need no config write. */
function applyOutput(modId, game, output) {
  try {
    const list = (MOD_OUTPUTS || {})[modId]; if (!list || !output) return null;
    const o = list.find(x => x.k === output); if (!o) return null;
    if (o.addon) return { output, addon: o.addon };            // VR export add-on: nothing to write
    if (!o.apply) return null;
    const mod = MODS[modId] || {};
    const section = o.fx ? o.fx : 'Device';                    // preset uses the shader name as its section
    // Route through modSectionFile so shader uniforms land in the ACTIVE PRESET, not ReShade.ini.
    // Geo3D's configFile is ReShade.ini (correct for its own [Geo3D] block), but ReShade reads
    // 3DToElse.fx's uniforms from the preset - writing them to ReShade.ini did nothing at all.
    const file = modSectionFile(game, modId, section) || resolveConfigPath(mod, game); if (!file) return null;
    const patch = {}; patch[section] = Object.assign({}, o.apply);
    cfg.writeConfig(file, patch);
    return { output, file: path.basename(file), section, set: o.apply };
  } catch (_) { return null; }
}

/** Files only ONE mod can own per game: the graphics entry points, plus the NVIDIA stereo shim
 *  (geo-11 and wiz3D each ship their own nvapi64.dll - two stereo drivers cannot share it). */
const PROXY_SLOTS = /^(d3d(7|8|9|10|11|12)\.dll|dxgi\.dll|ddraw\.dll|d3dimm\.dll|opengl32\.dll|nvapi(64)?\.dll)$/i;
/** Which other mod (if any) already owns one of `wanted` in a slot matched by `re`. */
function slotOwner(game, modId, wanted, re) {
  try {
    const m = readManifest(game);
    const want = new Set((wanted || []).map(f => String(f).toLowerCase()));
    for (const [id, rec] of Object.entries(m.mods || {})) {
      if (id === modId) continue;
      for (const f of (rec.files || [])) {
        const base = String(f).split(/[\\/]/).pop().toLowerCase();
        if (re.test(base) && want.has(base)) return { id, file: base };
      }
    }
  } catch (_) {}
  return null;
}
/** Which other mod (if any) already owns a graphics entry point / NVIDIA shim this mod needs. */
function proxySlotOwner(game, modId, wanted) { return slotOwner(game, modId, wanted, PROXY_SLOTS); }

/** Loader/hook DLLs that mods use as an injection point. Only one mod can own each per game.
 *  3DVision4All uses one of these as its proxy; ASI-loader based 6DOF mods ship dinput8.dll too. */
/** Every filename (basename only) inside a directory tree - used for collision pre-checks. */
function listFilesShallow(dir) {
  const out = [];
  const walk = (d, depth) => { if (depth > 4) return;
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) { if (e.isDirectory()) walk(path.join(d, e.name), depth + 1); else out.push(e.name); } };
  walk(dir, 0); return out;
}

const LOADER_SLOTS = /^(dinput8|winmm|version|dsound|xinput1_3|xinput1_4)\.dll$/i;

/**
 * If another mod is about to claim the loader DLL 3DVision4All is using, move v4a to its next free
 * alternate rather than letting one silently overwrite the other. v4a ships four interchangeable
 * proxy names for exactly this reason. Returns the new proxy name, or null if nothing to do.
 */
/**
 * Move an installed ReShade from d3d11.dll to dxgi.dll.
 *
 * ReShade hooks the swapchain either way, so on DX10/11/12 the two entry points are equivalent -
 * but only d3d11.dll works for geo-11. Renaming frees the slot without reinstalling anything, and
 * the manifest is updated so a later uninstall still removes the right file.
 */
function rehomeReShadeToDxgi(game) {
  const base = gameBase(game);
  const from = path.join(base, 'd3d11.dll'), to = path.join(base, 'dxgi.dll');
  try {
    if (!fs.existsSync(from)) return { ok: false, why: 'no d3d11.dll present' };
    if (fs.existsSync(to)) return { ok: false, why: 'dxgi.dll is already taken' };
    fs.renameSync(from, to);
  } catch (e) { return { ok: false, why: String(e.message || e) }; }
  // Sidecar marker: survives whatever the in-flight install writes to the manifest afterwards.
  try {
    const dir = path.join(base, '.stereoscope');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'reshade-dxgi.json'),
      JSON.stringify({ from: 'd3d11.dll', to: 'dxgi.dll', when: new Date().toISOString() }, null, 2));
  } catch (_) {}
  try {
    const m = readManifest(game) || { mods: {} };
    const rec = (m.mods || {}).reshade;
    if (rec) {
      rec.files = Array.isArray(rec.files) ? rec.files : [];
      const had = rec.files.some(f => /(^|[\\/])d3d11\.dll$/i.test(String(f)));
      rec.files = rec.files.map(f => (/(^|[\\/])d3d11\.dll$/i.test(String(f))
        ? String(f).replace(/d3d11\.dll$/i, 'dxgi.dll') : f));
      // If the DLL wasn't recorded (an adopted install, say), add it now - otherwise uninstalling
      // ReShade would leave the renamed dxgi.dll behind for the next mod to trip over.
      if (!had && !rec.files.some(f => /(^|[\\/])dxgi\.dll$/i.test(String(f)))) rec.files.push('dxgi.dll');
      rec.rehomed = 'd3d11.dll -> dxgi.dll';
      rec.dll = 'dxgi.dll';
      writeManifest(game, m);
    }
  } catch (_) {}
  return { ok: true, from: 'd3d11.dll', to: 'dxgi.dll' };
}

function rehomeV4aProxy(game, incomingFiles, liveManifest) {
  try {
    // Operate on the caller's manifest object when given one - install() reads the manifest before
    // this runs and writes it back afterwards, so a separate read/write here would be overwritten.
    const m = liveManifest || readManifest(game);
    const rec = m.mods && m.mods.v4a;
    if (!rec || !rec.v4aProxy) return null;
    const cur = String(rec.v4aProxy).toLowerCase();
    const wanted = new Set((incomingFiles || []).map(f => String(f).split(/[\\/]/).pop().toLowerCase()));
    if (!wanted.has(cur)) return null;                       // no collision
    const base = gameBase(game);
    const list = (MODS.v4a && MODS.v4a.v4aProxies) || ['dinput8.dll', 'winmm.dll', 'version.dll', 'dsound.dll'];
    const free = list.find(c => {
      const lc = c.toLowerCase();
      if (lc === cur || wanted.has(lc)) return false;
      try { return !fs.existsSync(path.join(base, c)); } catch (_) { return false; }
    });
    if (!free) return null;
    // move the file and re-point the manifest
    const from = path.join(base, rec.v4aProxy), to = path.join(base, free);
    try { if (fs.existsSync(from)) { fs.copyFileSync(from, to); fs.unlinkSync(from); } } catch (_) { return null; }
    rec.files = (rec.files || []).map(f => (String(f).toLowerCase() === cur ? free : f));
    const wasProxy = rec.v4aProxy;
    rec.v4aProxy = free;
    addHistory(m, 'v4a', rec.tag, 'proxy moved ' + wasProxy + ' -> ' + free + ' (loader slot taken by another mod)');
    if (!liveManifest) writeManifest(game, m);   // caller persists when it owns the object
    return free;
  } catch (_) { return null; }
}

/** A legacy game with dgVoodoo2 installed is presented to mods as DirectX 11. */
function effectiveApi(game) {
  const api = (game && game.api) || [];
  try {
    const m = readManifest(game);
    if (m.mods && m.mods.dgvoodoo && api.some(a => /^(DX[5-9]|DDRAW|GLIDE)$/i.test(String(a)))) return ['DX11'];
  } catch (_) {}
  return api;
}
/** Can this mod actually drive this game's (effective) API? Mods absent from MOD_API are agnostic. */
function modSupportsApi(modId, game) {
  const allowed = MOD_API[modId];
  if (!allowed) return { ok: true };
  const api = effectiveApi(game);
  if (!api.length) return { ok: true };                       // unknown API - don't block
  const hit = api.some(a => allowed.includes(String(a).toUpperCase()) || allowed.includes(String(a)));
  return hit ? { ok: true } : { ok: false, api: api[0], allowed };
}

/* ---- single-owner invariant ---------------------------------------------------------------
 * Two mods can ship the same payload (Geo3D latest vs the bundled Legacy build; the standalone
 * GeoVRExport add-on vs the copy Legacy Geo3D bundles). If both record the same path, uninstalling
 * either deletes files the other still needs and the manifest stops describing the disk. So exactly
 * one mod owns each path:
 *   - identical boilerplate (license/readme/changelog/credits) -> the FIRST placer keeps it
 *   - real payload files -> ownership TRANSFERS to whoever just wrote them, since that copy is what
 *     is actually on disk now. The previous owner drops the claim and the move is logged.
 * Applied to the mod itself AND to every locked add-on / loader placed alongside it. */
const GENERIC_DOCS_RE = /^(licen[sc]e|readme|changelog|credits)(\.[a-z0-9]+)?$/i;
function claimFiles(m, modId, files, log) {
  const claimedBy = new Map();
  for (const [id, rec] of Object.entries(m.mods || {})) {
    if (id === modId) continue;
    for (const f of (rec.files || [])) claimedBy.set(String(f).toLowerCase(), id);
  }
  const docsKept = []; const transferred = new Map();
  const kept = (files || []).filter(f => {
    const key = String(f).toLowerCase();
    const prev = claimedBy.get(key);
    if (!prev) return true;
    if (GENERIC_DOCS_RE.test(String(f).split(/[\\/]/).pop())) { docsKept.push(f); return false; }
    const list = transferred.get(prev) || []; list.push(key); transferred.set(prev, list);
    return true;
  });
  for (const [prevId, keys] of transferred) {
    const rec = m.mods[prevId]; if (!rec) continue;
    const drop = new Set(keys);
    rec.files = (rec.files || []).filter(f => !drop.has(String(f).toLowerCase()));
    addHistory(m, prevId, rec.tag, 'released ' + keys.length + ' file(s) to ' + modId + ' (overwritten)');
    if (log) log.push('\u2139 ' + (MODS[modId] ? MODS[modId].name : modId) + ' took over ' + keys.length + ' file(s) from ' + ((MODS[prevId] || {}).name || prevId));
  }
  if (log && docsKept.length) log.push('\u2139 ' + docsKept.length + ' shared doc file(s) left owned by the mod that placed them');
  return kept;
}

/** Thin wrapper so every filesystem failure reaches the user as an explanation rather than an errno.
 *  A half-written install is also rolled back, so a retry starts from a clean folder. */
async function install(modId, game, onProgress, opts) {
  const L = require('./logger');
  const t0 = Date.now();
  try {
    const r = await _installInner(modId, game, onProgress, opts);
    // Log the RESULT. Previously only the attempt was recorded, so a failed install left the log
    // looking as if nothing had happened at all.
    const files = ((r && r.files) || []).length;
    if (r && r.ok) L.app.info('install OK ' + modId, { ms: Date.now() - t0, files, tag: r.tag, dir: r.dir });
    else L.app.error('install FAILED ' + modId, { ms: Date.now() - t0,
      note: String((r && (r.note || r.error)) || 'no reason given').slice(0, 400),
      incompatible: !!(r && r.incompatible), conflict: !!(r && r.conflict),
      website: !!(r && r.website), envError: !!(r && r.envError) });
    return r;
  } catch (e) {
    if (e && e.antivirus) {
      try { uninstall(modId, game); } catch (_) {}
      require('./logger').app.error('install blocked by antivirus', { mod: modId, message: String(e.message) });
      return { ok: false, envError: true, kind: 'antivirus', code: 'EANTIVIRUS', note: String(e.message) };
    }
    require('./logger').app.error('install THREW ' + modId, { message: String((e && e.message) || e).slice(0, 400) });
    const cls = classifyFsError(e, (game && (game.exeDir || game.dir)) || '');
    if (cls) {
      try { uninstall(modId, game); } catch (_) {}     // never leave a partial install behind
      require('./logger').app.error('install failed: ' + cls.kind, { mod: modId, code: cls.code });
      return { ok: false, envError: true, kind: cls.kind, code: cls.code, note: cls.note };
    }
    throw e;
  }
}

async function _installInner(modId, game, onProgress, opts) {
  // Refuse a mod that cannot drive this game's API. The UI already greys these out, but the backend
  // must enforce it too: dropping wiz3D's dxgi.dll into a DX12 title is actively harmful (DX12 loads
  // dxgi), and geo-11's d3d11.dll in a Vulkan game is dead weight that only confuses later scans.
  // Preflight: fail fast and clearly when the folder can't be written, rather than part-way through.
  {
    const dir = (game && (game.exeDir || game.dir)) || null;
    const pf = dir ? preflightWritable(dir) : null;
    if (pf) {
      require('./logger').app.error('preflight failed: ' + pf.kind, { dir, code: pf.code });
      return { ok: false, envError: true, kind: pf.kind, code: pf.code, note: pf.note };
    }
    const free = dir ? freeSpace(dir) : null;
    if (free !== null && free < 64 * 1024 * 1024) {
      require('./logger').app.warn('low disk space before install', { dir, freeMB: Math.round(free / 1048576) });
      return { ok: false, envError: true, kind: 'diskfull',
        note: 'Only ' + Math.round(free / 1048576) + ' MB free on that drive — not enough room to install safely. Free up some space and try again.' };
    }
  }
  // dgVoodoo2 is not a normal mod: it needs the API/bitness-specific wrapper DLL, not the package.
  // Route it to its real installer instead of letting the generic placement copy everything.
  if (modId === 'dgvoodoo') return await setupDgVoodoo(game, onProgress, opts || {});

  let apiOverrideNote = null;
  {
    const sup = modSupportsApi(modId, game);
    // wiz3D and 3DVision4All are proxy WRAPPERS - they hook whatever device the game creates, so a
    // hard refusal on a mis-detected API blocked setups that would have worked. Let them through
    // with a clear warning. The geometric mods stay gated: they genuinely can't run on the wrong API.
    const FORCEABLE = { wiz3d: 1, v4a: 1 };
    if (!sup.ok && FORCEABLE[modId]) {
      apiOverrideNote = ((MODS[modId] || {}).name || modId) + ' does not list ' + sup.api
        + ' as supported \u2014 installing anyway, since it wraps whatever the game creates.'
        + ' If 3D does not engage, correct the Render API above and reinstall.';
    } else if (!sup.ok) {
      const nm = (MODS[modId] || {}).name || modId;
      const legacy = /^(DX[5-9]|DDRAW)$/i.test(String(sup.api || ''));
      return { ok: false, incompatible: true, api: sup.api,
        note: nm + ' does not support ' + sup.api + ' (it drives ' + sup.allowed.join('/') + ').'
            + (legacy ? ' Convert the game to DirectX 11 with dgVoodoo2 first, then install it.'
                      : ' Try SuperDepth3D, which works on any API.') };
    }
  }

  opts = opts || {};
  const mod = MODS[modId]; if (!mod) throw new Error('unknown mod ' + modId);
  if (!game || !game.dir) throw new Error('game has no folder on disk');
  const log = [];
  require('./logger').app.info('install ' + modId, { game: (game && (game.n || game.folder)) || '?', api: (game && game.api) || [], bit: game && game.bit, output: opts && opts.output, version: opts && opts.version });
  if (apiOverrideNote) log.push('\u26a0 ' + apiOverrideNote); const m = readManifest(game); const now = new Date().toISOString();
  // updating (or re-installing) over an existing copy → keep the user's tuned config values
  const isUpdate = !!(m.mods && m.mods[modId]);
  const prevTag = isUpdate ? m.mods[modId].tag : null;
  const keepCfg = (opts.preserveConfig === false) ? [] : (isUpdate ? snapshotModConfig(game, modId) : []);

  // guided installs (ReShade, dgVoodoo2, the 6DOF hub) — open the official source, don't place files
  if (mod.guide) {
    const s = CORE_BY_ID[modId];
    const url = (typeof mod.site === 'function' ? mod.site(game.n) : mod.site) || (s && s.url);
    return { ok: false, website: true, url, note: mod.note || (s && s.note), nexus: typeof mod.nexus === 'function' ? mod.nexus(game.n) : null };
  }

  let core;
  try { core = await ensureCore(modId, game, onProgress, opts); }
  catch (e) {
    // per-game head-tracking with no resolvable release → open the source instead of failing
    if (mod.perGame || mod.headTracking) {
      const repo = typeof mod.repo === 'function' ? mod.repo(game.n) : null;
      const url = repo ? 'https://github.com/' + repo : ((typeof mod.site === 'function' ? mod.site(game.n) : mod.site) || (typeof mod.nexus === 'function' ? mod.nexus(game.n) : null));
      return { ok: false, website: true, url,
        nexus: typeof mod.nexus === 'function' ? mod.nexus(game.n) : null,
        note: 'No auto-download found for ' + (game.n || 'this game') + ' — opening the source (also check Nexus).' };
    }
    throw e;
  }

  // ReShade: fully automatic — right DLL for the detected API/bitness + shaders + textures + preset
  if (mod.install === 'reshade-auto') {
    const r = await installReShade(core, game, onProgress, opts);
    if (!r.ok) {
      if (r.launch && r.file) { m.mods[modId] = { tag: core.tag, files: [], when: now, installer: r.file }; writeManifest(game, m); }
      return { ok: false, launch: !!r.launch, file: r.file, note: r.note };
    }
    // A mod can write the same path more than once (geo-11 ships 32- and 64-bit trees that collapse
    // onto one destination). Record each file ONCE so ownership accounting and uninstall stay exact.
    const uniqFiles = [...new Set((r.files || []).map(f => String(f)))];
    m.mods[modId] = { tag: core.tag, files: uniqFiles, when: now, dll: r.dll };
    addHistory(m, modId, core.tag, isUpdate ? ('update from ' + prevTag) : 'install');
    writeManifest(game, m);
    const kept = restoreModConfig(game, modId, keepCfg);
    return { ok: true, tag: core.tag, files: r.files, kept,
      log: [ ...(typeof apiOverrideNote !== "undefined" && apiOverrideNote ? ["\u26a0 " + apiOverrideNote] : []), 'ReShade ' + core.tag + ' \u2192 ' + r.dll + '  (' + r.api + ' ' + r.bit + ')',
            r.shaders ? 'shaders + textures \u2192 reshade-shaders\\' : 'shaders skipped (offline)',
            'ReShade.ini + ' + r.preset + ' written'] };
  }

  if (mod.install === 'launch-installer') {
    m.mods[modId] = { tag: core.tag, files: [], when: now, installer: core.file };
    writeManifest(game, m);
    return { ok: true, launch: core.file, exe: game.exe, dir: game.dir, log: [ ...(typeof apiOverrideNote !== "undefined" && apiOverrideNote ? ["\u26a0 " + apiOverrideNote] : []), 'Launching ' + path.basename(core.file) + ' — point it at ' + game.exe + ' and pick the right API.'] };
  }
  if (core.website) { return { ok: false, website: true, url: core.url, note: core.note }; }

  // wiz3D — copy the release subfolder matching the game's API + bitness, then set the output method
  if (mod.install === 'wiz3d') {
    { // wiz3D claims the API entry point AND ships its own nvapi shim - check both, or a geo-11
      // install already on this game gets its nvapi64.dll silently overwritten.
      const want = [String((MODS.wiz3d.proxyDLL || (() => 'd3d9.dll'))(game.api || ['DX9'])).toLowerCase(),
                    'nvapi64.dll', 'nvapi.dll'];
      const own = proxySlotOwner(game, modId, want);
      if (own) return { ok: false, conflict: own.id,
        note: 'wiz3D needs ' + own.file + ', but ' + ((MODS[own.id] || {}).name || own.id) + ' already owns that file for this game. '
            + 'Only one stereo driver can own a DirectX entry point or the NVIDIA shim - uninstall ' + ((MODS[own.id] || {}).name || own.id) + ' first.' }; }
    const apiFolder = wizApiFolder(game); const bit = game.bit === 'x64' ? 'x64' : 'x86';
    const src = wizFindFolder(core.dir, apiFolder, bit, { tdv: !!(game && game.tdv) || opts.wizVariant === '3dvision' });
    if (!src) { return { ok: false, website: true, url: 'https://github.com/effcol/wiz3D/releases', note: 'Could not find a wiz3D build for ' + apiFolder + '/' + bit + ' in this release — grab it from the releases page (copy the ' + apiFolder + '/' + bit + ' folder next to the exe).' }; }
    const base = gameBase(game); const files = copyDir(src, base, base);
    const outMode = opts.wizOutput || opts.output || 'interlaced';   // callers pass opts.output
    const r = wizSetOutput(game, outMode);
    m.mods[modId] = { tag: core.tag, files, when: now, wizFolder: apiFolder + '/' + bit, wizOutput: outMode };
    addHistory(m, modId, core.tag, isUpdate ? ('update from ' + prevTag) : 'install');
    writeManifest(game, m);
    const keptW = restoreModConfig(game, modId, keepCfg);
    if (keptW.restored) log.push('\u2713 kept ' + keptW.restored + ' of your settings');
    return { ok: true, dir: base, kept: keptW, log: [ ...(typeof apiOverrideNote !== "undefined" && apiOverrideNote ? ["\u26a0 " + apiOverrideNote] : []), '\u2713 wiz3D ' + apiFolder + '/' + bit + ' \u2192 ' + files.length + ' file(s) next to ' + game.exe, r.ok ? ('\u2713 output = ' + (WIZ_OUTPUTS[outMode] ? WIZ_OUTPUTS[outMode].label : outMode)) : ('! ' + r.error)] };
  }

  // 3DVision4All — proxy-DLL wrapper like wiz3D. The release ships proxy DLL options (winmm/version/
  // dinput8/dsound); we copy ONE that isn't already taken (default dinput8.dll) + 3dvision4all.ini +
  // EnableWindowed3D.exe next to the exe, then write the chosen [stereo] mode. No ReShade / add-ons.
  if (mod.install === 'v4a') {
    const base = gameBase(game);
    // the release ships an x64 build and a Win32 build — pick the folder matching the game's bitness
    const want64 = game.bit === 'x64';
    const findBitRoot = () => {
      // look for a subfolder whose name signals the right bitness AND holds the ini
      const dirs = [];
      const walk = (d, depth) => { if (depth > 3) return; let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
        if (ents.some(e => e.isFile() && /^3dvision4all\.ini$/i.test(e.name))) dirs.push(d);
        for (const e of ents) if (e.isDirectory()) walk(path.join(d, e.name), depth + 1); };
      walk(core.dir, 0);
      if (!dirs.length) return null;
      const re64 = /(x64|win64|x86_64|amd64)/i, re32 = /(win32|x86|ia32)/i;
      const match = dirs.find(d => want64 ? re64.test(d) : (re32.test(d) && !re64.test(d)));
      return match || dirs[0];
    };
    const root = findBitRoot() || effectiveRoot(core.dir);
    const iniSrc = (() => { const f = path.join(root, '3dvision4all.ini'); return fs.existsSync(f) ? f : findFileRec(root, /^3dvision4all\.ini$/i); })();
    let proxyList = (MODS.v4a.v4aProxies || ['dinput8.dll', 'winmm.dll', 'version.dll', 'dsound.dll']);
    // A proxy we installed on a previous run is OURS, not an obstacle - reuse it. Without this, a
    // reinstall/update sees its own dinput8.dll as "taken", picks winmm.dll instead, and the game ends
    // up with two competing 3DVision4All proxies.
    const prevProxy = (m.mods[modId] || {}).v4aProxy || null;
    const ourFiles = new Set(((m.mods[modId] || {}).files || []).map(f => String(f).toLowerCase()));
    const taken = f => {
      try {
        if (prevProxy && f.toLowerCase() === String(prevProxy).toLowerCase()) return false;
        if (ourFiles.has(f.toLowerCase())) return false;
        return fs.existsSync(path.join(base, f));
      } catch (_) { return false; }
    };
    // pick the first proxy name the release actually ships AND that isn't already occupied in the game folder
    let proxyName = null, proxySrc = null;
    if (prevProxy) { proxyList = [prevProxy].concat(proxyList.filter(x => x.toLowerCase() !== String(prevProxy).toLowerCase())); }
    for (const cand of proxyList) {
      const src = (() => { try { return fs.readdirSync(root).find(f => f.toLowerCase() === cand.toLowerCase()); } catch (_) { return null; } })();
      if (src && !taken(cand)) { proxyName = cand; proxySrc = path.join(root, src); break; }
    }
    // Every preferred name is occupied. Before falling back to overwriting one, make sure we are not
    // about to clobber a loader that a mod THIS APP installed still depends on - a 6DOF ASI mod ships
    // its own dinput8.dll, and silently replacing it leaves that mod broken but still marked installed.
    if (!proxyName) {
      const shipped = proxyList.filter(cand => { try { return fs.readdirSync(root).some(f => f.toLowerCase() === cand.toLowerCase()); } catch (_) { return false; } });
      const own = slotOwner(game, modId, shipped, LOADER_SLOTS);
      if (own) return { ok: false, conflict: own.id,
        note: '3DVision4All needs ' + own.file + ', but ' + ((MODS[own.id] || {}).name || own.id)
            + ' already uses that loader for this game, and this release ships no alternate proxy name for '
            + (want64 ? 'x64' : 'x86') + '. Uninstall ' + ((MODS[own.id] || {}).name || own.id)
            + ' first, or install it after 3DVision4All so the app can move the proxy for you.' };
      for (const cand of proxyList) { const src = (() => { try { return fs.readdirSync(root).find(f => f.toLowerCase() === cand.toLowerCase()); } catch (_) { return null; } })(); if (src) { proxyName = cand; proxySrc = path.join(root, src); break; } }
    }
    if (!proxyName) return { ok: false, website: true, url: 'https://github.com/oneup03/3DVision4All/releases', note: 'No 3DVision4All proxy DLL found in the download — grab it from the releases page.' };
    const written = [];
    // 1) proxy DLL (renamed only if we chose an alternate; here we keep the shipped name)
    const proxyDest = path.join(base, proxyName);
    try { if (fs.existsSync(proxyDest)) fs.copyFileSync(proxyDest, proxyDest + '.bak'); } catch (_) {}
    fs.copyFileSync(proxySrc, proxyDest); written.push(proxyName);
    // 2) the ini + the EnableWindowed3D helper
    if (iniSrc) { const iniDest = path.join(base, '3dvision4all.ini'); try { if (fs.existsSync(iniDest)) fs.copyFileSync(iniDest, iniDest + '.bak'); } catch (_) {} fs.copyFileSync(iniSrc, iniDest); written.push('3dvision4all.ini'); }
    const helper = findFileRec(root, /^EnableWindowed3D\.exe$/i);
    if (helper) { try { fs.copyFileSync(helper, path.join(base, 'EnableWindowed3D.exe')); written.push('EnableWindowed3D.exe'); } catch (_) {} }
    // 3) seed the documented defaults, THEN the chosen output mode.
    //    (This branch returns before the generic DEFAULTS write, so [render] force_windowed /
    //     defeat_directflip were never actually applied and the config editor showed no [render].)
    if (DEFAULTS[modId]) { try { cfg.writeConfig(path.join(base, '3dvision4all.ini'), DEFAULTS[modId]); } catch (_) {} }
    const outMode = opts.v4aOutput || opts.output || 'sbs';
    const outDef = (MOD_OUTPUTS.v4a || []).find(o => o.k === outMode);
    if (outDef && outDef.apply) { try { cfg.writeConfig(path.join(base, '3dvision4all.ini'), { stereo: outDef.apply }); } catch (_) {} }
    m.mods[modId] = { tag: core.tag, files: written, when: now, v4aProxy: proxyName, v4aOutput: outMode };
    addHistory(m, modId, core.tag, isUpdate ? ('update from ' + prevTag) : 'install');
    writeManifest(game, m);
    const keptV = restoreModConfig(game, modId, keepCfg);
    if (keptV.restored) log.push('\u2713 kept ' + keptV.restored + ' of your settings');
    const pi = postInstallInfo(game, modId);
    const piLog = pi ? (pi.present
        ? ('\u26a0 REQUIRED NEXT: ' + pi.title + ' \u2014 stereo will not activate without it.')
        : ('\u26a0 ' + (MODS[modId].postInstall || {}).file + ' is missing from this build \u2014 grab it from the release zip.'))
      : null;
    return { ok: true, dir: base, kept: keptV, postInstall: pi || undefined,
      log: [ ...(typeof apiOverrideNote !== "undefined" && apiOverrideNote ? ["\u26a0 " + apiOverrideNote] : []), '\u2713 3DVision4All \u2192 ' + proxyName + ' + 3dvision4all.ini next to ' + game.exe,
            outDef ? ('\u2713 output = ' + outDef.label) : ('output = ' + outMode),
            'Nvidia GPU required \u2014 no ReShade / add-ons needed.'].concat(piLog ? [piLog] : []) };
  }

  // Before writing anything, make sure this mod isn't about to seize a file another mod already owns
  // (two stereo drivers both shipping nvapi64.dll, two wrappers both wanting d3d9.dll, ...).
  {
    const want = [];
    try {
      const eff = effectiveRoot(core.dir);
      const walk = (dir, depth) => { if (depth > 2) return; let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
        for (const e of ents) { if (e.isFile() && PROXY_SLOTS.test(e.name)) want.push(e.name.toLowerCase()); else if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1); } };
      walk(eff, 0);
    } catch (_) {}
    if (want.length) {
      let own = proxySlotOwner(game, modId, want);
      /* ReShade can hook through EITHER d3d11.dll or dxgi.dll. When it happens to hold d3d11.dll
       * and geo-11 arrives - which can only be d3d11.dll - the two used to be mutually exclusive
       * and the user had to uninstall ReShade. Move ReShade to dxgi.dll instead: same injection,
       * different entry point, and both mods end up installed. */
      if (own && own.id === 'reshade' && /^d3d11\.dll$/i.test(String(own.file || ''))) {
        const moved = rehomeReShadeToDxgi(game);
        if (moved.ok) {
          require('./logger').app.info('moved ReShade to dxgi.dll so ' + modId + ' can use d3d11.dll', moved);
          own = proxySlotOwner(game, modId, want);          // re-check now the slot is free
        } else {
          require('./logger').app.warn('could not move ReShade off d3d11.dll', moved);
        }
      }
      if (own) return { ok: false, conflict: own.id,
        note: (MODS[modId] ? MODS[modId].name : modId) + ' needs ' + own.file + ', but '
            + ((MODS[own.id] || {}).name || own.id) + ' already owns that file for this game. '
            + 'Only one mod can own a DirectX entry point or the NVIDIA stereo shim - uninstall '
            + ((MODS[own.id] || {}).name || own.id) + ' first.' };
    }
  }
  // Before writing, make sure we are not about to stomp 3DVision4All's loader DLL (6DOF ASI mods
  // ship dinput8.dll too). v4a has interchangeable proxy names, so move it instead of clobbering.
  try {
    const incoming = (core && core.dir) ? listFilesShallow(core.dir) : [];
    if (modId !== 'v4a' && incoming.some(f => LOADER_SLOTS.test(f))) {
      const moved = rehomeV4aProxy(game, incoming, m);
      if (moved) log.push('\u2713 moved 3DVision4All proxy to ' + moved + ' (this mod needs the original slot)');
    }
  } catch (_) {}
  // ---- host prerequisite -------------------------------------------------------------------
  // Mods that run INSIDE ReShade (Geo3D, Legacy Geo3D, SuperDepth3D) are useless without a working
  // host. Install the real thing first: the ReShade DLL matching this game's API + bitness, renamed
  // to a proxy name the game actually loads, plus reshade-shaders/ and a ReShade.ini pointing at it.
  // Doing it BEFORE placement means the mod's own defaults and preset land on top of a live host.
  const guidance = [];
  let hostLaunch = null;
  for (const hostId of (mod.needs || [])) {
    if (m.mods[hostId]) continue;                                   // already set up for this game
    const hostMod = MODS[hostId]; if (!hostMod) continue;
    try {
      const hc = await ensureCore(hostId, game, onProgress, opts);
      if (hc && hc.website) { guidance.push({ name: hostMod.name, url: hc.url, note: hc.note }); log.push('\u2192 install ' + hostMod.name + ' manually: ' + hc.url); continue; }
      const hr = await installReShade(hc, game, onProgress, { presetName: 'ReShadePreset.ini', presetBody: PRESET_SEED[modId] || '[SuperDepth3D.fx]\n' });
      if (hr.ok) {
        m.mods[hostId] = { tag: hc.tag, files: claimFiles(m, hostId, hr.files, log), when: now, dll: hr.dll };
        addHistory(m, hostId, hc.tag, 'installed as host for ' + modId);
        log.push('\u2713 ' + hostMod.name + ' ' + hc.tag + ' \u2192 ' + hr.dll + '  (' + hr.api + ' ' + hr.bit + ')'
               + (hr.shaders ? ' + shaders' : ''));
      } else {
        if (hr.launch && hr.file) { hostLaunch = hr.file; m.mods[hostId] = { tag: hc.tag, files: [], when: now, installer: hr.file }; }
        log.push('! ' + hostMod.name + ': ' + (hr.note || 'could not be installed automatically'));
        guidance.push({ name: hostMod.name, url: (CORE_BY_ID[hostId] || {}).site || 'https://reshade.me/', note: hr.note });
      }
    } catch (e) {
      log.push('! ' + hostMod.name + ': ' + String(e.message || e));
      guidance.push({ name: hostMod.name, url: (CORE_BY_ID[hostId] || {}).site || 'https://reshade.me/', note: String(e.message || e) });
    }
  }

  let allFiles = placeInto(core, game, mod);
  allFiles = claimFiles(m, modId, allFiles, log);
  log.push('\u2713 linked ' + allFiles.length + ' file(s) for ' + mod.name);

  // engine loader required by this mod (BepInEx / Ultimate ASI Loader / REFramework) — into the same game
  if (typeof mod.loader === 'function') {
    const loaderId = mod.loader(game.eng); const loaderMod = MODS[loaderId];
    if (loaderId && loaderMod) {
      if (loaderMod.guide) {
        const s = CORE_BY_ID[loaderId]; const url = loaderMod.site || (s && s.url);
        log.push('\u2192 install loader ' + loaderMod.name + ' manually: ' + url);
        guidance.push({ name: loaderMod.name, url, note: loaderMod.note });
      } else {
        try {
          const lc = await ensureCore(loaderId, game, onProgress);
          if (!lc.website) { const lf = claimFiles(m, loaderId, placeInto(lc, game, loaderMod), log); m.mods[loaderId] = { tag: lc.tag, files: lf, when: now, lockedBy: modId }; log.push('\u2713 + ' + loaderMod.name + ' (loader)'); }
        } catch (e) { log.push('! loader ' + loaderId + ': ' + String(e.message || e)); }
      }
    }
  }

  // locked addons / required tools installed into the same game (skip guided loaders/tools — the user installs those)
  for (const reqId of (mod.requires || [])) {
    const reqMod = MODS[reqId] || { place: { root: true } };
    if (reqMod.guide) { const s = CORE_BY_ID[reqId]; guidance.push({ name: reqMod.name, url: reqMod.site || (s && s.url), note: reqMod.note }); continue; }
    try {
      const rc = await ensureCore(reqId, game, onProgress);
      if (!rc.website) {
        // The add-on owns its own files. Don't also claim them for the parent - double ownership makes
        // uninstall ambiguous (both records would try to remove the same paths).
        const rf = claimFiles(m, reqId, placeInto(rc, game, reqMod), log);
        m.mods[reqId] = { tag: rc.tag, files: rf, when: now, lockedBy: modId };
        log.push('\u2713 + ' + (MODS[reqId] ? MODS[reqId].name : reqId) + ' (locked)');
      }
    } catch (e) { log.push('! ' + reqId + ': ' + String(e.message || e)); }
  }

  if (DEFAULTS[modId]) { const f = resolveConfigPath(mod, game); if (f) { cfg.writeConfig(f, DEFAULTS[modId]); log.push('\u2713 wrote ' + path.basename(f)); } }
  const outApplied = applyOutput(modId, game, opts.output);
  if (outApplied && outApplied.set) log.push('\u2713 output \u2192 ' + Object.entries(outApplied.set).map(([k, v]) => k + ' = ' + v).join(', ') + ' in ' + outApplied.file);
  else if (outApplied && outApplied.addon) log.push('\u2713 output \u2192 full-res VR via ' + ((MODS[outApplied.addon] || {}).name || outApplied.addon));

  // SuperVrExport forces SuperDepth3D into SBS + DoubleBuffer at startup (see its README). Seed those
  // exact values into the preset now so the state is correct before first launch and visible in our UI.
  // Fires when SuperVrExport is installed directly OR pulled in as a locked requirement of
  // SuperDepth3D (the normal path) - otherwise the full-res VR chain would never be armed.
  if (modId === 'supervrexport' || (mod.requires || []).includes('supervrexport') || m.mods.supervrexport) {
    try {
      const preset = activePresetPath(game) || path.join(gameBase(game), 'ReShadePreset.ini');
      // SuperVrExport wants SBS + DoubleBuffer, but only when the VR export IS the chosen output.
      // If the user picked a direct display mode (TAB / interlaced / checkerboard), leave it alone -
      // forcing SBS here would silently override the output they just selected.
      const vrPath = !opts.output || opts.output === 'vr_addon' || opts.output === 'vr' || opts.output === 'katanga';
      const seed = vrPath ? { Stereoscopic_Mode: '0', DoubleBuffer_Mode: '1' } : { DoubleBuffer_Mode: '1' };
      cfg.writeConfig(preset, { 'SuperDepth3D.fx': seed });
      // EX_DLP_FS_Mode / DoubleBuffer_Mode are preprocessor defines — record them in ReShade.ini too
      const ini = path.join(gameBase(game), 'ReShade.ini');
      const cur = cfg.readConfig(ini); const gen = (cur.sections && cur.sections.GENERAL) || {};
      const defs = String(gen.PreprocessorDefinitions || '');
      const need = ['EX_DLP_FS_Mode=1', 'DoubleBuffer_Mode=1'];
      const have = defs ? defs.split(',').map(x => x.trim()) : [];
      need.forEach(d => { const k = d.split('=')[0]; if (!have.some(h => h.startsWith(k))) have.push(d); });
      gen.PreprocessorDefinitions = have.filter(Boolean).join(',');
      cfg.writeConfig(ini, { GENERAL: gen });
      log.push('\u2713 SuperVrExport preset armed: Side-by-Side + DoubleBuffer (full-res SBS \u2192 KatangaVR)');
    } catch (_) {}
  }

  // D3D9 full-res VR: the VR-Export addons need an IDirect3DDevice9Ex for their fast GPU shared path.
  // The geod3d9.dll proxy setup is OPT-IN (manual only) — it rearranges the game folder (moves ReShade
  // into a subfolder), so it only runs when the user explicitly asks via opts.dx9Proxy, never automatically.
  if (opts.dx9Proxy && (modId === 'supervrexport' || modId === 'geovrexport') && isDx9(game)) {
    const px = setupDx9VrProxy(game, opts);
    if (px.ok) { allFiles = allFiles.concat(px.files); log.push('\u2713 D3D9 native fast path: ' + px.note); }
    else log.push('! D3D9 proxy: ' + px.note + ' (addon falls back to CPU staging — still works, just slower)');
  }
  m.mods[modId] = { tag: core.tag, files: allFiles, when: now, requires: mod.requires || [], combo3d: !!core.combo3d, asset: core.assetName || null };
  addHistory(m, modId, core.tag, (isUpdate ? ('update from ' + prevTag) : 'install') + (core.combo3d ? ' (3D+6DOF all-in-one)' : ''));
  writeManifest(game, m);
  // re-apply the user's tuning over the author's fresh defaults
  const kept = restoreModConfig(game, modId, keepCfg);
  if (kept.restored) log.push('\u2713 kept ' + kept.restored + ' of your settings' + (kept.skipped ? ' (' + kept.skipped + ' no longer exist)' : ''));
  if (core.combo3d) log.push('\u2713 all-in-one 3D + 6DOF \u2014 no separate stereoscopic 3D mod needed');
  /* Turn the shader ON so the effect is live on first launch instead of the user having to open the
   * ReShade overlay and tick it. For Geo3D we also set the conversion pair it is actually there to
   * do: geo-11/Geo3D hands ReShade a FRAME-SEQUENTIAL signal, and the useful default output is
   * Side-by-Side (what KatangaVR/VRScreenCap capture). Values come from 3DToElse.fx's own ui_items:
   *   Stereoscopic_Mode_Input : Off 0 | SbS 1 | TaB 2 | Line 3 | Checkerboard 4 | Frame Sequential 5
   *   Stereoscopic_Mode       : SbS 0 | TaB 1 | Line 2 | Column 3 | Checkerboard 4 | Anaglyph 5 */
  const AUTO_ENABLE = {
    sd3d:         { fx: 'reshade-shaders/Shaders/SuperDepth3D.fx', name: 'SuperDepth3D' },
    geo3d:        { fx: 'reshade-shaders/Shaders/3DToElse.fx', name: 'To_Else',
                    seed: { Stereoscopic_Mode_Input: '5', Stereoscopic_Mode: '0' } },
    geo3d_legacy: { fx: 'reshade-shaders/Shaders/3DToElse.fx', name: 'To_Else',
                    seed: { Stereoscopic_Mode_Input: '5', Stereoscopic_Mode: '0' } }
  };
  if (AUTO_ENABLE[modId]) {
    const ae = AUTO_ENABLE[modId];
    if (ae.seed) {
      // don't fight an explicit output choice - only fill what applyOutput didn't already set
      const fxSec = path.basename(ae.fx);
      let have = {};
      try { const p2 = activePresetPath(game); const sc = cfg.readConfig(p2).sections || {};
        const k = Object.keys(sc).find(x => x.toLowerCase() === fxSec.toLowerCase()); have = k ? sc[k] : {}; } catch (_) {}
      const patch = {};
      for (const [k, v] of Object.entries(ae.seed)) if (have[k] === undefined) patch[k] = v;
      if (Object.keys(patch).length) { try { cfg.writeConfig(activePresetPath(game), { [fxSec]: patch }); } catch (_) {} }
    }
    const on = enableReShadeTechnique(game, ae.fx, ae.name);
    if (on) log.push('\u2713 enabled ' + on + ' \u2014 active on first launch');
  }

  if (guidance.length) return { ok: true, tag: core.tag, dir: gameBase(game), log, guidance, kept, output: outApplied, combo3d: !!core.combo3d, launch: hostLaunch || undefined };
  return { ok: true, log, tag: core.tag, kept, output: outApplied, combo3d: !!core.combo3d, needs: [], fixLink: mod.fixLink || null, launch: hostLaunch || undefined };
}

function uninstall(modId, game) {
  /* If ReShade was moved to dxgi.dll to make room for geo-11, that rename happened outside the
   * manifest, so removing ReShade has to clear it explicitly - otherwise the orphaned dxgi.dll
   * stays behind and the next mod trips over an owner that no longer exists. */
  if (modId === 'reshade') {
    try {
      const base = gameBase(game);
      const marker = path.join(base, '.stereoscope', 'reshade-dxgi.json');
      if (fs.existsSync(marker)) {
        const dll = path.join(base, 'dxgi.dll');
        if (fs.existsSync(dll)) { fs.rmSync(dll, { force: true });
          require('./logger').app.info('removed the dxgi.dll ReShade was moved to', { game: (game && (game.n || game.folder)) || '?' }); }
        fs.rmSync(marker, { force: true });
      }
    } catch (_) {}
  }
  try {
    const man0 = readManifest(game) || { mods: {} };
    require('./logger').app.info('uninstall ' + modId, { game: (game && (game.n || game.folder)) || '?',
      files: ((man0.mods || {})[modId] || {}).files || [], tag: ((man0.mods || {})[modId] || {}).tag });
  } catch (_) {}
  const base = gameBase(game);
  const m = readManifest(game); const rec = m.mods[modId];
  if (!rec) return { ok: true, log: [ ...(typeof apiOverrideNote !== "undefined" && apiOverrideNote ? ["\u26a0 " + apiOverrideNote] : []), 'nothing recorded for ' + modId] };
  let n = 0; const removed = [modId];
  for (const rel of rec.files || []) { try { fs.unlinkSync(path.join(base, rel)); n++; } catch (_) {} }
  delete m.mods[modId];
  // remove addons that were locked to this mod
  for (const [id, r] of Object.entries(m.mods)) {
    if (r && r.lockedBy === modId) { for (const rel of r.files || []) { try { fs.unlinkSync(path.join(base, rel)); n++; } catch (_) {} } delete m.mods[id]; removed.push(id); }
  }
  writeManifest(game, m);
  return { ok: true, log: [ ...(typeof apiOverrideNote !== "undefined" && apiOverrideNote ? ["\u26a0 " + apiOverrideNote] : []), 'removed ' + n + ' file(s)' + (removed.length > 1 ? ' (+ ' + removed.slice(1).join(', ') + ')' : '')], removed };
}

/* Registry ids that are two packagings of the SAME mod - they share every on-disk signature, so if
 * one is already managed the other must not be reported as a separate "found on disk" item. */
const ALIAS_SIBLINGS = { geo11: ['geo11_github'], geo11_github: ['geo11'], geo3d: ['geo3d_legacy'],
  geo3d_legacy: ['geo3d'], track_loop: ['track_bz'], track_bz: ['track_loop'] };
/* When a signature is genuinely ambiguous - files on disk that BOTH packagings would produce, and
 * neither is in the manifest yet - report this one. Anything else means the user is shown two config
 * cards for one physical install and has to guess which is real.
 *   Geo3D  -> the app-bundled stable build, which is what the one-click path installs
 *   geo-11 -> the official HelixMod build, not the GitHub mirror */
const ALIAS_PREFERRED = { geo3d: 'geo3d_legacy', geo3d_legacy: 'geo3d_legacy',
  geo11: 'geo11', geo11_github: 'geo11' };
/** Collapse an alias pair down to a single id, honouring what's already managed. */
function resolveAlias(id, managed) {
  const sibs = ALIAS_SIBLINGS[id]; if (!sibs) return id;
  if (managed && managed.has(id)) return id;                    // already managed as this packaging
  for (const sib of sibs) if (managed && managed.has(sib)) return sib;   // managed as the other one
  return ALIAS_PREFERRED[id] || id;                             // ambiguous: use the preferred build
}
function detect(game) {
  const base = gameBase(game);
  const man = readManifest(game);
  const managed = new Set(Object.keys(man.mods || {}));
  const found = new Set(managed);
  // Files a managed mod already owns are NOT evidence of a second, unmanaged mod. Without this,
  // installing the bundled Legacy Geo3D made the UI offer geo3d / geovrexport as "adopt me?"
  // rows built entirely out of files Legacy Geo3D had just placed.
  const owned = new Set();
  for (const rec of Object.values(man.mods || {})) for (const f of (rec.files || [])) owned.add(String(f).toLowerCase().replace(/\\/g, '/'));
  const isOwned = f => owned.has(String(f).toLowerCase().replace(/\\/g, '/'));
  const has = f => { if (isOwned(f)) return false; try { return fs.existsSync(path.join(base, f)); } catch { return false; } };
  const anyIn = (rel, re) => { try { return fs.readdirSync(path.join(base, rel)).some(f => re.test(f) && !isOwned(rel + '/' + f)); } catch { return false; } };
  // ReShade.ini is also SEEDED by mods that host themselves in ReShade, so it alone proves nothing.
  const seedsReShadeIni = ['reshade', 'geo3d', 'geo3d_legacy'].some(id => managed.has(id));
  if (!seedsReShadeIni && (has('ReShade.ini') || has('dxgi.dll') && has('reshade-shaders'))) found.add('reshade');
  if (has('wiz3D_Config.xml') || has('HD3D_Config.xml') || has('3DVision_Config.xml') || has('S3DWrapperD3D9.dll') || has('S3DWrapperD3D10.dll')) found.add('wiz3d');
  if (has('d3dxdm.ini')) found.add('geo11');
  if (has('reshade-shaders/Shaders/SuperDepth3D.fx')) found.add('sd3d');
  if (has('Geo3D.addon64') || has('Geo3D.addon32')) found.add('geo3d');
  if (has('SuperVrExport.addon64') || has('SuperVrExport.addon32')) found.add('supervrexport');
  if (has('GeoVrExport.addon64') || has('GeoVrExport.addon32')) found.add('geovrexport');
  // head-tracking: the cameraunlock config, a *HeadTracking.dll/.asi, or HeadTracking.ini — not just "a BepInEx folder"
  // Both 6DOF mods share HeadTracking.ini, so the FILE LAYOUT is what distinguishes them:
  // an .asi next to the exe is the BerZerker/ASI style, a BepInEx or Mods plugin is the Loop style.
  // Reporting the wrong one offered the user the wrong mod to adopt.
  const htAsi = anyIn('.', /\.asi$/i) || has('HeadTracking.asi');
  const htPlugin = anyIn('BepInEx/plugins', /headtracking\.dll$/i) || anyIn('Mods', /headtracking\.dll$/i)
                || anyIn('BepInEx/config', /headtracking\.cfg$/i) || anyIn('reframework/plugins', /headtracking\.dll$/i);
  if (htAsi) found.add('track_bz');
  if (htPlugin) found.add('track_loop');
  if (!htAsi && !htPlugin && has('HeadTracking.ini')) found.add('track_loop');   // ini only: no layout hint
  // 3DVision4All and dgVoodoo2 had no signature at all - a hand-installed copy was invisible.
  if (has('3dvision4all.ini') || has('EnableWindowed3D.exe')) found.add('v4a');
  if (has('dgVoodoo.conf') || has('dgVoodooCpl.exe')) found.add('dgvoodoo');
  // drop the alias twin of anything already managed
  for (const [id, sibs] of Object.entries(ALIAS_SIBLINGS)) if (managed.has(id)) for (const sib of sibs) if (!managed.has(sib)) found.delete(sib);
  // Collapse any remaining alias pair to ONE id. A pre-installed Geo3D matches both the bundled and
  // the official registry entries, and reporting both put two config cards on screen for one install.
  for (const id of [...found]) {
    if (!ALIAS_SIBLINGS[id]) continue;
    const keep = resolveAlias(id, managed);
    if (keep !== id) { found.delete(id); found.add(keep); }
    for (const sib of (ALIAS_SIBLINGS[keep] || [])) if (!managed.has(sib)) found.delete(sib);
  }
  return [...found];
}
/** Detection split: which mods the app manages (manifest) vs. found on disk but unmanaged (adoptable). */
function detectDetailed(game) {
  let managed = []; try { managed = Object.keys(readManifest(game).mods || {}); } catch (_) {}
  const all = detect(game);                       // manifest + on-disk signatures
  const found = all.filter(id => !managed.includes(id));  // on disk, not app-installed → adoptable
  return { managed, found, all };
}

async function checkUpdates() {
  const cached = {}, cachedSha = {};
  for (const c of coreList()) { cached[c.id] = c.tag; try { cachedSha[c.id] = fs.readFileSync(path.join(c.path, '.sha'), 'utf8').trim().slice(0, 7); } catch (_) {} }
  const rows = [];
  for (const src of CORE_SOURCES) {
    if (src.strategy === 'website') { rows.push({ id: src.id, name: src.name, website: true, url: src.url }); continue; }
    if (src.strategy === 'bundled') { rows.push({ id: src.id, name: src.name, latest: 'bundled', cached: 'bundled', bundled: true, update: false }); continue; }
    if (src.strategy === 'github-repo') {
      // A branch has no version, so "cached master vs latest master" could never differ and the core
      // looked permanently up to date with no way to pull newer shaders. Compare the branch HEAD
      // commit (via the commits atom feed — no API quota) against the sha recorded at download time.
      let head = null;
      try { const t = await getText('https://github.com/' + src.repo + '/commits/' + (src.branch || 'main') + '.atom');
        const m2 = (t.text || '').match(/\/commit\/([0-9a-f]{7,40})/i); if (m2) head = m2[1].slice(0, 7); } catch (_) {}
      const have = cachedSha[src.id] || null;
      rows.push({ id: src.id, name: src.name, latest: head ? (src.branch + '@' + head) : src.branch,
        cached: cached[src.id] ? (have ? src.branch + '@' + have : src.branch) : null,
        branchTracking: true, refreshable: !!cached[src.id],
        update: !!(head && have && head !== have) });
      continue;
    }
    if (src.strategy === 'url' || src.strategy === 'archive-url') {
      // geo-11 (official): probe the HelixMod/S3 host for a newer archive than the one we cached
      let latest = src.version;
      if (src.id === 'geo11') {
        try { const l = await geo11LatestHelix(); if (l && l.version) latest = 'v' + String(l.version).replace(/^v/, ''); } catch (_) {}
      }
      if (src.id === 'reshade') {
        try { const l = await reshadeLatest(); if (l && l.version) latest = String(l.version); } catch (_) {}
      }
      rows.push({ id: src.id, name: src.name, latest, cached: cached[src.id] || null,
        update: !!(cached[src.id] && geo11VerNum(latest) > geo11VerNum(cached[src.id])) });
      continue;
    }
    if (src.strategy === 'release-hub') { rows.push({ id: src.id, name: src.name, perGame: true, update: false }); continue; } // per-game — checked via head-tracking
    // version check via the releases.atom feed (github.com) — NOT the 60/hour API. API only as a fallback.
    let tag = await latestTagAtom(src.repo);
    let rateLimited = false;
    if (!tag) { const rel = await latestRelease(src.id, null); tag = rel && rel.tag; rateLimited = !!(rel && rel.rateLimited); }
    rows.push({ id: src.id, name: src.name, latest: tag || null, cached: cached[src.id] || null, rateLimited, update: !!(tag && cached[src.id] && tag !== cached[src.id]) });
  }
  return rows;
}


/** Real per-game mod status: what is actually installed next to the exe, its version, and whether it's stale.
 *  Sources of truth: the manifest (app installs) + on-disk signature detection (hand-installed / adopted). */
async function gameModStatus(game, opts) {
  opts = opts || {};
  const man = readManifest(game); const mods = man.mods || {};
  const det = detectDetailed(game);
  let latestMap = {};
  if (opts.checkLatest !== false) {
    try { for (const r of await checkUpdates()) latestMap[r.id] = r; } catch (_) {}
  }
  const rows = [];
  for (const id of det.all) {
    const src = CORE_BY_ID[id] || null;
    const entry = mods[id] || null;
    const L = latestMap[id] || {};
    const installed = entry ? entry.tag : null;            // null => adopted (we didn't place it, so no version)
    const latest = L.latest || (src && src.version) || null;
    const norm = v => String(v || '').replace(/^v/i, '');
    const update = !!(installed && latest && !/^(bundled|manual)$/i.test(installed) && norm(installed) !== norm(latest));
    rows.push({
      id,
      name: (MODS[id] && MODS[id].name) || (src && src.name) || id,
      installed, latest, update,
      combo3d: !!(entry && entry.combo3d),                 // BerZerker all-in-one: stereo 3D is already inside
      asset: entry ? (entry.asset || null) : null,
      adopted: !entry,                                     // found on disk but not installed by the app
      files: entry ? (entry.files || []).length : 0,
      dll: entry ? entry.dll || null : null,
      when: entry ? entry.when || null : null,
      website: !!L.website, url: L.url || (src && src.url) || null,
      configFiles: []
    });
  }
  // attach the real config files the analyzer can see for each mod
  try {
    const an = analyzeConfigs(game);
    for (const r of rows) {
      const tags = MOD_TAGS[r.id] || [r.id];
      r.configFiles = an.files.filter(f => (f.mods || []).some(t => tags.includes(t))).map(f => f.name);
    }
  } catch (_) {}
  return rows;
}

/** DLL-proxy / search-order-hijack candidate names (dinput8, version, winmm first — the safe go-tos). */
const PROXY_CANDIDATES = ['dinput8.dll', 'version.dll', 'winmm.dll', 'dxgi.dll', 'd3d11.dll', 'd3d12.dll', 'd3d9.dll', 'xinput1_3.dll', 'xinput1_4.dll', 'xinput9_1_0.dll', 'wininet.dll', 'winhttp.dll', 'bink2w64.dll', 'binkw64.dll', 'binkw32.dll', 'dsound.dll'];
// grouped for the UI (from Ultimate ASI Loader's compatibility table)
const PROXY_GROUPS = [
  { label: 'Almost any game', names: ['version.dll', 'winmm.dll'] },
  { label: 'Default / common', names: ['dinput8.dll', 'dsound.dll'] },
  { label: 'DX10 / 11 / 12 games', names: ['dxgi.dll', 'd3d11.dll', 'd3d12.dll'] },
  { label: 'Older DX9 games', names: ['d3d9.dll'] },
  { label: 'Only sometimes', names: ['xinput1_3.dll', 'xinput1_4.dll', 'xinput9_1_0.dll', 'wininet.dll', 'winhttp.dll', 'bink2w64.dll', 'binkw64.dll', 'binkw32.dll'] },
];
/** Which proxy DLLs currently sit next to the exe (so the UI can show the loader's current name). */
function proxyState(game) {
  const base = gameBase(game);
  const present = PROXY_CANDIDATES.filter(n => { try { return fs.existsSync(path.join(base, n)); } catch { return false; } });
  // best guess at the ACTIVE loader (a renamed Ultimate ASI Loader): prefer a real .asi-loader-ish present dll
  const active = present.includes('dinput8.dll') ? 'dinput8.dll' : present[0] || null;
  return { base, candidates: PROXY_CANDIDATES, groups: PROXY_GROUPS, present, active };
}
/** Rename the loader proxy DLL in the game folder to another proxy name (when one target doesn't inject). */
function renameProxy(game, toName, fromName) {
  const base = gameBase(game);
  if (!PROXY_CANDIDATES.includes(toName)) throw new Error('unknown proxy name ' + toName);
  let src = fromName && PROXY_CANDIDATES.includes(fromName) ? fromName : null;
  if (!src) { const present = PROXY_CANDIDATES.filter(n => { try { return fs.existsSync(path.join(base, n)); } catch { return false; } }); src = present.includes('dinput8.dll') ? 'dinput8.dll' : present[0]; }
  if (!src) throw new Error('No loader proxy DLL found next to the exe — install the loader first, then rename it.');
  if (src === toName) return { ok: true, from: src, to: toName, log: 'Loader is already named ' + toName };
  const from = path.join(base, src), to = path.join(base, toName);
  if (!fs.existsSync(from)) throw new Error(src + ' not found next to the exe.');
  if (fs.existsSync(to)) { try { fs.renameSync(to, to + '.bak-' + Date.now()); } catch (_) {} }   // preserve any existing target
  fs.renameSync(from, to);
  // keep the manifest in sync if the loader file was tracked
  try { const m = readManifest(game); let changed = false; for (const rec of Object.values(m.mods || {})) { if (rec && Array.isArray(rec.files)) { const i = rec.files.indexOf(src); if (i >= 0) { rec.files[i] = toName; changed = true; } } } if (changed) writeManifest(game, m); } catch (_) {}
  return { ok: true, from: src, to: toName, log: 'Renamed ' + src + ' \u2192 ' + toName };
}


/** Dynamically match ONE game to a head-tracking mod (BerZerker OR itsloopyo) by understanding the
 *  game NAME rather than an exact-string set. Uses the same acronym/roman-numeral/fuzzy scoring as the
 *  hub tag matcher, so "Batman Arkham Knight" == "Batman: Arkham Knight" and "AC Unity" == "Assassin's
 *  Creed Unity". Returns { source:'berzerker'|'itsloopyo', game, repo?, score, combo3d? } or null. */
let _htCatalogCache = null, _htCatalogAt = 0;
async function htCatalog(force) {
  const now = Date.now();
  if (!force && _htCatalogCache && (now - _htCatalogAt) < 6 * 3600 * 1000) return _htCatalogCache;
  const repo = 'BerZerker96/6DOF-Head-Tracking-Mods-Hub';
  let bz = [], loop = [];
  try { bz = await bzHubGames(repo); } catch (_) {}
  try { loop = await loopAllMods(); } catch (_) {}
  _htCatalogCache = { bz, loop, repo }; _htCatalogAt = now;
  return _htCatalogCache;
}
async function htMatchGame(game, opts) {
  opts = opts || {};
  const cat = await htCatalog(opts.force);
  const keys = gameKeys(game);
  // Keys derived from the game's NAME only (title + its acronym). The game's executable also yields a
  // key, which is great for unknown titles but dangerous on its own: Assetto Corsa Competizione ships
  // AC2-Win64-Shipping.exe, which collides with the hub's "AC2" (Assassin's Creed II) tag, and
  // Assassin's Creed Rogue ships ACR.exe, colliding with "ACR" (Revelations). The title is the
  // authoritative identifier, so an exe-only hit that the title flatly contradicts is not a match.
  const nameKeys = gameKeys({ n: game && game.n, folder: game && game.n, exe: '' });
  const isNameKey = (k) => nameKeys.includes(k);
  const THRESH = 60;
  const WEAK = THRESH - 5;                 // exe-only agreement: keep it below the auto-match bar
  const scoreAgainst = (texts) => {
    let nameSc = 0, anySc = 0;
    for (const t of texts) for (const k of keys) {
      const sc = bestScore(t, k);
      if (sc > anySc) anySc = sc;
      if (sc > nameSc && isNameKey(k)) nameSc = sc;
    }
    return nameSc > 0 ? Math.max(nameSc, anySc) : Math.min(anySc, WEAK);
  };
  let best = null;
  // BerZerker: match on the game display name AND its odd tag
  for (const e of (cat.bz || [])) {
    const sc = scoreAgainst([e.game, e.tag].filter(Boolean));
    if (sc > (best ? best.score : THRESH - 1)) best = { source: 'berzerker', game: e.game, tag: e.tag, repo: cat.repo, score: sc };
  }
  // itsloopyo: match on the game name (repo slug is derived from it)
  for (const m of (cat.loop || [])) {
    const slug = m.repo ? String(m.repo).split('/').pop().replace(/-?head-?tracking$/i, '') : null;
    const sc = scoreAgainst([m.game, slug].filter(Boolean));
    if (sc > (best ? best.score : THRESH - 1)) best = { source: 'itsloopyo', game: m.game, repo: m.repo, pre: !!m.pre, score: sc };
  }
  return best;
}


/** Installable versions for a MANUALLY-chosen head-tracking mod, independent of game detection.
 *  entry = { source:'berzerker', game, tag } OR { source:'itsloopyo', repo, game }.
 *  Returns { source, game, versions:[{tag, version, asset, combo3d, kind, prerelease}] } so the UI can
 *  offer every 6DOF build AND every combined 3D+6DOF build for the user to pick. */
/**
 * Every downloadable build inside ONE known hub release. Used when the user has already chosen a
 * release from the manual picker: there is nothing left to guess, so this must never fall back to
 * name matching or probe other tags. Two requests at most.
 */
/** The ONLY thing filtered out of a 6DOF release is GitHub's auto-generated source archive.
 *  Every other asset is listed and downloadable - no -nexus / -installer / -thunderstore rules and
 *  no name heuristics. Both authors ship different archive layouts per game and per release, and
 *  every rule the app invented eventually hid a build somebody needed. */
function isSourceArchive(name) {
  const n = String(name || '');
  return /^source[\s._-]*code/i.test(n) || /\.(tar\.gz|tar|tgz)$/i.test(n);
}
function releaseAssets(list) { return (list || []).filter(a => a && a.name && !isSourceArchive(a.name)); }

async function versionsForHubTag(repo, tag, hint) {
  const ARCH = a => !isSourceArchive(a.name);
  /* Treat an already-blocked API as limited too. getJSON now short-circuits once GitHub has said
   * 403, so the __status checks below never see it - without this the caller would report "no
   * versions" instead of "throttled, using the public pages". */
  let limited = ghfree.apiIsBlocked();
  // Whole-operation budget. Each request already has its own timeout, but the fallback chain can
  // stack several of them; on a dead host that added up to a minute of "loading...". Past this
  // point we stop trying and let the UI say so.
  const BUDGET = 30000, started = Date.now();
  const outOfTime = () => (Date.now() - started) > BUDGET;

  // One release -> its archives. Tries the API, then the release page. Returns null if the tag
  // simply doesn't exist, which is the signal to go looking for the real one.
  const fetchTag = async (t) => {
    let meta = null, archives = [];
    try {
      const rel = await getJSON('https://api.github.com/repos/' + repo + '/releases/tags/' + encodeURIComponent(t));
      if (rel && rel.__status === 403) limited = true;
      else if (rel && Array.isArray(rel.assets)) {
        meta = { date: rel.published_at || '', prerelease: !!rel.prerelease, name: rel.name || t };
        archives = rel.assets.filter(ARCH).map(a => ({ name: a.name, url: a.browser_download_url, size: a.size }));
      }
    } catch (_) {}
    if (!archives.length) {
      try { archives = (await assetsViaExpanded(repo, t)).filter(ARCH); } catch (_) {}
      if (archives.length && !meta) meta = { date: '', prerelease: false, name: hint || t };
    }
    return archives.length ? { tag: t, meta: meta || { date: '', prerelease: false, name: hint || t }, archives } : null;
  };

  // Common case first: the tag is real, so this costs a single request.
  let hit = await fetchTag(tag);

  // Otherwise the caller probably handed us the release TITLE. On this hub the two differ -
  // "ACSyndicate" is tagged "s1", "ACOrigins" is tagged "1" - so look the title up and retry.
  // Preferred lookup: the API's own release list carries BOTH tag_name and name, so a title can be
  // mapped to its real tag in one request without depending on page markup.
  if (!hit && !outOfTime()) {
    try {
      const all = await getJSON('https://api.github.com/repos/' + repo + '/releases?per_page=100');
      if (all && all.__status === 403) limited = true;
      else if (Array.isArray(all)) {
        const key = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        // Try the picked tag/title FIRST, then the friendly game name as a weaker fallback.
        // Using `hint || tag` meant the game name shadowed the tag entirely.
        const wants = [key(tag), key(hint)].filter(Boolean);
        const rel = all.find(r => !r.draft && wants.some(w => key(r.tag_name) === w || key(r.name) === w));
        if (rel) {
          const archives = releaseAssets(rel.assets).map(a => ({ name: a.name, url: a.browser_download_url, size: a.size }));
          if (archives.length) hit = { tag: rel.tag_name || tag,
            meta: { date: rel.published_at || '', prerelease: !!rel.prerelease, name: rel.name || rel.tag_name || tag },
            archives };
        }
      }
    } catch (_) {}
  }

  // Last resort: scrape the releases page for the title -> tag mapping.
  if (!hit && !outOfTime()) {
    try {
      const refs = await hubAllReleaseRefs(repo);
      const key = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const wants = [key(tag), key(hint)].filter(Boolean);
      const ref = refs.find(r => wants.some(w => key(r.name) === w))
               || refs.find(r => wants.some(w => key(r.tag) === w));
      if (ref && ref.tag && ref.tag !== tag && !outOfTime()) hit = await fetchTag(ref.tag);
    } catch (_) {}
  }
  if (!hit) return { rateLimited: limited, versions: [] };

  const versions = hit.archives.map(asset => {
    const av = parseAssetVersion(asset.name);
    return { tag: hit.tag, version: av.label, verNum: av.num, sortNum: av.sortNum, variant: av.variant,
             combo3d: av.combo3d, kind: av.kind, name: hit.meta.name, asset,
             date: hit.meta.date, prerelease: hit.meta.prerelease, score: 100 };
  });
  versions.sort((x, y) => ((y.sortNum || y.verNum) - (x.sortNum || x.verNum))
    || (x.variant ? 1 : 0) - (y.variant ? 1 : 0) || (y.date || '').localeCompare(x.date || ''));
  return { rateLimited: limited, versions: disambiguateVersions(versions) };
}

async function htVersionsFor(entry) {
  entry = entry || {};
  if (entry.source === 'berzerker') {
    const repo = 'BerZerker96/6DOF-Head-Tracking-Mods-Hub';
    // The user already picked a release in the dropdown. Re-running the name matcher here was the
    // bug: for games whose tag isn't in the static map (Assassin's Creed Unity / Syndicate ...) it
    // fell through to the tag-probing path and sat there for minutes, so the version list never
    // appeared. An explicit tag is authoritative - fetch exactly that release.
    if (entry.tag) {
      const v = await versionsForHubTag(repo, entry.tag, entry.name || entry.game);
      // Report the throttle when we ended up with NOTHING. If the atom/HTML fallback delivered a
      // list, the user does not need to hear about the API at all.
      const vs = v.versions || [];
      return { source: 'berzerker', game: entry.game, repo, tag: entry.tag,
               rateLimited: (!!v.rateLimited || ghfree.apiIsBlocked()) && !vs.length, versions: vs };
    }
    const g = { n: entry.game, folder: (entry.game || '').replace(/[^A-Za-z0-9]/g, ''), exe: 'game.exe' };
    const r = await releasesForGame(repo, g);
    const vs2 = r.versions || [];
    return { source: 'berzerker', game: entry.game, repo,
             rateLimited: (!!r.rateLimited || ghfree.apiIsBlocked()) && !vs2.length, versions: vs2 };
  }
  if (entry.source === 'itsloopyo') {
    const repo = entry.repo || ('itsloopyo/' + htSlug(entry.game || '') + '-headtracking');
    // itsloopyo ships one repo per game; each release has -installer / -nexus / -thunderstore assets.
    // We want the -nexus build (the real mod files), and we surface EVERY release as a version option.
    let rels = null; try { rels = await getJSON('https://api.github.com/repos/' + repo + '/releases?per_page=100'); } catch (_) {}
    const limited = !!(rels && rels.__status === 403);
    const versions = [];
    // Pick every INSTALLABLE archive in a release, not just one. A release can ship a plain 6DOF build
    // alongside a combined 3D+6DOF build or a "smooth"/alt variant - taking only the first hid those
    // from the picker entirely. The -installer / -thunderstore packages are wrappers, not mod files.
    const installable = (assets) => {
      // Released mods ship a clean -nexus archive; PRE-RELEASE mods have no Nexus page yet and ship
      // ONLY -installer.zip. Dropping installer archives outright left every pre-release mod with an
      // empty version list. Keep them when they are all that is on offer.
      const real = releaseAssets(assets);   // everything except GitHub's source archive
      // No selection heuristics at all: list them ALL, clean -nexus builds first for convenience.
      const nexus = real.filter(a => /-nexus\.zip$/i.test(a.name));
      const others = real.filter(a => !/-nexus\.zip$/i.test(a.name));
      return nexus.concat(others);
    };
    if (Array.isArray(rels) && rels.length) {
      for (const r of rels) {
        if (r.draft) continue;
        const assets = releaseAssets(r.assets);   // extension-agnostic; only source code is hidden
        for (const a of installable(assets)) {
          const av = parseAssetVersion(a.name);
          versions.push({ tag: r.tag_name, version: av.label, verNum: av.num, sortNum: av.sortNum, variant: av.variant,
            combo3d: av.combo3d, kind: av.kind,
            asset: { name: a.name, url: a.browser_download_url, size: a.size }, prerelease: !!r.prerelease, date: r.published_at || '' });
        }
      }
    }
    /* Fall back whenever we have nothing - INCLUDING when the API said 429/403.
     * The old guard was `!versions.length && !limited`, which skipped the scrape in exactly the
     * case it exists for: rate-limited. The scrape reads the public releases HTML, which is not
     * rate-limited, so a limited API should trigger it rather than suppress it. */
    if (!versions.length) {
      // API empty, errored, or rate-limited → scrape tags, then read each tag's assets
      let tags = []; try { tags = await hubAllTags(repo); } catch (_) {}
      for (const tag of tags.slice(0, 12)) {
        let assets = []; try { assets = await assetsViaExpanded(repo, tag); } catch (_) {}
        for (const a of installable(assets.filter(x => /\.(zip|7z)$/i.test(x.name)))) {
          const av = parseAssetVersion(a.name);
          versions.push({ tag, version: av.label, verNum: av.num, sortNum: av.sortNum, variant: av.variant,
            combo3d: av.combo3d, kind: av.kind, asset: a, prerelease: false, date: '' });
        }
      }
    }
    // dedupe by asset URL, newest first (sortNum keeps v1.1 above v1), then guarantee distinct labels
    const seenU = new Set();
    let vlist = versions.filter(v => { const k = (v.asset && v.asset.url) || (v.asset && v.asset.name); if (!k || seenU.has(k)) return false; seenU.add(k); return true; });
    vlist.sort((a, b) => ((b.sortNum || b.verNum || 0) - (a.sortNum || a.verNum || 0)) || (a.variant ? 1 : 0) - (b.variant ? 1 : 0) || (b.date || '').localeCompare(a.date || ''));
    // only surface the rate-limit warning if the fallback also came up empty - otherwise the UI
    // says "rate-limited" while showing a perfectly good list
    return { source: 'itsloopyo', game: entry.game, repo, rateLimited: limited && !vlist.length,
      versions: disambiguateVersions(vlist) };
  }
  return { versions: [] };
}

/** Locate a mod's post-install helper next to the game exe (3DVision4All's EnableWindowed3D.exe). */
function postInstallInfo(game, modId) {
  const mod = MODS[modId]; const pi = mod && mod.postInstall;
  if (!pi) return null;
  const base = gameBase(game);
  const file = path.join(base, pi.file);
  let present = false; try { present = fs.existsSync(file); } catch (_) {}
  let done = null;
  try { done = (readManifest(game).mods[modId] || {}).postInstallDone || null; } catch (_) {}
  return { modId, title: pi.title, why: pi.why, manual: pi.manual, elevate: !!pi.elevate,
           file: present ? file : null, present, done, required: true };
}
/** Run that helper, elevated on Windows. Records completion so the UI stops asking. */
function runPostInstall(game, modId) {
  const info = postInstallInfo(game, modId);
  if (!info) return { ok: false, error: 'no post-install step for ' + modId };
  if (!info.present) return { ok: false, error: (MODS[modId].postInstall || {}).file + ' was not found next to the game exe \u2014 reinstall the mod.' };
  const { spawn } = require('child_process');
  try {
    if (process.platform === 'win32' && info.elevate) {
      // Start-Process -Verb RunAs raises the UAC prompt; the working directory scopes the tool to
      // THIS game folder, which is the set of .exe files it writes NVIDIA profiles for.
      spawn('powershell.exe', ['-NoProfile', '-Command',
        'Start-Process', '-FilePath', JSON.stringify(info.file),
        '-WorkingDirectory', JSON.stringify(path.dirname(info.file)), '-Verb', 'RunAs'],
        { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn(info.file, [], { cwd: path.dirname(info.file), detached: true, stdio: 'ignore' }).unref();
    }
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
  const m = readManifest(game);
  if (m.mods[modId]) { m.mods[modId].postInstallDone = new Date().toISOString();
    addHistory(m, modId, m.mods[modId].tag, 'ran ' + (MODS[modId].postInstall || {}).file + ' (elevated)'); writeManifest(game, m); }
  return { ok: true, file: info.file, elevated: process.platform === 'win32' && info.elevate };
}

module.exports = { rehomeReShadeToDxgi, appUpdateApply, versionsForHubTag, hubAllReleaseRefs, postInstallInfo, runPostInstall, rehomeV4aProxy, LOADER_SLOTS, modSupportsApi, effectiveApi, disambiguateVersions, reshadeLatest, reshadeCandidates, proxySlotOwner, PROXY_SLOTS, geo11LatestHelix, geo11VerNum, geo11Candidates, headOk, dgVoodooSupports, appUpdateCheck, appUpdateDownload, verCmp, APP_REPO, setupDgVoodoo, ensureDgVoodoo, dgVoodooDllsFor, applyDx9Proxy, setupDx9VrProxy, isDx9, isDx10, bundledFile, htVersionsFor, htCatalog, htMatchGame, snapshotModConfig, restoreModConfig, gameModStatus, installReShade, reshadeDllName, latestRelease, releasesForGame, install, uninstall, detect, detectDetailed, adoptMods, resolveConfigPath, htConfigPath, coreList, coreSources, coreFolder, ensureCore, updateCore, coreFetchAll, checkUpdates, checkHeadTracking, coreRoot, userData, placeInto, effectiveRoot, proxyState, renameProxy, PROXY_CANDIDATES, wizSetOutput, wizSetConfig, wizGetConfig, resolveFile, readModConfig, writeModConfig, readModFiles, writeModFiles, analyzeConfigs, readModAnalyzed, writeAnalyzed, activePresetPath, setManualCoreRoot, ensureManualCoreDirs, manualCoreStatus, manualCoreDir, manualCoreRoot, hubAllReleases, hubDownloadAll, hubPooled, hubInstallInto, loopAllMods, bzHubGames, suggestGameForTag, gameKeys, acronym };
