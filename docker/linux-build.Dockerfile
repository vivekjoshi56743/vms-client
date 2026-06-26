# Tauri Linux build toolchain — Ubuntu 22.04 LTS (jammy).
#
# Produces .deb + AppImage for the container's native architecture. The build
# script (scripts/build-linux.sh) drives this for both linux/amd64 and
# linux/arm64 from a Mac via Docker's platform emulation.
#
# Deps mirror .github/workflows/build.yml so local and CI Linux builds match.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
# AppImage tooling (linuxdeploy/appimagetool) normally mounts a FUSE image,
# which containers can't do. This makes those tools extract-and-run instead.
ENV APPIMAGE_EXTRACT_AND_RUN=1
ENV NO_STRIP=1

# WebKitGTK + Tauri runtime libs + GStreamer media stack. The GStreamer
# plugins must be present at build time so the AppImage's bundleMediaFramework
# step can bundle them (MSE, WebRTC via webrtcbin, H.264/HEVC software decode).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates build-essential file pkg-config git \
      libwebkit2gtk-4.1-dev libssl-dev \
      libayatana-appindicator3-dev librsvg2-dev libsecret-1-dev \
      gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
      gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav \
    && rm -rf /var/lib/apt/lists/*

# Node 20 (matches the CI setup-node version)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Rust (stable). rustup picks the correct target for the container's arch.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app
