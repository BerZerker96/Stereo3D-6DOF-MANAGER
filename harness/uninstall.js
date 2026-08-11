'use strict';
/*
 * Install / uninstall lifecycle.
 *
 * The whole point of the manifest is that uninstall removes exactly what was placed and nothing
 * else. These tests exercise the real installer against a sandboxed game folder, using the
 * manual-core mechanism so nothing touches the network.
 *
 * Covers the two bugs that made both uninstall buttons look broken:
 *   - an unknown / untracked id used to answer ok:true and delete nothing
 *   - "remove all" looped over the UI's card ids, which match no manifest record
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'uninst-'));
process.env.HOME = ROOT;                       // userData falls back to $HOME/.stereoscope
process.env.USERPROFILE = ROOT;

const { writeExe } = require('./pebuild');
const installer = require('../src/installer');

let pass = 0, fail = 0; const failures = [];
function check(name, got, want) {
  const ok = String(got) === String(want);
  if (ok) pass++; else { fail++; failures.push(`  ${name}\n      expected: ${want}\n      got:      ${got}`); }
}
const w = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body || 'binary'); };
const exists = p => { try { return fs.existsSync(p); } catch (_) { return false; } };

/* ---- a manual-core tree so every install resolves offline ---- */
const MC = path.join(ROOT, 'manual-core');
installer.setManualCoreRoot(MC);
w(path.join(MC, 'reshade', 'ReShade64.dll'), 'reshade-x64');
w(path.join(MC, 'reshade', 'ReShade32.dll'), 'reshade-x86');
w(path.join(MC, 'reshade-shaders', 'Shaders', 'Generic.fx'), 'fx');
w(path.join(MC, 'reshade-shaders', 'Textures', 'noise.png'), 'png');
w(path.join(MC, 'sd3d', 'Shaders', 'SuperDepth3D.fx'), 'technique SuperDepth3D');
w(path.join(MC, 'sd3d', 'Shaders', 'Depth3D.fxh'), 'header');
w(path.join(MC, 'supervrexport', 'SuperVrExport.addon64'), 'addon');
w(path.join(MC, 'geo11', 'x64', 'd3d11.dll'), 'geo11');
w(path.join(MC, 'geo11', 'x64', 'd3dxdm.ini'), '[Stereo]\n');
w(path.join(MC, 'geo11', 'x64', 'd3dx.ini'), '[Rendering]\n');

/* ---- a sandboxed game ---- */
function newGame(name) {
  const dir = path.join(ROOT, 'games', name);
  const exe = writeExe(dir, name + '.exe', { x64: true, imports: { 'd3d11.dll': ['D3D11CreateDeviceAndSwapChain'] } });
  return { n: name, folder: name, dir, exe: path.basename(exe), exePath: exe, exeDir: dir, api: ['DX11'], bit: 'x64', eng: 'Unknown' };
}
const manifestOf = g => { try { return JSON.parse(fs.readFileSync(path.join(g.exeDir, '.stereoscope', 'manifest.json'), 'utf8')); } catch (_) { return { mods: {} }; } };

(async () => {

  console.log('=== the app records what it installs ===');
  const g1 = newGame('TrackMe');
  const r1 = await installer.install('geo11', g1, null, {});
  check('geo-11 installs', r1.ok, true);
  const m1 = manifestOf(g1);
  check('manifest records geo11', !!m1.mods.geo11, true);
  check('manifest lists the files it placed', (m1.mods.geo11.files || []).length > 0, true);
  check('d3d11.dll is on disk', exists(path.join(g1.exeDir, 'd3d11.dll')), true);
  check('installedMods() reports it', installer.installedMods(g1).map(x => x.id).join(','), 'geo11');

  console.log('=== per-mod uninstall removes exactly what was placed ===');
  const placed = (m1.mods.geo11.files || []).slice();
  const u1 = installer.uninstall('geo11', g1);
  check('uninstall reports ok', u1.ok, true);
  check('uninstall reports a real file count', u1.files > 0, true);
  check('every recorded file is gone', placed.every(f => !exists(path.join(g1.exeDir, f))), true);
  check('manifest entry removed', !!manifestOf(g1).mods.geo11, false);
  check('the game exe is untouched', exists(g1.exePath), true);
  check('installedMods() is now empty', installer.installedMods(g1).length, 0);

  console.log('=== an untracked id is reported honestly, not faked ===');
  const g2 = newGame('Untracked');
  const u2 = installer.uninstall('geo11', g2);
  check('ok is false', u2.ok, false);
  check('flagged untracked', u2.untracked, true);
  check('explains itself', /not recorded as installed/i.test(u2.note || ''), true);
  // the UI card ids must never silently resolve to "no such mod"
  const g3 = newGame('AliasCheck');
  await installer.install('sd3d', g3, null, {});
  const u3 = installer.uninstall('supervr', g3);            // renderer card id, not the registry id
  check('card id "supervr" resolves to supervrexport', u3.ok, true);
  check('...and actually removed something', u3.removed.includes('supervrexport'), true);

  console.log('=== locked add-ons come off with their host ===');
  const g4 = newGame('Locked');
  const r4 = await installer.install('sd3d', g4, null, {});
  check('SuperDepth3D installs', r4.ok, true);
  const m4 = manifestOf(g4);
  check('ReShade installed as its host', !!m4.mods.reshade, true);
  check('SuperVrExport locked to sd3d', (m4.mods.supervrexport || {}).lockedBy, 'sd3d');
  const addon = path.join(g4.exeDir, 'SuperVrExport.addon64');
  check('add-on is on disk', exists(addon), true);
  const u4 = installer.uninstall('sd3d', g4);
  check('removing the host removes the locked add-on', u4.removed.includes('supervrexport'), true);
  check('add-on file deleted', exists(addon), false);
  check('ReShade survives (it is a host, not a guest)', !!manifestOf(g4).mods.reshade, true);

  console.log('=== remove all: every mod, in dependency order ===');
  const g5 = newGame('RemoveAll');
  await installer.install('sd3d', g5, null, {});
  await installer.install('geo11', g5, null, {});
  const before = installer.installedMods(g5).map(x => x.id).sort();
  check('several mods are recorded', before.length >= 3, true);
  const all = installer.uninstallAll(g5);
  check('uninstallAll reports ok', all.ok, true);
  check('it removed every recorded mod', installer.installedMods(g5).length, 0);
  check('it deleted real files', all.files > 0, true);
  check('manifest has no mods left', Object.keys(manifestOf(g5).mods || {}).length, 0);
  check('the game exe is still there', exists(g5.exePath), true);
  // nothing this app placed may survive
  const leftovers = ['d3d11.dll', 'SuperVrExport.addon64', 'ReShade.ini', 'dxgi.dll']
    .filter(f => exists(path.join(g5.exeDir, f)));
  check('no mod payload left behind', leftovers.join(',') || '(none)', '(none)');

  console.log('=== remove all on a clean game says so rather than failing ===');
  const g6 = newGame('Clean');
  const all6 = installer.uninstallAll(g6);
  check('ok', all6.ok, true);
  check('flagged as nothing to do', all6.nothing, true);

  console.log('=== adopted mods are de-registered, never deleted ===');
  const g7 = newGame('Adopted');
  w(path.join(g7.exeDir, 'd3dxdm.ini'), '[Stereo]\ndm_separation=5\n');   // hand-installed by the user
  installer.adoptMods(g7, ['geo11']);
  check('adopted into the manifest', !!manifestOf(g7).mods.geo11, true);
  const u7 = installer.uninstall('geo11', g7);
  check('uninstall ok', u7.ok, true);
  check('flagged adopted', u7.adopted, true);
  check('the user\'s own file is NOT deleted', exists(path.join(g7.exeDir, 'd3dxdm.ini')), true);
  check('but it is no longer managed', installer.installedMods(g7).length, 0);

  console.log('=== reinstall after uninstall leaves no drift ===');
  const g8 = newGame('Drift');
  const shape = [];
  for (let i = 0; i < 3; i++) {
    await installer.install('geo11', g8, null, {});
    shape.push((manifestOf(g8).mods.geo11.files || []).slice().sort().join('|'));
    installer.uninstall('geo11', g8);
    check('pass ' + (i + 1) + ': folder returns to clean', Object.keys(manifestOf(g8).mods || {}).length, 0);
  }
  check('file footprint identical on every pass', new Set(shape).size, 1);

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\nuninstall: ${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch(e => { console.error('SUITE THREW:', e); process.exit(1); });
