'use strict';
/*
 * Configuration round-trips.
 *
 * The original handoff calls this the most repeated assertion in the codebase, and for good reason:
 * a configuration editor that silently fails to save is worse than not having one. Three guarantees
 * are asserted here:
 *
 *   - edits round-trip: writing a value and reading it back returns the value written
 *   - unknown keys survive: a key the app has never heard of is preserved through an edit AND
 *     through a mod upgrade
 *   - defaults seed without overwriting: installing fills in missing sections but never replaces a
 *     value the user already set
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
process.env.HOME = ROOT; process.env.USERPROFILE = ROOT;

const { writeExe } = require('./pebuild');
const installer = require('../src/installer');
const cfg = require('../src/config');

let pass = 0, fail = 0; const failures = [];
function check(name, got, want) {
  const ok = String(got) === String(want);
  if (ok) pass++; else { fail++; failures.push(`  ${name}\n      expected: ${want}\n      got:      ${got}`); }
}
const w = (p, b) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b || 'x'); };

const MC = path.join(ROOT, 'manual-core');
installer.setManualCoreRoot(MC);
w(path.join(MC, 'reshade', 'ReShade64.dll'), 'r');
w(path.join(MC, 'reshade-shaders', 'Shaders', 'Generic.fx'), 'fx');
w(path.join(MC, 'sd3d', 'Shaders', 'SuperDepth3D.fx'), 'technique SuperDepth3D');
w(path.join(MC, 'supervrexport', 'SuperVrExport.addon64'), 'a');
w(path.join(MC, 'geo11', 'x64', 'd3d11.dll'), 'g');
w(path.join(MC, 'geo11', 'x64', 'd3dxdm.ini'), '[Stereo]\ndm_separation = 5\n');
w(path.join(MC, 'geo11', 'x64', 'd3dx.ini'), '[Rendering]\nforce_stereo = 1\n');

let n = 0;
function newGame() {
  const dir = path.join(ROOT, 'g' + (++n));
  const exe = writeExe(dir, 'game.exe', { x64: true, imports: { 'kernel32.dll': ['ExitProcess'] } });
  return { n: 'Game' + n, folder: 'Game' + n, dir, exe: 'game.exe', exePath: exe, exeDir: dir,
           api: ['DX11'], bit: 'x64', eng: 'Unknown' };
}

(async () => {

  console.log('=== the INI parser preserves what it does not understand ===');
  {
    const f = path.join(ROOT, 'rt.ini');
    const original = [
      '; a leading comment',
      '',
      '[Stereo]',
      'dm_separation = 5      ; inline comment',
      'dm_convergence=10',
      'a_key_nobody_knows = keepme',
      '',
      '# another comment style',
      '[Unknown Section]',
      'weird = value'
    ].join('\r\n') + '\r\n';
    fs.writeFileSync(f, original);

    cfg.writeConfig(f, { Stereo: { dm_separation: '17' } });
    const after = fs.readFileSync(f, 'utf8');
    const read = cfg.readConfig(f).sections;

    check('the edited value round-trips', read.Stereo.dm_separation, '17');
    check('an untouched key survives', read.Stereo.dm_convergence, '10');
    check('an UNKNOWN key survives', read.Stereo.a_key_nobody_knows, 'keepme');
    check('an unknown SECTION survives', read['Unknown Section'].weird, 'value');
    check('leading comment preserved', /; a leading comment/.test(after), true);
    check('hash comment preserved', /# another comment style/.test(after), true);
    check('inline comment preserved', /; inline comment/.test(after), true);
    check('a .bak was written', fs.existsSync(f + '.bak'), true);
    check('the .bak holds the ORIGINAL', fs.readFileSync(f + '.bak', 'utf8') === original, true);
    check('CRLF line endings preserved', after.includes('\r\n'), true);
  }

  console.log('=== creating a config from nothing ===');
  {
    const f = path.join(ROOT, 'fresh', 'new.ini');
    cfg.writeConfig(f, { Device: { direct_mode: 'katanga_vr' } });
    check('file created', fs.existsSync(f), true);
    check('value readable', cfg.readConfig(f).sections.Device.direct_mode, 'katanga_vr');
  }

  console.log('=== per-mod config round-trips through the real resolver ===');
  {
    const g = newGame();
    const r = await installer.install('geo11', g, null, {});
    check('geo-11 installed', r.ok, true);

    const before = installer.readModConfig(g, 'geo11');
    check('the editor can read its sections', Object.keys(before.sections).length > 0, true);

    installer.writeModConfig(g, 'geo11', { Stereo: { dm_separation: '42', dm_convergence: '7' } });
    const after = installer.readModConfig(g, 'geo11');
    check('dm_separation round-trips', after.sections.Stereo.dm_separation, '42');
    check('dm_convergence round-trips', after.sections.Stereo.dm_convergence, '7');

    // [Rendering] lives in d3dx.ini, not d3dxdm.ini - the resolver must route it correctly
    installer.writeModConfig(g, 'geo11', { Rendering: { force_stereo: '2' } });
    const dx = cfg.readConfig(path.join(g.exeDir, 'd3dx.ini')).sections;
    check('[Rendering] routed to d3dx.ini', (dx.Rendering || {}).force_stereo, '2');
    const dm = cfg.readConfig(path.join(g.exeDir, 'd3dxdm.ini')).sections;
    check('[Stereo] stayed in d3dxdm.ini', (dm.Stereo || {}).dm_separation, '42');
  }

  console.log('=== a user\'s tuning survives a mod upgrade ===');
  {
    const g = newGame();
    await installer.install('geo11', g, null, {});
    // the user tunes two values, one of which the app ships no default for
    installer.writeModConfig(g, 'geo11', { Stereo: { dm_separation: '33', my_custom_key: 'mine' } });
    check('custom key written', installer.readModConfig(g, 'geo11').sections.Stereo.my_custom_key, 'mine');

    // reinstall over the top (the upgrade path)
    const r2 = await installer.install('geo11', g, null, {});
    check('reinstall succeeded', r2.ok, true);
    const after = installer.readModConfig(g, 'geo11');
    check('tuned value preserved across upgrade', after.sections.Stereo.dm_separation, '33');
    check('UNKNOWN key preserved across upgrade', after.sections.Stereo.my_custom_key, 'mine');
  }

  console.log('=== defaults seed but never overwrite ===');
  {
    const g = newGame();
    // the user has already set a value before installing
    w(path.join(g.exeDir, 'd3dxdm.ini'), '[Stereo]\ndm_separation = 99\n');
    await installer.install('geo11', g, null, {});
    const s = installer.readModConfig(g, 'geo11').sections;
    check('the pre-existing value is not clobbered', s.Stereo.dm_separation, '99');
  }

  console.log('=== adopted mods get their editor seeded, without touching tuned values ===');
  {
    const g = newGame();
    w(path.join(g.exeDir, 'd3dxdm.ini'), '[Stereo]\ndm_separation = 21\n');
    installer.adoptMods(g, ['geo11']);
    const s = installer.readModConfig(g, 'geo11').sections;
    check('the tuned value is untouched', s.Stereo.dm_separation, '21');
    check('missing defaults were seeded', s.Stereo.dm_convergence !== undefined || s.Device !== undefined, true);
  }

  console.log('=== the ReShade preset is resolved, not assumed ===');
  {
    const g = newGame();
    const r = await installer.install('sd3d', g, null, {});
    check('SuperDepth3D installed', r.ok, true);
    const ini = cfg.readConfig(path.join(g.exeDir, 'ReShade.ini')).sections;
    check('ReShade.ini points at a preset', !!(ini.GENERAL && ini.GENERAL.PresetPath), true);
    check('the overlay key is bound to Space (32)', (ini.INPUT || {}).KeyOverlay, '32,0,0,0');
    const preset = installer.activePresetPath(g);
    check('the active preset resolves to a real file', fs.existsSync(preset), true);
    // the technique must be switched ON so the effect is live on first launch
    const p = cfg.readConfig(preset).sections;
    const techs = String((p[''] || {}).Techniques || '');
    check('SuperDepth3D technique enabled in the preset', /SuperDepth3D/i.test(techs), true);
  }

  console.log('=== writeAnalyzed round-trips through whatever file holds the key ===');
  {
    const g = newGame();
    await installer.install('geo11', g, null, {});
    const a = installer.readModAnalyzed(g, 'geo11');
    check('analyzer found settings', a.settings.length > 0, true);
    const row = a.settings.find(x => x.key === 'dm_separation');
    check('analyzer found dm_separation', !!row, true);
    if (row) {
      installer.writeAnalyzed(g, [{ file: row.file, section: row.section, key: row.key, value: '55' }]);
      const b = installer.readModAnalyzed(g, 'geo11');
      const back = b.settings.find(x => x.key === 'dm_separation');
      check('analyzed write round-trips', back && back.value, '55');
    }
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\nconfigs: ${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch(e => { console.error('SUITE THREW:', e); process.exit(1); });
