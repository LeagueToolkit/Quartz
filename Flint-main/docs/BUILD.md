# Building Flint

This document provides comprehensive instructions for building Flint from source.

## Prerequisites

### Required Software
- **Node.js**: Version 20 or higher ([Download](https://nodejs.org/))
- **Rust**: Version 1.75 or higher ([Download](https://rustup.rs/))
- **Windows**: Windows 10 or higher (for NSIS installer)

### Verify Installation
```bash
node --version  # Should show v20.x.x or higher
npm --version   # Should show 10.x.x or higher
rustc --version # Should show 1.75.x or higher
cargo --version # Should show 1.75.x or higher
```

---

## Development Build

### Quick Start
```bash
# 1. Install Node.js dependencies
npm install

# 2. Start development mode (hot reload enabled)
npm run tauri dev
```

The application will launch with the Vite dev server running on `http://localhost:1420`.

### Development Mode Features
- **Hot Module Replacement (HMR)**: Frontend changes apply instantly without restart
- **Debug Logging**: Full tracing output to console
- **Source Maps**: Enabled for debugging
- **Fast Compilation**: Debug build profile optimized for quick iteration

---

## Production Build

### Full Production Build
```bash
# 1. Install dependencies (if not already installed)
npm install

# 2. Build frontend
npm run build

# 3. Build Tauri application with installer
npm run tauri build
```

### Build Output
The installer will be generated at:
```
src-tauri/target/release/bundle/nsis/Flint_0.1.0_x64-setup.exe
```

### Build Artifacts
- **Installer**: `*.exe` (NSIS installer for Windows)
- **Binary**: `src-tauri/target/release/flint.exe` (standalone executable)
- **Frontend**: `dist/` (bundled React application)

---

## Build Configuration

### Frontend Build (Vite)
Configuration file: `vite.config.ts`

- **Target**: ES2021, Chrome 100+, Safari 13+
- **Minification**: esbuild (production), none (debug)
- **Source Maps**: Enabled in debug mode only
- **Port**: 1420 (development server)

### Backend Build (Rust)
Configuration file: `src-tauri/Cargo.toml`

#### Development Profile
```toml
[profile.dev]
opt-level = 0              # No optimization for fast compilation
codegen-units = 256        # Maximum parallelism
incremental = true         # Incremental compilation
```

#### Release Profile
```toml
[profile.release]
opt-level = 3              # Maximum optimization
lto = "fat"                # Link-Time Optimization
codegen-units = 1          # Single codegen unit for better optimization
strip = true               # Strip debug symbols
panic = "abort"            # Abort on panic (smaller binary)
```

#### Release-Dev Profile (Fast Testing)
```toml
[profile.release-dev]
inherits = "release"
opt-level = 2              # Good optimization, faster compilation
lto = "off"                # No LTO for faster builds
incremental = true         # Incremental compilation
```

To use release-dev profile:
```bash
cargo build --profile release-dev
```

---

## Troubleshooting

### Common Issues

#### 1. Rust Compilation Errors
**Problem**: `error: failed to compile`

**Solution**:
```bash
# Clean build artifacts
cd src-tauri
cargo clean

# Rebuild
cargo build --release
```

#### 2. Node Module Issues
**Problem**: `Module not found` errors

**Solution**:
```bash
# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### 3. Port Already in Use
**Problem**: `Port 1420 is already in use`

**Solution**:
- Kill the process using port 1420
- Or change the port in `vite.config.ts`

#### 4. Missing Dependencies
**Problem**: `linker 'link.exe' not found` (Windows)

**Solution**:
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)
- Select "Desktop development with C++"

---

## CI/CD Integration

### GitHub Actions
Automated builds are configured in `.github/workflows/`:

- **build.yml**: Runs on every push to `main`/`develop` and on pull requests to `main`. On pushes to `main`, it automatically creates a GitHub Release with the installer attached.
- **release.yml**: Runs on version tags (`v*`) as a manual release path.

### Automatic Release (Recommended)

Simply push to `main` and a release is created automatically:

```bash
# 1. Update version in src-tauri/tauri.conf.json and package.json
# 2. Commit changes
git add -A && git commit -m "Release v0.2.0"

# 3. Push to main - release is created automatically
git push origin main
```

GitHub Actions will automatically:
1. Lint the Rust backend
2. Build the full application and NSIS installer
3. Upload the installer as a build artifact
4. Create a GitHub Release tagged with the version from `tauri.conf.json`
5. Attach the installer `.exe` to the release

### Manual Tag Release (Alternative)

You can also trigger a release by pushing a version tag:

```bash
git tag v0.2.0
git push --tags
```

This triggers the `release.yml` workflow which builds and creates a release for that tag.

---

## Release Process

### 1. Version Bump
Update version in both:
- `package.json` (line 3)
- `src-tauri/tauri.conf.json` (line 17)

### 2. Build and Test Locally (Optional)
```bash
# Clean build
npm run build
npm run tauri build

# Test installer
# - Install on clean system
# - Verify all features work
# - Check About dialog shows correct version
```

### 3. Push to Main
```bash
# Commit version changes
git add -A && git commit -m "Release v0.2.0"

# Push to main - GitHub Actions creates the release automatically
git push origin main
```

### 4. Verify Release
- Check GitHub Actions workflow completes successfully
- Verify release appears on GitHub Releases page
- Download and test the installer from the release

---

## Advanced Build Options

### Custom Build Flags

#### Frontend-Only Build
```bash
npm run build
```

#### Backend-Only Build
```bash
cd src-tauri
cargo build --release
```

#### Specific Target
```bash
cargo build --release --target x86_64-pc-windows-msvc
```

### Build Caching

#### Local Development
Rust build cache is stored in `src-tauri/target/`.

To clear cache:
```bash
cd src-tauri
cargo clean
```

#### CI/CD
GitHub Actions uses:
- `actions/setup-node@v4` with built-in npm caching
- `Swatinem/rust-cache@v2` for Cargo

Cache is automatically managed and restored between builds.

---

## Build Performance Tips

### Speed Up Compilation

#### 1. Use sccache (Shared Compilation Cache)
```bash
# Install sccache
cargo install sccache

# Configure Rust to use it
export RUSTC_WRAPPER=sccache  # Unix
$env:RUSTC_WRAPPER="sccache"  # PowerShell

# Build with caching
cargo build --release
```

#### 2. Parallel Frontend Build
```bash
# Use all CPU cores for TypeScript compilation
npm run build -- --max-old-space-size=4096
```

#### 3. Incremental Builds
Incremental compilation is enabled by default in development.

For release builds with incremental:
```bash
cargo build --profile release-dev
```

### Typical Build Times
- **Development**: First build ~5-8 minutes, incremental ~30 seconds
- **Production**: Full release build ~6-10 minutes
- **CI/CD**: With caching ~8-12 minutes

---

## Build Artifacts Size

### Unoptimized (Debug)
- Binary: ~150 MB
- Installer: Not generated

### Optimized (Release)
- Binary: ~8-12 MB (with stripping)
- Installer: ~10-15 MB (NSIS compressed)
- Frontend bundle: ~1.2 MB (before optimization)

---

## Platform-Specific Notes

### Windows
- **Installer**: NSIS (Nullsoft Scriptable Install System)
- **Code Signing**: Optional (requires certificate)
- **Admin Rights**: Required for installation to Program Files

### Future Platforms
- **macOS**: DMG installer (planned)
- **Linux**: AppImage / deb / rpm (planned)

---

## Getting Help

- **Build Issues**: Check [Troubleshooting](#troubleshooting) section
- **Tauri Docs**: https://tauri.app/v2/guides/
- **Vite Docs**: https://vitejs.dev/guide/
- **Rust Docs**: https://doc.rust-lang.org/cargo/

---

## Summary

### Quick Reference Commands
```bash
# Development
npm install              # Install dependencies
npm run tauri dev        # Start dev mode

# Production
npm run build            # Build frontend
npm run tauri build      # Build full application

# Maintenance
cargo clean              # Clean Rust build cache
rm -rf node_modules      # Clean Node modules
```

### Build Output Location
```
src-tauri/target/release/bundle/nsis/Flint_0.1.0_x64-setup.exe
```
