# Terminal profile

Typography, glyph, and window settings that sit alongside the
[Tokyo Night Clear palette](../palettes/tokyo-night-clear.json). The palette
supplies color; this directory supplies everything else the terminal needs to
render Pi and the `tokyo-holo` extension the way they were designed.

| File | Target | Kind |
|---|---|---|
| [`profile.json`](./profile.json) | all | source of record |
| [`ghostty/config`](./ghostty/config) | Ghostty 1.2+ | generated |
| [`windows-terminal/settings-fragment.json`](./windows-terminal/settings-fragment.json) | Windows Terminal 1.21+ | generated |
| [`herdr/config.toml`](./herdr/config.toml) | herdr 0.8+ | generated |

Regenerate after editing `profile.json`:

```bash
npm run generate:terminal
npm run check
```

## Fonts

The stack is CommitMono for text with JetBrainsMono Nerd Font Mono behind it for
glyphs. Keeping the Nerd Font as a fallback rather than the primary face means
text metrics come from CommitMono while every private-use glyph still resolves.

```bash
scripts/install-fonts.sh            # macOS (Homebrew) or Linux (~/.local/share/fonts)
scripts/install-fonts.sh --dry-run  # print what it would do first
```

The primary face must be the unpatched CommitMono. Nerd Fonts also publishes a
patched CommitMono, but it registers under the family name `CommitMono Nerd
Font`, so installing that one instead leaves the configured primary face
unresolved and every character falls through to the fallback.

On Windows, install the Nerd Font with scoop:

```powershell
scoop bucket add nerd-fonts
scoop install nerd-fonts/JetBrainsMono-NF-Mono
```

CommitMono has no scoop or winget package. Download the
[latest release](https://github.com/eigilnikolajsen/commit-mono/releases/latest)
and install the top-level `.otf` files, skipping the `ttfautohint` folder, whose
faces duplicate the same family.

To install a single patched family instead, use `nerd-fonts/CommitMono-NF-Mono`
and change `font.face` to `CommitMono Nerd Font Mono`. That combination needs
the config edit, so the fallback stack is the default.

## Nerd glyphs

`tokyo-holo` never guesses which font your terminal is using, because no
environment variable reports it reliably. While `glyphMode` is `auto` the
extension uses Nerd Font glyphs only when `PI_TOKYO_HOLO_NERD_FONT=1` is set, and
otherwise falls back to Unicode. Both generated terminal configs export that
variable, so installing either one turns the glyphs on.

Setting `glyphMode` to `nerd` in `tokyo-holo.config.json` forces them on
regardless of the environment; `unicode` or `ascii` forces them off.

The extension's glyphs live at U+E0A0, U+E22C, U+EDE8, U+F07B, and U+F50C. The
Ghostty config pins the surrounding private-use ranges to the Nerd Font with
`font-codepoint-map` so coverage does not depend on fallback ordering.

## Ghostty

```bash
mkdir -p ~/.config/ghostty/themes
cp "themes/ghostty/Tokyo Night Clear" ~/.config/ghostty/themes/
cp terminal/ghostty/config ~/.config/ghostty/config
```

The theme file must be installed too; the config refers to it by name. Verify
with `ghostty +show-config`, which prints nothing to stderr when the file parses
cleanly. The macOS-only keys (`macos-titlebar-style`, `macos-option-as-alt`,
`macos-non-native-fullscreen`, and `window-colorspace`) are ignored elsewhere.

## Windows Terminal

Both fragments merge into one `settings.json`. Neither is a complete settings
file, so copy their keys in rather than replacing the file:

1. Merge the `schemes` array from
   [`themes/windows-terminal/tokyo-night-clear.json`](../themes/windows-terminal/tokyo-night-clear.json).
2. Merge `copyOnSelect` and `profiles.defaults` from
   [`windows-terminal/settings-fragment.json`](./windows-terminal/settings-fragment.json).

`profiles.defaults` applies to every profile. Move the block into a single entry
under `profiles.list` to scope it to one shell instead.

Comma-separated font fallback in `font.face` requires Windows Terminal 1.21 or
newer. On older builds, drop the fallback and use one patched face.

## herdr

```bash
herdr config check          # validate before and after
herdr server reload-config  # apply without restarting
```

Merge [`herdr/config.toml`](./herdr/config.toml) into `~/.config/herdr/config.toml`.
The `[theme.custom]` table maps the palette onto herdr's nineteen theme tokens
over the built-in `tokyo-night` base. The `[ui]` and `[keys]` tables are
preferences rather than theming, so drop them if you have your own.

`herdr config check` reports unknown keys instead of failing, so read its output
rather than trusting its exit code.
