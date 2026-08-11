'use strict';
/*
 * Structural checks that need no network and no game folder.
 *
 * The undefined-global check exists because openDetail() was called in two places and defined in
 * none. Both call sites threw a ReferenceError, and one of them was the last line of "Remove all
 * mods" - so the button ran the removals and then died before reporting or refreshing, which read
 * to the user as "the button does nothing". A whole-page function is exactly the kind of thing that
 * fails silently in a renderer, so it is asserted here.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0; const failures = [];
function check(name, got, want) {
  const ok = String(got) === String(want);
  if (ok) pass++; else { fail++; failures.push(`  ${name}\n      expected: ${want}\n      got:      ${got}`); }
}

console.log('=== every module parses ===');
for (const f of ['main.js', 'preload.js', 'stamp-build.js',
                 'src/scanner.js', 'src/installer.js', 'src/mods.js', 'src/config.js', 'src/store.js',
                 'src/logger.js', 'src/ghfree.js', 'src/peicon.js', 'src/peimports.js',
                 'src/gamedb.js', 'src/gamedb-ext.js']) {
  let ok = true; try { new (require('vm').Script)(R(f), { filename: f }); } catch (_) { ok = false; }
  check('parses ' + f, ok, true);
}

console.log('=== renderer script blocks parse ===');
{
  const html = R('renderer/index.html');
  const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  check('three script blocks', blocks.length, 3);
  blocks.forEach((b, i) => {
    let ok = true; try { new Function(b[1]); } catch (_) { ok = false; }
    check('renderer block ' + (i + 1) + ' parses', ok, true);
  });
}

console.log('=== IPC surface is symmetric ===');
{
  const handlers = [...R('main.js').matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map(m => m[1]);
  const bindings = [...R('preload.js').matchAll(/invoke\(\s*'([^']+)'/g)].map(m => m[1]);
  const hs = new Set(handlers), bs = new Set(bindings);
  check('no duplicate handlers', handlers.length, hs.size);
  check('handler count == binding count', hs.size, bs.size);
  check('every handler is bridged', handlers.filter(h => !bs.has(h)).join(',') || '(none)', '(none)');
  check('every binding has a handler', bindings.filter(b => !hs.has(b)).join(',') || '(none)', '(none)');
  for (const need of ['uninstall', 'uninstallAll', 'installedMods'])
    check('handler present: ' + need, hs.has(need), true);
}

console.log('=== renderer calls no function that is never defined ===');
{
  const html = R('renderer/index.html');
  const rawJs = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  /* Strip comments and string/template literals first. Without this the scan reads English prose out
   * of tooltips and comments and reports words like "the" and "folder" as undefined functions. */
  /* Blank out comments, string/template literals and regex literals with a small scanner.
   * A regex-based stripper cannot do this: template literals nest ( `a ${ `b` } c` ), so a
   * leftmost match tears them open and leaves English prose behind, which then reads as code. */
  function strip(src) {
    let out = '', i = 0, n = src.length;
    const tmpl = [];                                  // backtick nesting stack
    const prevMeaningful = () => { for (let k = out.length - 1; k >= 0; k--) { const c = out[k]; if (!/\s/.test(c)) return c; } return ''; };
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); out += ' '; i = e < 0 ? n : e + 2; continue; }
      if (c === '/' && d === '/') { const e = src.indexOf('\n', i); out += ' '; i = e < 0 ? n : e; continue; }
      if (c === '"' || c === "'") {
        i++; while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; }
        i++; out += '""'; continue;
      }
      if (c === '`') { tmpl.push(true); i++; while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '`') { i++; tmpl.pop(); break; } if (src[i] === '$' && src[i + 1] === '{') { break; } i++; } out += '""'; continue; }
      if (tmpl.length && c === '$' && d === '{') { out += ' ('; i += 2; continue; }   // keep the expression, drop the shell
      if (tmpl.length && c === '}') { out += ') '; i++; while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '`') { i++; tmpl.pop(); break; } if (src[i] === '$' && src[i + 1] === '{') break; i++; } continue; }
      if (c === '/') {
        // a regex literal can only start where an operand is expected
        const p = prevMeaningful();
        if (p === '' || '(,=:[!&|?{};+-*%~^<>'.includes(p)) {
          let j = i + 1, cls = false, ok = false;
          while (j < n) { const x = src[j]; if (x === '\\') { j += 2; continue; } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) { ok = true; break; } else if (x === '\n') break; j++; }
          if (ok) { while (j + 1 < n && /[a-z]/i.test(src[j + 1])) j++; out += '/RE/'; i = j + 1; continue; }
        }
      }
      out += c; i++;
    }
    return out;
  }
  const js = strip(rawJs);
  // everything the page defines, one way or another
  const defined = new Set();
  for (const re of [/function\s+([A-Za-z_$][\w$]*)/g,
                    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
                    /([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/g,
                    /window\.([A-Za-z_$][\w$]*)\s*=/g])
    for (const m of rawJs.matchAll(re)) defined.add(m[1]);
  // function parameters are locals, not missing globals
  for (const m of rawJs.matchAll(/(?:function\s*[A-Za-z_$\w]*\s*|(?:^|[^\w$]))\(([^)(]{0,300})\)\s*(?:=>|\{)/g))
    for (const part of m[1].split(',')) {
      const id = part.trim().replace(/=[\s\S]*$/, '').replace(/^\.\.\./, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(id)) defined.add(id);
    }
  for (const m of rawJs.matchAll(/(?:^|[^\w$])([A-Za-z_$][\w$]*)\s*=>/g)) defined.add(m[1]);
  // plus the preload bridge and the usual browser globals
  for (const m of R('preload.js').matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) defined.add(m[1]);
  const BUILTIN = new Set(['if','for','while','switch','catch','return','typeof','function','await','new',
    'console','document','window','setTimeout','setInterval','clearTimeout','clearInterval','JSON','Object',
    'Array','String','Number','Boolean','Math','Date','Promise','Set','Map','RegExp','Error','parseInt',
    'parseFloat','isNaN','encodeURIComponent','decodeURIComponent','alert','confirm','prompt','fetch',
    'requestAnimationFrame','Image','Buffer','URL','Intl','Symbol','BigInt','structuredClone','queueMicrotask',
    'do','else','try','finally','delete','void','in','of','case','yield','import','export','class','super','this',
    'require','module','exports','localStorage','sessionStorage','navigator','location','history','performance',
    'CustomEvent','Event','MutationObserver','ResizeObserver','IntersectionObserver','FileReader','Blob','atob','btoa',
    'isFinite','WeakMap','WeakSet','Proxy','Reflect','globalThis','undefined','null','true','false','let','const','var',
    'get','set','then','catch','finally','map','filter','forEach','join','split','slice','push','sort','find','some','every']);
  // calls that look like a bare global function invocation
  const called = new Set();
  for (const m of js.matchAll(/(?:^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)) called.add(m[1]);
  // and calls written into inline onclick= handlers in the markup
  const markup = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  for (const m of markup.matchAll(/on[a-z]+="\s*([A-Za-z_$][\w$]*)\s*\(/g)) called.add(m[1]);
  // keywords that can be followed by '(' and are not calls
  ['if','for','while','switch','catch','return','typeof','function','await','new','do','else','try','delete','void','of','in','case','with','async']
    .forEach(k => called.delete(k));
  /* CSS value functions written inside style strings, and the handful of DOM/CSS tokens that survive
   * stripping, are not JavaScript calls. */
  const NOT_A_CALL = new Set(['hsl','hsla','rgb','rgba','url','calc','linear','radial','gradient',
    'linearGradient','radialGradient','translate','translateX','translateY','rotate','scale','blur',
    'drop','brightness','saturate','cubic','steps','var','attr','repeat','minmax','clamp','env']);
  const missing = [...called].filter(n => !defined.has(n) && !BUILTIN.has(n) && !NOT_A_CALL.has(n)).sort();
  check('no call to an undefined function', missing.join(', ') || '(none)', '(none)');
}

console.log('=== mod registry integrity ===');
{
  const { MODS, CORE_SOURCES, CORE_BY_ID, MOD_API, MOD_OUTPUTS, DEFAULTS } = require('../src/mods');
  check('17 managed mods', Object.keys(MODS).length, 17);
  check('17 core sources', CORE_SOURCES.length, 17);
  for (const [id, m] of Object.entries(MODS)) {
    check('mod has a name: ' + id, !!m.name, true);
    if (m.lockedTo) check('lockedTo target exists: ' + id, !!MODS[m.lockedTo], true);
    for (const n of (m.needs || [])) check('needs target exists: ' + id + '->' + n, !!MODS[n], true);
    for (const r of (m.requires || [])) check('requires target exists: ' + id + '->' + r, !!MODS[r], true);
  }
  for (const id of Object.keys(MOD_OUTPUTS)) check('outputs belong to a real mod: ' + id, !!MODS[id], true);
  for (const id of Object.keys(MOD_API)) check('API gate belongs to a real mod: ' + id, !!MODS[id], true);
  for (const id of Object.keys(DEFAULTS)) check('defaults belong to a real mod: ' + id, !!MODS[id], true);
  // Vulkan must keep at least one route or Vulkan titles are stranded
  const vulkan = Object.entries(MOD_API).filter(([, list]) => list.includes('Vulkan')).map(([id]) => id);
  check('Vulkan still has a driver', vulkan.includes('sd3d'), true);
}

console.log('=== catalogue links point at the right projects ===');
{
  const mods = R('src/mods.js');
  const html = R('renderer/index.html');
  const VR = 'BerZerker96/Super-VRExport-Addon';
  check('supervrexport source repo', new RegExp("id:'supervrexport'[\\s\\S]{0,200}repo:'" + VR + "'").test(mods), true);
  check('geovrexport source repo', new RegExp("id:'geovrexport'[\\s\\S]{0,200}repo:'" + VR + "'").test(mods), true);
  // the Mods page used to link these at BlueSkyDefender/SuperVrExport and Flugan/Geo3D-Installer,
  // neither of which is where the app actually downloads them from
  check('Mods page links SuperVrExport at its real repo',
    /\['SuperVrExport[^']*',\s*'https:\/\/github\.com\/BerZerker96\/Super-VRExport-Addon'/.test(html), true);
  check('Mods page links GeoVrExport at its real repo',
    /\['GeoVrExport[^']*',\s*'https:\/\/github\.com\/BerZerker96\/Super-VRExport-Addon'/.test(html), true);
  check('no stale BlueSkyDefender/SuperVrExport link', /BlueSkyDefender\/SuperVrExport/.test(html), false);
  // every http(s) URL in the registry is well formed
  const bad = [...mods.matchAll(/https?:\/\/[^'"\s)]+/g)].map(m => m[0]).filter(u => { try { new URL(u); return false; } catch (_) { return true; } });
  check('all registry URLs parse', bad.join(',') || '(none)', '(none)');
}

console.log('=== bundled payloads are present ===');
{
  for (const f of ['bundled/legacy-geo3d/Geo3D.addon64', 'bundled/legacy-geo3d/Geo3D.addon32',
                   'bundled/legacy-geo3d/3DToElse.fx', 'bundled/legacy-geo3d/LICENSE.txt',
                   'bundled/vrexport/SuperVrExport.addon64', 'bundled/vrexport/GeoVrExport.addon64',
                   'bundled/vrexport/geod3d9.dll'])
    check('bundled: ' + f, fs.existsSync(path.join(ROOT, f)), true);
}

console.log('=== game database ===');
{
  const db = require('../src/gamedb');
  check('3,335 titles', db.GAMES.length, 3335);
  check('every entry has a name', db.GAMES.every(g => !!g.n), true);
  check('every entry has an API', db.GAMES.every(g => Array.isArray(g.api) && g.api.length), true);
}

console.log('=== build stamp ===');
{
  /* stamp-build.js hashes files that themselves contain BUILD_ID, so stamping is deliberately not
   * idempotent and an equality check could never hold. Assert the shape, and that the stamp has
   * actually moved off the value the pre-fix build shipped with. */
  const main = R('main.js');
  const id = (main.match(/const BUILD_ID = '([^']*)'/) || [])[1];
  const date = (main.match(/const BUILD_DATE = '([^']*)'/) || [])[1];
  check('BUILD_ID is an 8-char hash', /^[0-9a-f]{8}$/.test(id || ''), true);
  check('BUILD_DATE is set', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(date || ''), true);
  check('BUILD_ID was re-stamped after these changes', id !== '86fc41b8', true);
}

console.log(`\nsmoke: ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
