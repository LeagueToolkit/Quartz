# Port2 Architecture Lookup

## Purpose
`port2` is the dual-pane VFX porting tool:
- Target pane: file being edited.
- Donor pane: source file for emitters/systems.
- Advanced tools: idle particles, child particles, persistent effects, matrix edit, texture preview, undo, backup/restore.

Route:
- `src/App.js` -> `/port2` -> `src/pages/port2/Port2.js`

## Quick Lookup Table
| Concern | Primary File | Notes |
|---|---|---|
| Page composition | `src/pages/port2/Port2.js` | Renders layout, modals, list panels, binds handlers from hook. |
| Orchestrator hook | `src/pages/port2/hooks/usePort.js` | Main state composition and cross-feature wiring. |
| File load/save | `src/pages/port2/hooks/useVfxFile.js` | Open target/donor, parse, save, ritobin flow integration. |
| Mutations | `src/pages/port2/hooks/useVfxMutations.js` | Port/rename/delete/move emitters/systems, copy assets. |
| Undo history | `src/pages/port2/hooks/useVfxHistory.js` | Undo stack API. |
| Idle particles | `src/pages/port2/hooks/useIdleParticles.js` | Idle add/edit flow state + apply handler. |
| Child particles | `src/pages/port2/hooks/useChildParticles.js` | Child add/edit flow state + apply handler. |
| Persistent effects | `src/pages/port2/hooks/usePersistentEffects.js` | Persistent condition state + apply logic. |
| System list UI | `src/pages/port2/components/ParticleSystemList/` | `ParticleSystemList`, `ParticleSystemItem`, `EmitterItem`. |
| System action menu | `src/pages/port2/components/SystemActionsButton.js` | Add idle/child/matrix + delete-all actions. |
| Modal UIs | `src/pages/port2/components/*.js` | Persistent, idle, child, child edit, matrix modal wrappers. |
| Helper utils | `src/pages/port2/utils/*.js` | Name trimming, py content transforms, texture/color extraction. |
| Shared VFX parsers | `src/utils/vfx/*.js` | System/emitter parse + insert/extract helpers. |
| Shared VFX mutations | `src/utils/vfx/mutations/*.js` | Matrix/idle/child/persistent text mutation utilities. |
| Shared IO/assets | `src/utils/io/*.js`, `src/utils/assets/*.js` | File conversion/backup and texture/asset tooling. |

## Core State Ownership
Single source of page state is `usePort`.

Important state groups:
- File/session: `targetPath`, `donorPath`, `targetPyContent`, `donorPyContent`, `fileSaved`.
- Parsed systems: `targetSystems`, `donorSystems`.
- Selection/UI: `selectedTargetSystem`, collapsed sets, filters, drag state.
- Feature flags: `hasResourceResolver`, `hasSkinCharacterData`.
- Modal state: idle/child/persistent/matrix/backup/unsaved dialogs.

## End-to-End Flows
### Open Target Bin
1. `Port2.js` calls `handleOpenTargetBin`.
2. `useVfxFile.processTargetBin` converts/loads `.py` and parses systems.
3. State updates in `usePort` drive UI.

### Port Emitter
1. Trigger from donor emitter row.
2. `useVfxMutations.handlePortEmitter` loads full emitter data, updates target systems and py content.
3. Optional asset copy if paths resolve.
4. Marks unsaved state.

### Delete All Emitters
1. Trigger from `SystemActionsButton`.
2. `useVfxMutations.handleDeleteAllEmitters` updates `targetSystems`, `deletedEmitters`, syncs py content, marks unsaved.
3. Undo stack already captured before mutation.

### Texture Preview
1. Hover/click events on emitter preview button in `EmitterItem`.
2. Handlers from `usePort` resolve texture paths and run conversion.
3. Shared floating preview popup is rendered in DOM.

## Edit Playbook
### Add a new system-level action
1. Add action UI in `SystemActionsButton.js`.
2. Implement handler in `useVfxMutations.js` (or appropriate feature hook).
3. Thread props through `usePort` return and `Port2.js` usage.

### Add a new modal
1. Create component in `src/pages/port2/components/`.
2. Add state + handlers in relevant hook.
3. Render modal in `Port2.js` and pass hook state/handlers.

### Add parser-dependent feature
1. Put raw parsing/generation in `src/utils/vfx/*` or `src/pages/port2/utils/*`.
2. Keep hooks focused on state orchestration.
3. Avoid direct in-component parsing where possible.

## Guardrails
- Keep mutations immutable at system/emitter collection level.
- Keep `targetPyContent` and `targetSystems` synchronized after structural changes.
- Maintain case-insensitive matching for VFX parser-sensitive operations.
- Avoid reintroducing heavy inline logic into `Port2.js`; extend hooks/components instead.
