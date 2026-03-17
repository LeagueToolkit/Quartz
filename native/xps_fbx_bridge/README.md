# xps_fbx_bridge

Small native bridge executable used by `quartz_cli xps2fbx`.

## Status

Phase 1 scaffold only:
- CLI wiring exists.
- FBX SDK linkage is optional via `FBXSDK_ROOT`.
- Real XPS -> FBX scene conversion is not implemented yet.

## Build (Windows)

```powershell
cmake -S native/xps_fbx_bridge -B native/xps_fbx_bridge/build
cmake --build native/xps_fbx_bridge/build --config Release
```

With FBX SDK:

```powershell
cmake -S native/xps_fbx_bridge -B native/xps_fbx_bridge/build `
  -DFBXSDK_ROOT="C:/Program Files/Autodesk/FBX/FBX SDK/2020.3.7"
cmake --build native/xps_fbx_bridge/build --config Release
```

## CLI Usage

`quartz_cli` tries to locate the bridge in this order:

1. `QUARTZ_XPS_FBX_BRIDGE_PATH` env var
2. same directory as `quartz_cli.exe` (`xps_fbx_bridge.exe`)
3. dev build locations:
   - `native/xps_fbx_bridge/build/Release/xps_fbx_bridge.exe`
   - `native/xps_fbx_bridge/build/Debug/xps_fbx_bridge.exe`

Command:

```powershell
quartz_cli xps2fbx "model.xps" "model.fbx"
```
