'use strict';
/*
 * Real game scanner.
 *  - Enumerates fixed drives (Windows letters; POSIX root in dev).
 *  - Reads Steam's libraryfolders.vdf to find every Steam library.
 *  - Lists steamapps/common/<game> plus user-added scan roots.
 *  - Detects bitness from the PE header, and best-effort render API + engine.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

/* ---------- drives ---------- */
function listDrives() {
  if (process.platform !== 'win32') return ['/'];
  const drives = [];
  /* existsSync on a drive root can return false for a volume that is present but momentarily busy,
   * or that denies a stat to a non-elevated process - which is how a machine with C/D/E/F/G ended
   * up offering only C:. Probe with readdir as well, and treat "permission denied" or "busy" as
   * PRESENT, because a drive that refuses to be listed still exists and can still hold games. */
  for (let c = 65; c <= 90; c++) {                 // A..Z, not C..Z: removable volumes count too
    const d = String.fromCharCode(c) + ':\\';
    let present = false;
    try { present = fs.existsSync(d); } catch (_) {}
    if (!present) {
      try { fs.readdirSync(d); present = true; }
      catch (e) { const code = String((e && e.code) || ''); if (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') present = true; }
    }
    if (present) drives.push(d);
  }
  return drives;
}

/* ---------- Steam discovery ---------- */
function steamRoots() {
  const candidates = [];
  if (process.platform === 'win32') {
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    candidates.push(path.join(pf86, 'Steam'));
    candidates.push('C:\\Steam');
    for (const d of listDrives()) candidates.push(path.join(d, 'SteamLibrary'), path.join(d, 'Steam'));
  } else {
    candidates.push(path.join(os.homedir(), '.steam', 'steam'));
    candidates.push(path.join(os.homedir(), '.local', 'share', 'Steam'));
  }
  return candidates.filter(p => { try { return fs.existsSync(p); } catch { return false; } });
}

/** Parse libraryfolders.vdf (loose) for library paths. */
function steamLibraries() {
  const libs = new Set();
  for (const root of steamRoots()) {
    libs.add(root);
    const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf');
    try {
      if (fs.existsSync(vdf)) {
        const txt = fs.readFileSync(vdf, 'utf8');
        const re = /"path"\s*"([^"]+)"/g; let m;
        while ((m = re.exec(txt))) libs.add(m[1].replace(/\\\\/g, '\\'));
      }
    } catch (_) {}
  }
  return [...libs];
}

/* ---------- PE inspection ---------- */
function readBitness(exe) {
  try {
    const fd = fs.openSync(exe, 'r');
    const head = Buffer.alloc(0x40);
    fs.readSync(fd, head, 0, 0x40, 0);
    if (head.readUInt16LE(0) !== 0x5a4d) { fs.closeSync(fd); return 'x86'; } // 'MZ'
    const peOff = head.readUInt32LE(0x3c);
    const sig = Buffer.alloc(6);
    fs.readSync(fd, sig, 0, 6, peOff);
    fs.closeSync(fd);
    if (sig.readUInt32LE(0) !== 0x00004550) return 'x86'; // 'PE\0\0'
    const machine = sig.readUInt16LE(4);
    return machine === 0x8664 ? 'x64' : 'x86'; // 0x14c = i386
  } catch (_) { return 'x64'; }
}

/** Read up to `max` bytes from the start of a file (imports live near the front). */
function readChunk(file, max) {
  try {
    const fd = fs.openSync(file, 'r');
    const size = Math.min(fs.fstatSync(fd).size, max);
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, 0);
    fs.closeSync(fd);
    return buf;
  } catch (_) { return Buffer.alloc(0); }
}

/** Best-effort render API by scanning the exe for imported graphics DLL names. */
function detectApi(exe, buf, dir) {
  const apis = new Set();
  try {
    if (!buf) buf = readChunk(exe, 24 * 1024 * 1024);
    const has = s => buf.includes(Buffer.from(s, 'ascii'));
    if (has('d3d12.dll') || has('D3D12.dll') || has('D3D12Core.dll')) apis.add('DX12');
    if (has('vulkan-1.dll') || has('VULKAN-1.dll')) apis.add('Vulkan');
    if (has('d3d11.dll') || has('D3D11.dll') || has('dxgi.dll') || has('D3D11_')) apis.add('DX11');
    if (has('d3d10.dll') || has('D3D10.dll')) apis.add('DX10');
    if (has('d3d9.dll') || has('D3D9.dll')) apis.add('DX9');
    if (has('d3d8.dll') || has('D3D8.dll')) apis.add('DX8');
    // DirectDraw / Direct3D immediate-mode = the DX7-and-earlier family. Without this a DirectDraw
    // game matched no rule at all and fell through to the DX11 default, so it was never offered
    // dgVoodoo2 (the only thing that can actually run it on a modern stack).
    if (has('ddraw.dll') || has('DDRAW.dll') || has('DDraw.dll')) apis.add('DX7');
    if (has('d3dim.dll') || has('D3DIM.dll') || has('d3dimm.dll') || has('D3DImm.dll')) apis.add('DX7');
    if (has('opengl32.dll') || has('OPENGL32.dll')) apis.add('OpenGL');
  } catch (_) {}
  // Real DLLs sitting in the game folder are a signal - BUT only if they are the game's own.
  // Mods and wrappers (geo-11, ReShade, dgVoodoo, wiz3D, 3DVision4All, the geod3d9 proxy, ASI loaders)
  // deliberately drop files with exactly these names next to the .exe. Counting those would flip a DX9
  // game to "DX11" on the next rescan and then mis-pick the pipeline, the dgVoodoo DLL and the D3D9
  // proxy. So we ignore anything this app installed (tracked in the manifest) and any known wrapper name.
  try {
    const gdir = dir || path.dirname(exe);
    let installed = new Set();
    try {
      const man = JSON.parse(fs.readFileSync(path.join(gdir, '.stereoscope', 'manifest.json'), 'utf8'));
      for (const m of Object.values(man.mods || {})) for (const f of (m.files || [])) installed.add(String(f).toLowerCase().replace(/\\/g, '/').split('/').pop());
    } catch (_) {}
    const WRAPPER_NAMES = /^(d3d(8|9|10|11|12)\.dll|dxgi\.dll|ddraw\.dll|d3dimm\.dll|opengl32\.dll|nvapi(64)?\.dll|dinput8\.dll|winmm\.dll|version\.dll|dsound\.dll|geod3d9\.dll|reshade(32|64)?\.dll)$/i;
    const own = f => !installed.has(f) && !WRAPPER_NAMES.test(f);
    const names = fs.readdirSync(gdir).map(f => f.toLowerCase()).filter(own);
    if (names.includes('vulkan-1.dll')) apis.add('Vulkan');
    if (names.some(f => /^d3d12/.test(f))) apis.add('DX12');
    if (names.some(f => /^d3d11/.test(f))) apis.add('DX11');
  } catch (_) {}
  // exe-name hints (Control_DX12.exe, game_dx11.exe, ...x64vk.exe)
  const base = String(path.basename(exe)).toLowerCase();
  if (/dx12|d3d12/.test(base)) apis.add('DX12');
  if (/dx11|d3d11/.test(base)) apis.add('DX11');
  if (/dx10/.test(base)) apis.add('DX10');
  if (/dx9|d3d9/.test(base)) apis.add('DX9');
  if (/(^|[^a-z])vk([^a-z]|$)|vulkan/.test(base)) apis.add('Vulkan');
  const order = ['DX12', 'Vulkan', 'DX11', 'DX10', 'DX9', 'DX8', 'DX7', 'OpenGL'];   // DX7 was missing here, so DirectDraw games were filtered out and fell back to the DX11 default
  const out = order.filter(a => apis.has(a));
  return out.length ? out : ['DX11']; // safe default
}

/** Best-effort engine detection (drives the head-tracking loader choice). */
function detectEngine(dir, exe) {
  const here = f => { try { return fs.existsSync(path.join(dir, f)); } catch { return false; } };
  const names = (() => { try { return fs.readdirSync(dir); } catch { return []; } })();
  const base = path.basename(exe || '');
  const ep = (exe || '').replace(/\\/g, '/');
  if (here('UnityPlayer.dll') || names.some(f => f.endsWith('_Data'))) return 'Unity';
  if (here('dinput8.dll') && here('reframework')) return 'RE Engine';
  if (/^re\d?\.exe$/i.test(base) || here('re_chunk_000.pak')) return 'RE Engine';
  if (/-Win(64|32|GDK)-Shipping\.exe$/i.test(base) || /\/Binaries\/Win/i.test(ep)) return 'Unreal';       // definitive UE markers
  if (/\/bin\/x64(_dx12)?\//i.test(ep) || here('r4data') || /witcher3\.exe|Cyberpunk2077\.exe/i.test(base)) return 'REDengine';
  if (/\/Bin\/Win64\//i.test(ep) || here('GameSDK') || here('Engine.pak')) return 'CryEngine';
  if (/SkyrimSE\.exe|Fallout4\.exe|Starfield\.exe|Oblivion\.exe/i.test(base)) return 'Creation';
  if (here('bin') && (here('hl2.exe') || here('left4dead2.exe') || here('portal2.exe')) || /\/game\/bin\/win64\//i.test(ep)) return 'Source';
  if (here('Engine') || names.some(f => /-Win64-Shipping\.exe$/i.test(f))) return 'Unreal';                // generic UE fallback (last)
  return 'Unknown';
}

/* ---------- HD3D / 3D-Vision heuristics ---------- */
function detectStereoHw(buf) {
  const has = s => buf.includes(Buffer.from(s, 'ascii'));
  return { hd3d: has('atimgpud') || has('AMD') && has('Quad'), tdv: has('nvapi') || has('StereoEnabled') };
}

/* ---------- pick the main exe in a game dir ---------- */
/* Two tiers, because the old single anchored pattern missed anything whose giveaway sits at the
 * END of the name - "UnityCrashHandler64.exe", "GameBenchmark.exe", "skse64_loader.exe" all
 * sailed past /^crashhandler/ and got picked as the game.
 *
 *   NEVER_EXE  - not a game under any circumstances; skipped outright.
 *   DEMOTE_EXE - probably not the game (launcher, tool, script extender), but might be all there
 *                is, so it sorts last rather than being discarded.
 */
const NEVER_EXE = /(^|[^a-z])(unins\w*|setup|\w*installer|installer\w*|quicksfv|miniconda|vc_?redist|dxsetup|directx|oalinst|dotnet\w*|prereq\w*|ueprereq|crashpad|crashreport\w*|crashhandler\w*|easyanticheat\w*|battleye|be_?service|touchup|activation|cleanup|notification|redist)([^a-z]|$)|crashhandler|crashreport|_redist/i;
const DEMOTE_EXE = /^(play|start|launch|boot|run)[A-Z0-9]|launcher|benchmark|_loader|server\.exe$|editor\.exe$|devkit\.exe$|tool\.exe$|config\.exe$|settings\.exe$|^(skse|f4se|obse|nvse)\d*|dedicated|modmanager|ansel|fbxtogranny|texconv|creationkit|bssndrpt|driverversionchecker|^patch\b|windowsdesktop-runtime|dotnet-runtime|^vc_|oalinst|^activation|crashsender|hkxcmd|chardetect|trainer|cheat\s*engine|\bfling\b|nifskope|bsa\s*browser|xedit|tes5edit|sseedit|fo4edit|loot\.exe$|wrye|mo2|vortex|resaver|papyrus|bethini|enbinjector|d3dcompiler|dxwebsetup|unrealcefsubprocess|epicwebhelper|steamerrorreporter|gameoverlayui|dumper|symbols|pdb|profiler|shadercompiler|shaderc|installscript|bugsplat|crash_?handler|saveremover|pygrun|layerschecker|preprocessor|vrcompositor|wallpaperinject|applicationwallpaper|_tool\d*\.exe$|tool\d*\.exe$|remover|packer|unpacker|extractor|repacker|decompil|disasm|hasher|validator|verifier|diagnos|telemetry|overlay|companion|steamvr|vrmonitor|vrserver|vrdashboard|vrwebhelper|helper\.exe$|host\.exe$|service\.exe$|monitor\.exe$|agent\.exe$|daemon\.exe$|crs-?video|bink|movieplayer|videoplayer|smackw|umediaplayer|wmvplayer|^criware|^cri_|criware|adx2|scaleform|autorun|register\.exe$|activate\.exe$|3dmigoto|migoto\s*loader|nvdxt|nvcompress|cefsharp|cefclient|libcef|leaveingamedir|^ds3t$|ds3t\.exe$|knobcontroller|companion\s*app|modloader|mod\s*loader|asiloader|scripthook|reframework|^dinput8\.exe$|steamvr|vrserver|vrmonitor|oculus\w*setup|openvr|shadercompileworker|unrealpak|unreallightmass|swarmagent|unrealcefsubprocess|ue\d?prereqsetup|crashreportclient|epicwebhelper|eosbootstrapper|epicgameslauncher|easyanticheat|eac_\w*|battleye|be_?service|beclient|punkbuster|pbsvc|pbcl|gameguard|npkcrypt|nprotect|xigncode|xhunter|denuvo|vmprotect|themida|vac\.exe$|anticheat|ac_?client|uplay\w*|ubisoft\w*connect|galaxyclient|gog\w*galaxy|origin\w*setup|eadesktop|rockstar\w*launcher|socialclub|bethesda\w*launcher|battle\.net|updater|patcher|repair|verif\w*|downloader|bootstrapper|physx\w*|xnafx|dotnetfx|dxwebsetup|directx\w*redist|openal\w*|oalinst|wwise\w*|fmod\w*setup|havok\w*|speedtree|coherent\w*|awesomium|werfault|breakpad|crashpad_handler|sentry|bugreport|errorreport|feedback|rtss|afterburner|shadowplay|overwolf|discord\w*hook|fraps|bandicam|^install$|^install\.exe$|^readme|^manual\.exe$|^credits\.exe$|acroread|adobe\w*reader|^dxdiag|^regsvr|^msiexec|^rundll|^cmd\.exe$|^conhost|^wscript|^cscript/i;
const IGNORE_EXE = NEVER_EXE;   // kept for callers that only want the hard list
const exeNamesIn = d => { try { return fs.readdirSync(d).filter(f => f.toLowerCase().endsWith('.exe')); } catch { return []; } };

/** The best non-tool exe DIRECTLY inside dir (no descent). null if none. */
function pickDirectExe(dir) {
  const exes = exeNamesIn(dir);
  if (!exes.length) return null;
  const folder = path.basename(dir).toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = exes.find(e => !IGNORE_EXE.test(e) && e.toLowerCase().replace(/[^a-z0-9]/g, '').includes(folder.slice(0, 6)));
  const real = exes.filter(e => !IGNORE_EXE.test(e)).sort((a, b) => {
    try { return fs.statSync(path.join(dir, b)).size - fs.statSync(path.join(dir, a)).size; } catch { return 0; }
  });
  const best = match || real[0];
  return best ? path.join(dir, best) : null;
}

/**
 * Find the REAL game executable — the one the GPU driver loads, where ReShade /
 * geo-11 / proxy DLLs must sit. Researched real layouts, in priority order:
 *   UE4/5:     <Game>/<Project>/Binaries/Win64/<Name>(-Win64-Shipping).exe   (root .exe is just a loader; name isn't always -Shipping)
 *   UE BP:     <Game>/Engine/Binaries/Win64/UE4Game.exe                      (skip CrashReportClient.exe)
 *   REDengine: <Game>/bin/x64/<game>.exe  (Witcher 3 / Cyberpunk; also bin/x64_dx12)
 *   CryEngine: <Game>/Bin/Win64/<game>.exe
 *   Source 2:  <Game>/game/bin/win64/<game>.exe
 *   Source 1:  <Game>/<game>.exe (root launcher) + bin/
 *   Unity / Creation / id / RE / Frostbite / old DX8-9: <Game>/<game>.exe at the root
 * Returns the full path to the chosen exe (null if only tools / none).
 */
/**
 * Does this executable actually render?
 *
 * Name blocklists are endless whack-a-mole - every library turns up another `pygrun.exe` or
 * `LayersChecker.exe`. The binary itself carries the answer: a game links Direct3D, OpenGL or
 * Vulkan, while a save editor, packer or crash reporter does not. Reading the import strings is a
 * far stronger signal than the filename, and it needs no list to maintain.
 *
 * Returns 3 for a modern renderer, 2 for an older one, 1 for a windowing-only binary, 0 for none.
 * Cached, because a scan asks about the same file repeatedly.
 */
const _gfxCache = new Map();
function graphicsScore(exe) {
  if (_gfxCache.has(exe)) return _gfxCache.get(exe);
  let score = 0;
  try {
    const buf = readChunk(exe, 6 * 1024 * 1024);       // imports live near the start
    if (buf) {
      const has = t => buf.includes(Buffer.from(t, 'ascii'));
      const modern = ['d3d12.dll', 'D3D12.dll', 'vulkan-1.dll', 'dxgi.dll', 'DXGI.dll',
                      'd3d11.dll', 'D3D11.dll'];
      const older  = ['d3d9.dll', 'D3D9.dll', 'd3d8.dll', 'D3D8.dll', 'ddraw.dll', 'DDRAW.dll',
                      'DDraw.dll', 'opengl32.dll', 'OPENGL32.dll'];
      const windowing = ['user32.dll', 'USER32.dll'];
      if (modern.some(has)) score = 3;
      else if (older.some(has)) score = 2;
      else if (windowing.some(has)) score = 1;
    }
  } catch (_) {}
  if (_gfxCache.size > 4000) _gfxCache.clear();
  _gfxCache.set(exe, score);
  return score;
}

function bestExeIn(dir, folder) {
  const exes = exeNamesIn(dir).filter(e => !NEVER_EXE.test(e));
  if (!exes.length) return null;
  const ship = n => /-Win64-Shipping\.exe$/i.test(n) ? 3 : /-WinGDK-Shipping\.exe$/i.test(n) ? 2 : /-Win32-Shipping\.exe$/i.test(n) ? 2 : /-Shipping\.exe$/i.test(n) ? 1 : 0;
  const demoted = n => DEMOTE_EXE.test(n) ? 1 : 0;          // launchers and tools sort last
  // Many games ship a 32- and a 64-bit build side by side (PathOfExile.exe / PathOfExile_x64.exe,
  // arma3.exe / arma3_x64.exe). Prefer 64-bit: it's what people run, and what the mods target.
  const wide = n => /(_|-|\.)?(x64|64|win64)(\.exe)$|_x64\b|x64\.exe$/i.test(n) ? 1 : 0;
  /* Several games ship one binary per renderer (Control_DX12 / Control_DX11, bg3 / bg3_dx11).
   * Prefer the most capable: DX12 first, then the plain/Vulkan build, then DX11, then DX9. The
   * plain name outranks a _dx11 suffix because that's the default the launcher starts. */
  const apiTier = n => /_?dx12\b/i.test(n) ? 3
                     : /_?(vk|vulkan)\b/i.test(n) ? 2
                     : /_?dx1[01]\b/i.test(n) ? 1
                     : /_?dx9\b/i.test(n) ? 0
                     : 2;                              // no suffix = the default build
  const matches = n => n.toLowerCase().replace(/[^a-z0-9]/g, '').includes((folder || '').slice(0, 6)) ? 1 : 0;
  const sizeOf = n => { try { return fs.statSync(path.join(dir, n)).size; } catch { return 0; } };
  const gfx = n => graphicsScore(path.join(dir, n));
  /* Size, banded rather than compared byte-for-byte. A game executable is usually far bigger than
   * the tools beside it - tens of megabytes against a few hundred kilobytes - so the band is a
   * strong signal. Banding matters: raw byte order would let a 4.1 MB tool edge out a 4.0 MB game,
   * while a band keeps them tied and lets the better signals (renderer, shipping suffix) decide. */
  const sizeTier = n => {
    const b = sizeOf(n);
    return b >= 40 * 1048576 ? 4      // 40 MB+  almost certainly the game
         : b >= 10 * 1048576 ? 3      // 10 MB+  very likely
         : b >=  3 * 1048576 ? 2      //  3 MB+  plausible
         : b >=      524288  ? 1      // 512 KB+ small but real
         : 0;                         //          a stub, a launcher, or a helper
  };
  exes.sort((a, b) =>
       (demoted(a) - demoted(b))        // a real binary always beats a launcher, whatever its size
    || (ship(b) - ship(a))
    || (gfx(b) - gfx(a))            // THE decider: does it link a graphics API at all?
    || (sizeTier(b) - sizeTier(a))  // then bulk: games dwarf the tools sitting beside them
    || (apiTier(b) - apiTier(a))    // DX12 build beats the DX11 one; plain beats _dx11
    || (wide(b) - wide(a))          // 64-bit build beats its 32-bit twin
    || (matches(b) - matches(a))
    || (sizeOf(b) - sizeOf(a)));    // finally raw bytes, to break any remaining tie
  return path.join(dir, exes[0]);
}

/** Every plausible game executable under `root`, best first. Used by the "list all executables"
 *  toggle: when automatic detection guesses wrong, the user can choose from this list instead. */
function findAllExes(root, maxDepth = 5) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth || out.length > 200) return;
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!JUNK_DIR.test(e.name)) walk(p, depth + 1); continue; }
      if (!/\.exe$/i.test(e.name) || NEVER_EXE.test(e.name)) continue;
      let size = 0; try { size = fs.statSync(p).size; } catch (_) {}
      out.push({ path: p, name: e.name, rel: path.relative(root, p), size,
                 depth, tool: DEMOTE_EXE.test(e.name) });
    }
  };
  walk(root, 0);
  const ship = n => /-Win64-Shipping\.exe$/i.test(n) ? 3 : /-Win(GDK|32)-Shipping\.exe$/i.test(n) ? 2 : /-Shipping\.exe$/i.test(n) ? 1 : 0;
  out.forEach(e => { e.gfx = graphicsScore(e.path); });
  out.sort((a, b) =>
       (a.tool ? 1 : 0) - (b.tool ? 1 : 0)      // real binaries first, tools at the bottom
    || ship(b.name) - ship(a.name)
    || (b.gfx - a.gfx)                          // renders > doesn't render
    || (Math.floor(b.size / 1048576) - Math.floor(a.size / 1048576))   // then by whole megabytes
    || b.size - a.size);
  return out;
}

function findMainExe(root) {
  const folder = path.basename(root).toLowerCase().replace(/[^a-z0-9]/g, '');
  const sep = path.sep;
  const proj64 = [], proj32 = [], engineBin = [], redCry = [], srcBin = [];
  // project Binaries (UE) — one folder deep, plus a direct Binaries at root
  for (const e of safeReaddir(root)) {
    if (!e.isDirectory() || JUNK_DIR.test(e.name)) continue;
    const isEngine = /^engine$/i.test(e.name);
    const w64 = path.join(root, e.name, 'Binaries', 'Win64');
    const w32 = path.join(root, e.name, 'Binaries', 'Win32');
    if (isDir(w64)) (isEngine ? engineBin : proj64).push(w64);
    if (isDir(w32)) (isEngine ? engineBin : proj32).push(w32);
  }
  // one folder deep: "<X> Game/", "<X>/runtime/media", "<X>/bin/x64" — shapes the fixed list can't name
  for (const e of safeReaddir(root)) {
    if (!e.isDirectory() || JUNK_DIR.test(e.name)) continue;
    for (const sub of ['', 'runtime' + sep + 'media', 'bin' + sep + 'x64', 'bin', 'Bin64', 'x64']) {
      const d = sub ? path.join(root, e.name, sub) : path.join(root, e.name);
      if (!isDir(d)) continue;
      // a bare subfolder only counts when it looks like a game dir, not a data dump
      if (!sub && !/(game|bin|runtime|retail|client)$/i.test(e.name)) continue;
      redCry.push(d);
    }
  }
  if (isDir(path.join(root, 'Binaries', 'Win64'))) proj64.push(path.join(root, 'Binaries', 'Win64'));
  if (isDir(path.join(root, 'Binaries', 'Win32'))) proj32.push(path.join(root, 'Binaries', 'Win32'));
  // REDengine / CryEngine / next-gen DX12
  for (const s of ['bin/x64', 'bin/x64_dx12', 'bin/win64', 'bin/win_x64', 'Bin/Win64', 'Bin64']) { const d = path.join(root, s.replace(/\//g, sep)); if (isDir(d)) redCry.push(d); }
  // Source / generic
  /* Explicit shapes, in rough order of how specific they are. Collected from real installs:
   *   runtime/media   RGG / Dragon Engine  (Judgment, Lost Judgment, Yakuza 7+)
   *   Game            FromSoftware         (Elden Ring, Dark Souls III, Armored Core VI)
   *   game            Square Enix          (FFXIV: game/ffxiv_dx11.exe)
   *   Base/Binaries/Win64Steam             (Civilization VI)
   *   pso2_bin        Phantasy Star Online 2
   *   Bin64           Star Citizen, CryEngine titles
   *   MCC/Binaries/Win64                   (Halo: The Master Chief Collection)
   */
  for (const s of ['runtime/media', 'game/bin/win64', 'Base/Binaries/Win64Steam', 'Base/Binaries/Win64',
                   'Binaries/Win64Steam', 'Binaries/Retail', 'System', 'Game', 'game', 'pso2_bin',
                   // more real shapes: Nixxes ports, Blizzard, Ubisoft, Bethesda launchers, Wube,
                   // Larian, CDPR older, Klei, Paradox, Frontier, id, Croteam, Egosoft, Bohemia
                   'bin64', 'Bin64', 'binaries', 'Binaries', 'bin/x64_dx12', 'bin/win_x64',
                   'client', 'Client', 'launcher/game', 'Engine/Binaries/Win64',
                   'Win64/Shipping', 'x64/Release', 'Release', 'redist_bin', 'app',
                   'bin', 'Bin', 'x64', 'Win64', 'win64', '_retail_', 'retail', 'Data/bin']) {
    const d = path.join(root, s.replace(/\//g, sep)); if (isDir(d)) srcBin.push(d);
  }

  /* The named shapes are a HINT, not an answer.
   *
   * Returning the first candidate folder's best executable was wrong: "bin" is on that list, so
   * P5R\bin\SaveRemoverTool.exe and METAPHOR\bin\crash_handler.exe were returned before anything
   * looked at P5R.exe and METAPHOR.exe sitting in the root. Score the candidates against the whole
   * tree instead, and let the best one win wherever it happens to live. */
  const hinted = [];
  for (const d of [...proj64, ...proj32, ...engineBin, ...redCry, ...srcBin]) {
    const x = bestExeIn(d, folder);
    if (x) hinted.push(x);
  }
  {
    const ranked = rankAllExes(root, folder);
    if (ranked.length) {
      const best = ranked[0];
      // a hinted folder wins ties, because a named shape is meaningful evidence
      const hintedBest = hinted.length
        ? ranked.find(e => hinted.some(h => path.resolve(h) === path.resolve(e.path)))
        : null;
      if (hintedBest && hintedBest.score >= best.score) return hintedBest.path;
      return best.path;
    }
  }
  if (hinted.length) return hinted[0];

  /* Nothing in the usual places. Games nest the real binary in shapes the fixed list above can't
   * anticipate - "FINAL FANTASY VII REMAKE\End\Binaries\Win64", "Jedi Survivor\SwGame\Binaries\Win64",
   * or a plain "bin\x64" two levels down. Walk the tree for a binaries-looking folder and take the
   * best executable in it, rather than falling back to a launcher sitting in the root. */
  const deep = findBinariesDirDeep(root);
  for (const d of deep) { const x = bestExeIn(d, folder); if (x) return x; }

  /* Still nothing from the named shapes. Rank EVERY executable in the tree against each other
   * instead of trusting a folder list: name against the game's own name, bulk, whether it links a
   * renderer at all, and how deep it sits. This is what catches a real binary in a subfolder nobody
   * has thought to name - "MyGame\Retail\", "Judgment\runtime\media\" before it was listed - and
   * it degrades gracefully rather than falling back to a launcher in the root. */
  const ranked = rankAllExes(root, folder);
  if (ranked.length) return ranked[0].path;

  return bestExeIn(root, folder);   // plain root exe (Unity / Creation / old games)
}

/**
 * Every executable under `root`, scored and sorted best-first.
 *
 * The score deliberately mixes independent signals so no single one can carry a wrong answer:
 *   - a Shipping suffix is near-conclusive for Unreal
 *   - linking Direct3D / OpenGL / Vulkan says it renders; a packer or crash reporter does not
 *   - bulk, in bands, because a game dwarfs the tools beside it
 *   - a name resembling the game's folder
 *   - sitting in a folder that looks like it holds binaries
 *   - shallowness, as a mild tie-break
 * A name that looks like a tool is a heavy penalty rather than an exclusion, so a folder containing
 * nothing but oddly-named binaries still yields the most game-like one.
 */
function rankAllExes(root, folder, maxDepth = 5) {
  const key = String(folder || path.basename(root)).toLowerCase().replace(/[^a-z0-9]/g, '');
  const BIN_LIKE = /^(win64|win32|wingdk|winarm64|x64|x86|bin|bin64|binaries|retail|_retail_|media|game|shipping|release)/i;
  const out = [];
  const walk = (dir, depth, inBin) => {
    if (depth > maxDepth || out.length > 400) return;
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!JUNK_DIR.test(e.name)) walk(p, depth + 1, inBin || BIN_LIKE.test(e.name)); continue; }
      if (!/\.exe$/i.test(e.name) || NEVER_EXE.test(e.name)) continue;
      let size = 0; try { size = fs.statSync(p).size; } catch (_) {}
      const n = e.name;
      const nk = n.toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, '');
      let score = 0;
      if (/-Win64-Shipping\.exe$/i.test(n)) score += 100;
      else if (/-Win(GDK|32|ARM64)-Shipping\.exe$/i.test(n)) score += 80;
      else if (/-Shipping\.exe$/i.test(n)) score += 70;
      score += graphicsScore(p) * 25;                       // renders, and how modern
      score += size >= 40 * 1048576 ? 40 : size >= 10 * 1048576 ? 30
             : size >= 3 * 1048576 ? 20 : size >= 524288 ? 8 : 0;
      if (key.length > 3 && (nk.includes(key.slice(0, 6)) || key.includes(nk.slice(0, 6)))) score += 35;
      // one binary per renderer (Control_DX12 / Control_DX11) - prefer the most capable
      score += /_?dx12\b/i.test(n) ? 12 : /_?(vk|vulkan)\b/i.test(n) ? 8
             : /_?dx1[01]\b/i.test(n) ? 2 : /_?dx9\b/i.test(n) ? 0 : 8;
      // and the 64-bit half of a 32/64 pair (PathOfExile.exe / PathOfExile_x64.exe)
      if (/(_|-|\.)(x64|64|win64)\.exe$/i.test(n) || /_x64\b/i.test(n)) score += 6;
      if (inBin) score += 15;                               // sitting where binaries live
      /* Engine\Binaries\Win64 is Unreal's generic fallback (UE4Game-Win64-Shipping.exe), used only
       * by blueprint-only projects. When a project folder also has a shipping build, that one is
       * the game - so the engine copy ranks just below an otherwise equal candidate. */
      if (/(^|[\\/])Engine[\\/]/i.test(path.relative(root, p))) score -= 10;
      score -= depth * 3;                                   // prefer the shallower of two equals
      if (DEMOTE_EXE.test(n)) score -= 200;                 // a tool, but not disqualified outright
      out.push({ path: p, name: n, size, depth, score });
    }
  };
  walk(root, 0, false);
  out.sort((a, b) => b.score - a.score || b.size - a.size);
  return out;
}

/** Directories that look like they hold a game binary, nearest first. */
function findBinariesDirDeep(root, maxDepth = 4) {
  /* Prefix-matched, not exact: real builds append configuration names to the platform folder -
   * Kingdom Come ships bin\Win64MasterMasterSteamPGO, others use Win64Shipping / Win64Retail. */
  const BIN_DIR = /^(win64|win32|wingdk|winarm64|x64|x86|bin|bin64|binaries|retail|_retail_|media|game|pso2_bin|redist_bin)/i;
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth || hits.length > 40) return;
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (!e.isDirectory() || JUNK_DIR.test(e.name)) continue;
      const p = path.join(dir, e.name);
      if (BIN_DIR.test(e.name) && exeNamesIn(p).some(n => !NEVER_EXE.test(n) && !DEMOTE_EXE.test(n))) hits.push({ p, depth });
      walk(p, depth + 1);
    }
  };
  walk(root, 0);
  // shallower first, and a Win64 beats a bare bin at the same depth
  hits.sort((a, b) => a.depth - b.depth || (/win64$/i.test(b.p) ? 1 : 0) - (/win64$/i.test(a.p) ? 1 : 0));
  return hits.map(h => h.p);
}

/** Any *-Shipping.exe in the tree - Unreal's real binary, wherever the project folder sits. */
function findShippingExeDeep(root, maxDepth = 5) {
  let best = null, bestScore = -1;
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!JUNK_DIR.test(e.name)) walk(p, depth + 1); continue; }
      if (!/\.exe$/i.test(e.name) || NEVER_EXE.test(e.name)) continue;
      const n = e.name;
      const score = /-Win64-Shipping\.exe$/i.test(n) ? 40
                  : /-WinGDK-Shipping\.exe$/i.test(n) ? 30
                  : /-Win32-Shipping\.exe$/i.test(n) ? 25
                  : /-Shipping\.exe$/i.test(n) ? 20 : 0;
      if (!score) continue;
      const total = score - depth;                     // prefer the shallower of two shipping exes
      if (total > bestScore) { bestScore = total; best = p; }
    }
  };
  walk(root, 0);
  return best;
}

/** Back-compat: main exe with a light one-level descent fallback for odd layouts. */
function pickMainExe(dir) {
  return findMainExe(dir) || (function () {
    for (const sub of safeReaddir(dir)) {
      if (!sub.isDirectory() || JUNK_DIR.test(sub.name)) continue;
      const inner = pickDirectExe(path.join(dir, sub.name));
      if (inner) return inner;
    }
    return null;
  })();
}

/** Back-compat: main exe with a light one-level descent fallback. */
function pickMainExe(dir) {
  return findMainExe(dir) || (function () {
    for (const sub of safeReaddir(dir)) {
      if (!sub.isDirectory()) continue;
      const inner = pickDirectExe(path.join(dir, sub.name));
      if (inner) return inner;
    }
    return null;
  })();
}

/* ---------- main scan ---------- */
/* Folders that never contain the game.
 *
 * Two real mis-picks came from here rather than from the ranking: "Trails in the Sky\_Redist\
 * QuickSFV.EXE" and "VaM\TextAudioTool-0.4\installer_files\miniconda_installer.exe". No filename
 * rule would catch a checksum utility called QuickSFV - but nothing in a _Redist or installer_files
 * folder is ever the game, so the fix is to not walk into them at all. */
const JUNK_DIR = /^(\$|windows$|windows\.old|system volume|recovery|perflogs|programdata|appdata|boot|msocache|intel$|amd$|nvidia$|drivers$|node_modules|\.git|temp$|tmp$|cache$|users$|public$|default$|all users|_?redist|_?commonredist|redistributable|installer_files|installers?$|vcredist|directx$|dotnet|_mei\d*|__installer|prerequisites?|prereq|dxsetup|support$|extras?$|docs?$|manual$|soundtrack|artbook|savegames?$|screenshots?$|crashes$|logs?$|dumps?$|tools?$|sdk$|modtools?$|editor$|devkit$|_backup|backup$)/i;
const safeReaddir = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** Own-level markers that make a folder a game folder. */
function isGameDir(dir) {
  if (pickDirectExe(dir)) return true;
  try { if (fs.existsSync(path.join(dir, 'UnityPlayer.dll'))) return true; } catch (_) {}
  for (const e of safeReaddir(dir)) { if (e.isDirectory() && /_Data$/i.test(e.name)) return true; }
  const realIn = d => isDir(d) && exeNamesIn(d).some(e => !IGNORE_EXE.test(e));
  for (const sub of ['Binaries/Win64', 'Binaries/Win32', 'Engine/Binaries/Win64', 'bin/x64', 'bin/x64_dx12', 'Bin/Win64', 'game/bin/win64']) {
    if (realIn(path.join(dir, sub.replace(/\//g, path.sep)))) return true;
  }
  // UE project layout: an Engine/ folder at this level + a <Project>/Binaries/Win64 with a real exe
  if (isDir(path.join(dir, 'Engine'))) {
    for (const e of safeReaddir(dir)) { if (e.isDirectory() && realIn(path.join(dir, e.name, 'Binaries', 'Win64'))) return true; }
  }
  return false;
}

/** Recognized game-library ancestor paths (used to keep app folders out of a full-drive scan). */
const LIB_PATH = /[\\/](steamapps[\\/]common|Epic Games|GOG Games|GOG Galaxy[\\/]Games|Games[\\/]|Origin Games|EA Games|Ubisoft[\\/]|Amazon Games[\\/]Library|XboxGames|ModifiableWindowsApps|My Games)[\\/]?/i;

/** Strong "this is a game, not an app" signal — used only for full-drive sweeps. */
function hasGameSignal(dir) {
  try {
    if (LIB_PATH.test(dir + path.sep)) return true;
    const here = f => { try { return fs.existsSync(path.join(dir, f)); } catch { return false; } };
    if (here('steam_api.dll') || here('steam_api64.dll') || here('steam_appid.txt')) return true;
    if (here('UnityPlayer.dll') || here('Engine') || here('GameSDK')) return true;
    if (isDir(path.join(dir, 'Binaries', 'Win64')) || isDir(path.join(dir, 'bin', 'x64')) || isDir(path.join(dir, 'Bin', 'Win64'))) return true;
    for (const e of safeReaddir(dir)) { if (e.isDirectory() && (/_Data$/i.test(e.name) || /^(Engine|Content)$/i.test(e.name))) return true; }
    if (exeNamesIn(dir).some(e => /-Win(64|32|GDK)-Shipping\.exe$/i.test(e))) return true;
  } catch (_) {}
  return false;
}

/** Recursively find game folders. Stops descending once found; skips junk; budget-capped. `signal` (optional) keeps apps out of full-drive sweeps. */
function walkForGames(root, { maxDepth = 5, excluded = new Set(), out = [], seen = new Set(), budget = { n: 0, max: 40000 }, onTick = null, signal = null } = {}) {
  (function rec(dir, depth) {
    if (budget.n++ > budget.max) return;
    if (onTick && budget.n % 300 === 0) onTick(out.length);
    const key = dir.toLowerCase();
    if (excluded.has(key)) return;
    if (isGameDir(dir)) {
      if (!signal || signal(dir)) { if (!seen.has(key)) { seen.add(key); out.push({ name: gameNameFor(dir), dir }); } }
      return; // an exe-bearing folder — don't descend further either way
    }
    if (depth >= maxDepth) return;
    for (const e of safeReaddir(dir)) { if (!e.isDirectory()) continue; if (depth === 0 ? JUNK_DIR.test(e.name) : /^(node_modules|\.git|_CommonRedist|DirectX|Redist|DotNet|vcredist)$/i.test(e.name)) continue; rec(path.join(dir, e.name), depth + 1); }
  })(root, 0);
  return out;
}

/** Steam libraries + user scan roots (recursive) + optionally every drive (signal-filtered). */
function listGameDirs(extraRoots = [], excluded = [], opts = {}) {
  const ex = new Set((excluded || []).map(p => String(p).toLowerCase()));
  const out = []; const seen = new Set(); const budget = { n: 0, max: opts.allDrives ? 400000 : 80000 };
  for (const lib of steamLibraries()) {
    const c = path.join(lib, 'steamapps', 'common');
    for (const e of safeReaddir(c)) { if (!e.isDirectory()) continue; const dir = path.join(c, e.name); const key = dir.toLowerCase(); if (ex.has(key) || seen.has(key)) continue; if (pickMainExe(dir)) { seen.add(key); out.push({ name: e.name, dir }); } }
  }
  for (const r of (extraRoots || [])) if (fs.existsSync(r)) walkForGames(r, { maxDepth: 6, excluded: ex, out, seen, budget, onTick: opts.onTick });
  if (opts.allDrives) { for (const d of listDrives()) walkForGames(d, { maxDepth: 7, excluded: ex, out, seen, budget, onTick: opts.onTick, signal: hasGameSignal }); }
  return out;
}

/** Find games anywhere on one drive/folder (recursive, signal-filtered). Used by "scan this drive". */
/* A folder name is only the game's name if it isn't a platform or plumbing folder. "Immortals of
 * Aveum\x64\Windows" was being listed as a game called "Windows"; walk up until the name means
 * something. */
const PLUMBING_DIR = /^(windows|win64|win32|wingdk|winarm64|x64|x86|bin|bin64|binaries|retail|_retail_|game|media|content|data|shipping|release|debug|update|launcher|redist|_commonredist|dotnetcore|engine|system|app|client)$/i;
function gameNameFor(dir) {
  // Split on BOTH separators: a Windows path must resolve the same way wherever this runs.
  const parts = String(dir).replace(/[\\/]+$/, '').split(/[\\/]+/).filter(Boolean);
  const LIB = /^(common|steamapps|games|program files( \(x86\))?|gog galaxy|epic games|origin games|ea games|steamlibrary)$/i;
  for (let i = parts.length - 1; i >= 0; i--) {
    const base = parts[i];
    if (/^[a-z]:$/i.test(base)) break;             // reached the drive letter
    if (!PLUMBING_DIR.test(base) && !/^win64\w*$/i.test(base)) return base;
    if (i > 0 && LIB.test(parts[i - 1])) break;    // don't climb into a library root
  }
  return parts[parts.length - 1] || String(dir);
}


/**
 * Games on ONE drive.
 *
 * This used to be a bare walkForGames() from the drive root, which is why a per-drive scan came up
 * empty on a Steam drive: the all-drives path discovers Steam libraries EXPLICITLY from
 * steamLibraries() before it walks anything, and this path skipped that entirely. It now runs the
 * same discovery as a full scan and filters the result to the requested drive, so per-drive can
 * never find less than "all drives" would on that same volume.
 */
function listGameDirsOnDrive(drive, excluded = [], onTick = null) {
  const ex = new Set((excluded || []).map(p => String(p).toLowerCase()));
  const want = String(drive || '').slice(0, 2).toLowerCase();
  const onDrive = p => String(p || '').slice(0, 2).toLowerCase() === want;
  const out = []; const seen = new Set();
  const budget = { n: 0, max: 250000 };

  // 1) Steam libraries on this drive - the same first step a full scan takes
  for (const lib of steamLibraries()) {
    if (!onDrive(lib)) continue;
    const c = path.join(lib, 'steamapps', 'common');
    for (const e of safeReaddir(c)) {
      if (!e.isDirectory()) continue;
      const dir = path.join(c, e.name);
      const key = dir.toLowerCase();
      if (ex.has(key) || seen.has(key)) continue;
      if (pickMainExe(dir)) { seen.add(key); out.push({ name: gameNameFor(dir), dir }); }
    }
  }

  // 2) then the general walk, for anything installed outside a Steam library
  walkForGames(drive, { maxDepth: 7, excluded: ex, out, seen, budget, onTick, signal: hasGameSignal });

  // 3) belt and braces: keep only what is genuinely on this drive
  return out.filter(g => onDrive(g.dir));
}


function inspectGame(name, dir) {
  const exe = findMainExe(dir) || pickMainExe(dir);
  if (!exe) return null;
  const exeDir = path.dirname(exe);
  const buf = readChunk(exe, 12 * 1024 * 1024);
  const hw = detectStereoHw(buf);
  let api = detectApi(exe, buf, exeDir), eng = detectEngine(dir, exe), n = name;
  // curated DB override — accurate name / engine / API when the game is known
  let db = null; try { db = require('./gamedb').lookupGame(path.basename(exe), name); } catch (_) {}
  if (db) { n = db.n; if (db.eng) eng = db.eng; if (db.api && db.api.length) api = db.api.slice(); }
  return { n, folder: name, exe: path.basename(exe), exePath: exe, exeDir, dir,
    api, bit: readBitness(exe), eng, dbMatch: !!db,
    hd3d: hw.hd3d, tdv: hw.tdv, hue: hashHue(name), inst: [], found: [] };
}

/** Synchronous scan (used by tests / quick calls). */
function scanGames(extraRoots = [], excluded = []) {
  const games = [];
  for (const { name, dir } of listGameDirs(extraRoots, excluded)) { const g = inspectGame(name, dir); if (g) games.push(g); }
  return games;
}

/**
 * Non-blocking scan: inspects one game at a time and yields to the event loop
 * between each so progress events flush and the UI never freezes.
 *   opts.drive    = scan only that whole drive/folder.
 *   default       = Steam libraries + user scan roots + a signal-filtered sweep of EVERY drive.
 * onProgress({ phase:'search'|'count'|'game'|'done', done, total, name })
 */
async function scanGamesProgressive(extraRoots = [], excluded = [], onProgress = null, opts = {}) {
  if (onProgress) onProgress({ phase: 'search', done: 0, total: 0, name: opts.drive ? opts.drive : 'all drives' });
  const onTick = n => onProgress && onProgress({ phase: 'search', done: n, total: 0 });
  let dirs = opts.drive
    ? listGameDirsOnDrive(opts.drive, excluded, onTick)
    : listGameDirs(extraRoots, excluded, { allDrives: true, onTick });
  /* Drop nested candidates. A game folder contains bin\, launcher\, Update\, DotNetCore\ and
   * similar, and each of those can look like a game on its own. Keeping only the OUTERMOST folder
   * means one entry per game, with the real executable, instead of several with stray tools. */
  const dedup = (() => {
    const norm = p => String(p).replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
    const sorted = dirs.slice().sort((a, b) => norm(a).length - norm(b).length);   // parents first
    const kept = [];
    for (const d of sorted) {
      const n = norm(d);
      if (kept.some(k => n.startsWith(norm(k) + '/'))) continue;    // inside one we already have
      kept.push(d);
    }
    return kept;
  })();
  if (dedup.length !== dirs.length) dirs = dedup;

  const total = dirs.length;
  if (onProgress) onProgress({ phase: 'count', done: 0, total });
  const games = [];
  for (let i = 0; i < dirs.length; i++) {
    const { name, dir } = dirs[i];
    let g = null; try { g = inspectGame(name, dir); } catch (_) {}
    if (g) games.push(g);
    if (onProgress) onProgress({ phase: 'game', done: i + 1, total, name });
    await new Promise(r => setImmediate(r));
  }
  if (onProgress) onProgress({ phase: 'done', done: total, total });
  return games;
}

function hashHue(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

module.exports = { rankAllExes, graphicsScore, findAllExes, gameNameFor, findMainExe, findBinariesDirDeep, findShippingExeDeep, listDrives, steamLibraries, scanGames, scanGamesProgressive, listGameDirs, listGameDirsOnDrive, walkForGames, inspectGame, readBitness, detectApi, detectEngine, pickMainExe };
