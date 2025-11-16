# Port.js Performance Optimization Plan

## Current Problems

### 1. Entire lists re-render on any change
- `memoizedTargetSystems` and `memoizedDonorSystems` depend on too many values
- Any state change triggers full list re-render
- All system cards re-render even if their data hasn't changed

### 2. Systems stored as objects, not arrays
- `targetSystems` and `donorSystems` are objects with keys
- Harder to optimize with React's reconciliation
- Object.values() creates new array references on every render

### 3. No item-level memoization
- Each system card is created inline in map function
- No React.memo wrapper for individual cards
- Event handlers created fresh on every render

### 4. Filter state causes full re-renders
- Every keystroke in search triggers full list render
- Filter logic runs on every render
- Creates new filtered array references constantly

### 5. Heavy inline computations
- Color parsing, name trimming, feature checks all inline
- Repeated calculations for same data
- No caching of computed values

## Optimization Solutions

### 1. Extract SystemCard as Memoized Component
```javascript
const SystemCard = React.memo(({ 
  system, 
  isTarget,
  isSelected,
  isPressed,
  isDragging,
  // ... other props
}) => {
  // Render logic here
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these change
  return (
    prevProps.system === nextProps.system &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isPressed === nextProps.isPressed &&
    prevProps.isDragging === nextProps.isDragging
    // ... other comparisons
  );
});
```

### 2. Use useCallback for Event Handlers
```javascript
const handleSystemClick = useCallback((systemKey) => {
  setSelectedTargetSystem(prev => prev === systemKey ? null : systemKey);
}, []);

const handleDeleteEmitter = useCallback((systemKey, emitterIndex, isTarget, emitterName) => {
  // ... logic
}, [/* minimal dependencies */]);
```

### 3. Optimize Data Structure
```javascript
// Store systems as array with stable references
const [targetSystemsArray, setTargetSystemsArray] = useState([]);

// Use Map for O(1) lookups when needed
const targetSystemsMap = useMemo(() => 
  new Map(targetSystemsArray.map(s => [s.key, s])),
  [targetSystemsArray]
);
```

### 4. Debounced Filter with Separate State
```javascript
// Local input state (no re-renders)
const [filterInput, setFilterInput] = useState('');

// Debounced filter state (triggers re-render)
const debouncedFilter = useDebounce(filterInput, 300);

// Filter only when debounced value changes
const filteredSystems = useMemo(() => 
  filterSystems(targetSystemsArray, debouncedFilter),
  [targetSystemsArray, debouncedFilter]
);
```

### 5. Virtual Scrolling for Large Lists
```javascript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={filteredSystems.length}
  itemSize={100}
  itemData={filteredSystems}
>
  {SystemCardRow}
</FixedSizeList>
```

### 6. Separate Emitter Component
```javascript
const EmitterCard = React.memo(({ 
  emitter, 
  systemKey,
  index,
  isTarget,
  // ... props
}) => {
  // Render logic
});
```

### 7. Computed Values Cache
```javascript
// Cache expensive computations
const systemMetadata = useMemo(() => 
  targetSystemsArray.map(system => ({
    key: system.key,
    displayName: getDisplayName(system),
    hasIdleParticles: hasIdleParticleEffect(targetPyContent, system.key),
    hasChildParticles: hasChildParticleEffect(targetPyContent, system.key),
    hasMatrix: parseSystemMatrix(system.rawContent)?.matrix
  })),
  [targetSystemsArray, targetPyContent]
);
```

## Implementation Strategy

### Phase 1: Component Extraction
1. Create `SystemCard` component with React.memo
2. Create `EmitterCard` component with React.memo
3. Extract event handlers to useCallback

### Phase 2: Data Structure Optimization
1. Convert systems object to array
2. Add stable IDs/keys
3. Implement efficient lookups with Map

### Phase 3: Render Optimization
1. Implement virtual scrolling
2. Add computed value caching
3. Optimize filter logic

### Phase 4: State Management
1. Minimize re-renders with proper dependencies
2. Use refs for non-visual state
3. Batch state updates

## Expected Performance Gains

- **Delete operations**: Instant (already optimized with deferred updates)
- **Rename operations**: Instant (no reparse)
- **Filtering**: Smooth typing with no lag
- **Scrolling**: 60fps with virtual scrolling
- **System selection**: Instant feedback
- **Overall re-renders**: 90% reduction

## Migration Path

1. Create PortNew.js with optimized architecture
2. Test thoroughly with large files (100+ systems)
3. Compare performance metrics
4. Gradually migrate features
5. Replace Port.js when stable
