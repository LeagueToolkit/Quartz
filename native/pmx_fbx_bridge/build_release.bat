@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" -S "C:\Users\Frog\Desktop\Projects coding\Quartz-main\native\pmx_fbx_bridge" -B "C:\Users\Frog\Desktop\Projects coding\Quartz-main\native\pmx_fbx_bridge\build_release" -G Ninja -DCMAKE_BUILD_TYPE=Release -DFBXSDK_ROOT="C:\Program Files\Autodesk\FBX\FBX SDK\2020.3.9"
if errorlevel 1 exit /b %errorlevel%
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" --build "C:\Users\Frog\Desktop\Projects coding\Quartz-main\native\pmx_fbx_bridge\build_release" --config Release
if errorlevel 1 exit /b %errorlevel%
copy /Y "C:\Users\Frog\Desktop\Projects coding\Quartz-main\native\pmx_fbx_bridge\build_release\pmx_fbx_bridge.exe" "C:\Users\Frog\Desktop\Projects coding\Quartz-main\native\fbx_runtime\pmx_fbx_bridge.exe"
echo Copied pmx_fbx_bridge.exe to fbx_runtime
