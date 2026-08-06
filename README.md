<img width="1584" height="672" alt="1784444271884" src="https://github.com/user-attachments/assets/5e5b2641-69e1-4fcf-b843-f95df9456d69" />
<div align="center">

# 🥽 Stereo 3D / 6DoF Manager

### One‑click setup for stereoscopic‑3D & 6DOF head‑tracking game mods

*Scan your games → get the right 3D mod → play in depth. No manual DLL juggling.*

<br/>

<img width="2460" height="1707" alt="2026-08-06 17_32_00-" src="https://github.com/user-attachments/assets/d4e08e52-b965-4401-b274-9ea963835a3c" />


![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows&logoColor=white)
![APIs](https://img.shields.io/badge/APIs-DX7%20to%20DX12%20%7C%20Vulkan%20%7C%20OpenGL-1a6a7a)
![Games](https://img.shields.io/badge/Game%20database-3335%20titles-2a71a8)
![Mods](https://img.shields.io/badge/Managed%20mods-17-0e7f93)
![Built with](https://img.shields.io/badge/Built%20with-Electron-47848F?logo=electron&logoColor=white)

</div>

---

## 📖 What is this?

Playing PC games in **stereoscopic 3D** or with **6DOF head tracking** usually means hunting down the right driver, the right ReShade add‑on, the right per‑game mod, matching each to your game's graphics API, dropping DLLs into the correct folder, and hand‑editing config files. 😮‍💨

**This app does all of that for you.** It scans your drives, identifies each game, recommends the correct 3D pipeline, downloads the real mods from their official sources, installs them with the correct proxy DLLs, and gives you a clean editor for the settings that actually matter.

> [!NOTE]
> This is an **installer / orchestrator**. The 3D and 6DOF mods themselves are made by the amazing community authors in the [Credits](#-credits). Please support them! 💛

---

## ✨ Features

| | Feature | What it does |
|:--:|---|---|
| 🔍 | **Drive scan** | Finds installed games and reads each one's render API + 32/64‑bit straight from the `.exe`. |
| ⚡ | **One‑click setup** | Picks & installs the best 3D pipeline for the game's API and writes a working config. |
| 🎚️ | **Manual install** | Install any single mod yourself, with the correct proxy & folder layout applied automatically. |
| 🟨 | **API / bit override** | A selector under the game title lets you correct detection; it sticks across rescans. |
| ↺ | **Revert to auto-detect** | Overrode something by hand? One button re-reads the `.exe` headers and the game database and hands detection back to the app. |
| 🖼️ | **Dynamic output picker** | The output list adapts to each mod's real formats (SBS, TAB, interlaced, checkerboard, VR…). |
| 🎯 | **6DOF auto‑match** | Understands the game *name* and matches a BerZerker or itsloopyo head‑tracking mod. |
| 🕹️ | **6DOF manual picker** | Pick **any** mod & version from either catalogue — including combined **3D + 6DOF** builds. |
| 🎮 | **DX → DX11 (dgVoodoo2)** | One‑button, built‑in: converts DX7/8/9/10 games to DirectX 11 with the right DLL for the API + bitness. |
| ⛭ | **D3D9 full‑res VR proxy** | Optional manual button that sets up the `geod3d9.dll` native fast path for SuperDepth3D or Geo3D. |
| ⚙️ | **Streamlined config** | Key 3D settings pinned on top, the rest folded away. Edits saved with a `.bak`, kept across updates. |
| 🧹 | **Clean uninstall** | Removes only the files the app installed (tracked per game). Your `game.exe` is never touched. |
| 💾 | **Backup & restore** | Export / import all your settings, library and profiles as a single JSON file. |
| 🟣 | **Self‑update** | **Check app updates** (purple, far right) queries this app's own GitHub. The version you *can* move to shows on the badge — nothing is shown while you're current. |
| ♻️ | **Adopts what's already there** | Mods you installed by hand are picked up automatically — one card per physical install, never two, and their missing settings are seeded without touching anything you tuned. |
| ▶️ | **Launch from the app** | A red **Play** button on each game starts it from its own folder, so mods and data paths resolve correctly. |
| 🎨 | **Themes & backgrounds** | Ten themes plus 12 CSS background patterns (Blender grid, XMB waves, blueprint, carbon, topographic…) in **Settings → Appearance**. |
| 📘 | **Three-page guide** | Setup, a colour-coded section for every mod with its real in-game hotkeys, and 6DOF fine-tuning tips. |
| ▶️ | **On from first launch** | SuperDepth3D and Geo3D are switched **on** in ReShade at install, with Geo3D's conversion already set to Frame-Sequential in → Side-by-Side out. The overlay opens on **Space**. |
| 📴 | **Offline‑capable** | Bundled cores & fallbacks install even when a download source is unreachable. |

---

## 🚀 Usage — 5 simple steps

```
①  Scan  →  ②  Pick a game  →  ③  One‑click setup  →  ④  Tune  →  ⑤  Play
```

### ① Scan your drives
Click **⟳ Scan all drives**. The app reads each game's API + bitness and matches its name against the built‑in database of **3,335 titles** across 275 engines — DX7 through DX12, Vulkan and OpenGL.

### ② Pick a game
Select any game. Its detected **API** and **bitness** show under the title — override them if a game was mis-detected, and press **↺ Auto-detect** to hand it back to the app.

### ③ One‑click setup
Choose an **output format** and press the setup button. The app:
- picks the best 3D pipeline for the game's API,
- downloads the real mod from its official source,
- installs it with the correct proxy DLL & folder layout,
- writes a working config.

### ④ Tune
Open **⚙ Config**. The settings that matter for 3D — **output, separation, convergence** — are pinned at the top; everything else is folded into an *Advanced* section.

### ⑤ Play (+ optional 6DOF)
Hit the red **▶ Play** button on the game panel — or launch it yourself. For head tracking, install a **6DOF** mod from the game's card (auto‑matched) or the manual picker, and point your tracker at **UDP `127.0.0.1:4242`**.

> [!TIP]
> Some config files only appear **after a game's first launch** (loaders like BepInEx create them on first run). The app shows sensible defaults until then.

---

## 🧩 What it can install

<table>
<tr><td valign="top">

**🟦 Stereoscopic 3D**
- **geo‑11** — DX11 geometry 3D, from HelixMod
- **geo‑11 (mirror)** — same build, GitHub fallback
- **Geo3D** (Flugan) — newest, manual
- **Legacy Geo3D** — bundled stable, used by one‑click
- **SuperDepth3D** — depth‑based, any API
- **wiz3D** — DX7–11, three build variants
- **3DVision4All** — Nvidia proxy, DX9–12

</td><td valign="top">

**🥽 VR export (full‑res SBS)**
- **SuperVrExport** → SuperDepth3D
- **GeoVrExport** → Geo3D
- ships **`geod3d9.dll`** for native DX9
- feeds **Katanga / VRScreenCap**

**🎮 Compatibility**
- **dgVoodoo2** — DX7/8/9/10 → DX11

</td><td valign="top">

**🎯 6DOF head tracking**
- **BerZerker hub** (per‑game)
- **itsloopyo** (per‑game)
- every **version** a mod ships
- ✦ combined **3D + 6DOF** builds
- auto loader install

</td></tr>
</table>

---

## ⚙️ What an install actually configures

Installing isn't just copying DLLs — the app leaves the game in a state you can launch straight into.

**ReShade‑hosted mods** (SuperDepth3D, Geo3D, Legacy Geo3D) get the real ReShade host downloaded for the game's **API and bitness**, renamed to the proxy name that game actually loads (`dxgi.dll` for DX10/11/12, `d3d9.dll` for DX9, `opengl32.dll` for GL), with the shader and texture folders and a matching `ReShade.ini`. The host is shared: a second hosted mod reuses it instead of downloading again, and removing one leaves it in place for the other.

Then the shader is **switched on**:

| Mod | What's set at install |
|---|---|
| **SuperDepth3D** | Technique enabled in the preset — active on first launch, no overlay needed. |
| **Geo3D / Legacy Geo3D** | `3DToElse` enabled, **input = Frame Sequential**, **output = Side‑by‑Side**. Pick a different output and your choice wins. |
| **All of them** | ReShade overlay bound to **Space** instead of the default `Home`. |

**3DVision4All** additionally needs `EnableWindowed3D.exe` run **once per game folder, elevated** — it writes the NVIDIA `StereoProfile` flags without which the driver won't activate stereo for the windowed swap chain the mod forces. The app prompts you and offers to run it.

**Legacy Geo3D** ships its add‑ons and shader inside the app (no download), but the ReShade host it runs inside is fetched per game so it always matches the architecture.

---

## 🔒 Install safety

- **One owner per file.** Two mods can ship the same payload. Exactly one is ever recorded as owning a given path, so removing either can't delete files the other still needs.
- **Proxy & loader slots are exclusive.** `d3d9/11/12.dll`, `dxgi.dll`, `nvapi64.dll` and the loader slots (`dinput8`, `winmm`, `version`, `dsound`) can only have one owner. A second mod that wants an occupied slot is refused *by name*, never silently clobbered — except 3DVision4All, which is politely **moved** to a free loader slot when a 6DOF mod needs the one it's using.
- **Nothing fails silently.** Every mod either installs or is refused with a stated reason.
- **Your tuning survives updates**, including keys the app doesn't ship a default for.

---

## 📚 Glossary

| Term | Meaning |
|---|---|
| **Stereoscopic 3D** | A separate image per eye, so the scene has real depth on a 3D display or VR viewer. |
| **6DOF** | *Six Degrees Of Freedom* — head yaw, pitch, roll + X/Y/Z lean driving the in‑game camera. |
| **Render API** | The graphics interface a game uses (DirectX 7–12, Vulkan, OpenGL). Decides which mod & DLL apply. |
| **Proxy DLL** | A DLL named like a system graphics library (`d3d9.dll`, `dxgi.dll`) that the game loads so a mod can hook in. |
| **ReShade** | A post‑processing injector; its **Add‑on** build hosts the stereo shaders and VR‑export add‑ons. |
| **SBS / TAB** | *Side‑by‑Side / Top‑and‑Bottom* — two eye images in one frame (half‑res squished, or full‑res). |
| **Convergence** | The distance that sits on the screen plane. Nearer pops out, farther recedes. |
| **Separation** | The 3D strength — how far apart the two eye viewpoints are. |
| **Katanga / VRScreenCap** | VR viewer apps that display the full‑res SBS frame the export add‑ons share to them. |
| **Core** | A shared cached download that multiple games link against (vs. a per‑game build). |
| **Frame Sequential** | Alternating left/right frames — what geo‑11 and Geo3D hand to ReShade before `3DToElse` converts it. |
| **Adopt** | Recording a mod that was already on disk into the app's manifest so it gets config, updates and clean removal. |
| **Technique** | A named effect inside a ReShade shader file. It has to be in the preset's enabled list to actually run. |

---

## 🕹️ DX9 games & full‑res VR

Direct3D 9 games can't share GPU textures across processes, so the VR‑export add‑ons ship a tiny proxy — **`geod3d9.dll`** — that upgrades the game to an extended (D3D9Ex) device for the fast GPU‑shared path. **This works for both SuperDepth3D and Geo3D.**

On a DX9 game, the manual install section shows an **optional ⛭ button** to set this up. Click it after installing ReShade + your 3D mod + the VR‑export addon. It renames the proxy to `d3d9.dll` beside the executable and moves ReShade into a subfolder it chainloads:

```
<game>\game.exe
<game>\d3d9.dll            ← geod3d9 proxy (renamed; the ONLY DirectX dll here)
<game>\ReShade\d3d9.dll    ← ReShade itself (keeps the d3d9.dll name)
<game>\ReShade\GeoVrExport.addon32
<game>\ReShade\ReShade.ini + ReShadePreset.ini
```

**Legacy DX → DX11 is built in.** For DX7/8/9/10 games, the manual section has an **Install dgVoodoo2** button that downloads the official package and places the correct DLL for the game's API + bitness (no site visit needed). This presents the game as DirectX 11 so geo‑11 / ReShade / Geo3D can run.

> dgVoodoo2 is freeware © **Dege** — the app fetches it *unmodified from the official source*, never bundling a modified copy, per its redistribution terms.

---

## 🧭 The top bar

Four compact buttons, left to right:

| Button | What it checks |
|---|---|
| 📘 **Guide** | The in‑app quick‑start walkthrough. |
| ▤ **Core library** | The shared download cache. Each mod's heavy files land here once and link into every game, so a second game installs instantly. Anything cached can always be **re‑downloaded** if it looks wrong. |
| ⟲ **Check mod updates** | Every *mod's* releases. Updating a core re‑links every game using it — no per‑game re‑download. |
| ⟲ **Check app updates** | This *app's* own [GitHub releases](https://github.com/BerZerker96/Stereo3D-6DOF-MANAGER/releases). |

The installed version is deliberately **not** displayed. The only number you ever see is the release tag you can move up to — it appears on the purple badge when an update exists and disappears when you're current. Release notes and the version bump are shown before anything downloads, and the installer goes straight to your **Downloads** folder.

The **app theme** and the **background pattern** live in **Settings → Appearance** — ten themes (nine dark, one light) and twelve CSS‑drawn patterns, all tinted to whichever theme you're on.

---

## 📘 The in‑app guide

Three pages side by side: **getting started**, **the 3D mods**, and **6DOF head tracking**. Every mod gets its own colour‑coded section with the settings that matter and, where the mod has them, its **real in‑game hotkeys** — geo‑11 and Geo3D share the same `Ctrl+F3–F7` depth/convergence keys (both are 3Dmigoto/HelixMod derived), 3DVision4All uses the 3D Vision driver's `Ctrl+F3–F8`, wiz3D uses numpad bindings, and SuperDepth3D lives entirely in the ReShade overlay. Plus depth‑tuning tips for SuperDepth3D and fine‑tuning advice for head tracking.

---

## ♻️ Mods you already installed

The app doesn't assume it put everything there. On every scan it reads what's physically on disk and **adopts** it, so hand‑installed mods get the same config editor, update checks and clean uninstall as ones it installed itself — but it never records files it didn't place, so removing an adopted mod leaves your own files alone.

Two things it's careful about:

- **One card per install.** Several mods ship the same files under two registry names — Geo3D has a bundled build and a latest build, geo‑11 has an official and a mirror. An ambiguous find resolves to **one**: the bundled Geo3D and the official geo‑11. A manifest that already listed both gets healed.
- **Empty editors get seeded.** A pre‑installed mod that has never been run has no settings block yet — Geo3D writes its section into `ReShade.ini` at runtime. Adopting it fills in the missing keys only, so anything you already tuned is left exactly as it was, and a `.bak` is written.

---

## 🎯 6DOF head tracking

Head‑tracking mods are **per game**, from two catalogues: the **BerZerker hub** (one release per game in a single repo) and **itsloopyo** (one repo per game). The app matches your game by name — handling acronyms, roman↔arabic numerals and sequel collisions — and installs the right build with the loader layout that release expects (ASI, BepInEx, MelonLoader or REFramework).

The **manual picker** lists **every version** a mod ships, not just the newest: store variants (Steam / Epic / GamePass), build variants, and older releases, each labelled by whatever actually differs between them. A build tagged **✦ 3D + 6DOF** bundles the stereo mod too, so you don't need a separate one.

Point your tracker at **UDP `127.0.0.1:4242`**.

---

## 📄 Full documentation

A complete **feature & technical reference** — every download method, install layout, the config editor, and the DX9 proxy in detail — is in **[`docs/Stereo3D-6DoF-Manager-Guide.pdf`](docs/Stereo3D-6DoF-Manager-Guide.pdf)**.

Developers: build & architecture notes are in **[`DEVELOPER.md`](DEVELOPER.md)**.

Every release is validated by an offline test suite covering the install engine end to end — every mod against every render API, every mod pair and triple in every install order, every output format, config round‑trips, update and download paths, and the full game database's exe↔folder correlation.

---

## 🙏 Credits

This manager stands on the shoulders of the stereoscopic‑3D & VR modding community. All mods are downloaded from their **official sources** and remain under their authors' own licenses. 💛

| Project | Author |
|---|---|
| **SuperDepth3D / Depth3D** | [BlueSkyDefender](https://github.com/BlueSkyDefender/Depth3D) |
| **geo‑11 / HelixMod** | bo3b, DHR, Flugan & the HelixMod community |
| **Geo3D** | [Flugan](https://github.com/Flugan/Geo3D-Installer) |
| **Super‑VRExport / GeoVrExport** | [BerZerker96](https://github.com/BerZerker96/Super-VRExport-Addon) *(built on [artumino's ReshadeVRExport](https://github.com/artumino/ReshadeVRExport))* |
| **Katanga VR** | [bo3b](https://github.com/bo3b/katanga) |
| **ReShade** | [crosire](https://reshade.me) |
| **wiz3D** | effcol |
| **3DVision4All** | [oneup03](https://github.com/oneup03/3DVision4All) |
| **6DOF Head‑Tracking Hub** | [BerZerker96](https://github.com/BerZerker96) |
| **6DOF per‑game mods** | [itsloopyo](https://github.com/itsloopyo) |
| **dgVoodoo2** | [Dege](https://dege.freeweb.hu/) |
| **Loaders** | BepInEx · ThirteenAG (Ultimate ASI Loader) · praydog (REFramework) |

---

<div align="center">

**Made for the 3D gaming community.**

*Not affiliated with or endorsed by the individual mod authors — this tool simply helps you install their work correctly.*

</div>
