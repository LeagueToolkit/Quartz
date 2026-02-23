# Tauri Auto-Updater Setup Guide

This document explains how to set up and use Flint's automatic update system.

## Overview

Flint uses Tauri's official updater plugin to provide automatic updates. When enabled in settings, the app checks for updates on startup and shows a notification when a new version is available.

## Initial Setup (One-Time)

### 1. Generate Signing Keys

You need to generate a key pair to sign your releases. Run this command **once**:

```bash
npm exec tauri signer generate -- -w ~/.tauri/flint.key
```

This creates:
- **Private key**: `~/.tauri/flint.key` (keep this SECRET!)
- **Public key**: Printed to console (starts with `dW50cnVzdGVkIGNvbW1lbnQ6...`)

**⚠️ IMPORTANT**:
- The private key file should **NEVER** be committed to git
- Store it securely - you need it to sign all future releases
- The password you set is required every time you build a release

### 2. Add Public Key to tauri.conf.json

Copy the public key from the console output and paste it into [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json):

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/SirDexal/Flint/releases/latest/download/latest.json"
      ],
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

Replace `YOUR_PUBLIC_KEY_HERE` with the public key you generated.

### 3. Add Secrets to GitHub Repository

Go to your GitHub repository settings → Secrets and variables → Actions, and add:

**`TAURI_SIGNING_PRIVATE_KEY`**
- The **contents** of `~/.tauri/flint.key` file
- On Windows: Copy from `C:\Users\YourName\.tauri\flint.key`
- On Linux/Mac: Copy from `~/.tauri/flint.key`

**`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`**
- The password you set when generating the key

To get the private key content:
```bash
# Linux/Mac
cat ~/.tauri/flint.key

# Windows PowerShell
Get-Content $env:USERPROFILE\.tauri\flint.key
```

Copy the **entire output** (including the header/footer) into the GitHub secret.

## How It Works

### Release Process

When you push a git tag (e.g., `v0.2.2`):

1. GitHub Actions builds the app
2. Signs the `.exe` with your private key → creates `.sig` file
3. Generates `latest.json` with version info and download URLs
4. Creates a GitHub release with:
   - `Flint_0.2.2_x64-setup.exe`
   - `Flint_0.2.2_x64-setup.exe.sig`
   - `latest.json`

### Update Check Process

When Flint starts:

1. If auto-updates are **enabled** in Settings:
   - Fetches `latest.json` from GitHub releases
   - Compares versions
   - Shows update modal if newer version available

2. User clicks "Update Now":
   - Downloads the `.exe`
   - Verifies signature using public key
   - Installs and relaunches the app

## Creating a Release

### Method 1: Automated (Recommended)

```bash
# 1. Bump version (automatically updates all files)
npm run version:patch   # 0.2.1 → 0.2.2
# or
npm run version:minor   # 0.2.1 → 0.3.0
# or
npm run version:major   # 0.2.1 → 1.0.0

# 2. Create release (commit + tag)
npm run release

# 3. Push to GitHub
git push && git push --tags

# 4. GitHub Actions will automatically build and release
```

### Method 2: Manual

```bash
# 1. Update version in package.json
# Edit package.json and change "version": "0.2.2"

# 2. Sync version to all files
npm run sync-version

# 3. Commit and tag
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "Bump version to 0.2.2"
git tag v0.2.2

# 4. Push to GitHub
git push origin main
git push origin v0.2.2

# 5. GitHub Actions will automatically build and release
```

### Version Scripts

- `npm run sync-version` - Sync version from package.json to tauri.conf.json and Cargo.toml
- `npm run version:patch` - Bump patch version (0.2.1 → 0.2.2)
- `npm run version:minor` - Bump minor version (0.2.1 → 0.3.0)
- `npm run version:major` - Bump major version (0.2.1 → 1.0.0)
- `npm run release` - Create commit and tag for release

## User Settings

Users can control auto-updates via Settings modal:

- **Enable automatic updates** checkbox
  - When enabled: Checks for updates on app startup
  - When disabled: No update checks are performed

- **Skip This Version** button in update modal
  - Hides the notification for that specific version
  - Will show notifications for future versions

## Testing Updates

To test the updater locally:

1. Build a signed release:
   ```bash
   npm run tauri build
   ```
   You'll be prompted for your signing key password.

2. The signed `.exe` and `.sig` will be in:
   ```
   src-tauri/target/release/bundle/nsis/
   ```

3. To test the full update flow:
   - Create a test GitHub release with the files
   - Lower your app's version number locally
   - Run the app and trigger an update check

## Troubleshooting

### "Failed to check for updates"

Check:
- GitHub repository is public (or endpoint is accessible)
- `latest.json` exists in the release assets
- Public key in `tauri.conf.json` matches your generated key
- Internet connection is working

### "Signature verification failed"

- Public key in `tauri.conf.json` doesn't match the private key used to sign
- `.sig` file is missing or corrupted
- `.exe` was modified after signing

### Build fails with signing error

- Check `TAURI_SIGNING_PRIVATE_KEY` secret is correctly set
- Check `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is correct
- Ensure private key file is valid

## Security Notes

- The signature verification prevents tampered updates
- Updates are downloaded over HTTPS
- The private key should never be shared or committed
- Users can disable auto-updates in settings
- Old `checkForUpdates` API commands removed - using Tauri plugin only

## File Structure

```
.github/workflows/release.yml      # GitHub Actions workflow
src-tauri/tauri.conf.json          # Updater configuration
src/lib/updater.ts                 # Frontend updater API
src/components/modals/UpdateModal.tsx  # Update UI
src/components/App.tsx             # Update check on startup
```
