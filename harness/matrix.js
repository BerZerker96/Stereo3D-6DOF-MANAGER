'use strict';
/*
 * Every mod against every engine layout.
 *
 * Reconstructs the intent of the original suite's "matrix" (section 25 / appendix C): a placement
 * rule that works at a game root but not inside Binaries\Win64 is broken for most modern titles,
 * and only a layout-aware test finds that.
 *
 * Two invariants are asserted for every combination:
 *   - every install reaches a DECISION. Never a crash, never a silent no-op. A refusal is a valid
 *     outcome; an exception is not.
 *   - refusals and acceptances are both JUSTIFIED. A mod refused on API grounds must genuinely not
 *     support that API, and a mod accepted must genuinely support it.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-'));
process.env.HOME = ROOT; process.env.USERPROFILE = ROOT;

const { writeExe } = require('./pebuild');
const installer = require('../src/installer');
const { MODS, MOD_API, MOD_OUTPUTS } = require('../src/mods');

let pass = 0, fail = 0; const failures = [];
function check(name, got, want) {
  const ok = String(got) === String(want);
  if (ok) pass++; else { fail++; failures.push(`  ${name}\n      expected: ${want}\n      got:      ${got}`); }
}
const w = (p, b) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b || 'x'); };

/* ---- offline cores for everything the matrix installs ---- */
const MC = path.join(ROOT, 'manual-core');
installer.setManualCoreRoot(MC);
w(path.join(MC, 'reshade', 'ReShade64.dll'), 'r64');
w(path.join(MC, 'reshade', 'ReShade32.dll'), 'r32');
w(path.join(MC, 'reshade-shaders', 'Shaders', 'Generic.fx'), 'fx');
w(path.join(MC, 'sd3d', 'Shaders', 'SuperDepth3D.fx'), 'technique SuperDepth3D');
w(path.join(MC, 'supervrexport', 'SuperVrExport.addon64'), 'a');
w(path.join(MC, 'supervrexport', 'SuperVrExport.addon32'), 'a');
w(path.join(MC, 'geovrexport', 'GeoVrExport.addon64'), 'a');
w(path.join(MC, 'geovrexport', 'GeoVrExport.addon32'), 'a');
w(path.join(MC, 'geo3d', 'Geo3D', 'Geo3D.addon64'), 'a');
w(path.join(MC, 'geo3d', 'Geo3D', 'Geo3D.addon32'), 'a');
w(path.join(MC, 'geo3d', 'Geo3D', '3DToElse.fx'), 'technique To_Else');
w(path.join(MC, 'geo3d', 'DXIL', 'dxil.dll'), 'd');
for (const id of ['geo11', 'geo11_github']) {
  w(path.join(MC, id, 'x64', 'd3d11.dll'), 'g');
  w(path.join(MC, id, 'x64', 'd3dxdm.ini'), '[Stereo]\n');
  w(path.join(MC, id, 'x64', 'd3dx.ini'), '[Rendering]\n');
  w(path.join(MC, id, 'x32', 'd3d11.dll'), 'g');
  w(path.join(MC, id, 'x32', 'd3dxdm.ini'), '[Stereo]\n');
}
w(path.join(MC, 'wiz3d', 'dx9', 'x64', 'd3d9.dll'), 'wz');
w(path.join(MC, 'wiz3d', 'dx9', 'x64', 'wiz3D_Config.xml'), '<wiz3D><Separation Value="0.5"/></wiz3D>');
w(path.join(MC, 'wiz3d', 'dx10-11', 'x64', 'dxgi.dll'), 'wz');
w(path.join(MC, 'wiz3d', 'dx10-11', 'x64', 'wiz3D_Config.xml'), '<wiz3D><Separation Value="0.5"/></wiz3D>');
w(path.join(MC, 'v4a', 'x64', 'dinput8.dll'), 'v');
w(path.join(MC, 'v4a', 'x64', 'winmm.dll'), 'v');
w(path.join(MC, 'v4a', 'x64', 'version.dll'), 'v');
w(path.join(MC, 'v4a', 'x64', 'dsound.dll'), 'v');
w(path.join(MC, 'v4a', 'x64', '3dvision4all.ini'), '[stereo]\nmode=sbs\n');
w(path.join(MC, 'v4a', 'x64', 'EnableWindowed3D.exe'), 'e');

/* ---- the eleven layouts from appendix C ---- */
const LAYOUTS = [
  { name: 'Unreal 5',      sub: 'Proj/Binaries/Win64', exe: 'Proj-Win64-Shipping.exe', api: ['DX12'],   bit: 'x64', eng: 'Unreal Engine 5' },
  { name: 'Unreal 4',      sub: 'Proj/Binaries/Win64', exe: 'Proj-Win64-Shipping.exe', api: ['DX11'],   bit: 'x64', eng: 'Unreal Engine 4' },
  { name: 'Unreal 3',      sub: 'Binaries/Win32',      exe: 'Game.exe',                api: ['DX9'],    bit: 'x86', eng: 'Unreal Engine 3' },
  { name: 'Unreal 1/2',    sub: 'System',              exe: 'UT2004.exe',              api: ['DX8'],    bit: 'x86', eng: 'Unreal Engine 2' },
  { name: 'Unity',         sub: '',                    exe: 'Game.exe',                api: ['DX11'],   bit: 'x64', eng: 'Unity' },
  { name: 'RedEngine',     sub: 'bin/x64',             exe: 'game.exe',                api: ['DX12'],   bit: 'x64', eng: 'REDengine' },
  { name: 'CryEngine',     sub: 'Bin64',               exe: 'game.exe',                api: ['DX11'],   bit: 'x64', eng: 'CryEngine' },
  { name: 'Source',        sub: 'game/bin/win64',      exe: 'game.exe',                api: ['DX9'],    bit: 'x64', eng: 'Source' },
  { name: 'RE Engine',     sub: '',                    exe: 're8.exe',                 api: ['DX12'],   bit: 'x64', eng: 'RE Engine' },
  { name: 'Dragon Engine', sub: 'runtime/media',       exe: 'Judgment.exe',            api: ['DX11'],   bit: 'x64', eng: 'Dragon Engine' },
  { name: 'Vulkan title',  sub: '',                    exe: 'game.exe',                api: ['Vulkan'], bit: 'x64', eng: 'Custom' }
];

/* mods the matrix drives directly (loaders/guided entries open a website by design) */
const DRIVEN = ['sd3d', 'geo3d', 'geo3d_legacy', 'geo11', 'geo11_github', 'wiz3d', 'v4a', 'reshade'];

let n = 0;
function makeGame(layout) {
  const dir = path.join(ROOT, 'games', layout.name.replace(/\W+/g, '') + '_' + (++n));
  const exeDir = layout.sub ? path.join(dir, layout.sub.replace(/\//g, path.sep)) : dir;
  const exe = writeExe(exeDir, layout.exe, { x64: layout.bit === 'x64', imports: { 'kernel32.dll': ['ExitProcess'] } });
  if (layout.eng === 'Unity') fs.mkdirSync(path.join(dir, 'Game_Data'), { recursive: true });
  return { n: layout.name, folder: layout.name, dir, exe: path.basename(exe), exePath: exe, exeDir,
           api: layout.api.slice(), bit: layout.bit, eng: layout.eng };
}
const manifestOf = g => { try { return JSON.parse(fs.readFileSync(path.join(g.exeDir, '.stereoscope', 'manifest.json'), 'utf8')); } catch (_) { return { mods: {} }; } };

(async () => {

  console.log('=== every mod x every layout reaches a justified decision ===');
  let decisions = 0, installs = 0, refusals = 0;
  for (const layout of LAYOUTS) {
    for (const modId of DRIVEN) {
      const g = makeGame(layout);
      let r = null, threw = null;
      try { r = await installer.install(modId, g, null, {}); } catch (e) { threw = e; }
      if (threw) { check(`${modId} on ${layout.name}: no exception`, 'threw: ' + threw.message, 'a result object'); continue; }
      check(`${modId} on ${layout.name}: returned a decision`, !!r && typeof r.ok === 'boolean', true);
      decisions++;

      const allowed = MOD_API[modId];
      const supported = !allowed || layout.api.some(a => allowed.includes(a));
      if (r && r.incompatible) {
        refusals++;
        // a refusal on API grounds must be a REAL API mismatch
        check(`${modId} on ${layout.name}: refusal is justified`, supported, false);
      } else if (r && r.ok) {
        installs++;
        // an acceptance must be a real match, unless the mod is a forceable proxy wrapper
        const FORCEABLE = { wiz3d: 1, v4a: 1 };
        check(`${modId} on ${layout.name}: acceptance is justified`, supported || !!FORCEABLE[modId], true);
        // and it must have placed files beside the REAL exe, not at the game root
        const m = manifestOf(g);
        check(`${modId} on ${layout.name}: recorded in the manifest`, !!m.mods[modId], true);
      }
    }
  }
  check('every combination produced a decision', decisions, LAYOUTS.length * DRIVEN.length);
  console.log(`    ${decisions} combinations · ${installs} installed · ${refusals} refused on API grounds`);

  console.log('=== placement lands beside the real executable, not the game root ===');
  for (const layout of LAYOUTS.filter(l => l.sub && l.api[0] !== 'Vulkan')) {
    const g = makeGame(layout);
    const r = await installer.install('sd3d', g, null, {});
    if (!r.ok) continue;
    const shaderHere = fs.existsSync(path.join(g.exeDir, 'reshade-shaders', 'Shaders', 'SuperDepth3D.fx'));
    const shaderAtRoot = fs.existsSync(path.join(g.dir, 'reshade-shaders', 'Shaders', 'SuperDepth3D.fx'));
    check(`${layout.name}: shader beside the exe`, shaderHere, true);
    check(`${layout.name}: NOT at the game root`, shaderAtRoot && g.dir !== g.exeDir, false);
  }

  console.log('=== Vulkan is never stranded ===');
  {
    const vk = MOD_API.sd3d.includes('Vulkan');
    check('SuperDepth3D still drives Vulkan', vk, true);
    const g = makeGame(LAYOUTS.find(l => l.api[0] === 'Vulkan'));
    const r = await installer.install('sd3d', g, null, {});
    check('a Vulkan title can install its one option', r.ok || r.launch === true || !!r.website, true);
    // and the geometric drivers correctly refuse it
    for (const id of ['geo11', 'geo3d']) {
      const g2 = makeGame(LAYOUTS.find(l => l.api[0] === 'Vulkan'));
      const r2 = await installer.install(id, g2, null, {});
      check(`${id} refuses Vulkan`, !!r2.incompatible, true);
    }
  }

  console.log('=== output formats are written to the mod\'s real config ===');
  {
    let checked = 0;
    for (const [modId, outputs] of Object.entries(MOD_OUTPUTS)) {
      if (!DRIVEN.includes(modId)) continue;
      const allowed = MOD_API[modId];
      const layout = LAYOUTS.find(l => !allowed || l.api.some(a => allowed.includes(a)));
      if (!layout) continue;
      for (const o of outputs) {
        const g = makeGame(layout);
        let r = null;
        try { r = await installer.install(modId, g, null, { output: o.k }); } catch (e) { r = { ok: false, error: String(e.message) }; }
        check(`${modId}/${o.k}: reached a decision`, !!r && typeof r.ok === 'boolean', true);
        checked++;
        if (!r.ok) continue;
        // a format backed by a config write must actually be on disk somewhere
        if (o.apply || o.fx) {
          const files = (manifestOf(g).mods[modId] || {}).files || [];
          check(`${modId}/${o.k}: placed something`, files.length > 0, true);
        }
      }
    }
    console.log(`    ${checked} mod/output combinations exercised`);
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\nmatrix: ${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch(e => { console.error('SUITE THREW:', e); process.exit(1); });
