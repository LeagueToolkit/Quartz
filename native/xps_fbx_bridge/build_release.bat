@echo off
REM Builds xps_fbx_bridge.exe and copies it into native\fbx_runtime\.
REM Paths under the project are derived from %~dp0 (this .bat's directory)
REM so the script works regardless of where the repo is cloned. Build tool
REM locations (MSVC, CMake, FBX SDK) are kept hardcoded - adjust if your
REM install differs.

setlocal
set "BRIDGE_DIR=%~dp0"
set "BUILD_DIR=%BRIDGE_DIR%build_release"
set "RUNTIME_DIR=%BRIDGE_DIR%..\fbx_runtime"

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" -S "%BRIDGE_DIR:~0,-1%" -B "%BUILD_DIR%" -G Ninja -DCMAKE_BUILD_TYPE=Release -DFBXSDK_ROOT="C:\Program Files\Autodesk\FBX\FBX SDK\2020.3.9"
if errorlevel 1 exit /b %errorlevel%
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" --build "%BUILD_DIR%" --config Release
if errorlevel 1 exit /b %errorlevel%
copy /Y "%BUILD_DIR%\xps_fbx_bridge.exe" "%RUNTIME_DIR%\xps_fbx_bridge.exe"
echo Copied xps_fbx_bridge.exe to fbx_runtime
