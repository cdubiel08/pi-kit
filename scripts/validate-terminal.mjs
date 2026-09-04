import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relativePath) => readFile(join(root, relativePath), "utf8");

// Ghostty 1.3.1 config keys used by the generated profile, confirmed against
// `ghostty +show-config --default --docs`.
const ghosttyKeys = new Set([
  "font-family", "font-size", "font-feature", "font-codepoint-map", "adjust-cell-height",
  "adjust-cursor-thickness", "theme", "window-colorspace", "background-opacity", "background-blur",
  "background-opacity-cells", "cursor-style", "copy-on-select", "mouse-hide-while-typing",
  "confirm-close-surface", "shell-integration", "window-padding-x", "window-padding-y",
  "macos-titlebar-style", "macos-option-as-alt", "macos-non-native-fullscreen", "env", "keybind",
]);

// herdr `CustomThemeColors` tokens. Unknown tokens are ignored by herdr with a
// warning from `herdr config check`, so validate them here instead.
const herdrTokens = new Set([
  "accent", "panel_bg", "sidebar_bg", "active_row_bg", "selection_bg", "surface0", "surface1",
  "surface_dim", "overlay0", "overlay1", "text", "subtext0", "mauve", "green", "yellow", "red",
  "blue", "teal", "peach",
]);

// Windows Terminal keys from https://aka.ms/terminal-profiles-schema.
const windowsGlobalKeys = new Set(["$schema", "copyOnSelect", "profiles"]);
const windowsProfileKeys = new Set([
  "colorScheme", "font", "cursorShape", "padding", "opacity", "useAcrylic",
  "adjustIndistinguishableColors", "environment",
]);
const windowsFontKeys = new Set(["face", "size", "weight", "features", "axes", "cellWidth", "cellHeight"]);
const cursorShapes = new Set(["bar", "vintage", "underscore", "filledBox", "emptyBox", "doubleUnderscore"]);

const colorPattern = /^#[0-9a-f]{6}$/;
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const palette = JSON.parse(await read("palettes/tokyo-night-clear.json"));
const profile = JSON.parse(await read("terminal/profile.json"));

// --- profile.json ------------------------------------------------------------
assert(typeof profile.font?.primary === "string" && profile.font.primary.length > 0, "profile: font.primary must be a non-empty string");
assert(typeof profile.font?.nerdFallback === "string" && profile.font.nerdFallback.length > 0, "profile: font.nerdFallback must be a non-empty string");
assert(Number.isFinite(profile.font?.size) && profile.font.size > 0, "profile: font.size must be a positive number");
assert(Number.isFinite(profile.font?.cellHeightPercent), "profile: font.cellHeightPercent must be a number");
assert(Number.isFinite(profile.window?.opacity) && profile.window.opacity > 0 && profile.window.opacity <= 1, "profile: window.opacity must be between 0 and 1");
assert(cursorShapes.has(profile.cursor?.style), `profile: cursor.style must be one of ${[...cursorShapes].join(", ")}`);
assert(Object.keys(profile.glyphs?.env ?? {}).length > 0, "profile: glyphs.env must declare at least one variable");
for (const range of profile.glyphs?.privateUseRanges ?? []) {
  assert(/^U\+[0-9A-F]{4,6}(-U\+[0-9A-F]{4,6})?$/.test(range), `profile: invalid codepoint range ${range}`);
}
for (const [token, name] of Object.entries(profile.herdr?.colors ?? {})) {
  assert(herdrTokens.has(token), `profile: unknown herdr theme token ${token}`);
  assert(Object.hasOwn(palette.colors, name), `profile: herdr token ${token} references unknown palette color ${name}`);
}

// --- generated Ghostty config ------------------------------------------------
const ghostty = await read("terminal/ghostty/config");
for (const [index, line] of ghostty.split("\n").entries()) {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) continue;
  const key = trimmed.split("=", 1)[0].trim();
  assert(ghosttyKeys.has(key), `ghostty config line ${index + 1}: unsupported key ${key}`);
  assert(trimmed.includes("="), `ghostty config line ${index + 1}: expected key = value`);
}
assert(ghostty.includes(`theme = ${palette.name}`), "ghostty config: must reference the generated palette theme");
for (const family of [profile.font.primary, profile.font.nerdFallback]) {
  assert(ghostty.includes(`font-family = ${family}`), `ghostty config: missing font-family ${family}`);
}

// --- generated Windows Terminal fragment -------------------------------------
const windows = JSON.parse(await read("terminal/windows-terminal/settings-fragment.json"));
for (const key of Object.keys(windows)) assert(windowsGlobalKeys.has(key), `windows-terminal: unsupported top-level key ${key}`);
const defaults = windows.profiles?.defaults ?? {};
for (const key of Object.keys(defaults)) assert(windowsProfileKeys.has(key), `windows-terminal: unsupported profile key ${key}`);
for (const key of Object.keys(defaults.font ?? {})) assert(windowsFontKeys.has(key), `windows-terminal: unsupported font key ${key}`);
assert(cursorShapes.has(defaults.cursorShape), `windows-terminal: invalid cursorShape ${defaults.cursorShape}`);
assert(Number.isInteger(defaults.opacity) && defaults.opacity >= 0 && defaults.opacity <= 100, "windows-terminal: opacity must be an integer between 0 and 100");
assert(/^[+-]?\d+(?:\.\d+)?(?:%|ch|pt|px)?$/.test(defaults.font?.cellHeight ?? ""), `windows-terminal: invalid font.cellHeight ${defaults.font?.cellHeight}`);
assert(defaults.colorScheme === palette.name, `windows-terminal: colorScheme must be ${palette.name}`);
const scheme = JSON.parse(await read("themes/windows-terminal/tokyo-night-clear.json"));
assert(scheme.schemes?.some((entry) => entry.name === defaults.colorScheme), "windows-terminal: colorScheme has no matching generated scheme");
assert(defaults.font?.face === `${profile.font.primary}, ${profile.font.nerdFallback}`, "windows-terminal: font.face must list the primary font then the Nerd Font fallback");

// --- generated herdr config --------------------------------------------------
const herdr = await read("terminal/herdr/config.toml");
const customStart = herdr.indexOf("[theme.custom]");
assert(customStart >= 0, "herdr config: missing [theme.custom] table");
const customBlock = herdr.slice(customStart).split("\n").slice(1);
let seen = 0;
for (const line of customBlock) {
  if (line.startsWith("[")) break;
  const match = /^([a-z0-9_]+) = "(.*)"$/.exec(line.trim());
  if (!match) continue;
  seen += 1;
  assert(herdrTokens.has(match[1]), `herdr config: unknown theme token ${match[1]}`);
  assert(colorPattern.test(match[2]), `herdr config: token ${match[1]} has invalid color ${match[2]}`);
}
assert(seen === Object.keys(profile.herdr.colors).length, "herdr config: emitted token count does not match the profile");

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(`Terminal validation failed with ${failures.length} problem(s).`);
  process.exitCode = 1;
} else {
  console.log("Validated terminal profile: ghostty, windows-terminal, herdr");
}
