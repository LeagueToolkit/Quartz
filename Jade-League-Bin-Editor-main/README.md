# Jade

[![Rust](https://img.shields.io/badge/Rust-1.70+-orange?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.0-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8?style=for-the-badge&logo=tauri)](https://tauri.app/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE.md)

A fast, modern bin file editor for League of Legends modding. Built with Rust and Tauri for native performance.

## Features

- Native Ritobin parser written in Rust
- Monaco editor with custom syntax highlighting
- Hash file management with auto-download from CommunityDragon
- Theme customization with built-in and custom themes
- Linked bin file importing
- Tab-based editing with multiple files
- Window state and preferences persistence
- Auto-updater with signed releases (no manual downloads needed)
- Launch on Windows startup toggle
- Minimize to system tray on close
- `.bin` file association (double-click to open in Jade)
- Single-instance: re-launching focuses the existing window

## Requirements

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (stable)
- [pnpm](https://pnpm.io/) or npm

## Installation

```bash
# Clone the repository
git clone https://github.com/LeagueToolkit/Jade-League-Bin-Editor.git
cd Jade-League-Bin-Editor

# Switch to the jade-rust branch
git checkout jade-rust

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
├── .github/workflows/      # CI/CD - release.yml triggers on v* tags
├── src/                    # React frontend
│   ├── components/         # UI components (UpdaterDialog, SettingsDialog, …)
│   └── lib/                # Utilities and parsers
├── src-tauri/              # Rust backend
│   └── src/
│       ├── core/           # Bin parser, hash table
│       ├── bin_commands.rs # File operations
│       ├── hash_commands.rs# Hash management
│       ├── app_commands.rs # App preferences & window state
│       └── extra_commands.rs # Autostart, .bin association, updater
```

## Keyboard Shortcuts

### File
- **Ctrl+O** - Open file (when on welcome screen) / Toggle General Editing panel (when file is open)
- **Ctrl+S** - Save file
- **Ctrl+Shift+S** - Save As...

### Edit
- **Ctrl+Z** - Undo
- **Ctrl+Y** - Redo
- **Ctrl+X** - Cut
- **Ctrl+C** - Copy
- **Ctrl+V** - Paste
- **Ctrl+A** - Select All
- **Ctrl+F** - Find
- **Ctrl+H** - Replace
- **Ctrl+D** - Compare Files

### Tools
- **Ctrl+P** - Toggle Particle Editing panel (bin files only)
- **Ctrl+Shift+P** - Toggle Particle Editor dialog (bin files only)

### Navigation
- **Ctrl+W** - Close current tab
- **Ctrl+Tab** - Switch to next tab
- **Ctrl+Shift+Tab** - Switch to previous tab
- **Escape** - Close all panels/dialogs

## Configuration

Hash files are stored in `%APPDATA%\LeagueToolkit\Requirements\Hashes` and can be downloaded automatically through the Settings dialog.

## Releasing

The GitHub Actions workflow at `.github/workflows/release.yml` builds and publishes a signed installer whenever you push a version tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

This will:
1. Build the Tauri app on `windows-latest`
2. Sign the installer with your private key
3. Generate `latest.json` for the auto-updater endpoint
4. Create a GitHub Release with the installer, `.sig`, and `latest.json` attached

### Required GitHub Secrets

Set these once in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Base64-encoded private key from `tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the private key (empty string if none) |

The `tauri.conf.json` `updater.pubkey` field must contain the matching **public** key so the app can verify downloaded updates.

## License

See [LICENSE.md](LICENSE.md) for details.
