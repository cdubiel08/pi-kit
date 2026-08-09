import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const palette = JSON.parse(await readFile(join(root, "palettes/tokyo-night-clear.json"), "utf8"));
const zedAdapter = JSON.parse(await readFile(join(root, "adapters/zed-tokyo-night-clear.json"), "utf8"));
const c = palette.colors;
const colorPattern = /^#[0-9a-f]{6}$/;

for (const [name, value] of Object.entries(c)) {
  if (!colorPattern.test(value)) throw new Error(`Invalid palette color ${name}: ${value}`);
}
for (const [slot, name] of Object.entries(palette.ansi)) {
  if (!Object.hasOwn(c, name)) throw new Error(`Unknown ANSI color reference ${slot}: ${name}`);
}

const rgb = (hex) => {
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const resolveAdapter = (value) => {
  if (Array.isArray(value)) return value.map(resolveAdapter);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveAdapter(item)]));
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  const [, name, alpha] = /^\$([^@]+)(?:@([0-9a-f]{2}))?$/.exec(value) ?? [];
  if (!name || !Object.hasOwn(c, name)) throw new Error(`Unknown adapter color reference: ${value}`);
  return `${c[name]}${alpha ?? ""}`;
};

const pi = {
  $schema: "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  name: "tokyo-night-clear",
  vars: {
    bg0: c.bg0, bg1: c.bg1, bg2: c.bg2, bg3: c.bg3, fg0: c.fg0, fg1: c.fg1,
    muted0: c.muted, dim0: c.dim, cyan: c.cyan, aqua: c.aqua, blue: c.blue,
    indigo: c.indigo, violet: c.violet, pink: c.pink, amber: c.amber, orange: c.orange,
    red: c.red, green: c.green, rose: c.rose, userBg: c.userBg, pendingBg: c.bg2,
    successBg: c.successBg, errorBg: c.errorBg,
  },
  colors: {
    accent: "cyan", border: "dim0", borderAccent: "cyan", borderMuted: "dim0", success: "green",
    error: "red", warning: "amber", muted: "muted0", dim: "dim0", text: "fg0", thinkingText: "muted0",
    selectedBg: "bg3", userMessageBg: "userBg", userMessageText: "fg0", customMessageBg: "bg1",
    customMessageText: "fg0", customMessageLabel: "violet", toolPendingBg: "pendingBg",
    toolSuccessBg: "successBg", toolErrorBg: "errorBg", toolTitle: "cyan", toolOutput: "fg0",
    mdHeading: "violet", mdLink: "blue", mdLinkUrl: "muted0", mdCode: "aqua", mdCodeBlock: "fg0",
    mdCodeBlockBorder: "blue", mdQuote: "muted0", mdQuoteBorder: "dim0", mdHr: "dim0", mdListBullet: "pink",
    toolDiffAdded: "green", toolDiffRemoved: "red", toolDiffContext: "muted0", syntaxComment: "dim0",
    syntaxKeyword: "violet", syntaxFunction: "blue", syntaxVariable: "fg0", syntaxString: "green",
    syntaxNumber: "pink", syntaxType: "indigo", syntaxOperator: "cyan", syntaxPunctuation: "muted0",
    thinkingOff: "dim0", thinkingMinimal: "muted0", thinkingLow: "blue", thinkingMedium: "cyan",
    thinkingHigh: "pink", thinkingXhigh: "red", bashMode: "orange",
  },
  export: { pageBg: c.bg0, cardBg: c.bg1, infoBg: c.bg2 },
};

const claude = {
  name: "Tokyo Night Clear CC", id: "tokyo-night-clear-cc", author: palette.author,
  colors: Object.fromEntries(Object.entries({
    background: "bg0", text: "fg0", inverseText: "bg0", subtle: "muted", inactive: "inactive", ide: "muted",
    claude: "cyan", claudeShimmer: "aqua", claudeBlue_FOR_SYSTEM_SPINNER: "blue",
    claudeBlueShimmer_FOR_SYSTEM_SPINNER: "indigo", success: "green", error: "red", warning: "amber",
    warningShimmer: "orange", permission: "green", permissionShimmer: "aqua", autoAccept: "green",
    planMode: "violet", remember: "amber", suggestion: "blue", bashBorder: "dim", promptBorder: "cyan",
    promptBorderShimmer: "violet", diffAdded: "successBg", diffRemoved: "errorBg",
    diffAddedDimmed: "diffAddedDimmed", diffRemovedDimmed: "diffRemovedDimmed", diffAddedWord: "diffAddedWord",
    diffRemovedWord: "diffRemovedWord", diffAddedWordDimmed: "diffAddedWordDimmed",
    diffRemovedWordDimmed: "diffRemovedWordDimmed", bashMessageBackgroundColor: "bg2",
    userFacingToolNameBackgroundColor: "bg3", userFacingNameBackgroundColor: "bg3",
    messageActionsBackground: "bg3", userMessageBackground: "userBg", userMessageBackgroundHover: "bg3",
    selectionBg: "bg3", gitBranch: "aqua", fastMode: "pink", "autoAccept-shimmer": "aqua",
  }).map(([key, name]) => [key, rgb(c[name])])),
};

const ansi = Object.fromEntries(Object.entries(palette.ansi).map(([slot, name]) => [slot, c[name]]));
const windows = {
  $schema: "https://aka.ms/terminal-profiles-schema",
  schemes: [{
    name: palette.name, background: c.bg0, foreground: c.fg0, cursorColor: c.cyan, selectionBackground: c.bg3,
    black: ansi.black, red: ansi.red, green: ansi.green, yellow: ansi.yellow, blue: ansi.blue,
    purple: ansi.purple, cyan: ansi.cyan, white: ansi.white, brightBlack: ansi.brightBlack,
    brightRed: ansi.brightRed, brightGreen: ansi.brightGreen, brightYellow: ansi.brightYellow,
    brightBlue: ansi.brightBlue, brightPurple: ansi.brightPurple, brightCyan: ansi.brightCyan,
    brightWhite: ansi.brightWhite,
  }],
};
const ghosttyNames = {
  black: "palette = 0", red: "palette = 1", green: "palette = 2", yellow: "palette = 3",
  blue: "palette = 4", purple: "palette = 5", cyan: "palette = 6", white: "palette = 7",
  brightBlack: "palette = 8", brightRed: "palette = 9", brightGreen: "palette = 10",
  brightYellow: "palette = 11", brightBlue: "palette = 12", brightPurple: "palette = 13",
  brightCyan: "palette = 14", brightWhite: "palette = 15",
};
const ghostty = [
  `# Generated from palettes/${palette.id}.json.`, `background = ${c.bg0}`, `foreground = ${c.fg0}`,
  `cursor-color = ${c.cyan}`, `cursor-text = ${c.bg0}`, `selection-background = ${c.bg3}`,
  `selection-foreground = ${c.fg0}`,
  ...Object.entries(ghosttyNames).map(([slot, prefix]) => `${prefix}=${ansi[slot]}`), "",
].join("\n");

const outputs = new Map([
  ["themes/tokyo-night-clear.json", json(pi)],
  ["themes/claude-code/tokyo-night-clear-cc.json", json(claude)],
  ["themes/zed/tokyo-night-clear-high-contrast.json", json(resolveAdapter(zedAdapter))],
  ["themes/ghostty/Tokyo Night Clear", ghostty],
  ["themes/windows-terminal/tokyo-night-clear.json", json(windows)],
]);

const check = process.argv.includes("--check");
let drift = false;
for (const [relativePath, content] of outputs) {
  const path = join(root, relativePath);
  if (check) {
    const current = await readFile(path, "utf8").catch(() => "");
    if (current !== content) { console.error(`Generated theme is stale: ${relativePath}`); drift = true; }
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    console.log(`Generated ${relativePath}`);
  }
}
if (drift) process.exitCode = 1;
