import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const palette = JSON.parse(await readFile(join(root, "palettes/tokyo-night-clear.json"), "utf8"));
const profile = JSON.parse(await readFile(join(root, "terminal/profile.json"), "utf8"));

const c = palette.colors;
const { font, glyphs, window: win, cursor, behavior, macos, keybinds, herdr } = profile;

const color = (name) => {
  if (!Object.hasOwn(c, name)) throw new Error(`Unknown palette color reference: ${name}`);
  return c[name];
};
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const fontStack = [font.primary, font.nerdFallback];
const generatedFrom = "terminal/profile.json and palettes/tokyo-night-clear.json";

// --- Ghostty -----------------------------------------------------------------
// Repeated font-family entries append fallbacks in declaration order. The
// codepoint map pins Nerd Font private-use ranges to the patched font so glyph
// coverage does not depend on fallback ordering.
const ghostty = [
  `# ${palette.name} terminal profile.`,
  `# Generated from ${generatedFrom}. Do not edit by hand.`,
  "#",
  `# Install: copy this file to ~/.config/ghostty/config and copy`,
  `# "themes/ghostty/${palette.name}" into ~/.config/ghostty/themes/.`,
  "",
  ...fontStack.map((family) => `font-family = ${family}`),
  `font-size = ${font.size}`,
  ...Object.entries(font.features).map(([tag, value]) => `font-feature = ${value ? "" : "-"}${tag}`),
  ...glyphs.privateUseRanges.map((range) => `font-codepoint-map = ${range}=${font.nerdFallback}`),
  `adjust-cell-height = ${font.cellHeightPercent}%`,
  `adjust-cursor-thickness = ${font.cursorThickness}`,
  "",
  `theme = ${palette.name}`,
  `window-colorspace = ${win.colorspace}`,
  `background-opacity = ${win.opacity}`,
  `background-blur = ${win.blur}`,
  "background-opacity-cells = false",
  "",
  `cursor-style = ${cursor.style}`,
  `copy-on-select = ${behavior.copyOnSelect ? "clipboard" : "false"}`,
  `mouse-hide-while-typing = ${behavior.mouseHideWhileTyping}`,
  `confirm-close-surface = ${behavior.confirmClose}`,
  `shell-integration = ${behavior.shellIntegration}`,
  "",
  `window-padding-x = ${win.paddingX}`,
  `window-padding-y = ${win.paddingY}`,
  `macos-titlebar-style = ${macos.titlebarStyle}`,
  `macos-option-as-alt = ${macos.optionAsAlt}`,
  `macos-non-native-fullscreen = ${macos.nonNativeFullscreen}`,
  "",
  "# Opt the tokyo-holo Pi extension into Nerd Font glyphs while glyphMode is auto.",
  ...Object.entries(glyphs.env).map(([key, value]) => `env = ${key}=${value}`),
  ...keybinds.flatMap(({ key, action, comment }) => ["", `# ${comment}`, `keybind = ${key}=${action}`]),
  "",
].join("\n");

// --- Windows Terminal --------------------------------------------------------
// font.face accepts a comma-separated fallback list in Windows Terminal 1.21+.
// cellHeight works like CSS line-height, so Ghostty's +20% becomes 120%.
const windowsTerminal = {
  $schema: "https://aka.ms/terminal-profiles-schema",
  copyOnSelect: behavior.copyOnSelect,
  profiles: {
    defaults: {
      colorScheme: palette.name,
      font: {
        face: fontStack.join(", "),
        size: font.size,
        features: font.features,
        cellHeight: `${100 + font.cellHeightPercent}%`,
      },
      cursorShape: cursor.style,
      padding: `${win.paddingX}, ${win.paddingY}, ${win.paddingX}, ${win.paddingY}`,
      opacity: Math.round(win.opacity * 100),
      useAcrylic: win.blur,
      adjustIndistinguishableColors: "never",
      environment: { ...glyphs.env },
    },
  },
};

// --- herdr -------------------------------------------------------------------
const tomlScalar = (value) => (typeof value === "string" ? JSON.stringify(value) : String(value));
const tomlTable = (name, entries) => [
  `[${name}]`,
  ...Object.entries(entries).map(([key, value]) => `${key} = ${tomlScalar(value)}`),
  "",
];
const herdrConfig = [
  `# ${palette.name} herdr profile.`,
  `# Generated from ${generatedFrom}. Do not edit by hand.`,
  "#",
  "# Install: merge into ~/.config/herdr/config.toml, then run",
  "# `herdr config check` and `herdr server reload-config`.",
  "",
  `onboarding = ${herdr.onboarding}`,
  "",
  ...tomlTable("theme", { name: herdr.base }),
  ...tomlTable(
    "theme.custom",
    Object.fromEntries(Object.entries(herdr.colors).map(([token, name]) => [token, color(name)])),
  ),
  ...tomlTable("ui", herdr.ui),
  ...tomlTable("keys", herdr.keys),
].join("\n");

const outputs = new Map([
  [`terminal/ghostty/config`, ghostty],
  ["terminal/windows-terminal/settings-fragment.json", json(windowsTerminal)],
  ["terminal/herdr/config.toml", herdrConfig],
]);

const check = process.argv.includes("--check");
let drift = false;
for (const [relativePath, content] of outputs) {
  const path = join(root, relativePath);
  if (check) {
    const current = await readFile(path, "utf8").catch(() => "");
    if (current !== content) {
      console.error(`Generated terminal config is stale: ${relativePath}`);
      drift = true;
    }
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    console.log(`Generated ${relativePath}`);
  }
}
if (drift) process.exitCode = 1;
