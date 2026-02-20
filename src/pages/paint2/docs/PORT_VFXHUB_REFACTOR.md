# Port.js + VFXHub.js — Refactor Plan

> Analysis-based plan. Both files are 7k–9k lines and share ~65% of their logic.
> This doc guides AI and humans through what to do, why, and in what order.

---

## What they do

| File | Lines | Purpose |
|------|-------|---------|
| `Port.js` | 8,777 | Dual-pane VFX porting tool. Left = target .bin, Right = donor .bin. Copy emitters/systems between them. |
| `VFXHub.js` | 7,015 | Same dual-pane, but right side is a GitHub collection browser. Can also upload systems. |

They are **the same app with different donor sources.** They share all the same state shape, parsers, mutation patterns, and feature set (idle particles, persistent effects, matrix editor, undo, asset copying, save/RitoBin).

---

## The corruption bugs — what causes them

### 1. Shallow copy + direct mutation (main cause)

Both files do this everywhere:

```js
// Port.js line 2168, VFXHub.js line 1686
const updatedSystems = { ...targetSystems };      // Shallow copy — emitters array is SHARED
updatedSystems[systemKey].emitters.splice(i, 1);  // Mutating the original array
setTargetSystems(updatedSystems);
```

`{ ...targetSystems }` only copies the top-level keys. The `emitters` array inside each system is the **same reference** as the original. Splicing it mutates the original object before React has committed the state update.

Same bug when adding:
```js
updatedTargetSystems[selectedTargetSystem].emitters.push(fullEmitterData); // mutates original
```

**Fix:** Use immutable updates:
```js
setTargetSystems(prev => ({
  ...prev,
  [systemKey]: {
    ...prev[systemKey],
    emitters: prev[systemKey].emitters.filter((_, i) => i !== index)
  }
}));
```

### 2. Naive brace counting for emitter block extraction

```js
// Port.js ~line 753
const opens = (line.match(/\{/g) || []).length;
const closes = (line.match(/\}/g) || []).length;
depth += opens - closes;
```

This counts `{` and `}` in comments, inside strings, everywhere. If a VFX property value contains a brace (e.g. a path string or comment), the block boundary is detected at the wrong line — deleting too little or too much.

**Fix:** Skip lines that are comments (`//`) or string values when counting braces.

### 3. Re-parse inconsistency

Port.js and VFXHub.js both keep a full `.py` string (`targetPyContent`) AND a parsed systems map (`targetSystems`). These can drift:

- A mutation updates `targetSystems` but not `targetPyContent`
- Or vice versa — string gets updated but systems map not re-parsed

Comment in Port.js line 1926: `// Don't re-parse systems here - it will reset the state and lose ported emitters`

This is the root cause. The system tries to avoid re-parsing to preserve ported emitters, but that means text and state go out of sync.

**Fix:** Use the **paint2 model** — the `.py` string is the source of truth, always derive state from it. Cache the parsed result, don't try to maintain two sources of truth manually.

### 4. Regex mutation without escaping

```js
updatedContent = updatedContent.replace(oldKeyPattern, (match) => { ... });
```

If a system key contains regex special characters (`.`, `(`, `[`, etc.), the regex matches incorrectly and can corrupt adjacent systems.

**Fix:** Escape all keys before using in regex: `key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`

---

## What's duplicated between Port.js and VFXHub.js

Both files import and duplicate logic for:

| Feature | Utils used |
|---------|-----------|
| Parse VFX file | `vfxEmitterParser.js` — `parseVfxEmitters`, `loadEmitterData`, `generateModifiedPythonFromSystems` |
| Extract/insert systems | `vfxSystemParser.js` — `extractVFXSystem`, `vfxInsertSystem.js` — `insertVFXSystemIntoFile` |
| Save + RitoBin conversion | `fileOperations.js` — `ToPyWithPath`, spawn RitoBin process (duplicated inline!) |
| Idle particles | `idleParticlesManager.js` (same 6 imports in both) |
| Persistent effects | `persistentEffectsManager.js` (same 6 imports in both) |
| Matrix editor | `matrixUtils.js` (same 3 imports in both) |
| Asset copying | `assetCopier.js` (same 3 imports in both) |
| Backup | `backupManager.js` (same 2 imports in both) |
| Undo history | Identical `saveStateToHistory()` logic (copy-pasted) |
| Capability detection | Identical regex for `ResourceResolver` and `SkinCharacterDataProperties` |
| Navigation guard | Identical `window.__DL_unsavedBin` / `navigation-blocked` pattern |

The only real difference: Port.js loads a second local .bin as donor. VFXHub.js loads systems from a GitHub API.

---

## Approach: Follow the paint2 pattern exactly

Port.js stays untouched. Port2.js is the rewrite, wired into App.js at `/port2`.
UI must be pixel-identical. Only logic/structure changes.

```
src/pages/port2/
├── index.js                     Barrel — re-exports Port2 as default
├── Port2.js                     Orchestrator: all state + handlers (~3000 lines target)
├── docs/
│   └── CLAUDE.md
└── components/
    ├── PersistentEffectsModal.js   Extracted from Port.js (~1300 lines of JSX)
    ├── IdleParticleModal.js        Extracted idle particle dialog (~200 lines)
    ├── ChildParticleModal.js       Extracted child particle dialog (~300 lines)
    ├── MatrixEditorModal.js        Extracted matrix editor dialog (~300 lines)
    ├── SystemList.js               Collapsible system + emitter list panel
    └── EmitterRow.js               Single emitter row with action buttons
```

## Proposed structure after refactor

```
src/
├── features/
│   └── vfx-editor/                          NEW — shared feature module
│       ├── hooks/
│       │   ├── useVfxState.js               Core state: targetSystems, pyContent, undo
│       │   ├── useVfxMutations.js           All add/delete/rename/port operations (immutable)
│       │   ├── useVfxFile.js                Load, save, RitoBin conversion
│       │   ├── useIdleParticles.js          Idle particle logic
│       │   ├── usePersistentEffects.js      Persistent effects logic
│       │   ├── useMatrixEditor.js           Matrix modal state + apply
│       │   └── useUndo.js                   Generic undo stack (20 states, with notification)
│       ├── components/
│       │   ├── SystemList.js                Collapsible system + emitter list (shared UI)
│       │   ├── EmitterRow.js                Single emitter row with action buttons
│       │   ├── SystemActionsMenu.js         Per-system dropdown menu
│       │   ├── IdleParticleModal.js         Extracted from Port/VFXHub inline JSX
│       │   ├── PersistentEffectsModal.js    Extracted (~1300 lines of modal JSX)
│       │   ├── MatrixEditorModal.js         Extracted matrix editor
│       │   └── SaveStatusBar.js             Status + save button + undo button
│       ├── utils/
│       │   └── immutableSystems.js          Pure functions: addEmitter, deleteEmitter, renameSystem (immutable)
│       ├── docs/
│       │   └── CLAUDE.md                    This doc's final form
│       └── index.js                         Barrel export
│
├── pages/
│   ├── port/
│   │   ├── Port.js                          ~500 lines — orchestrator only, uses vfx-editor hooks
│   │   ├── components/
│   │   │   └── DonorPanel.js               Local file donor browser
│   │   └── index.js
│   └── vfxhub/
│       ├── VFXHub.js                        ~500 lines — orchestrator only, uses vfx-editor hooks
│       ├── components/
│       │   ├── GithubDonorPanel.js          GitHub collection browser
│       │   ├── DownloadModal.js             Extracted GitHub download modal
│       │   └── UploadModal.js               Extracted GitHub upload modal
│       └── index.js
```

---

## Refactor steps (in order)

### Step 1 — Create `immutableSystems.js` (fix corruption now)
Pure functions that never mutate their input:
```js
export const deleteEmitter = (systems, systemKey, emitterIndex) => ({
  ...systems,
  [systemKey]: {
    ...systems[systemKey],
    emitters: systems[systemKey].emitters.filter((_, i) => i !== emitterIndex)
  }
});

export const addEmitter = (systems, systemKey, emitter) => ({
  ...systems,
  [systemKey]: {
    ...systems[systemKey],
    emitters: [...systems[systemKey].emitters, emitter]
  }
});

export const renameSystem = (systems, oldKey, newKey, rawContent) => {
  const { [oldKey]: system, ...rest } = systems;
  return { ...rest, [newKey]: { ...system, key: newKey, rawContent } };
};
```

Replace all the `splice`/`push` patterns in both files immediately. This alone fixes most corruption.

### Step 2 — Create `useUndo.js` hook (shared)
```js
export function useUndo(maxStates = 20) {
  const [history, setHistory] = useState([]);
  const push = useCallback((snapshot, label) => {
    setHistory(h => [...h.slice(-(maxStates - 1)), { snapshot, label, ts: Date.now() }]);
  }, [maxStates]);
  const pop = useCallback(() => {
    setHistory(h => h.slice(0, -1));
    return history[history.length - 1]?.snapshot;
  }, [history]);
  return { push, pop, canUndo: history.length > 0, count: history.length };
}
```

### Step 3 — Extract the 5 modal components
Each modal is ~200–1300 lines of inline JSX. Extract to individual files:
- `PersistentEffectsModal.js` (~1300 lines from Port.js)
- `IdleParticleModal.js` (~200 lines)
- `MatrixEditorModal.js` (~300 lines)
- `DownloadModal.js` in VFXHub (~600 lines)
- `UploadModal.js` in VFXHub (~400 lines)

No logic changes — just move the JSX and pass props down.

### Step 4 — Extract `useVfxFile.js` (shared file I/O)
Both files duplicate the RitoBin spawn logic. Extract to a shared hook:
```js
export function useVfxFile() {
  const loadBin = async (binPath) => { /* convert bin→py, return pyContent */ };
  const saveBin = async (pyContent, binPath) => { /* write py, spawn ritobin */ };
  return { loadBin, saveBin };
}
```

### Step 5 — Refactor Port.js and VFXHub.js to use the new pieces
After Steps 1–4, both files should shrink from 8000+ lines to ~1000–1500 lines each — just their unique donor panel UI and wiring.

---

## What NOT to touch yet
- The underlying utils (`vfxEmitterParser.js`, `persistentEffectsManager.js`, etc.) are stable and shared — don't refactor these
- `paint2/` — already good, don't break it
- `BackgroundEffects/`, `ClickEffects/`, `CursorEffects/` — separate task
- `Settings.js` — separate task

---

## Risk notes
- Port.js and VFXHub.js are the most-used features — test every operation after each step
- The RitoBin spawn is fragile (path, error handling) — don't change it, just move it
- The persistent effects logic is the most complex and most likely to break — extract last
