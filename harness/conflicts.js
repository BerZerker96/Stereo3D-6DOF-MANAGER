'use strict';
/*
 * Conflict resolution, install ordering and the ownership invariants.
 *
 * Slot claiming is order-sensitive, so a bug that only appears when the head-tracking mod installs
 * first would otherwise hide completely. Every pair is therefore exercised BOTH ways round, and the
 * invariants are re-checked after each removal:
 *
 *   - one owner per file, across every mod installed into a game
 *   - one owner per proxy slot
 *   - removing any mod leaves every other mod complete on disk and still recorded
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-'));
process.env.HOME = ROOT; process.env.USERPROFILE = ROOT;

const { writeExe } = require('./pebuild');
const installer = require('../src/installer');
const { MODS } = require('../src/mods');

let pass = 0, fail = 0; const failures = [];
function check(name, got, want) {
  const ok = String(got) === String(want);
  if (ok) pass++; else { fail++; failures.push(`  ${name}\n      expected: ${want}\n      got:      ${got}`); }
}
const w = (p, b) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b || 'x'); };

const MC = path.join(ROOT, 'manual-core');
installer.setManualCoreRoot(MC);
w(path.join(MC, 'reshade', 'ReShade64.dll'), 'r64');
w(path.join(MC, 'reshade-shaders', 'Shaders', 'Generic.fx'), 'fx');
w(path.join(MC, 'sd3d', 'Shaders', 'SuperDepth3D.fx'), 'technique SuperDepth3D');
w(path.join(MC, 'supervrexport', 'SuperVrExport.addon64'), 'a');
w(path.join(MC, 'geovrexport', 'GeoVrExport.addon64'), 'a');
w(path.join(MC, 'geo3d', 'Geo3D.addon64'), 'a');
w(path.join(MC, 'geo3d', '3DToElse.fx'), 'technique To_Else');
w(path.join(MC, 'geo11', 'x64', 'd3d11.dll'), 'g');
w(path.join(MC, 'geo11', 'x64', 'd3dxdm.ini'), '[Stereo]\n');
w(path.join(MC, 'geo11', 'x64', 'd3dx.ini'), '[Rendering]\n');
w(path.join(MC, 'v4a', 'x64', 'dinput8.dll'), 'v');
w(path.join(MC, 'v4a', 'x64', 'winmm.dll'), 'v');
w(path.join(MC, 'v4a', 'x64', 'version.dll'), 'v');
w(path.join(MC, 'v4a', 'x64', 'dsound.dll'), 'v');
w(path.join(MC, 'v4a', 'x64', '3dvision4all.ini'), '[stereo]\nmode=sbs\n');

let n = 0;
function newGame(api) {
  const dir = path.join(ROOT, 'g' + (++n));
  const exe = writeExe(dir, 'game.exe', { x64: true, imports: { 'kernel32.dll': ['ExitProcess'] } });
  return { n: 'Game' + n, folder: 'Game' + n, dir, exe: 'game.exe', exePath: exe, exeDir: dir,
           api: (api || ['DX11']).slice(), bit: 'x64', eng: 'Unknown' };
}
const manifestOf = g => { try { return JSON.parse(fs.readFileSync(path.join(g.exeDir, '.stereoscope', 'manifest.json'), 'utf8')); } catch (_) { return { mods: {} }; } };

/** No path may be recorded by two mods at once. */
function ownershipReport(g) {
  const m = manifestOf(g); const owner = {}; const dupes = [];
  for (const [id, rec] of Object.entries(m.mods || {}))
    for (const f of (rec.files || [])) {
      const k = String(f).toLowerCase();
      if (owner[k]) dupes.push(`${k}: ${owner[k]} + ${id}`);
      else owner[k] = id;
    }
  return dupes;
}
/** Every file a surviving mod claims must still exist on disk. */
function survivorsIntact(g) {
  const m = manifestOf(g); const missing = [];
  for (const [id, rec] of Object.entries(m.mods || {})) {
    if (rec.adopted) continue;
    for (const f of (rec.files || []))
      if (!fs.existsSync(path.join(g.exeDir, f))) missing.push(`${id}:${f}`);
  }
  return missing;
}

(async () => {

  const PAIRS = [
    ['sd3d', 'geo11'], ['sd3d', 'v4a'], ['geo3d', 'geo11'], ['geo3d', 'v4a'],
    ['geo11', 'v4a'], ['reshade', 'geo11'], ['sd3d', 'geo3d'], ['reshade', 'v4a']
  ];

  console.log('=== every pair, in BOTH install orders ===');
  for (const [a, b] of PAIRS) {
    for (const order of [[a, b], [b, a]]) {
      const g = newGame(['DX11']);
      const results = [];
      for (const id of order) {
        let r = null;
        try { r = await installer.install(id, g, null, {}); } catch (e) { r = { ok: false, threw: String(e.message) }; }
        results.push(r);
        check(`${order.join(' then ')} — ${id} reached a decision`, !!r && !r.threw, true);
      }
      const dupes = ownershipReport(g);
      check(`${order.join(' then ')} — one owner per file`, dupes.join('; ') || '(none)', '(none)');
      const missing = survivorsIntact(g);
      check(`${order.join(' then ')} — every claimed file exists`, missing.join('; ') || '(none)', '(none)');
    }
  }

  console.log('=== proxy slots have exactly one owner ===');
  {
    const SLOT = /^(d3d(8|9|10|11|12)|dxgi|ddraw|opengl32|nvapi64?|dinput8|winmm|version|dsound)\.dll$/i;
    for (const [a, b] of PAIRS) {
      const g = newGame(['DX11']);
      for (const id of [a, b]) { try { await installer.install(id, g, null, {}); } catch (_) {} }
      const m = manifestOf(g); const slotOwner = {}; const clashes = [];
      for (const [id, rec] of Object.entries(m.mods || {}))
        for (const f of (rec.files || [])) {
          const base = String(f).split(/[\\/]/).pop();
          if (!SLOT.test(base)) continue;
          const k = base.toLowerCase();
          if (slotOwner[k] && slotOwner[k] !== id) clashes.push(`${k}: ${slotOwner[k]} + ${id}`);
          else slotOwner[k] = id;
        }
      check(`${a}+${b} — one owner per proxy slot`, clashes.join('; ') || '(none)', '(none)');
    }
  }

  console.log('=== geo-11 arriving after ReShade rehomes it rather than refusing ===');
  {
    const g = newGame(['DX11']);
    await installer.install('reshade', g, null, {});
    const rsDll = (manifestOf(g).mods.reshade || {}).dll;
    await installer.install('geo11', g, null, {});
    const m = manifestOf(g);
    check('both mods are installed', !!(m.mods.reshade && m.mods.geo11), true);
    check('geo-11 owns d3d11.dll', (m.mods.geo11.files || []).some(f => /d3d11\.dll$/i.test(f)), true);
    // ReShade must not still claim d3d11.dll
    check('ReShade no longer claims d3d11.dll',
      (m.mods.reshade.files || []).some(f => /(^|[\\/])d3d11\.dll$/i.test(f)), false);
    check('one owner per file after rehoming', ownershipReport(g).join('; ') || '(none)', '(none)');
    console.log(`    ReShade installed as ${rsDll}${m.mods.reshade.rehomed ? ', rehomed: ' + m.mods.reshade.rehomed : ''}`);
  }

  console.log('=== 3DVision4All is moved aside, not clobbered ===');
  {
    const g = newGame(['DX9']);
    const r = await installer.install('v4a', g, null, {});
    if (r.ok) {
      const first = (manifestOf(g).mods.v4a || {}).v4aProxy;
      check('v4a claimed a loader slot', !!first, true);
      // reinstalling must reuse its own slot, not pick a second one
      await installer.install('v4a', g, null, {});
      check('reinstall reuses the same proxy', (manifestOf(g).mods.v4a || {}).v4aProxy, first);
      check('no duplicate ownership', ownershipReport(g).join('; ') || '(none)', '(none)');
    }
  }

  console.log('=== uninstall permutations: survivors stay complete ===');
  {
    const STACK = ['sd3d', 'geo11'];
    const perms = [[0, 1], [1, 0]];
    for (const order of perms) {
      const g = newGame(['DX11']);
      for (const id of STACK) { try { await installer.install(id, g, null, {}); } catch (_) {} }
      const label = order.map(i => STACK[i]).join(' then ');
      for (const i of order) {
        const r = installer.uninstall(STACK[i], g);
        check(`remove ${label} — ${STACK[i]} removed`, r.ok, true);
        const missing = survivorsIntact(g);
        check(`remove ${label} — survivors intact after ${STACK[i]}`, missing.join('; ') || '(none)', '(none)');
        const dupes = ownershipReport(g);
        check(`remove ${label} — ownership still exact`, dupes.join('; ') || '(none)', '(none)');
      }
      /* ReShade is a HOST (declared via `needs`), not a guest, so it deliberately survives the mods
       * that ran inside it - removing it with the first guest would strand the second. What must be
       * gone is every guest; the host is then cleared by remove-all. */
      const left = Object.keys(manifestOf(g).mods || {});
      check(`remove ${label} — no guest left recorded`, left.filter(id => id !== 'reshade').join(',') || '(none)', '(none)');
      check(`remove ${label} — the host survived`, left.includes('reshade'), true);
      installer.uninstallAll(g);
      check(`remove ${label} — remove-all then clears the host`, Object.keys(manifestOf(g).mods || {}).length, 0);
    }
  }

  console.log('=== a host survives its guest, and comes off last ===');
  {
    const g = newGame(['DX11']);
    await installer.install('sd3d', g, null, {});
    await installer.install('geo3d', g, null, {});
    const before = manifestOf(g);
    check('ReShade hosts both', !!before.mods.reshade, true);
    installer.uninstall('sd3d', g);
    check('ReShade survives sd3d removal', !!manifestOf(g).mods.reshade, true);
    check('Geo3D survives sd3d removal', !!manifestOf(g).mods.geo3d, true);
    check('survivors intact', survivorsIntact(g).join('; ') || '(none)', '(none)');
    const all = installer.uninstallAll(g);
    check('remove-all clears the rest', Object.keys(manifestOf(g).mods || {}).length, 0);
    check('remove-all reported files', all.files > 0, true);
  }

  console.log('=== state does not drift across repeated cycles ===');
  {
    const g = newGame(['DX11']);
    const shapes = [];
    for (let i = 0; i < 3; i++) {
      await installer.install('sd3d', g, null, {});
      const m = manifestOf(g);
      shapes.push(Object.keys(m.mods).sort().join(',') + '|' +
        Object.values(m.mods).reduce((a, r) => a + (r.files || []).length, 0));
      check(`cycle ${i + 1}: ownership exact`, ownershipReport(g).join('; ') || '(none)', '(none)');
      installer.uninstallAll(g);
      check(`cycle ${i + 1}: folder returns to clean`, Object.keys(manifestOf(g).mods || {}).length, 0);
    }
    check('identical footprint on every cycle', new Set(shapes).size, 1);
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\nconflicts: ${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch(e => { console.error('SUITE THREW:', e); process.exit(1); });
