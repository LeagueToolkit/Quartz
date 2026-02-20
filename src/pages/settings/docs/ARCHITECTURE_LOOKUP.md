# Settings Architecture Lookup

## Route
- `src/App.js` -> `src/pages/settings/index.js` -> `src/pages/settings/Settings.js`

## Current Structure
- Container page:
`src/pages/settings/Settings.js`
- Shared primitives:
`src/pages/settings/components/SettingsPrimitives.js`
- Extracted section components:
`src/pages/settings/components/sections/PageVisibilitySection.js`
`src/pages/settings/components/sections/GitHubSection.js`
`src/pages/settings/components/sections/ThemeCreatorSection.js`
`src/pages/settings/components/sections/ToolsSection.js`
`src/pages/settings/components/sections/WindowsIntegrationSection.js`
`src/pages/settings/components/sections/AppearanceSection.js`
- Extracted hooks:
`src/pages/settings/hooks/useGitHubSettings.js`
`src/pages/settings/hooks/useHashSettings.js`
`src/pages/settings/hooks/useUpdateSettings.js`
`src/pages/settings/hooks/useWindowsIntegrationSettings.js`

## Intent
- Keep `Settings.js` as orchestration/state composition.
- Move section UI blocks into `components/sections`.
- Move section-specific behavior/state into `hooks`.
- Keep imports folder-local via `src/pages/settings/index.js`.

## Next Extraction Targets
- Click/background/cursor settings -> `hooks/useEffectsSettings.js`
- Wallpaper controls -> `hooks/useWallpaperSettings.js`
- Theme/font management split -> `hooks/useAppearanceSettings.js`
