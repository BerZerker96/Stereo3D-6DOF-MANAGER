'use strict';
/*
 * GitHub without the rate limit.
 *
 * api.github.com allows 60 requests per hour to an unauthenticated client. A library of a hundred
 * games asks for far more than that in a single refresh, so the API stops answering and mod lists
 * come back empty - which is exactly what "rate limited, try later" in the picker means.
 *
 * The way out is that GitHub serves the same information over endpoints that are NOT part of that
 * quota:
 *
 *   /<owner>/<repo>/releases.atom                 an Atom feed of every release
 *   /<owner>/<repo>/releases                      the HTML release list
 *   /<owner>/<repo>/releases/expanded_assets/<t>  the asset list for one tag, as HTML
 *   /<owner>/<repo>/releases/tag/<tag>            one release, as HTML
 *
 * These are ordinary web pages. They are cached by GitHub's CDN and carry no X-RateLimit budget.
 * So this module resolves releases from those by default and only touches the API when the user has
 * supplied a token (5,000/hour, plenty) or when HTML genuinely could not answer.
 *
 * On top of that everything is cached on disk with a short TTL, so browsing the library re-reads
 * files instead of re-fetching pages.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

let _cacheDir = null;
let _rateLimitedUntil = 0;              // epoch ms; while set, the API is skipped entirely

function cacheDir() {
  /* Re-derive if the folder has gone. The path is memoised for speed, but if something removed the
   * directory underneath us - a profile reset, a cleanup, a test sandbox being torn down - carrying
   * on with a dead path would silently serve entries that no longer belong to the current state. */
  if (_cacheDir) {
    try { if (fs.existsSync(_cacheDir)) return _cacheDir; } catch (_) {}
    _cacheDir = null;
  }
  let base;
  try { base = require('electron').app.getPath('userData'); }
  catch (_) { base = path.join(os.homedir(), '.stereoscope'); }
  _cacheDir = path.join(base, 'cache', 'github');
  try { fs.mkdirSync(_cacheDir, { recursive: true }); } catch (_) {}
  return _cacheDir;
}
function setCacheDir(p) { _cacheDir = p || null; if (p) { try { fs.mkdirSync(p, { recursive: true }); } catch (_) {} } }

const keyFor = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);

/** Read a cached value if it is younger than `ttlMs`. Stale entries are still returned when the
 *  caller asks for them explicitly - a stale list beats an empty one. */
function cacheGet(key, ttlMs, allowStale) {
  try {
    const p = path.join(cacheDir(), keyFor(key) + '.json');
    const st = fs.statSync(p);
    const age = Date.now() - st.mtimeMs;
    if (age > (ttlMs || 0) && !allowStale) return null;
    const v = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { value: v, age, stale: age > (ttlMs || 0) };
  } catch (_) { return null; }
}
function cachePut(key, value) {
  try { fs.writeFileSync(path.join(cacheDir(), keyFor(key) + '.json'), JSON.stringify(value)); } catch (_) {}
}

/** Record that the API told us to back off, so nothing else wastes a request on it. */
function markRateLimited(resetEpochSec) {
  const until = resetEpochSec ? (Number(resetEpochSec) * 1000) : (Date.now() + 15 * 60 * 1000);
  _rateLimitedUntil = Math.max(_rateLimitedUntil, until);
}
function apiIsBlocked() { return Date.now() < _rateLimitedUntil; }
function rateLimitState() {
  return { blocked: apiIsBlocked(), until: _rateLimitedUntil,
           minutes: apiIsBlocked() ? Math.ceil((_rateLimitedUntil - Date.now()) / 60000) : 0 };
}
function clearRateLimit() { _rateLimitedUntil = 0; }

/* ---------------------------------------------------------------------------------------------
 * Parsers for the HTML/Atom endpoints. Deliberately forgiving: GitHub's markup changes, and a
 * missing field should degrade the result rather than throw it away.
 * ------------------------------------------------------------------------------------------- */

/** Tags, newest first, from a releases.atom feed. */
function tagsFromAtom(xml) {
  const out = [];
  const re = /<link[^>]+href="[^"]*\/releases\/tag\/([^"]+)"/g;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    let t = m[1];
    try { t = decodeURIComponent(t); } catch (_) {}
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Release titles from an atom feed, so a title that differs from its tag is still discoverable. */
function titlesFromAtom(xml) {
  const out = [];
  const re = /<title>([^<]+)<\/title>/g;
  let m, first = true;
  while ((m = re.exec(String(xml || '')))) {
    if (first) { first = false; continue; }         // the feed's own title
    out.push(m[1].trim());
  }
  return out;
}

/** Downloadable assets from any GitHub HTML that lists them. */
function assetsFromHtml(html, repo) {
  const out = [];
  const seen = new Set();
  const re = /href="(\/[^"]*\/releases\/download\/([^"\/]+)\/([^"]+))"/g;
  let m;
  while ((m = re.exec(String(html || '')))) {
    let name = m[3], tag = m[2];
    try { name = decodeURIComponent(name); tag = decodeURIComponent(tag); } catch (_) {}
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, tag, browser_download_url: 'https://github.com' + m[1], size: 0 });
  }
  return out;
}

module.exports = {
  setCacheDir, cacheDir, cacheGet, cachePut,
  markRateLimited, apiIsBlocked, rateLimitState, clearRateLimit,
  tagsFromAtom, titlesFromAtom, assetsFromHtml
};
