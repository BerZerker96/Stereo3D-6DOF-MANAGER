# Stereo 3D/6DoF Manager (desktop app)

A real Electron desktop application for managing stereoscopic-3D mods on PC games.
The UI is the exact Stereo 3D/6DoF Manager mockup; the difference is that every action is now
wired to a real Node backend that touches your actual drives and files.

## What's real

| Action | Real behavior |
|---|---|
| **Scan** | Enumerates drives, reads Steam's `libraryfolders.vdf`, lists `steamapps/common/*` plus your extra scan folders, detects **bitness from the PE header** + best-effort API/engine, and pulls the real `.exe` icon. |
| **Open folder** | Opens the game's install folder in Explorer. |
| **Add game .exe** | Native file picker; reads bitness/API/engine from the chosen `.exe`. |
| **Core library** | A **real on-disk cache** at `<userData>/core/<mod>@<tag>/`. The Core drawer and Mods page show exactly what's cached and how big. |
| **Download / Update core** | Fetches the latest GitHub release, **streams download progress** (live bar, bottom-left), extracts to the cache, re-links games. A second game reuses the cache — no re-download. |
| **Check updates** | Queries the GitHub Releases API for every mod, compares tags to cache. Add a token in Settings to raise the rate limit. |
| **Install / pipeline** | Caches the release, copies payload + proxy DLL into the game folder, writes a default config, records a manifest for detection/uninstall. |
| **Config editor** | Reads/writes the **real** `.ini`/`.conf`/`preset` files, preserving comments + unknown keys, atomic write + `.bak`. |
| **Mods / Profiles / Settings tabs** | Real pages: mod catalog with cache/version, saved config profiles (`profiles.json`), and scan-folder + token + data-folder management. |

### Core downloads

The **Mods** page (and the Core drawer) list every core package and a **Download all core files** button. Methods per source:

- **GitHub release**: **wiz3D** (universal iZ3D-based wrapper), geo-11, Geo3D, **SuperVRExport** + **GeoVRExport** (distinct assets from the same repo), Osiris VR Viewer.

### wiz3D wrapper (legacy DX7-9 / AMD HD3D / 3D Vision)

wiz3D is downloaded from `effcol/wiz3D`; the app copies the build matching the game's **API + bitness** (`dx9/x86`, `dx8`, `hd3d`, `opengl-quad-buffer-stereo`, …) next to the exe and writes the output method into `wiz3D_Config.xml`. For VR it defaults to **Interlaced** (full-res per eye); you can switch to **Checkerboard / DLP-Link**, SBS, Anaglyph, Shutter, or SR Weave from the wiz3D config editor. It's the recommended path for native DX7-9, HD3D and 3D-Vision-ready titles (no dgVoodoo2 conversion needed).

### Loader / proxy-DLL rename

When a proxy/loader DLL (wiz3D's `d3d9.dll`, an ASI loader's `dinput8.dll`, BepInEx's `winhttp.dll`, …) is detected next to the exe, a **Loader / proxy DLL** panel appears (in the install tab and in the wiz3D / head-tracking config editors). If the DLL doesn't inject, rename it to another search-order name — **dinput8 / version / winmm** first, then dxgi, xinput, d3d11, winhttp, binkw*. Existing targets are backed up and the manifest is kept in sync.
- **GitHub repo** (codeload, unit-tested): SuperDepth3D/Depth3D and the ReShade shader collection.

### Head-tracking (two real per-game sources)

Both head-tracking hubs are matched to the specific game and downloaded, then the mod is installed next to the real exe (DLLs in `BepInEx/plugins/` for Unity, `Mods/` for MelonLoader, or a `.asi` next to the exe for native). The **loader** each mod needs — **BepInEx** (Unity), **Ultimate ASI Loader** (native), or **REFramework** (RE Engine) — is **not auto-installed**; the app notes which one to install and links its download page, so you set it up once into the game folder. The mod reads head pose over UDP `127.0.0.1:4242` from whatever head-tracking app you choose to run.

- **itsloopyo** — per-game repositories at `github.com/itsloopyo/<game>-headtracking`; the manager resolves the game's repo (handling short names like `obra-dinn`) and downloads its release. DLLs land in `BepInEx/plugins/` (Unity), `Mods/` (MelonLoader), or as a `.asi` next to the exe (native).
- **BerZerker96 6DOF Hub** — a single repo (`6DOF-Head-Tracking-Mods-Hub`) with **one release per game**; the manager lists the releases, matches your game (distinguishing e.g. *Subnautica* from *Subnautica 2*), and downloads that release's asset.

The config is identified per game: `BepInEx/config/com.cameraunlock.<game>.headtracking.cfg` (Unity) or `HeadTracking.ini` next to the exe. If a game has no published release on a source (or you're rate-limited), the install opens that source's page (and notes the Nexus fallback) instead of failing.
- **Installer (download + launch)**: **ReShade** — the app downloads the latest official setup tool **with full add-on support** (`ReShade_Setup_<ver>_Addon.exe`) into `/core` and launches it; you point it at the game `.exe`, choose the render API, and tick the add-on shaders.
- **Guided (official site)**: **dgVoodoo2** opens dege.freeweb.hu and **HelixMod** per-game fixes open the HelixMod blog — these have their own interactive installers, so the app opens the site and shows the setup steps via the **❔ Help** button.

The stereo paths the app installs for you are **geo-11**, **SuperDepth3D** (+SuperVRExport) and **Geo3D** (+GeoVRExport). (wiz3D and 3DVision4All were removed to keep the set focused.)

### ReShade host prerequisite

`SuperDepth3D`, `Geo3D` and `Legacy Geo3D` all run *inside* ReShade, so they declare `needs: ['reshade']`.
Installing any of them now installs the real host first: the ReShade DLL matching the game's **API and
bitness**, renamed to the proxy name that game actually loads (`dxgi.dll` for DX10/11/12, `d3d9.dll` for
DX9, `opengl32.dll` for GL), plus `reshade-shaders/Shaders` + `Textures` and a `ReShade.ini` pointing at
them. The host is recorded as its own manifest entry, so a second hosted mod reuses it rather than
re-downloading, and uninstalling one mod leaves the host in place for the other. If ReShade can't be
fetched, the mod still installs and the app returns guidance instead of failing.

Legacy Geo3D used to ship a 32-bit `ReShade32.dll` inside the bundle. It was copied under that literal
name, which no game loads, and it was the wrong architecture for 64-bit titles — so it never worked. The
bundle now carries only the Geo3D payload (add-ons, the SBS shader, the DXIL compiler) and the host is
downloaded per game.

### Locked add-ons & placement

- **SuperDepth3D** automatically pulls and installs **SuperVRExport**; **Geo3D** pulls **GeoVRExport** — these add-ons are locked to their mod and are removed with it.
- Files are placed correctly per mod: SuperDepth3D shaders into `reshade-shaders\Shaders`, geo-11/Geo3D next to the real `.exe` (for Unreal that's inside `Binaries\Win64`), add-on `.addon64` next to the `.exe`.
- **geo-11** is configured for **`direct_mode = katanga_vr`** (full-res SBS to Osiris) and offers a one-click **HelixMod** link to grab the per-game shader fix.

### One-click setup & Help

- **Set up 3D** runs the chosen path: **geo-11** is fully automatic (installs the driver + KatangaVR config); **SuperDepth3D** and **Geo3D** install their shaders/add-ons and launch the ReShade add-on setup tool for the host install.
- The **❔ Help** button beside *One-click setup* opens an in-app guide explaining SuperDepth3D, geo-11 and Geo3D, plus how to install ReShade, dgVoodoo2 and HelixMod fixes.

### Managing installs

- **Uninstall** button in each mod's config editor reverts that mod (and its locked add-on) using the recorded manifest.
- **Auto-detection** adopts pre-installed mods on scan (ReShade, dgVoodoo2, geo-11, SuperDepth3D, Geo3D, head-tracking) so the app can manage them.
- **Right-click a game** → *Open file location*.

### Scanning & startup

The app **starts with an empty library and never scans automatically**, so it always opens instantly. Press **🔍 Scan** (top bar or the empty-library prompt) to scan your drives and Steam libraries, or **add games manually**. Scanning runs in the background with a **top progress bar** and yields between games so the UI never freezes. Manually-added games are remembered across launches; scanned games are not. You can flip on *Scan on startup* in Settings if you prefer.

### Portable, auto-saved settings

Every setting — theme, **window size/position**, scan folders, core location, GitHub token, excluded games, head-tracking preferences — is saved automatically to `settings.json`. When the app's own folder is writable (a portable build) the file lives **next to the app**; otherwise it falls back to your user-data folder. Settings persist across restarts with no Save button.

### Real exe detection & mod placement

The scanner finds the **real game executable** the GPU driver loads — not a thin launcher — using researched per-engine layouts, so injected DLLs (ReShade, geo-11, proxies) and `reshade-shaders/` land in the folder that actually loads them. Coverage:

- **Unreal 4/5** → `<Game>/<Project>/Binaries/Win64/<Name>(-Win64-Shipping).exe` (the root `.exe` is just a loader; the real name isn't always `-Shipping`, e.g. `Hotta/Binaries/Win64/QRSL.exe`). `Engine/Binaries/Win64/UE4Game.exe` is used for blueprint-only games, and `CrashReportClient.exe`/prereq/anti-cheat exes are skipped.
- **REDengine** (Witcher 3, Cyberpunk 2077) → `bin/x64/…exe` (and `bin/x64_dx12`).
- **CryEngine** → `Bin/Win64/…exe`. **Source 1** → root launcher + `bin/`. **Source 2** → `game/bin/win64/`.
- **Unity / Creation (Bethesda) / RE Engine / id Tech / Frostbite / older DX8–9 games** → the executable at the game root.

Mods install **next to that exe** (for Unreal that's inside `Binaries/Win64`), and the per-game `.stereoscope/manifest.json` lives there too. The picker prefers the deep engine binary over a root stub, and tool/uninstaller/redist folders are ignored.

### Everything is saved automatically

Your **library** (scanned + manually-added games), each game's **installed mods**, edited **config snapshots**, plus all **settings** (theme, window size, scan folders, core location, etc.) are written to disk automatically on every change, and restored on the next launch — no rescan needed. There's also a cyan **💾 Save** button next to the theme picker to force an immediate save whenever you want the reassurance.

### Editing the head-tracking config in-app

Click **⚙ Config** on a game's installed head-tracking mod and the app finds its ini next to the `.exe` (`HeadTracking.ini`, or the matching `BepInEx/config/*.headtracking.cfg` for Unity), reads it, and shows every key as an editable field. **Save** writes the file back in place (with a `.bak` backup); if no file exists yet, the editor shows sensible defaults and creates it on save. There's also an **Open file location** button.

> Honest scope: download/extract/placement/config/manifest are real and tested on the
> config layer. Per-mod upstream asset layouts vary, so asset matchers are best-effort and
> the per-game `.stereoscope/manifest.json` lets you review or roll back. `ReShade` and
> `dgVoodoo2` ship from their own sites (not GitHub releases); the app configures them in
> place once their binaries are present and links out to the official download.

## Run it (development)

```bash
npm install
npm start
```

## Build a Windows .exe

**Easiest:** double-click **`build.bat`** — it checks Node, runs `npm install`, lets you
pick a portable or installer build, and opens the `dist` folder when done.

Or run the steps manually:

**A. Portable folder (no installer, simplest, no Wine needed):**
```bash
npm run pack:dir
# → dist/Stereo 3D 6DoF Manager-win32-x64/Stereo 3D 6DoF Manager.exe   (double-click to run)
```

**B. Installer + portable .exe via electron-builder (run on Windows for signing/icons):**
```bash
npm run dist
# → dist/Stereo-3D-6DoF-Manager-1.0.0-x64.exe (NSIS installer)  and a portable .exe
```

> electron-builder embeds icons/metadata with tools that want Windows (or Wine on Linux).
> Building on Windows is the smooth path. The portable folder in option A builds anywhere.

## Project layout

```
main.js            Electron main process + IPC handlers (the real operations)
preload.js         contextBridge → window.stereo (safe renderer API)
renderer/index.html  the UI (identical to the mockup) + a thin integration layer
src/scanner.js     drives, Steam libraries, PE bitness, API/engine heuristics
src/config.js      INI/conf read-write that preserves unknown keys (+ .bak, atomic)
src/mods.js        the mod registry (sources, proxy DLLs, config files, strategy)
src/installer.js   GitHub release lookup, download, extract, placement, manifest
```

The renderer detects `window.stereo`. Inside the app it routes to the backend; opened as a
plain `.html` in a browser it falls back to the original in-memory mockup, so the same file
serves both.

## Notes / safety

- All wrappers and ASI/add-on builds are **single-player only** — do not use on
  anti-cheat-protected multiplayer.
- The config writer always backs up to `<file>.bak` before changing anything.
- Uninstall removes exactly the files recorded in the manifest.

MIT licensed. Mod sources belong to their respective authors (links in `src/mods.js`).
