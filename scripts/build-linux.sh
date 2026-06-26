#!/usr/bin/env bash
#
# Build Supervision Client Linux installers (.deb + AppImage) for amd64 and/or
# arm64 using Docker — no GitHub Actions, no cloud VM. Runs on a Mac.
#
# On Apple Silicon: arm64 builds natively (fast); amd64 builds under Docker's
# QEMU emulation (correct, but slow — expect a long Rust compile). Both are
# fine for infrequent release builds.
#
# Artifacts land in ./dist-linux/<arch>/.
#
# Usage:
#   scripts/build-linux.sh             # both arches (amd64 + arm64)
#   scripts/build-linux.sh arm64       # just arm64 (fast on Apple Silicon)
#   scripts/build-linux.sh amd64       # just amd64
#
# Prereqs: Docker Desktop running.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE=supervision-linux-build
DOCKERFILE=docker/linux-build.Dockerfile

ARCHES=("$@")
if [ ${#ARCHES[@]} -eq 0 ]; then
  ARCHES=(amd64 arm64)
fi

for arch in "${ARCHES[@]}"; do
  case "$arch" in
    amd64) platform=linux/amd64 ;;
    arm64) platform=linux/arm64 ;;
    *) echo "unknown arch '$arch' (use amd64 or arm64)" >&2; exit 1 ;;
  esac

  echo "==> [$arch] building toolchain image ($platform)"
  docker build --platform "$platform" -t "$IMAGE:$arch" -f "$DOCKERFILE" docker/

  echo "==> [$arch] building Tauri Linux bundles"
  # Named volumes keep node_modules / Rust target / cargo cache OUT of the
  # bind-mounted repo, so the container never clobbers your macOS build
  # artifacts (src-tauri/target) or host node_modules (native binaries differ).
  docker run --rm \
    --platform "$platform" \
    -v "$PWD":/app \
    -v "sv-linux-node-$arch":/app/node_modules \
    -v "sv-linux-target-$arch":/app/.linux-target \
    -v "sv-linux-cargo-$arch":/root/.cargo/registry \
    -e CARGO_TARGET_DIR=/app/.linux-target \
    -e APPIMAGE_EXTRACT_AND_RUN=1 \
    "$IMAGE:$arch" \
    bash -euc '
      npm ci
      npm run tauri build -- --bundles deb appimage
      out="/app/dist-linux/'"$arch"'"
      mkdir -p "$out"
      cp -v /app/.linux-target/release/bundle/deb/*.deb           "$out"/ 2>/dev/null || true
      cp -v /app/.linux-target/release/bundle/appimage/*.AppImage "$out"/ 2>/dev/null || true
    '

  echo "==> [$arch] done -> dist-linux/$arch/"
done

echo
echo "All requested Linux builds complete:"
ls -lR dist-linux 2>/dev/null || true
