# Commands reference — Supervision Client

> New to Tauri? Start with the **How Tauri dev / build works** section below.

---

## How Tauri dev / build works

Tauri is **two processes stapled together**: a tiny Rust shell (the native window,
OS integrations, keychain, TLS) and a standard web frontend (React + Vite) that
runs inside the system's WebView. You write the UI like a web app and call Rust via
`invoke()` when you need native capabilities.

### `npm run tauri dev` — what actually happens

```
tauri CLI
  │
  ├─ 1. Reads src-tauri/tauri.conf.json
  │       beforeDevCommand = "npm run dev"   ← starts Vite dev server
  │       devUrl           = "http://localhost:1420"
  │
  ├─ 2. Runs `npm run dev` in the background (Vite on port 1420)
  │       JS/CSS hot-reload works exactly like a browser.
  │
  ├─ 3. Compiles the Rust crate (debug build, fast)
  │       src-tauri/src/lib.rs + tofu.rs + secure_store.rs → native binary
  │
  └─ 4. Launches the native window pointed at http://localhost:1420
         Rust changes → you must Ctrl-C and re-run (Rust isn't HMR).
         JS/CSS changes → instant hot-reload, no restart needed.
```

**Does `tauri dev` run `npm run build`?** No. It runs `npm run dev` (Vite dev
server, no bundling). The production build (`npm run build`) only happens inside
`npm run tauri build`.

### `npm run tauri build` — what actually happens

```
tauri CLI
  │
  ├─ 1. Runs `npm run build`  (tsc + vite build → dist/)
  ├─ 2. Compiles Rust in --release mode  (takes 1–3 min first time)
  ├─ 3. Copies dist/ into the bundle
  └─ 4. Produces a platform installer in src-tauri/target/release/bundle/
```

Output on each platform:

| Platform | Installer formats |
|---|---|
| macOS | `.app` (run-in-place), `.dmg` (disk image) |
| Windows | `.msi` (MSI installer), `.exe` (NSIS installer) |
| Linux | `.AppImage` (portable), `.deb` (Debian/Ubuntu), `.rpm` (Fedora/RHEL) |

---

## Prerequisites

Install these once, then all commands below work.

### All platforms
```bash
# Node.js 18+ (LTS recommended)
node --version   # must be ≥ 18

# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable

# Tauri CLI (installs into node_modules — no global install needed)
# Already in devDependencies, so `npm install` covers it.
```

### macOS — extra step
```bash
# Xcode command-line tools (needed for the linker)
xcode-select --install
```

### Linux (Debian/Ubuntu) — extra step
```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libsecret-1-dev    # required by the keyring crate (Secret Service)
```

### Linux (Fedora/RHEL)
```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel libsecret-devel librsvg2-devel
```

### Windows — extra step
```bash
# Install Microsoft Build Tools or Visual Studio (C++ workload).
# Then install WebView2 runtime (ships with Windows 11; installer at microsoft.com/edge/webview2).
```

---

## Day-to-day development

```bash
# Install JS deps (first time or after package.json changes)
npm install

# Start the full Tauri dev environment (Vite + Rust + native window)
npm run tauri dev

# TypeScript type check only (fast, no emit)
npx tsc --noEmit

# Vite production build only (no Rust — for quick bundle-size checks)
npm run build

# Rust check only (no Vite — fastest way to verify Rust compiles)
cd src-tauri && cargo check

# Generate API types from backend OpenAPI spec
# (run this whenever docs/swagger.json changes)
npm run generate-api-types
```

---

## Building installers

> **Cross-compilation is NOT supported by Tauri.** Build for macOS on macOS,
> Windows on Windows, Linux on Linux. Use a CI matrix (GitHub Actions) for
> all three — see below.

### macOS (run on a Mac)
```bash
npm run tauri build
# → src-tauri/target/release/bundle/macos/Supervision.app
# → src-tauri/target/release/bundle/dmg/supervision-client_0.1.0_aarch64.dmg
```

**Universal binary (arm64 + x86_64):**
```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

### Windows (run on Windows)
```bash
npm run tauri build
# → src-tauri\target\release\bundle\msi\supervision-client_0.1.0_x64_en-US.msi
# → src-tauri\target\release\bundle\nsis\supervision-client_0.1.0_x64-setup.exe
```

### Linux (run on Linux)
```bash
npm run tauri build
# → src-tauri/target/release/bundle/appimage/supervision-client_0.1.0_amd64.AppImage
# → src-tauri/target/release/bundle/deb/supervision-client_0.1.0_amd64.deb
# → src-tauri/target/release/bundle/rpm/supervision-client-0.1.0-1.x86_64.rpm
```

---

## GitHub Actions CI matrix (build all three platforms)

Create `.github/workflows/build.yml`:

```yaml
name: Build

on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - platform: macos-latest
            args: '--target universal-apple-darwin'
          - platform: windows-latest
            args: ''
          - platform: ubuntu-22.04
            args: ''

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Install Linux deps
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt update && sudo apt install -y \
            libwebkit2gtk-4.1-dev libssl-dev \
            libayatana-appindicator3-dev librsvg2-dev libsecret-1-dev

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Set up Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - name: Install JS deps
        run: npm install

      - name: Build
        uses: tauri-apps/tauri-action@v0
        with:
          args: ${{ matrix.args }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: supervision-${{ matrix.platform }}
          path: src-tauri/target/release/bundle/
```

---

## Faster Rust iteration

```bash
# Check types without linking (fastest feedback loop)
cd src-tauri && cargo check

# Run clippy (lint)
cd src-tauri && cargo clippy

# Force a clean Rust rebuild (rarely needed — usually after Cargo.toml changes)
cd src-tauri && cargo clean
npm run tauri dev
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run tauri dev` hangs at "Compiling" | Normal on first run — downloading crates takes 2–5 min. Wait it out. |
| White window, nothing loads | Vite dev server didn't start. Check port 1420 isn't in use: `lsof -i :1420` |
| `webkit2gtk` not found (Linux) | Run the `apt install` block from the Prerequisites section above |
| Rust compile error after pulling | `cd src-tauri && cargo update` then retry |
| `keyring` error on headless Linux | The Secret Service daemon isn't running. Install `gnome-keyring` or `kwallet`, or set `KEYRING_BACKEND=SecretService` in your environment |
| `tsc` errors but Vite builds fine | `vite build` can skip some type errors. Always check `npx tsc --noEmit` before shipping. |
