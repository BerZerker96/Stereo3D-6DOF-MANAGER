'use strict';
/*
 * Mod + core registry — single source of truth for downloads, placement,
 * config, and dependencies.
 *
 * download strategy:
 *   github-release : latest release .zip asset      (objects CDN; user machine)
 *   github-repo    : whole repo via codeload zip    (works everywhere)
 *   url            : a single direct file (installer exe) cached + launched
 *   website        : redistribution not allowed; open the official site
 *
 * placement (place):
 *   {root:true}                 copy the package's effective root into the game
 *   {from, to}                  copy <root>/from  ->  <game>/to
 *   {match:/regex/, to}         copy matching files from the root -> <game>/to
 *   {subdirByApiBit:true, to}   use sourceSubdir(api,bit) as the source
 *   toBin:true                  Source-engine games receive files in bin\
 */
const RESHADE_VER = '6.7.3';
const HELIX_BASE = 'https://helixmod.blogspot.com/search?q=';

const MODS = {
  /* ---------- wiz3D: universal iZ3D-based stereo wrapper (proxy DLL, per-API/bitness build) ----------
   * Release ships dx9/x86, dx9/x64, dx8, dx7, dx10-11, hd3d, opengl-quad-buffer-stereo folders,
   * each with the proxy DLL(s), OutputMethods/, and wiz3D_Config.xml. We copy the folder that matches
   * the game's API + bitness, then set the output method in wiz3D_Config.xml. */
  wiz3d: { name: 'wiz3D (iZ3D wrapper)', kind: 'host', install: 'wiz3d', configFile: 'wiz3D_Config.xml',
    proxyDLL: (api) => api[0] === 'DX9' ? 'd3d9.dll' : api[0] === 'DX8' ? 'd3d8.dll' : api[0] === 'DX7' ? 'ddraw.dll' : /OpenGL/i.test(api[0]) ? 'opengl32.dll' : 'dxgi.dll',
    note: 'Best for DX7-9, AMD HD3D and 3D-Vision-ready games. For VR, output Interlaced or Checkerboard (full-res per eye). Hotkeys: Numpad * toggle, Numpad +/- separation, Shift+Numpad* wizard.' },

  // 3DVision4All (oneup03) — a proxy-DLL stereo wrapper like wiz3D: no ReShade, no add-ons. Runs 3DVision
  // games on any 3D display with an Nvidia GPU. Ships several proxy-hijack DLL name options (winmm/version/
  // dinput8/dsound) + 3dvision4all.ini + EnableWindowed3D.exe. We pick ONE proxy name (dinput8 by default,
  // the community's usual first choice) and copy it next to the exe along with the ini + helper.
  v4a: { name: '3DVision4All (oneup03)', kind: 'host', install: 'v4a', configFile: '3dvision4all.ini',
    proxyDLL: () => 'dinput8.dll',   // primary proxy name; alternates winmm/version/dsound also ship
    v4aProxies: ['dinput8.dll', 'winmm.dll', 'version.dll', 'dsound.dll'],
    /* Since v1.1.0 the release ships EnableWindowed3D.exe, and running it is part of the STANDARD
     * install. Once per game folder, elevated: for every *.exe it finds it creates (or attaches to) an
     * NVIDIA stereo profile and writes StereoProfile=1 + StereoHiddenProfile=1. Without those flags the
     * driver silently refuses to activate stereo for a WINDOWED swap chain - and 3DVision4All forces
     * windowed mode so its overlay can composite on top - so the reverse-stereo-blit becomes a no-op and
     * both halves of the captured frame are the same mono image. It also makes the in-game Ctrl+F7
     * actually persist Depth/Convergence instead of restoring defaults.
     * Source: github.com/oneup03/3DVision4All release notes, v1.1.0. */
    postInstall: { file: 'EnableWindowed3D.exe', elevate: true, once: 'perGameFolder',
      title: 'Run EnableWindowed3D as administrator',
      why: 'Writes the NVIDIA StereoProfile / StereoHiddenProfile flags for every .exe in this game folder. '
         + '3DVision4All forces windowed mode so its overlay can sit on top, and without these flags the driver '
         + 'will not activate stereo for a windowed swap chain \u2014 both eyes end up showing the same mono image. '
         + 'It also makes the in-game Ctrl+F7 save your Depth/Convergence instead of restoring defaults.',
      manual: 'Right-click EnableWindowed3D.exe next to the game\u2019s .exe and choose \u201cRun as administrator\u201d.' },
    note: 'Proxy-DLL 3D wrapper (like wiz3D) \u2014 no ReShade or add-ons. Runs 3DVision games on any 3D display; Nvidia GPU required. Best for DX9/DX10 (all DX on RTX20-or-older). Outputs SBS/TaB/interlaced/checkerboard/LeiaSR/Katanga VR.' },

  /* ---------- ReShade: download the official add-on setup tool and launch it ---------- */
  reshade: {
    name: 'ReShade (add-on build)', kind: 'host', install: 'reshade-auto', configFile: 'ReShade.ini',
    proxyDLL: (api) => /DX1[012]/.test(api[0]) ? 'dxgi.dll' : (api[0] === 'DX9' ? 'd3d9.dll' : 'opengl32.dll'),
    note: 'One-click: downloads the official ReShade add-on build, detects the game’s API + bitness, and drops the right DLL, the shaders and textures, plus a matching preset next to the .exe. Vulkan games still need the official setup tool (Vulkan can’t be injected via a DLL) — the app launches it for you in that case.'
  },

  /* ---------- stereo mods ---------- */
  // geo-11 ships x32/ and x64/ folders; HelixMod's instructions are to copy the DLLs + inis
  // OUT of the folder matching the game's bitness and next to game.exe (never the folders themselves).
  geo11: { name: 'geo-11', kind: 'mod', configFile: 'd3dxdm.ini', proxyDLL: () => 'd3d11.dll',
    sourceSubdir: (api, bit) => (bit === 'x86' ? 'x32' : 'x64'),
    place: { subdirByApiBit: true, match: /^(d3d11\.dll|nvapi(64)?\.dll|d3dxdm\.ini|d3dx\.ini|d3dcompiler_47\.dll)$/i },
    fixLink: 'helix',
    note: 'Set direct_mode = katanga_vr for full-res SBS to Osiris. Per-game shader fixes come from HelixMod.' },

  geo11_github: { name: 'geo-11 (GitHub mirror)', kind: 'mod', configFile: 'd3dxdm.ini', proxyDLL: () => 'd3d11.dll',
    sourceSubdir: (api, bit) => (bit === 'x86' ? 'x32' : 'x64'),
    place: { subdirByApiBit: true, match: /^(d3d11\.dll|nvapi(64)?\.dll|d3dxdm\.ini|d3dx\.ini|d3dcompiler_47\.dll)$/i },
    fixLink: 'helix',
    note: 'Community mirror of geo-11 \u2014 same files and config as the official build.' },

  sd3d: { name: 'SuperDepth3D', kind: 'mod', configFile: 'ReShadePreset.ini',
    proxyDLL: (api) => /DX1[012]/.test(api[0]) ? 'dxgi.dll' : 'd3d9.dll',
    place: { from: 'Shaders', to: 'reshade-shaders/Shaders' },
    needs: ['reshade'], requires: ['supervrexport'] },     // SuperVRExport is locked to SuperDepth3D

  geo3d: { name: 'Geo3D', kind: 'mod', configFile: 'ReShade.ini',
    proxyDLL: (api) => /DX1[012]/.test(api[0]) ? 'dxgi.dll' : 'd3d9.dll',
    place: { flatten: [                                   // Geo3D release is nested (Geo3D/, ReShade/, DXIL/) — scatter the real files to where they load
      { match: /^Geo3D\.addon(32|64)$/i, to: '.' },        // ReShade add-on → next to the exe
      { match: /^3DToElse\.fx$/i, to: 'reshade-shaders/Shaders' },
      { match: /^(dxil|dxcompiler)\.dll$/i, to: '.' },     // DXIL shader compiler
      { match: /^(FOLDERs|special|ignore)\.txt$/i, to: '.' }
    ] },
    needs: ['reshade'], requires: ['geovrexport'] },       // GeoVRExport is locked to Geo3D

  /* ---------- Legacy Geo3D: an older all-in-one build bundled with the app (no download) ---------- */
  geo3d_legacy: { name: 'Legacy Geo3D', kind: 'mod', bundled: true, configFile: 'ReShade.ini',
    proxyDLL: (api) => /DX1[012]/.test(api[0]) ? 'dxgi.dll' : 'd3d9.dll',
    place: { flatten: [                                     // flat all-in-one build → scatter to where each file loads
      { match: /\.(addon32|addon64)$/i, to: '.' },          // Geo3D + GeoVrExport add-ons → next to the exe
      { match: /^3DToElse\.fx$/i, to: 'reshade-shaders/Shaders' },
      { match: /^(dxil|dxcompiler)\.dll$/i, to: '.' },      // DXIL shader compiler (the ReShade host is downloaded, not bundled)
      { match: /^LICENSE(\.txt)?$/i, to: '.' }              // Geo3D BSD 2-Clause license (Ulf J\u00e4lmbrant) — ship it with the binaries
    ] },
    needs: ['reshade'],                                     // the host is downloaded per game (right bitness + proxy name)
    note: 'Older Geo3D build bundled with the app \u2014 the add-ons and shader install offline; the ReShade host it runs inside is downloaded automatically for the game\u2019s API and bitness. Use if the latest Geo3D misbehaves on a game.' },

  /* ---------- locked VR-export add-ons ---------- */
  supervrexport: { name: 'SuperVRExport add-on', kind: 'addon', lockedTo: 'sd3d',
    place: { match: /\.addon(64|32)?$/i, to: '.' } },
  geovrexport:   { name: 'GeoVRExport add-on',  kind: 'addon', lockedTo: 'geo3d',
    place: { match: /\.addon(64|32)?$/i, to: '.' } },
  dgvoodoo:      { name: 'dgVoodoo2 (DX8/9/10 \u2192 DX11)', kind: 'tool',
    note: 'Closed-source freeware by Dege, downloaded from its official source. Converts legacy DirectX to DX11 so DX11-class 3D mods can run.',
    configFile: 'dgVoodoo.conf',   // dgVoodoo.conf sits beside the exe; OutputAPI / VideoCard are the settings that matter
    site: 'https://github.com/dege-diosg/dgVoodoo2/releases', homepage: 'https://dege.freeweb.hu/' },
  /* ---------- head tracking ----------
   * Two real sources, handled differently because they ship differently:
   *   track_loop — itsloopyo per-game mods (github.com/itsloopyo/<slug>-headtracking) with release zips
   *                (DLLs → BepInEx/plugins for Unity, Mods/ for MelonLoader, or a .asi next to the .exe).
   *   track_bz   — BerZerker96's 6DOF Mods Hub, a *catalog* of AOB camera mods for the Osiris/6DOF injector,
   *                so the manager opens the hub for the user to pick their game's profile.
   */
  track_loop: { name: 'Head-Tracking (itsloopyo)', kind: 'mod', perGame: true, headTracking: true,
    repo: (game) => `itsloopyo/${htSlug(game)}-headtracking`,
    nexus: (game) => `https://www.nexusmods.com/search/?gsearchtype=mods&gsearch=${encodeURIComponent(game + ' head tracking')}`,
    loader: (eng) => eng === 'Unity' ? 'bepinex' : eng === 'RE Engine' ? 'reframework' : 'asiloader',
    place: { asiRoot: true },     // release zip is pre-structured (BepInEx/plugins, etc.); the head-pose tracker runs separately
    configFile: (eng, game) => eng === 'Unity' ? `BepInEx/config/com.cameraunlock.${htSlug(game)}.headtracking.cfg` : 'HeadTracking.ini' },
  track_bz: { name: '6DOF Hub (BerZerker96)', kind: 'mod', perGame: true, headTracking: true,
    releaseHub: 'BerZerker96/6DOF-Head-Tracking-Mods-Hub',     // one repo, many releases — one per game
    site: 'https://github.com/BerZerker96/6DOF-Head-Tracking-Mods-Hub/releases',
    loader: (eng) => eng === 'Unity' ? 'bepinex' : eng === 'RE Engine' ? 'reframework' : 'asiloader',
    place: { asiRoot: true },
    note: 'Each game has its own release on BerZerker96\u2019s 6DOF hub \u2014 the manager finds your game\u2019s release and downloads it.',
    configFile: (eng) => eng === 'Unity' ? 'BepInEx/config/headtracking.cfg' : 'HeadTracking.ini' },

  /* ---------- tools / loaders ---------- *
   * Loaders are prerequisites the USER installs (we just note where to get them and place the mod itself).
   */
  osiris:      { name: 'Osiris VR Viewer', kind: 'tool' },
  bepinex:     { name: 'BepInEx 5 (Unity loader)', kind: 'loader', guide: true, site: 'https://github.com/BepInEx/BepInEx/releases',
    note: 'Unity games need BepInEx (Mono 5.4.x, matching the game\u2019s bitness). Install it into the game folder, then the mod\u2019s DLLs in BepInEx/plugins load.' },
  asiloader:   { name: 'Ultimate ASI Loader', kind: 'loader', guide: true, site: 'https://github.com/ThirteenAG/Ultimate-ASI-Loader/releases',
    note: 'Native games need Ultimate ASI Loader \u2014 drop dinput8.dll next to the game .exe so the .asi mod loads.' },
  reframework: { name: 'REFramework (RE Engine)', kind: 'loader', guide: true, site: 'https://github.com/praydog/REFramework-nightly/releases',
    note: 'REFramework is per-game \u2014 download your RE Engine title\u2019s build and extract it so dinput8.dll sits next to the game .exe.' }
};

/* default config written on install (real keys) */

/* ---- REAL output methods, per mod ------------------------------------------------------------
 * Each 3D mod emits stereo its own way, so the one-click "output" list must come from the mod:
 *  geo-11  : d3dxdm.ini [Device] direct_mode  (its own Katanga path, no add-on)
 *  wiz3D   : built-in OutputMethods/<Name>.dll  (OutputMethodDll in wiz3D_Config.xml)
 *  Geo3D   : the 3DToElse.fx shader converts the stereo pair; GeoVrExport add-on does full-res VR
 *  SD3D    : SuperDepth3D.fx's own Stereoscopic_Mode; SuperVrExport add-on does full-res VR
 * Values below are transcribed from the real d3dxdm.ini / wiz3D OutputMethods / 3DToElse.fx and
 * SuperDepth3D.fx ui_items combo lists.                                                        */
const MOD_OUTPUTS = {
  geo11: [
    { k: 'katanga_vr',       label: 'VR / KatangaVR (full-res SBS)',      apply: { direct_mode: 'katanga_vr' },   note: 'geo-11 has its own VR path \u2014 no add-on. Full-res SBS to KatangaVR / VRScreenCap.' },
    { k: 'sbs',              label: 'Side-by-Side',                       apply: { direct_mode: 'sbs' },          note: 'SBS to an AR/3D display.' },
    { k: 'tab',              label: 'Top-and-Bottom',                     apply: { direct_mode: 'tab' },          note: 'Over/under for TAB displays.' },
    { k: 'interlaced',       label: 'Interlaced (passive polarized)',     apply: { direct_mode: 'interlaced' },   note: 'Row-interleaved for passive 3D panels.' },
    { k: 'checkerboard',     label: 'Checkerboard (DLP)',                 apply: { direct_mode: 'checkerboard' }, note: 'Checkerboard for DLP-Link projectors.' },
    { k: 'nvidia_dx11',      label: '3D Vision Direct (DX11)',            apply: { direct_mode: 'nvidia_dx11' },  note: 'Native 3D Vision on DX11 \u2014 needs the 3D Vision driver.' },
    { k: 'nvidia_dx9',       label: '3D Vision Direct (DX9)',             apply: { direct_mode: 'nvidia_dx9' },   note: 'Native 3D Vision on DX9.' }
  ],
  wiz3d: [
    { k: 'interlaced',   label: 'Interlaced (passive polarized)',            wiz: 'interlaced',   note: 'Built-in InterlacedOutput.dll.' },
    { k: 'sbs',          label: 'Side-by-Side (VR viewer / 3D TV)',          wiz: 'sbs',          note: 'Built-in SideBySideOutput.dll.' },
    { k: 'checkerboard', label: 'Checkerboard / DLP-Link',                   wiz: 'checkerboard', note: 'Built-in DLP3DOutput.dll.' },
    { k: 'anaglyph',     label: 'Anaglyph (red/cyan glasses)',               wiz: 'anaglyph',     note: 'Built-in AnaglyphOutput.dll.' },
    { k: 'shutter',      label: 'Shutter glasses (page-flip)',              wiz: 'shutter',      note: 'Built-in ShutterOutput.dll.' },
    { k: 'sr_weave',     label: 'SR Weave (SpatialLabs / Odyssey 3D)',       wiz: 'sr_weave',     note: 'Built-in SimulatedRealityWeaveOutput.dll \u2014 needs the SR Runtime.' }
  ],
  // 3DVision4All: real [stereo] mode values from its 3dvision4all.ini. All built into the wrapper — no add-ons.
  v4a: [
    { k: 'sbs',               label: 'Side-by-Side (AR glasses / 3D TV)',        apply: { mode: 'sbs' },               note: 'SBS \u2014 3D TVs (Half-SbS) and 32:9 AR glasses (Xreal/Viture/Rokid).' },
    { k: 'tab',               label: 'Top-and-Bottom',                           apply: { mode: 'tab' },               note: 'Over/under for TaB input.' },
    { k: 'row_interlaced',    label: 'Row Interlaced (passive polarized)',       apply: { mode: 'row_interlaced' },    note: 'Even rows = left eye \u2014 passive 3D panels.' },
    { k: 'column_interlaced', label: 'Column Interlaced',                        apply: { mode: 'column_interlaced' }, note: 'Even columns = left \u2014 rare passive setups.' },
    { k: 'checkerboard',      label: 'Checkerboard (DLP)',                       apply: { mode: 'checkerboard' },      note: 'DLP 3D-Ready TVs.' },
    { k: 'leiasr',            label: 'LeiaSR (Leia / SR autostereo)',            apply: { mode: 'leiasr' },            note: 'Leia / Simulated Reality autostereoscopic displays.' },
    { k: 'katanga',           label: 'VR / Katanga (full-res over IPC)',         apply: { mode: 'katanga' },           note: 'Publishes the stereo image over Katanga IPC to a VR viewer (Katanga.exe / VRScreenCap).' }
  ],
  // Geo3D: 3DToElse.fx "3D Display Mode" combo (Side by Side / Top and Bottom / Line Interlaced /
  // Column Interlaced / Checkerboard 3D / Anaglyph), plus the GeoVrExport add-on for full-res VR.
  geo3d: [
    { k: 'vr_addon',         label: 'Full-res VR (GeoVrExport \u2192 KatangaVR)', addon: 'geovrexport', note: 'GeoVrExport add-on sends a full-res SBS frame to KatangaVR / Osiris.' },
    { k: 'sbs',              label: 'Side-by-Side',                   fx: '3DToElse.fx', apply: { Stereoscopic_Mode: '0' }, note: '3DToElse.fx \u2192 Side by Side.' },
    { k: 'tab',              label: 'Top-and-Bottom',                 fx: '3DToElse.fx', apply: { Stereoscopic_Mode: '1' }, note: '3DToElse.fx \u2192 Top and Bottom.' },
    { k: 'interlaced',       label: 'Line Interlaced (passive)',      fx: '3DToElse.fx', apply: { Stereoscopic_Mode: '2' }, note: '3DToElse.fx \u2192 Line Interlaced.' },
    { k: 'column_interlaced',label: 'Column Interlaced',              fx: '3DToElse.fx', apply: { Stereoscopic_Mode: '3' }, note: '3DToElse.fx \u2192 Column Interlaced.' },
    { k: 'checkerboard',     label: 'Checkerboard 3D (DLP)',          fx: '3DToElse.fx', apply: { Stereoscopic_Mode: '4' }, note: '3DToElse.fx \u2192 Checkerboard 3D.' },
    { k: 'anaglyph',         label: 'Anaglyph (red/cyan)',            fx: '3DToElse.fx', apply: { Stereoscopic_Mode: '5' }, note: '3DToElse.fx \u2192 Anaglyph.' }
  ],
  // SuperDepth3D's own Stereoscopic_Mode combo + the SuperVrExport add-on for full-res VR.
  sd3d: [
    { k: 'vr_addon',         label: 'Full-res VR (SuperVrExport \u2192 KatangaVR)', addon: 'supervrexport', note: 'SuperVrExport add-on sends a full-res SBS frame to KatangaVR / Osiris.' },
    { k: 'sbs',              label: 'Side-by-Side',              fx: 'SuperDepth3D.fx', apply: { Stereoscopic_Mode: '0' }, note: "SuperDepth3D's own SBS output." },
    { k: 'tab',              label: 'Top-and-Bottom',            fx: 'SuperDepth3D.fx', apply: { Stereoscopic_Mode: '1' }, note: 'Over/under output.' },
    { k: 'interlaced',       label: 'Line Interlaced (passive)', fx: 'SuperDepth3D.fx', apply: { Stereoscopic_Mode: '2' }, note: 'Row-interleaved for passive panels.' },
    { k: 'column_interlaced',label: 'Column Interlaced',         fx: 'SuperDepth3D.fx', apply: { Stereoscopic_Mode: '3' }, note: 'Column-interleaved.' },
    { k: 'checkerboard',     label: 'Checkerboard 3D (DLP)',     fx: 'SuperDepth3D.fx', apply: { Stereoscopic_Mode: '4' }, note: 'Checkerboard for DLP-Link.' }
  ]
};
MOD_OUTPUTS.geo11_github = MOD_OUTPUTS.geo11;
MOD_OUTPUTS.geo3d_legacy = MOD_OUTPUTS.geo3d;

const DEFAULTS = {
  // 3DVision4All 3dvision4all.ini real defaults ([stereo] + key [render] toggles).
  v4a: { stereo: { mode: 'sbs', swap_eyes: '0' }, render: { defeat_directflip: '1', force_windowed: '1', disable_vsync: '0' } },
  dgvoodoo: { General: { OutputAPI: 'd3d11_fl11_0' }, DirectX: { dgVoodooWatermark: 'false', FastVideoMemoryAccess: 'true', Antialiasing: 'appdriven', VideoCard: 'internal3D' } },
  geo11: { Device: { direct_mode: 'katanga_vr' }, Stereo: { dm_convergence: '10', dm_separation: '5' } }, // VR full-res SBS -> Osiris
  // Geo3D writes [Geo3D] into ReShade.ini at runtime; seed it so it's editable BEFORE the first launch.
  // Values verified against the ReShade.ini files inside Geo3D v3.5's own per-game fixes.
  geo3d:        { Geo3D: { StereoSeparation: '15', StereoConvergence: '0.4', StereoScreenSize: '27', DepthZ: '1' } },
  geo3d_legacy: { Geo3D: { StereoSeparation: '15', StereoConvergence: '0.4', StereoScreenSize: '27', DepthZ: '1' } },
  // verified against the real SuperDepth3D.fx uniforms: Depth_Adjustment (0..100, default 50),
  // Zero_Parallax_Distance (0..0.250), Eye_Swap (bool). 'Divergence' is NOT a real uniform.
  // Seeded from the real SuperDepth3D.fx uniforms: Stereoscopic_Mode (output, default 0=SBS), Depth_Adjustment
  // (default 50), Zero_Parallax_Distance (default 0.025), Perspective (horizontal shift / eye swap, default 0).
  sd3d: { 'SuperDepth3D.fx': { Stereoscopic_Mode: '0', Depth_Adjustment: '50', Zero_Parallax_Distance: '0.025', Perspective: '0', IPD: '0', Eye_Swap: '0', Depth_Map: '0' } }
};
DEFAULTS.geo11_github = DEFAULTS.geo11;   // same driver, same seeded config


/* ------------------------------------------------------------------ *
 * CORE_SOURCES — how each cached package is downloaded.
 * ------------------------------------------------------------------ */
const CORE_SOURCES = [
  { id:'geo3d_legacy',    name:'Legacy Geo3D (bundled)',     strategy:'bundled', dir:'bundled/legacy-geo3d',
    desc:'An older all-in-one Geo3D build shipped with the app — installs offline with no download. Bundles Geo3D + GeoVRExport + the 3DToElse SBS shader.' },
  { id:'dgvoodoo',        name:'dgVoodoo2 (DX1-9 / Glide \u2192 DX11)', strategy:'github-release', repo:'dege-diosg/dgVoodoo2',
    site:'https://dege.freeweb.hu/dgVoodoo2/dgVoodoo2/', homepage:'https://dege.freeweb.hu/',
    official:'Dege (dege.freeweb.hu)',
    desc:'Legacy DirectX (1-9) and Glide wrapper by Dege. Cached once like any other core, then the wrapper DLL matching the game\u2019s API and bitness is copied next to the exe with a DX11-tuned dgVoodoo.conf.',
    note:'Freeware, closed source. Fetched unmodified from Dege\u2019s own release feed \u2014 never bundled or repackaged.' },
  { id:'wiz3d',           name:'wiz3D',                      strategy:'github-release', repo:'effcol/wiz3D',
    desc:'Universal iZ3D-based stereo wrapper (DX7-11, OpenGL, AMD HD3D, 3D Vision). Release ships per-API/bitness proxy builds; the app copies the matching one next to the exe.' },
  { id:'v4a',             name:'3DVision4All',               strategy:'github-release', repo:'oneup03/3DVision4All',
    desc:'Proxy-DLL 3D wrapper by oneup03 (GPL-3.0). Release ships x64 + Win32 builds, each with proxy DLLs (winmm/version/dinput8/dsound) + 3dvision4all.ini + EnableWindowed3D.exe. No ReShade/add-ons.' },
  { id:'reshade',         name:'ReShade add-on build',       strategy:'archive-url', fallbackLaunch:true,
    url:'https://reshade.me/downloads/ReShade_Setup_' + RESHADE_VER + '_Addon.exe',
    filename:'ReShade_Setup_' + RESHADE_VER + '_Addon.exe', version: RESHADE_VER, launch:true, site:'https://reshade.me/',
    desc:'The post-processing injector that hosts SuperDepth3D and Geo3D. The manager downloads the official setup tool WITH full add-on support and launches it (pick the game .exe + API + add-on shaders).',
    note:'Use the build WITH full add-on support. Pick your game .exe, choose its render API, and tick the SuperDepth3D / VR-export shaders.' },
  { id:'reshade-shaders', name:'ReShade shader collection',  strategy:'github-repo',    repo:'crosire/reshade-shaders', branch:'slim',
    desc:'The standard ReShade shader pack (crosire). Useful base effects that live in reshade-shaders/Shaders.' },
  { id:'sd3d',            name:'SuperDepth3D (Depth3D)',     strategy:'github-repo',    repo:'BlueSkyDefender/Depth3D', branch:'master',
    desc:'Depth-based stereo 3D shader. Works on almost any DX9/10/11 game; pairs with the locked SuperVRExport add-on for full-res SBS.',
    note:'The author (BlueSkyDefender) recommends installing SuperDepth3D via the GPUSelector app (https://github.com/BlueSkyDefender/GPUSelector), which sets up the shader + per-game profiles.' },
  { id:'geo3d',           name:'Geo3D',                      strategy:'github-release', repo:'Flugan/Geo3D',
    desc:'Geometry-based stereo 3D (Flugan) running as a ReShade add-on. Pairs with the locked GeoVRExport add-on for full-res SBS.' },
  { id:'geo11',           name:'geo-11 (HelixMod \u2014 official)', strategy:'archive-url', manualCore:true,
    url:'https://bo3b.s3.us-east-1.amazonaws.com/geo-11/geo-11_v0.7.10.7z',
    version:'v0.7.10',
    site:'https://helixmod.blogspot.com/search/label/geo-11',
    official:'HelixMod blog',
    desc:'3D Vision-class geometric 3D driver for DX11 (davegl1234 / HelixMod). Official build, downloaded straight from HelixMod\u2019s own server \u2014 one-click. Config: d3dxdm.ini direct_mode (sbs / tab / interlaced / checkerboard / katanga_vr / nvidia_dx9), and force_stereo=2 in d3dx.ini.',
    note:'Official HelixMod build v0.7.9 (.7z, extracted automatically) \u2014 well ahead of the GitHub mirror. If HelixMod posts a newer build, grab it from the blog and drop it into this mod\u2019s Manual core folder; the app will use that instead.' },
  { id:'geo11_github',    name:'geo-11 (GitHub mirror)',     strategy:'github-release', repo:'ThreeDeeJay/geo-11',
    site:'https://github.com/ThreeDeeJay/geo-11',
    official:'ThreeDeeJay mirror',
    desc:'Auto-downloadable mirror of the geo-11 binaries \u2014 one-click install for DX11 games. Same config files as the official build (d3dxdm.ini + d3dx.ini).',
    note:'Community mirror, downloads automatically. It can lag behind the official HelixMod blog build.' },
  { id:'supervrexport',   name:'SuperVRExport add-on (SuperDepth3D)', strategy:'github-release', repo:'BerZerker96/Super-VRExport-Addon',
    bundledFallback:'bundled/vrexport',
    desc:'Locked to SuperDepth3D. Exports full-resolution SBS to the Osiris VR viewer.' },
  { id:'geovrexport',     name:'GeoVRExport add-on (Geo3D)',          strategy:'github-release', repo:'BerZerker96/Super-VRExport-Addon',
    bundledFallback:'bundled/vrexport',
    desc:'Locked to Geo3D. Exports full-resolution SBS to the Osiris VR viewer. Ships geod3d9.dll for the native D3D9 fast path.' },
  { id:'osiris',          name:'Osiris VR Viewer',           strategy:'github-release', repo:'BerZerker96/Osiris-Vr-Viewer',
    desc:'Displays the full-res SBS stereo stream as a virtual VR screen.' },
  { id:'track_bz',        name:'6DOF Hub (BerZerker96)',     strategy:'release-hub',    repo:'BerZerker96/6DOF-Head-Tracking-Mods-Hub', headTracking:true,
    desc:'BerZerker96\u2019s 6DOF head-tracking hub. One repo with a separate release per game \u2014 the manager matches your game and downloads its release.' },
  { id:'bepinex',         name:'BepInEx (Unity loader)',     strategy:'website',        url:'https://github.com/BepInEx/BepInEx/releases', site:'https://github.com/BepInEx/BepInEx/releases',
    desc:'Plugin loader for Unity games \u2014 a prerequisite you install into the game folder before the head-tracking mod\u2019s DLLs load.' },
  { id:'asiloader',       name:'Ultimate ASI Loader',        strategy:'website',        url:'https://github.com/ThirteenAG/Ultimate-ASI-Loader/releases', site:'https://github.com/ThirteenAG/Ultimate-ASI-Loader/releases',
    desc:'Generic native ASI loader \u2014 a prerequisite for native-engine head-tracking mods (drop dinput8.dll next to the .exe).' },
  { id:'reframework',     name:'REFramework (RE Engine)',    strategy:'website',        url:'https://github.com/praydog/REFramework-nightly/releases', site:'https://github.com/praydog/REFramework-nightly/releases',
    desc:'Per-game mod framework / loader for RE Engine titles. Download your game\u2019s build from the releases page.' },
];
const CORE_BY_ID = Object.fromEntries(CORE_SOURCES.map(s => [s.id, s]));

/* per-mod release asset preference (bitness/api aware) */
const ASSET_MATCH = {
  // Output keys are the LIVE MOD_OUTPUTS.geo11 keys. (They used to be the renderer's old OUTPUTS
  // namespace — vr_native/tab_half/frame_sequential — which no longer reaches this function, so
  // Top-and-Bottom and both 3D Vision Direct modes silently downloaded the Side-By-Side build.)
  geo11: (api, bit, output) => {
    switch (output) {
      case 'interlaced':   return /Interlaced\.zip/i;
      case 'checkerboard': return /Checkerboard\.zip/i;
      case 'tab':          return /Top-?And-?Bottom\.zip/i;
      case 'nvidia_dx9':   return /NVIDIA3DVision.*Direct3D9\.zip/i;
      case 'nvidia_dx11':  return /NVIDIA3DVision.*Direct3D11\.zip/i;
      default:             return /Side-?By-?Side\.zip/i;   // katanga_vr / sbs — KatangaVR captures SBS
    }
  },
  geo11_github: (api, bit, output) => ASSET_MATCH.geo11(api, bit, output),
  // 3DVision4All ships two release assets: an x64 build and a Win32 build. Pick by the game's bitness.
  v4a: (api, bit) => (bit === 'x64') ? /(x64|win64|x86_64).*\.zip$/i : /(win32|x86|ia32).*\.zip$/i,
  // itsloopyo ships 3 assets per release: -installer.zip (just .cmd/.ps1 scripts), -nexus.zip (the
  // real mod files for manual install) and -thunderstore.zip (mod-manager package). We place files
  // ourselves, so we want the nexus build — never the installer scripts.
  // itsloopyo ships up to two archives per release:
  //   *-nexus.zip     mod files only  (RELEASED mods, which also go to Nexus)
  //   *-installer.zip mod files + install.cmd  (the ONLY archive on pre-release mods,
  //                                             which have no Nexus page yet)
  // Requiring -nexus.zip meant every pre-release mod resolved to no asset at all and the download
  // failed. Accept either, preferring the clean nexus archive when it exists.
  track_loop: () => /(?:-nexus|-installer)?\.zip$/i,
  /* dgVoodoo2 releases carry SEVEN assets, and only one of them is the wrapper pack a game needs:
   *   dgVoodoo2_XX_Y.zip        <- the pack we want (MS\\x86, MS\\x64, dgVoodooCpl.exe, dgVoodoo.conf)
   *   dgVoodoo2_XX_Y_Dev64.zip  <- graphics-API DLLs for developers (v2.86.3+)
   *   dgVoodooWinMM*.zip        <- the WinMM uptime-fixer, split out into its own pack in v2.87
   *   ...plus source archives
   * With no matcher the app took whichever zip came first, which could be the dev or WinMM pack -
   * neither contains a wrapper DLL, so the install would find no MS\\<bit> folder and fail. */
  dgvoodoo: () => /^dgvoodoo2[._-]?\d+(?:[._-]\d+){0,2}\.zip$/i,   // the plain versioned pack only — not Dev64 / WinMM / API
  supervrexport: () => /super\s*vr\s*export|supervr/i,   // repo ships both addons; pick SuperVRExport
  geovrexport:   () => /geo\s*vr\s*export|geovr/i         // ...and GeoVRExport
};

const FETCHABLE = CORE_SOURCES.filter(s => s.strategy !== 'website' && s.strategy !== 'release-hub' && s.strategy !== 'bundled').map(s => s.id);
function slug(s) { return String(s || '').toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
/* itsloopyo names its per-game repos with a short slug; most match slug() but a few are abbreviated. */
const HT_ALIAS = {
  'return of the obra dinn': 'obra-dinn',
  'the elder scrolls v skyrim special edition': 'skyrim-special-edition',
  'the elder scrolls v skyrim': 'skyrim',
  'subnautica below zero': 'subnautica-2'
};
function htSlug(game) { const k = String(game || '').toLowerCase().replace(/['\u2019:]/g, '').replace(/\s+/g, ' ').trim(); return HT_ALIAS[k] || slug(game); }
function helixFixUrl(game) { return 'https://www.google.com/search?q=' + encodeURIComponent((game || '') + ' geo-11 3D fix helixmod'); }

/* wiz3D output methods → the OutputMethodDll value written into wiz3D_Config.xml (verified names). */
const WIZ_OUTPUTS = {
  interlaced:   { dll: 'InterlacedOutput',            label: 'Interlaced (VR-ready, full-res per eye)' },
  checkerboard: { dll: 'DLP3DOutput',                 label: 'Checkerboard / DLP-Link (VR-ready)' },
  sbs:          { dll: 'SideBySideOutput',            label: 'Side-by-Side (VR viewer / 3D TV / passive)' },
  anaglyph:     { dll: 'AnaglyphOutput',              label: 'Anaglyph (red/cyan glasses)' },
  shutter:      { dll: 'ShutterOutput',               label: 'Shutter glasses (page-flip)' },
  sr_weave:     { dll: 'SimulatedRealityWeaveOutput', label: 'SR Weave (SpatialLabs / Odyssey 3D)' }
};
/* which release subfolder matches the game's API (+ bitness handled by installer). */
function wizApiFolder(game) {
  if (game && game.hd3d) return 'hd3d';
  const a = String((game && game.api && game.api[0]) || '').toUpperCase();
  if (a === 'DX7') return 'dx7';
  if (a === 'DX8') return 'dx8';
  if (a === 'DX9') return 'dx9';
  if (/OPENGL|GL/.test(a)) return 'opengl-quad-buffer-stereo';
  if (/DX1[012]/.test(a)) return 'dx10-11';
  return 'dx9';
}

/** Which render APIs each mod can actually drive. Mirrors the renderer's MOD_API so the backend
 *  enforces the same rule the UI advertises. Mods absent from this map are API-agnostic
 *  (ReShade, the VR-export add-ons, the 6DOF hubs, loaders). */
const MOD_API = {
  wiz3d:        ['DX7', 'DX8', 'DX9', 'DX10', 'DX11', 'OpenGL'],   // the v0.3.1 package ships dx8, dx9, dx10-11, opengl-quad-buffer, hd3d and 3d-vision-direct trees
  v4a:          ['DX7', 'DX8', 'DX9', 'DX10'],                     // NVIDIA 3D Vision proxy
  geo3d:        ['DX9', 'DX10', 'DX11', 'DX12'],
  geo3d_legacy: ['DX9', 'DX10', 'DX11', 'DX12'],
  geo11:        ['DX11'],
  geo11_github: ['DX11'],
  sd3d:         ['DX7', 'DX8', 'DX9', 'DX10', 'DX11', 'DX12', 'Vulkan', 'OpenGL'],
  reshade:      ['DX7', 'DX8', 'DX9', 'DX10', 'DX11', 'DX12', 'Vulkan', 'OpenGL'],
};

module.exports = {
  MOD_API, MOD_OUTPUTS, MODS, DEFAULTS, CORE_SOURCES, CORE_BY_ID, ASSET_MATCH, FETCHABLE, slug, htSlug, helixFixUrl, RESHADE_VER, WIZ_OUTPUTS, wizApiFolder };
