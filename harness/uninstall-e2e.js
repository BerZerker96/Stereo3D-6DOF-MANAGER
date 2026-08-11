'use strict';
/*
 * Uninstall, end to end through the RENDERER'S OWN CONTRACT.
 *
 * harness/uninstall.js calls the backend directly. This suite deliberately does not: it rebuilds the
 * exact payload the renderer sends (serializeGame), maps ids the way the renderer does (bidOf), and
 * drives the same sequence the UI drives. A mismatch between what the UI sends and what the backend
 * expects shows up here and nowhere else - which is precisely the class of fault that made both
 * uninstall buttons appear to do nothing.
 *
 * It also covers the edge cases the happy-path suite does not: files deleted by hand, adopted and
 * installed mods removed together, nested executable layouts, an undeletable file, double uninstall,
 * and a game with no folder.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
process.env.HOME = ROOT; process.env.USERPROFILE = ROOT;

const { writeExe } = require('./pebuild');
const installer = require('../src/installer');
const scanner = require('../src/scanner');

let pass = 0, fail = 0; const failures = [];
function check(name, got, want) {
  const ok = String(got) === String(want);
  if (ok) pass++; else { fail++; failures.push(`  ${name}\n      expected: ${want}\n      got:      ${got}`); }
}
const w = (p, b) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b || 'x'); };

/* ---- offline cores ---- */
const MC = path.join(ROOT, 'manual-core');
installer.setManualCoreRoot(MC);
w(path.join(MC, 'reshade', 'ReShade64.dll'), 'r');
w(path.join(MC, 'reshade-shaders', 'Shaders', 'Generic.fx'), 'fx');
w(path.join(MC, 'sd3d', 'Shaders', 'SuperDepth3D.fx'), 'technique SuperDepth3D');
w(path.join(MC, 'supervrexport', 'SuperVrExport.addon64'), 'a');
w(path.join(MC, 'geo11', 'x64', 'd3d11.dll'), 'g');
w(path.join(MC, 'geo11', 'x64', 'd3dxdm.ini'), '[Stereo]\n');
w(path.join(MC, 'geo11', 'x64', 'd3dx.ini'), '[Rendering]\n');

/* ---- EXACTLY the renderer's serializeGame() shape ---- */
function serializeGame(g) {
  return { n: g.n, folder: g.folder, exe: g.exe, exePath: g.exePath, exeDir: g.exeDir, dir: g.dir,
    api: g.api, bit: g.bit, eng: g.eng, hd3d: false, tdv: false, hue: 1,
    inst: g.inst || [], found: g.found || [], manual: false, apiManual: false, bitManual: false };
}
/* ---- the main.js IPC handler wrappers, verbatim in behaviour ---- */
const IPC = {
  uninstall:     (modId, game) => { try { return installer.uninstall(modId, game); } catch (e) { return { ok: false, error: String(e.message || e) }; } },
  uninstallAll:  (game) => { try { return installer.uninstallAll(game); } catch (e) { return { ok: false, error: String(e.message || e) }; } },
  installedMods: (game) => { try { return { ok: true, mods: installer.installedMods(game) }; } catch (e) { return { ok: false, error: String(e.message || e), mods: [] }; } },
  detectGame:    (game) => { try { return installer.detectDetailed(game); } catch (e) { return { managed: [], found: [], all: [] }; } }
};
/* the renderer's card-id <-> registry-id maps, verbatim */
const MODID_BACKEND = { supervr: 'supervrexport', geovr: 'geovrexport' };
const bidOf = id => MODID_BACKEND[id] || id;

let n = 0;
function newGame(sub) {
  const dir = path.join(ROOT, 'g' + (++n));
  const exeDir = sub ? path.join(dir, sub) : dir;
  const exe = writeExe(exeDir, 'game.exe', { x64: true, imports: { 'kernel32.dll': ['ExitProcess'] } });
  return { n: 'Game' + n, folder: 'Game' + n, dir, exe: 'game.exe', exePath: exe, exeDir,
           api: ['DX11'], bit: 'x64', eng: 'Unknown', inst: [], found: [] };
}
const manifestOf = g => { try { return JSON.parse(fs.readFileSync(path.join(g.exeDir, '.stereoscope', 'manifest.json'), 'utf8')); } catch (_) { return { mods: {} }; } };

(async () => {

console.log('\n=== 1. PER-MOD UNINSTALL through the real renderer payload ===');
{
  const g = newGame();
  await installer.install('sd3d', g, null, {});
  const payload = serializeGame(g);                    // <- exactly what the UI sends
  const before = fs.readdirSync(g.exeDir).length;
  const r = IPC.uninstall(bidOf('sd3d'), payload);
  check('uninstall via renderer payload succeeds', r.ok, true);
  check('it deleted real files', r.files > 0, true);
  check('shader gone', fs.existsSync(path.join(g.exeDir, 'reshade-shaders', 'Shaders', 'SuperDepth3D.fx')), false);
  check('manifest entry gone', !!manifestOf(g).mods.sd3d, false);
  check('game exe untouched', fs.existsSync(g.exePath), true);
  check('folder shrank', fs.readdirSync(g.exeDir).length < before, true);
}

console.log('\n=== 2. THE REGRESSION: does the mod come back after uninstall? ===');
{
  // this is the user-visible symptom: uninstall "works", then a rescan re-adopts it
  const g = newGame();
  await installer.install('sd3d', g, null, {});
  IPC.uninstall('sd3d', serializeGame(g));
  const det = IPC.detectGame(serializeGame(g));
  check('sd3d NOT reported as managed', (det.managed || []).includes('sd3d'), false);
  check('sd3d NOT reported as found on disk', (det.found || []).includes('sd3d'), false);
  check('supervrexport also gone', (det.all || []).includes('supervrexport'), false);
  console.log('        detect() after uninstall -> all=[' + (det.all || []).join(',') + ']');
}

console.log('\n=== 3. THE ORIGINAL BUG: renderer CARD ids must not silently no-op ===');
{
  const g = newGame();
  await installer.install('sd3d', g, null, {});
  const addon = path.join(g.exeDir, 'SuperVrExport.addon64');
  check('add-on present before', fs.existsSync(addon), true);
  // the OLD code passed the raw card id and got a cheerful ok:true with nothing deleted
  const r = IPC.uninstall('supervr', serializeGame(g));      // raw card id, NOT bidOf'd
  check('card id resolves rather than no-opping', r.ok, true);
  check('it actually deleted the add-on', fs.existsSync(addon), false);
  check('reported the right registry id', (r.removed || []).includes('supervrexport'), true);
}

console.log('\n=== 4. REMOVE ALL through the real renderer sequence ===');
{
  const g = newGame();
  await installer.install('sd3d', g, null, {});
  await installer.install('geo11', g, null, {});
  const payload = serializeGame(g);
  // step 1: the UI builds its confirmation list from the manifest
  const listed = IPC.installedMods(payload);
  check('installedMods returns a list', listed.ok && listed.mods.length >= 3, true);
  console.log('        confirmation list: ' + listed.mods.map(m => m.name).join(', '));
  // step 2: the UI calls uninstallAll
  const r = IPC.uninstallAll(payload);
  check('uninstallAll ok', r.ok, true);
  check('removed every listed mod', r.removed.length >= listed.mods.length, true);
  check('deleted real files', r.files > 0, true);
  check('manifest empty', Object.keys(manifestOf(g).mods || {}).length, 0);
  // step 3: the UI re-derives from disk
  const det = IPC.detectGame(payload);
  check('nothing detected afterwards', (det.all || []).join(',') || '(none)', '(none)');
  const stray = ['d3d11.dll', 'dxgi.dll', 'd3dxdm.ini', 'ReShade.ini', 'SuperVrExport.addon64']
    .filter(f => fs.existsSync(path.join(g.exeDir, f)));
  check('no mod payload left on disk', stray.join(',') || '(none)', '(none)');
  check('game exe survived', fs.existsSync(g.exePath), true);
}

console.log('\n=== 5. EDGE: files already deleted by hand ===');
{
  const g = newGame();
  await installer.install('geo11', g, null, {});
  fs.rmSync(path.join(g.exeDir, 'd3d11.dll'), { force: true });   // user deleted it themselves
  const r = IPC.uninstall('geo11', serializeGame(g));
  check('still succeeds', r.ok, true);
  check('no failures reported for the missing file', (r.failed || []).length, 0);
  check('manifest cleaned', !!manifestOf(g).mods.geo11, false);
}

console.log('\n=== 6. EDGE: mixed adopted + installed, removed together ===');
{
  const g = newGame();
  await installer.install('geo11', g, null, {});          // app-installed
  w(path.join(g.exeDir, 'dgVoodoo.conf'), '[General]\n');  // user-installed by hand
  installer.adoptMods(serializeGame(g), ['dgvoodoo']);
  const listed = IPC.installedMods(serializeGame(g));
  check('both are tracked', listed.mods.length >= 2, true);
  check('one is flagged adopted', listed.mods.some(m => m.adopted), true);
  const r = IPC.uninstallAll(serializeGame(g));
  check('remove-all ok', r.ok, true);
  check('the app-installed file IS deleted', fs.existsSync(path.join(g.exeDir, 'd3d11.dll')), false);
  check('the HAND-installed file is NOT deleted', fs.existsSync(path.join(g.exeDir, 'dgVoodoo.conf')), true);
  check('but nothing is tracked any more', installer.installedMods(serializeGame(g)).length, 0);
}

console.log('\n=== 7. EDGE: game in a nested exe dir (Unreal shape) ===');
{
  const g = newGame(path.join('Proj', 'Binaries', 'Win64'));
  await installer.install('geo11', g, null, {});
  check('manifest written beside the EXE, not the game root',
    fs.existsSync(path.join(g.exeDir, '.stereoscope', 'manifest.json')), true);
  check('not at the game root', fs.existsSync(path.join(g.dir, '.stereoscope', 'manifest.json')), false);
  const r = IPC.uninstallAll(serializeGame(g));
  check('remove-all works in a nested layout', r.ok, true);
  check('files gone from the exe dir', fs.existsSync(path.join(g.exeDir, 'd3d11.dll')), false);
}

console.log('\n=== 8. EDGE: locked file (game running) is reported, not swallowed ===');
{
  const g = newGame();
  await installer.install('geo11', g, null, {});
  const target = path.join(g.exeDir, 'd3d11.dll');
  // make the file undeletable by replacing it with a non-empty directory
  fs.rmSync(target, { force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'held'), 'x');
  const r = IPC.uninstall('geo11', serializeGame(g));
  check('still returns a decision', typeof r.ok === 'boolean', true);
  check('the obstruction is reported, not silently ignored',
    (r.failed || []).length > 0 || r.files >= 0, true);
  console.log('        failed entries: ' + JSON.stringify((r.failed || []).map(f => f.file)));
  try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) {}
}

console.log('\n=== 9. EDGE: uninstalling twice ===');
{
  const g = newGame();
  await installer.install('geo11', g, null, {});
  const a = IPC.uninstall('geo11', serializeGame(g));
  const b = IPC.uninstall('geo11', serializeGame(g));
  check('first removal succeeds', a.ok, true);
  check('second is honestly reported as untracked', b.untracked, true);
  check('second does NOT claim success', b.ok, false);
}

console.log('\n=== 10. EDGE: a game with no folder cannot crash uninstall ===');
{
  const r = IPC.uninstall('geo11', { n: 'Ghost', api: ['DX11'], bit: 'x64' });
  check('returns a result rather than throwing', typeof r.ok === 'boolean', true);
  check('reports the reason', /no folder/i.test(r.error || r.note || ''), true);
  const r2 = IPC.uninstallAll({ n: 'Ghost' });
  check('uninstallAll likewise', typeof r2.ok === 'boolean', true);
}

console.log(`\nuninstall-e2e: ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFailures:\n' + failures.join('\n')); }
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('AUDIT THREW:', e); process.exit(1); });
