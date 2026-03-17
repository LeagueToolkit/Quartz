@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" -S "C:\Users\Frog\Desktop\Projects coding\Quartz-main\native\xps_fbx_bridge" -B "C:\Users\Frog\Desktop\Projects coding\Quartz-main\native\xps_fbx_bridge\build" -G Ninja -DFBXSDK_ROOT="C:\Program Files\Autodesk\FBX\FBX SDK\2020.3.9"
if errorlevel 1 exit /b %errorlevel%
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" --build "C:\Users\Frog\Desktop\Projects coding\Quartz-main\native\xps_fbx_bridge\build" --config Release
exit /b %errorlevel%
