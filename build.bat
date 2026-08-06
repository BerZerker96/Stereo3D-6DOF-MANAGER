@echo off
REM ============================================================
REM  Stereo 3D/6DoF Manager - one-click Windows build
REM  Produces a runnable "Stereo 3D 6DoF Manager.exe" from source.
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ==== Stereo 3D/6DoF Manager build ====
echo.

REM --- check Node / npm ---
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js was not found on PATH.
  echo     Install the LTS build from https://nodejs.org/ then re-run this script.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do set NODEVER=%%v
echo [*] Node %NODEVER% detected.
echo.

REM --- install dependencies (downloads Electron runtime ~100-200 MB on first run) ---
echo [*] Installing dependencies ^(npm install^)...
echo     Verbose mode is ON - you will see one line per file as it downloads,
echo     plus a live progress bar for the big Electron runtime download.
echo     The Electron binary is ~100-200 MB, so the longest pause is normal -
echo     as long as new "npm http fetch" / download lines keep appearing, it is working.
echo ------------------------------------------------------------------------
REM  --loglevel=http       -> prints "npm http fetch GET 200 <url>" for every file
REM  --foreground-scripts  -> streams the Electron postinstall download progress live
REM  --progress=true       -> forces the download progress bar
call npm install --no-audit --no-fund --loglevel=http --foreground-scripts --progress=true
echo ------------------------------------------------------------------------
if errorlevel 1 (
  echo.
  echo [X] npm install failed. Check your internet connection / proxy and try again.
  pause
  exit /b 1
)
echo [*] Dependencies installed.
echo.

REM --- choose build type ---
echo Choose a build:
echo    [1] Portable folder     ^(fast, no installer^)  -> dist\Stereo 3D 6DoF Manager-win32-x64\Stereo 3D 6DoF Manager.exe
echo    [2] Installer + portable ^(electron-builder^)    -> dist\Stereo-3D-6DoF-Manager-1.0.0-x64.exe
echo.
set /p CHOICE="Enter 1 or 2 (default 1): "
if "%CHOICE%"=="" set CHOICE=1

REM  surface every download/extract step during packaging
set DEBUG=@electron/get*,electron-packager,electron-builder
set ELECTRON_GET_USE_PROXY=

if "%CHOICE%"=="2" (
  echo.
  echo [*] Building installer with electron-builder ^(verbose^)...
  echo     Watch for "downloading" / "packaging" lines below.
  echo ------------------------------------------------------------------------
  call npm run dist
  if errorlevel 1 (
    echo [X] electron-builder failed. Falling back to the portable folder build...
    call npm run pack:dir
  )
) else (
  echo.
  echo [*] Building portable folder ^(verbose^)...
  echo     If the Electron runtime is not cached yet you will see a
  echo     "Downloading electron-v...-win32-x64.zip" line with progress.
  echo ------------------------------------------------------------------------
  call npm run pack:dir
)
echo ------------------------------------------------------------------------
if errorlevel 1 (
  echo.
  echo [X] Build failed. See the messages above.
  pause
  exit /b 1
)

echo.
echo ==== Done ====
if exist "dist\Stereo 3D 6DoF Manager-win32-x64\Stereo 3D 6DoF Manager.exe" (
  echo Run it:  dist\Stereo 3D 6DoF Manager-win32-x64\Stereo 3D 6DoF Manager.exe
)
if exist "dist\Stereo-3D-6DoF-Manager-1.0.0-x64.exe" (
  echo Installer:  dist\Stereo-3D-6DoF-Manager-1.0.0-x64.exe
)
echo.
echo Opening the dist folder...
if exist "dist" start "" "dist"
echo.
pause
endlocal
