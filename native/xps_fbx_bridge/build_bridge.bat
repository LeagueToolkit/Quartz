@echo off
REM Debug build for xps_fbx_bridge (writes to .\build, no Release flag).
REM Paths under the project are derived from %~dp0 so this works on any clone.
REM Build tool locations (MSVC, CMake, FBX SDK) are kept hardcoded - adjust if
REM your install differs.

setlocal
set "BRIDGE_DIR=%~dp0"
set "BUILD_DIR=%BRIDGE_DIR%build"

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" -S "%BRIDGE_DIR:~0,-1%" -B "%BUILD_DIR%" -G Ninja -DFBXSDK_ROOT="C:\Program Files\Autodesk\FBX\FBX SDK\2020.3.9"
if errorlevel 1 exit /b %errorlevel%
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" --build "%BUILD_DIR%" --config Release
exit /b %errorlevel%
