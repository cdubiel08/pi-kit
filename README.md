# pi-kit

A deliberately small, public UI/TUI package for the [Pi coding agent](https://github.com/earendil-works/pi-mono).

The initial release contains only visual runtime behavior:

- `tokyo-night-clear` and `tokyo-holo` themes;
- a shared Tokyo Night Clear palette with generated themes for Pi, Claude Code, Zed, VS Code, Ghostty, and Windows Terminal;
- a portable terminal profile with matching font, Nerd glyph, and window settings for Ghostty, Windows Terminal, and herdr;
- a responsive gradient prompt rail and custom editor surface;
- compact renderers for Pi's built-in tools;
- grouped tool cards and edit-diff previews;
- optional welcome, status, working-indicator, glyph, and color treatments.

It does not include agents, skills, MCP integrations, provider configuration, credentials, or project-specific automation.

Tested with Pi `0.84.1` and Node.js `22.19+`. A truecolor terminal is recommended; Unicode and ASCII glyph fallbacks are built in.

## Install

Install the pinned Git package:

```bash
pi install git:github.com/cdubiel08/pi-kit@v0.1.0
```

Then choose `tokyo-night-clear` or `tokyo-holo` from `/settings` and run `/reload`.

For local development:

```bash
git clone https://github.com/cdubiel08/pi-kit.git
cd pi-kit
npm install
npm run check
pi -e .
```

`pi -e .` loads the package temporarily. Use `pi install /absolute/path/to/pi-kit` when you want the checkout registered in Pi settings.

## Configuration

Copy [`tokyo-holo.config.example.json`](./tokyo-holo.config.example.json) to the path below to opt into the complete visual preset, including compact tool cards and suppression of Pi's stock footer/working indicator:

```text
$PI_CODING_AGENT_DIR/tokyo-holo.config.json
```

When `PI_CODING_AGENT_DIR` is unset, Pi's normal location is used:

```text
~/.pi/agent/tokyo-holo.config.json
```

Important options:

| Option | Default | Purpose |
|---|---:|---|
| `glyphMode` | `auto` | `auto`, `nerd`, `unicode`, or `ascii` |
| `compactTools` | `false` | Opt into replacing built-in tool rendering with compact cards |
| `groupSequentialTools` | `true` | Group sibling tool calls into one visual card |
| `promptRail` | `true` | Enable the custom prompt/editor rail |
| `hardwareBarCursor` | `false` | Opt into terminal cursor-shape escape sequences |
| `welcomeOverlay` | `auto` | `auto`, `startup`, `always`, or `never` |
| `editPreview` | `true` | Show a compact post-edit diff card |

Set `PI_TOKYO_HOLO_NERD_FONT=1` to use Nerd Font glyphs while `glyphMode` is `auto`. The optional hardware bar cursor uses standard DECSET/DECSCUSR terminal sequences and restores the terminal default when the extension shuts down.

## Portable Tokyo Night Clear palette

[`palettes/tokyo-night-clear.json`](./palettes/tokyo-night-clear.json) is the canonical color source. It generates application-specific mappings rather than forcing every application to use the same semantic token names:

| Target | Generated output |
|---|---|
| Pi | `themes/tokyo-night-clear.json` |
| Claude Code | `themes/claude-code/tokyo-night-clear-cc.json` |
| Zed | `themes/zed/tokyo-night-clear-high-contrast.json` + `themes/zed/recommended-settings.json` |
| VS Code | `themes/vscode/tokyo-night-clear-color-theme.json` + `themes/vscode/recommended-settings.json` |
| Ghostty | `themes/ghostty/Tokyo Night Clear` |
| Windows Terminal | `themes/windows-terminal/tokyo-night-clear.json` |

Regenerate and verify checked-in outputs with:

```bash
npm run generate
npm run check:generated
```

Install target files by copying them into each application's normal theme/config directory. The generated Zed and VS Code `recommended-settings.json` files reproduce the preferred panel placement, JetBrains Mono Nerd Font code surface, and IBM Plex Sans Markdown layout; merge those keys into your existing user settings rather than replacing the file, especially if it contains agent or provider configuration.

To test the VS Code theme directly from this checkout, run `code --extensionDevelopmentPath="$PWD"` and select **Tokyo Night Clear** with **Preferences: Color Theme** in the new Extension Development Host window. The Windows Terminal file is a `schemes` settings fragment; merge its scheme into `settings.json` and select `Tokyo Night Clear` in the desired profile. Terminal preferences such as font, opacity, blur, padding, shell integration, and keybindings stay out of the palette and live in the terminal profile below.

## Terminal profile

[`terminal/profile.json`](./terminal/profile.json) is the canonical source for everything the palette deliberately leaves out: the font stack, Nerd glyph wiring, window padding and opacity, cursor shape, and keybindings. It generates one config per terminal:

| Target | Generated output |
|---|---|
| Ghostty | `terminal/ghostty/config` |
| Windows Terminal | `terminal/windows-terminal/settings-fragment.json` |
| herdr | `terminal/herdr/config.toml` |

The font stack is CommitMono with JetBrainsMono Nerd Font Mono behind it, so text metrics come from CommitMono while private-use glyphs still resolve. Install both faces with `scripts/install-fonts.sh` on macOS or Linux, or with the `nerd-fonts` scoop bucket on Windows.

The Ghostty and Windows Terminal configs both export `PI_TOKYO_HOLO_NERD_FONT=1`, which is the only signal `glyphMode: auto` trusts to turn on Nerd Font glyphs. Each config carries color by reference rather than by copy, so the palette stays the single color source.

Setup steps for all three targets, including the Windows Terminal version requirement for font fallback, are in [`terminal/README.md`](./terminal/README.md).

## Scope and behavior

When `compactTools` is enabled, the extension re-registers Pi's built-in `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls` definitions to supply custom renderers. Execution still comes from Pi's own built-in definitions. The extension skips any tool already supplied by another extension, the SDK, a sandbox, or a remote backend.

The prompt rail performs read-only local Git queries to show repository and branch state. No data is transmitted. See [SECURITY.md](./SECURITY.md) for the complete data-behavior summary.

## Development

```bash
npm run check
```

The tests cover narrow-width rendering, ANSI-safe truncation, gradients, glyph fallbacks, tool summaries, grouping, status behavior, and the welcome panel.

## Acknowledgements

The palettes draw inspiration from [Tokyo Night](https://github.com/enkia/tokyo-night-vscode-theme) and [Catppuccin Macchiato](https://github.com/catppuccin/catppuccin). Optional private-use glyphs are designed for [Nerd Fonts](https://www.nerdfonts.com/).

## License

[MIT](./LICENSE)
