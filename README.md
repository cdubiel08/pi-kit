# pi-kit

A deliberately small, public UI/TUI package for the [Pi coding agent](https://github.com/earendil-works/pi-mono).

The initial release contains only visual runtime behavior:

- `tokyo-night-clear` and `tokyo-holo` themes;
- a shared Tokyo Night Clear palette with generated themes for Pi, Claude Code, Zed, Ghostty, and Windows Terminal;
- a responsive gradient prompt rail and custom editor surface;
- compact renderers for Pi's built-in tools;
- grouped tool cards and edit-diff previews;
- optional welcome, status, working-indicator, glyph, and color treatments.

It does not include agents, skills, MCP integrations, provider configuration, credentials, or project-specific automation.

Tested with Pi `0.82.1` and Node.js `22.19+`. A truecolor terminal is recommended; Unicode and ASCII glyph fallbacks are built in.

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
| Zed | `themes/zed/tokyo-night-clear-high-contrast.json` |
| Ghostty | `themes/ghostty/Tokyo Night Clear` |
| Windows Terminal | `themes/windows-terminal/tokyo-night-clear.json` |

Regenerate and verify checked-in outputs with:

```bash
npm run generate:themes
npm run check:generated
```

Install target files by copying them into each application's normal theme/config directory. The Windows Terminal file is a `schemes` settings fragment; merge its scheme into `settings.json` and select `Tokyo Night Clear` in the desired profile. Terminal-only preferences such as fonts, opacity, blur, padding, shell integration, and keybindings intentionally remain outside the shared palette.

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
