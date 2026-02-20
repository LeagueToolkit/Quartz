# Flint Theme System

Flint uses CSS custom properties (variables) for theming. You can create custom themes by overriding these variables.

## Creating a Custom Theme

1. Create a new CSS file (e.g., `my-theme.css`)
2. Override the accent color variables:

```css
:root {
  /* Primary accent color - buttons, highlights */
  --accent-primary: #3B82F6;    /* Your main color */
  --accent-hover: #2563EB;      /* Slightly darker for hover states */
  --accent-secondary: #60A5FA;  /* Lighter variant for links, focus */
  --accent-muted: #1E40AF;      /* Darkest variant for subtle elements */
}
```

3. Import your theme after the main styles in `main.tsx`:

```typescript
import './styles/index.css';
import './themes/my-theme.css';  // Your custom theme
```

## Color Variables Reference

| Variable | Usage |
|----------|-------|
| `--accent-primary` | Primary buttons, active states |
| `--accent-hover` | Hover states for primary elements |
| `--accent-secondary` | Links, focus rings, highlights |
| `--accent-muted` | Subtle accents, muted backgrounds |

## Example Themes

### Blue Theme
```css
:root {
  --accent-primary: #3B82F6;
  --accent-hover: #2563EB;
  --accent-secondary: #60A5FA;
  --accent-muted: #1E40AF;
}
```

### Purple Theme
```css
:root {
  --accent-primary: #8B5CF6;
  --accent-hover: #7C3AED;
  --accent-secondary: #A78BFA;
  --accent-muted: #5B21B6;
}
```

### Green Theme
```css
:root {
  --accent-primary: #10B981;
  --accent-hover: #059669;
  --accent-secondary: #34D399;
  --accent-muted: #065F46;
}
```
