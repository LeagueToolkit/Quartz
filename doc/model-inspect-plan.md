# Global Model Inspect Plan

## Goal
Build a reusable SKN/SKL/ANM model inspection system that can be launched from FrogChanger now and reused by other pages later.

## Scope
- Add a global backend pipeline to discover and selectively extract model assets from WAD.
- Add a global UI modal for model inspection (Three.js viewer + materials + animations).
- Integrate launch entry from FrogChanger (`Inspect Model` button).
- Keep extraction/repath features unchanged.

## Architecture Decisions
- Keep logic global, not page-local.
- Use selective extraction (model subset only), not full WAD unpack.
- Cache extracted inspect assets in app cache directory.
- Start with SKN/SKL render path, then ANM playback.

## Folder Structure

### Main Process
- `src/main/ipc/channels/modelInspect.js`
- `src/main/services/modelInspect/resolveSkinPaths.js`
- `src/main/services/modelInspect/scanSkinAssets.js`
- `src/main/services/modelInspect/extractModelSubset.js`
- `src/main/services/modelInspect/cacheManager.js`

### Shared Renderer
- `src/services/modelInspectService.js`
- `src/hooks/useModelInspect.js`
- `src/components/model-inspect/ModelInspectModal.js`
- `src/components/model-inspect/ModelViewport.js`
- `src/components/model-inspect/MaterialPanel.js`
- `src/components/model-inspect/AnimationPanel.js`

### FrogChanger Adapter
- Update `src/pages/frogchanger/components/SelectionSummaryBar.js` to add `Inspect Model` button.
- Update `src/pages/frogchanger/FrogChanger.js` to open global modal with selected skin context.

## API Contract (IPC)
- `modelInspect:prepareSkinAssets`
  - Input: `{ championName, skinId, skinName, leaguePath, hashPath? }`
  - Output: `{ cacheDir, sknFiles, sklFiles, anmFiles, textures, skinKey }`
- `modelInspect:clearCache`
  - Input: optional `{ championName?, skinKey? }`
  - Output: `{ removedCount }`

## Skin Path Rules
- `skinId === 0` => `assets/characters/<champion>/skins/base/**`
- `skinId > 0` => `assets/characters/<champion>/skins/skinXX/**` (2-digit)
- Include animation folder under selected skin path.

## Extraction Strategy
1. Read WAD chunk list.
2. Resolve chunk paths.
3. Filter to selected skin subtree.
4. Extract only required files:
   - `.skn`, `.skl`, `.anm`
   - linked textures needed by model materials
5. Write to inspect cache dir.
6. Return manifest (`meta.json`).

## UI/UX Plan
1. Add `Inspect Model` button next to `Extract WAD` and `Repath`.
2. Open `ModelInspectModal` with loading state.
3. Show model list if multiple `.skn` files found.
4. Provide controls:
   - Orbit camera, reset view, wireframe toggle
   - Material visibility toggles
   - Animation dropdown + play/pause + timeline (phase 2)
5. Non-blocking error panel with actionable messages.

## Implementation Phases

### Phase 1 (MVP)
- Global IPC + selective extraction + cache.
- Global modal with SKN/SKL render.
- FrogChanger button integration.
- No ANM playback yet (animation list can be shown if discovered).

### Phase 2
- ANM loading + pose evaluation + playback controls.
- Better texture mapping fallback logic.
- Skeleton visualization toggle.

### Phase 3
- Reuse entry points in VFXHub/BinEditor.
- Shared context menu action: `Inspect Model`.

## Validation Checklist
- Skin 0 and SkinXX paths resolve correctly.
- No full-WAD extraction done for inspect path.
- Cache reused on repeated open for same champion+skin.
- Existing FrogChanger extract/repath behavior unchanged.
- Large models open without freezing UI.

## Risks and Mitigations
- Missing textures/material mapping:
  - Fallback to flat material and show missing texture info.
- Multiple SKN variants per skin:
  - Let user choose mesh in modal selector.
- Performance spikes:
  - Defer heavy parse/load to background steps and show progress.

## Out of Scope (for MVP)
- Mesh editing.
- Export modified meshes.
- Full Flint feature parity on day 1.
