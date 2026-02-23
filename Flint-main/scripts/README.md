# Release Scripts

Automated scripts for managing versions and creating releases.

## Quick Start

```bash
# Bump version and create a release
npm run version:patch
npm run release
git push && git push --tags
```

## Available Scripts

### Version Management

- **`npm run sync-version`**
  - Syncs version from `package.json` to `tauri.conf.json` and `Cargo.toml`
  - Use this if you manually edit `package.json`

- **`npm run version:patch`**
  - Bumps patch version: `0.2.1` → `0.2.2`
  - Updates all version files automatically

- **`npm run version:minor`**
  - Bumps minor version: `0.2.1` → `0.3.0`
  - Updates all version files automatically

- **`npm run version:major`**
  - Bumps major version: `0.2.1` → `1.0.0`
  - Updates all version files automatically

### Release Management

- **`npm run release`**
  - Creates a git commit with message "Bump version to X.Y.Z"
  - Creates a git tag `vX.Y.Z`
  - Does NOT push (allows you to review first)

## Workflow

### Standard Release

```bash
# 1. Bump version
npm run version:patch

# 2. Review changes
git diff

# 3. Create release commit and tag
npm run release

# 4. Review commit and tag
git log -1
git show vX.Y.Z

# 5. Push to trigger GitHub Actions
git push
git push --tags
```

### Quick Release

```bash
npm run version:patch && npm run release && git push && git push --tags
```

### Manual Version Update

```bash
# 1. Edit package.json version manually
nano package.json

# 2. Sync to other files
npm run sync-version

# 3. Commit and tag manually
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "Bump version to X.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

## Version Files

The scripts keep these files in sync:
- `package.json` - Source of truth
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

## How It Works

1. **Version bump scripts** (`version:*`) use npm's built-in `npm version` command to update `package.json`, then run `sync-version` to propagate changes

2. **Sync script** (`sync-version.js`) reads version from `package.json` and updates:
   - `tauri.conf.json` → `"version": "X.Y.Z"`
   - `Cargo.toml` → `version = "X.Y.Z"`

3. **Release script** (`release.js`):
   - Checks for uncommitted changes (warns but allows override)
   - Stages version files
   - Creates commit with standard message
   - Creates git tag
   - Shows next steps

## GitHub Actions

When you push a tag matching `v*`:
1. GitHub Actions workflow triggers
2. Builds signed release for Windows
3. Generates `.sig` signature file
4. Creates `latest.json` for updater
5. Publishes GitHub release with all files
6. Flint users get notified of the update

## Troubleshooting

**"passwords don't match" when generating keys**
- When running `npm exec tauri signer generate`, type your password carefully
- Password is hidden, so type slowly and press Enter once per prompt

**Version mismatch after manual edit**
- Run `npm run sync-version` to sync everything

**Git tag already exists**
- Delete old tag: `git tag -d vX.Y.Z`
- Delete remote tag: `git push origin :refs/tags/vX.Y.Z`
- Create new tag: `npm run release`
