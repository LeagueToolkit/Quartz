# PortNew.js Implementation Guide

## Overview
This guide shows how to create an optimized version of Port.js with the same UI but significantly better performance.

## Key Architecture Changes

### 1. Component Structure
```
PortNew (Main Component)
├── SystemCard (Memoized)
│   ├── SystemHeader
│   └── EmitterCard[] (Memoized)
├── SearchInput (Memoized)
└── RenameInput (Memoized)
```

### 2. Data Structure Changes

**Before (Port.js):**
```javascript
const [targetSystems, setTargetSystems] = useState({});
// Systems as object: { "systemKey1": {...}, "systemKey2": {...} }
```

**After (PortNew.js):**
```javascript
const [targetSystemsArray, setTargetSystemsArray] = useState([]);
// Systems as array: [{key: "systemKey1", ...}, {key: "systemKey2", ...}]

// Create Map for O(1) lookups when needed
const targetSystemsMap = useMemo(() => 
  new Map(targetSystemsArray.map(s => [s.key, s])),
  [targetSystemsArray]
);
```

### 3. Event Handler Optimization

**Before:**
```javascript
// Created fresh on every render
onClick={() => handleDeleteEmitter(system.key, index, true, emitter.name)}
```

**After:**
```javascript
// Stable reference with useCallback
const handleDeleteEmitter = useCallback((systemKey, emitterIndex, isTarget, emitterName) => {
  // ... implementation
}, []); // Minimal dependencies

// Pass to child component
<EmitterCard onDeleteEmitter={handleDeleteEmitter} />
```

### 4. Filter Optimization

**Before:**
```javascript
const [targetFilter, setTargetFilter] = useState('');
// Every keystroke triggers re-render

const filteredSystems = useMemo(() => {
  // Runs on every targetSystems change
}, [targetSystems, targetFilter]);
```

**After:**
```javascript
// Separate input state (no re-renders)
const [filterInput, setFilterInput] = useState('');

// Debounced filter (triggers re-render after delay)
const debouncedFilter = useDebounce(filterInput, 200);

// Filter only when debounced value changes
const filteredSystems = useMemo(() => {
  if (!debouncedFilter) return targetSystemsArray;
  return targetSystemsArray.filter(system => 
    system.name.toLowerCase().includes(debouncedFilter.toLowerCase())
  );
}, [targetSystemsArray, debouncedFilter]);
```

### 5. Memoized System Card

```javascript
const SystemCard = React.memo(({
  system,
  isTarget,
  isSelected,
  isPressed,
  isDragging,
  hasIdleParticles,
  hasChildParticles,
  hasMatrix,
  // Event handlers
  onSelect,
  onDelete,
  onRename,
  // ... other props
}) => {
  // Render logic
  return (
    <div className="particle-div" onClick={() => onSelect(system.key)}>
      {/* ... */}
      {system.emitters.map((emitter, index) => (
        <EmitterCard
          key={emitter.name}
          emitter={emitter}
          systemKey={system.key}
          index={index}
          // ... props
        />
      ))}
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.system === nextProps.system &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isPressed === nextProps.isPressed &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.hasIdleParticles === nextProps.hasIdleParticles &&
    prevProps.hasChildParticles === nextProps.hasChildParticles &&
    prevProps.hasMatrix === nextProps.hasMatrix
  );
});
```

### 6. Computed Values Cache

```javascript
// Cache expensive computations
const systemMetadata = useMemo(() => {
  return targetSystemsArray.map(system => ({
    key: system.key,
    hasIdleParticles: hasIdleParticleEffect(targetPyContent, system.key),
    hasChildParticles: hasChildParticleEffect(targetPyContent, system.key),
    hasMatrix: !!parseSystemMatrix(system.rawContent)?.matrix,
    displayName: getDisplayName(system, trimTargetNames)
  }));
}, [targetSystemsArray, targetPyContent, trimTargetNames]);

// Use in render
{filteredSystems.map(system => {
  const metadata = systemMetadata.find(m => m.key === system.key);
  return (
    <SystemCard
      key={system.key}
      system={system}
      hasIdleParticles={metadata.hasIdleParticles}
      hasChildParticles={metadata.hasChildParticles}
      hasMatrix={metadata.hasMatrix}
      // ... other props
    />
  );
})}
```

### 7. Delete Emitter Optimization (Already Implemented)

```javascript
const handleDeleteEmitter = useCallback((systemKey, emitterIndex, isTarget, emitterName) => {
  // 1. IMMEDIATE UI UPDATE
  setTargetSystemsArray(prev => 
    prev.map(sys => 
      sys.key === systemKey
        ? { ...sys, emitters: sys.emitters.filter((_, idx) => idx !== emitterIndex) }
        : sys
    )
  );

  // 2. DEFERRED FILE UPDATE
  setTimeout(() => {
    // Heavy file operations here
    const newSystemRaw = removeEmitterBlockFromSystem(currentRaw, emitterName);
    // ... update file content
  }, 50);
}, []);
```

## Implementation Steps

### Step 1: Create Base Structure
1. Copy Port.js to PortNew.js
2. Add optimization comments
3. Import necessary hooks

### Step 2: Extract Components
1. Create `EmitterCard` component with React.memo
2. Create `SystemCard` component with React.memo
3. Add custom comparison functions

### Step 3: Convert Data Structures
1. Change `targetSystems` from object to array
2. Update all references to use array methods
3. Create Map for lookups where needed

### Step 4: Optimize Event Handlers
1. Wrap all handlers in useCallback
2. Minimize dependencies
3. Pass stable references to child components

### Step 5: Implement Filter Optimization
1. Add debounce utility
2. Separate input state from filter state
3. Update filter logic

### Step 6: Add Computed Value Caching
1. Create systemMetadata cache
2. Update render logic to use cached values
3. Minimize expensive computations

### Step 7: Test and Benchmark
1. Test with large files (100+ systems)
2. Measure render times
3. Compare with original Port.js

## Expected Performance Improvements

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Delete emitter | 500ms | <50ms | 10x faster |
| Rename system | 2000ms | <50ms | 40x faster |
| Filter typing | Laggy | Smooth | No lag |
| Scroll large list | Janky | 60fps | Smooth |
| System selection | 100ms | <16ms | Instant |

## Migration Strategy

1. **Phase 1**: Create PortNew.js with core optimizations
2. **Phase 2**: Test thoroughly with various file sizes
3. **Phase 3**: Add feature parity with Port.js
4. **Phase 4**: User testing and feedback
5. **Phase 5**: Replace Port.js with PortNew.js

## Code Example: Complete Optimized Structure

See `src/pages/PortNew.js` for the full implementation with:
- ✅ Memoized components
- ✅ useCallback event handlers
- ✅ Array-based data structures
- ✅ Debounced filtering
- ✅ Computed value caching
- ✅ Minimal re-renders

## Testing Checklist

- [ ] Load file with 100+ systems
- [ ] Delete multiple emitters rapidly
- [ ] Rename systems quickly
- [ ] Type in filter without lag
- [ ] Scroll smoothly through list
- [ ] Drag and drop systems
- [ ] Port emitters between systems
- [ ] Undo/redo operations
- [ ] Save and reload files

## Notes

- Keep the same CSS classes for consistent styling
- Maintain all existing features
- Focus on performance without changing UX
- Document any breaking changes
- Add performance monitoring hooks
