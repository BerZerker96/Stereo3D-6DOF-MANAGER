@echo off
setlocal enableextensions enabledelayedexpansion
title Stereo 3D / 6DoF Manager - Updater

rem ==============================================================================================
rem  Standalone updater.
rem
rem  Run this with the app CLOSED. It asks GitHub for the newest release, downloads the portable
rem  archive, and replaces the files in this folder with the new ones.
rem
rem  What it never touches:
rem    - itself (update.bat)
rem    - logs\          your log files
rem    - manual-core\   cores you dropped in by hand
rem  Settings, profiles and your game library live in %APPDATA%\Stereo3D Manager, outside this
rem  folder entirely, so they are unaffected either way.
rem
rem  Everything it does is appended to logs\update.log.
rem ==============================================================================================

set "REPO=BerZerker96/Stereo3D-6DOF-MANAGER"
set "APPDIR=%~dp0"
if "%APPDIR:~-1%"=="\" set "APPDIR=%APPDIR:~0,-1%"
set "LOGDIR=%APPDIR%\logs"
set "LOG=%LOGDIR%\update.log"
set "STAGE=%APPDIR%\.update-staging"
set "ZIP=%TEMP%\stereo3d-update-%RANDOM%.zip"
set "SELF=%~nx0"

if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1
echo. >> "%LOG%"
echo ============================================================ >> "%LOG%"
echo [%DATE% %TIME%] standalone updater started >> "%LOG%"

echo.
echo   Stereo 3D / 6DoF Manager - Updater
echo   ----------------------------------
echo.

rem ---- 1. the app must not be running, or the files are locked -------------------------------
tasklist /FI "IMAGENAME eq Stereo 3D 6DoF Manager.exe" 2>nul | find /I "Stereo 3D 6DoF Manager.exe" >nul
if not errorlevel 1 (
  echo   The app is still running. Close it first, then run this again.
  echo [%DATE% %TIME%] ABORT - the app is still running >> "%LOG%"
  echo.
  pause
  exit /b 1
)

rem ---- 2. ask GitHub for the newest release ---------------------------------------------------
echo   Checking %REPO% for a newer version...
set "PS=powershell -NoProfile -ExecutionPolicy Bypass -Command"

%PS% "$ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $r=Invoke-RestMethod -Uri 'https://api.github.com/repos/%REPO%/releases/latest' -Headers @{'User-Agent'='Stereo3DManager-Updater'}; $a=$r.assets ^| Where-Object { $_.name -match '\.zip$' -and $_.name -notmatch 'Source' } ^| Select-Object -First 1; if(-not $a){ throw 'no .zip asset on the latest release' }; Write-Output ($r.tag_name + '|' + $a.browser_download_url) } catch { Write-Output ('ERR|' + $_.Exception.Message) }" > "%TEMP%\s3d_rel.txt" 2>nul

set "REL="
for /f "usebackq delims=" %%L in ("%TEMP%\s3d_rel.txt") do set "REL=%%L"
del "%TEMP%\s3d_rel.txt" >nul 2>&1

if not defined REL (
  echo   Could not reach GitHub. Check your connection and try again.
  echo [%DATE% %TIME%] ABORT - no response from GitHub >> "%LOG%"
  echo.
  pause
  exit /b 1
)
for /f "tokens=1,* delims=|" %%A in ("!REL!") do (
  set "TAG=%%A"
  set "URL=%%B"
)
if /I "!TAG!"=="ERR" (
  echo   GitHub said: !URL!
  echo [%DATE% %TIME%] ABORT - !URL! >> "%LOG%"
  echo.
  pause
  exit /b 1
)

echo   Latest release: !TAG!
echo [%DATE% %TIME%] latest=!TAG! url=!URL! >> "%LOG%"

rem ---- 3. download -----------------------------------------------------------------------------
echo   Downloading...
%PS% "$ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '!URL!' -OutFile '%ZIP%' -Headers @{'User-Agent'='Stereo3DManager-Updater'}; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo   Download failed.
  echo [%DATE% %TIME%] ABORT - download failed >> "%LOG%"
  del "%ZIP%" >nul 2>&1
  echo.
  pause
  exit /b 1
)
for %%F in ("%ZIP%") do echo [%DATE% %TIME%] downloaded %%~zF bytes >> "%LOG%"

rem ---- 4. unpack -------------------------------------------------------------------------------
echo   Unpacking...
if exist "%STAGE%" rmdir /S /Q "%STAGE%" >nul 2>&1
mkdir "%STAGE%" >nul 2>&1
%PS% "$ErrorActionPreference='Stop'; try { Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%STAGE%' -Force; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo   Could not unpack the download.
  echo [%DATE% %TIME%] ABORT - unpack failed >> "%LOG%"
  del "%ZIP%" >nul 2>&1
  rmdir /S /Q "%STAGE%" >nul 2>&1
  echo.
  pause
  exit /b 1
)
del "%ZIP%" >nul 2>&1

rem A release archive normally wraps everything in one folder - copy from inside it, not around it.
set "SRC=%STAGE%"
if not exist "%SRC%\Stereo 3D 6DoF Manager.exe" (
  for /d %%D in ("%STAGE%\*") do (
    if exist "%%D\Stereo 3D 6DoF Manager.exe" set "SRC=%%D"
  )
)
if not exist "!SRC!\Stereo 3D 6DoF Manager.exe" (
  echo   That archive doesn't contain the application - nothing has been changed.
  echo [%DATE% %TIME%] ABORT - no app exe inside the archive >> "%LOG%"
  rmdir /S /Q "%STAGE%" >nul 2>&1
  echo.
  pause
  exit /b 1
)
echo [%DATE% %TIME%] source=!SRC! >> "%LOG%"

rem ---- 5. replace ------------------------------------------------------------------------------
echo   Installing !TAG!...
robocopy "!SRC!" "%APPDIR%" /E /IS /IT /R:3 /W:2 /XF "%SELF%" /XD "%STAGE%" "%LOGDIR%" "%APPDIR%\manual-core" >> "%LOG%" 2>&1
if errorlevel 8 (
  echo.
  echo   The copy FAILED - your existing install has not been changed.
  echo   See logs\update.log for the detail.
  echo [%DATE% %TIME%] ROBOCOPY FAILED - install untouched >> "%LOG%"
  rmdir /S /Q "%STAGE%" >nul 2>&1
  echo.
  pause
  exit /b 1
)

rmdir /S /Q "%STAGE%" >nul 2>&1
echo [%DATE% %TIME%] updated to !TAG! >> "%LOG%"

echo.
echo   Updated to !TAG!.
echo.
choice /C YN /N /M "  Start the app now? [Y/N] "
if errorlevel 2 goto :done
start "" "%APPDIR%\Stereo 3D 6DoF Manager.exe"

:done
echo [%DATE% %TIME%] done >> "%LOG%"
endlocal
exit /b 0
