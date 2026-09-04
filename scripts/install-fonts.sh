#!/usr/bin/env bash
# Install the Tokyo Night Clear terminal font stack:
#   CommitMono                  primary text face
#   JetBrainsMono Nerd Font Mono   Nerd Font glyph fallback
#
# Nothing is removed or overwritten outside the platform font directory, and
# the script never asks for elevated privileges.
set -euo pipefail

# The primary face must be the unpatched CommitMono, whose embedded family name
# is "CommitMono" — the name the generated configs request. Nerd Fonts ships a
# patched CommitMono, but it registers as "CommitMono Nerd Font", so installing
# it here would leave the configured primary face unresolved.
NERD_VERSION="v3.5.1"
NERD_BASE="https://github.com/ryanoasis/nerd-fonts/releases/download/${NERD_VERSION}"
COMMIT_MONO_VERSION="v1.143"
COMMIT_MONO_URL="https://github.com/eigilnikolajsen/commit-mono/releases/download/${COMMIT_MONO_VERSION}/CommitMono-1.143.zip"

usage() {
  cat <<'USAGE'
Usage: scripts/install-fonts.sh [--dry-run]

  --dry-run   Print the commands that would run without installing anything.
USAGE
}

DRY_RUN=0
# Global so the EXIT trap can still read it after install_linux returns.
TMP_DIR=""
cleanup() { [ -n "$TMP_DIR" ] && rm -rf "$TMP_DIR"; }
trap cleanup EXIT

case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) usage; exit 1 ;;
esac

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'would run: %s\n' "$*"
  else
    "$@"
  fi
}

install_macos() {
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew is required on macOS: https://brew.sh" >&2
    exit 1
  fi
  run brew install --cask font-commit-mono font-jetbrains-mono-nerd-font
}

install_linux() {
  local dir="${XDG_DATA_HOME:-$HOME/.local/share}/fonts"
  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'would install into: %s\n' "$dir"
    printf 'would download: %s\n' "$COMMIT_MONO_URL" "${NERD_BASE}/JetBrainsMono.zip"
    return
  fi
  mkdir -p "$dir"
  TMP_DIR="$(mktemp -d)"
  local tmp="$TMP_DIR"

  echo "Downloading CommitMono ${COMMIT_MONO_VERSION}"
  curl -fsSL -o "$tmp/CommitMono.zip" "$COMMIT_MONO_URL"
  unzip -qo "$tmp/CommitMono.zip" -d "$tmp/CommitMono"
  # Only the top-level OpenType faces; the ttfautohint/ directory holds
  # duplicates of the same family that would register twice.
  find "$tmp/CommitMono" -type f -name 'CommitMono-*.otf' -not -path '*/ttfautohint/*' \
    -exec cp {} "$dir/" \;

  echo "Downloading JetBrainsMono Nerd Font ${NERD_VERSION}"
  curl -fsSL -o "$tmp/JetBrainsMono.zip" "${NERD_BASE}/JetBrainsMono.zip"
  unzip -qo "$tmp/JetBrainsMono.zip" -d "$tmp/JetBrainsMono"
  # Mono faces only. The NL (no-ligature) and Propo builds are separate
  # families that the generated configs never reference.
  find "$tmp/JetBrainsMono" -type f -name 'JetBrainsMonoNerdFontMono-*.ttf' \
    -exec cp {} "$dir/" \;

  command -v fc-cache >/dev/null 2>&1 && fc-cache -f "$dir" >/dev/null
  echo "Installed into $dir"
}

case "$(uname -s)" in
  Darwin) install_macos ;;
  Linux) install_linux ;;
  *)
    cat <<'WINDOWS'
On Windows, the generated config asks for the unpatched "CommitMono" with
"JetBrainsMono Nerd Font Mono" behind it.

1. Nerd Font fallback, via scoop:

     scoop bucket add nerd-fonts
     scoop install nerd-fonts/JetBrainsMono-NF-Mono

2. CommitMono has no scoop or winget package. Download the release below and
   install the top-level .otf files (skip the ttfautohint folder):

     https://github.com/eigilnikolajsen/commit-mono/releases/latest

Alternatively install only nerd-fonts/CommitMono-NF-Mono and change font.face
to "CommitMono Nerd Font Mono". That is one patched family instead of two, so
it needs the config edit.
WINDOWS
    ;;
esac
