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

const vscode = {
  $schema: "vscode://schemas/color-theme",
  name: palette.name,
  type: "dark",
  semanticHighlighting: true,
  colors: {
    "activityBar.background": c.bg1, "activityBar.foreground": c.fg0, "activityBar.inactiveForeground": `${c.muted}99`,
    "activityBarBadge.background": c.cyan, "activityBarBadge.foreground": c.bg0,
    "badge.background": c.bg3, "badge.foreground": c.fg0, "button.background": c.blue,
    "button.foreground": c.bg0, "button.hoverBackground": c.cyan, "descriptionForeground": c.muted,
    "dropdown.background": c.bg1, "dropdown.border": c.dim, "dropdown.foreground": c.fg0,
    "editor.background": c.bg0, "editor.foreground": c.fg0, "editorCursor.foreground": c.cyan,
    "editor.findMatchBackground": `${c.orange}66`, "editor.findMatchHighlightBackground": `${c.amber}44`,
    "editor.lineHighlightBackground": c.bg1, "editor.selectionBackground": `${c.blue}55`,
    "editor.inactiveSelectionBackground": `${c.bg3}99`, "editor.wordHighlightBackground": `${c.cyan}22`,
    "editorBracketMatch.background": `${c.cyan}22`, "editorBracketMatch.border": c.cyan,
    "editorError.foreground": c.red, "editorWarning.foreground": c.amber, "editorInfo.foreground": c.cyan,
    "editorGutter.addedBackground": c.green, "editorGutter.deletedBackground": c.red, "editorGutter.modifiedBackground": c.amber,
    "editorGroup.border": c.bg3, "editorIndentGuide.background1": c.bg3, "editorIndentGuide.activeBackground1": c.dim,
    "editorLineNumber.foreground": c.dim, "editorLineNumber.activeForeground": c.fg0,
    "editorWidget.background": c.bg1, "editorWidget.border": c.dim, "editorSuggestWidget.selectedBackground": c.bg3,
    "focusBorder": c.cyan, "foreground": c.fg0, "input.background": c.bg1, "input.border": c.dim,
    "input.foreground": c.fg0, "input.placeholderForeground": c.muted, "inputOption.activeBorder": c.cyan,
    "list.activeSelectionBackground": c.bg3, "list.activeSelectionForeground": c.fg0,
    "list.hoverBackground": c.bg2, "list.inactiveSelectionBackground": c.bg2, "list.highlightForeground": c.cyan,
    "menu.background": c.bg1, "menu.foreground": c.fg0, "menu.selectionBackground": c.bg3,
    "minimap.background": c.bg0, "notificationCenterHeader.background": c.bg2, "notifications.background": c.bg1,
    "panel.background": c.bg0, "panel.border": c.bg3, "panelTitle.activeBorder": c.cyan,
    "peekView.border": c.cyan, "peekViewEditor.background": c.bg1, "peekViewResult.background": c.bg0,
    "progressBar.background": c.cyan, "scrollbarSlider.background": `${c.dim}66`,
    "scrollbarSlider.hoverBackground": `${c.dim}99`, "scrollbarSlider.activeBackground": c.cyan,
    "sideBar.background": c.bg1, "sideBar.foreground": c.fg1, "sideBar.border": c.bg3,
    "sideBarSectionHeader.background": c.bg2, "sideBarTitle.foreground": c.fg0,
    "statusBar.background": c.bg1, "statusBar.foreground": c.fg1, "statusBar.debuggingBackground": c.orange,
    "statusBar.debuggingForeground": c.bg0, "statusBar.noFolderBackground": c.bg1,
    "tab.activeBackground": c.bg0, "tab.activeForeground": c.fg0, "tab.activeBorderTop": c.cyan,
    "tab.inactiveBackground": c.bg1, "tab.inactiveForeground": c.muted, "tab.border": c.bg3,
    "terminal.background": c.bg0, "terminal.foreground": c.fg0, "terminalCursor.foreground": c.cyan,
    ...Object.fromEntries(Object.entries({
      ansiBlack: "black", ansiRed: "red", ansiGreen: "green", ansiYellow: "yellow", ansiBlue: "blue",
      ansiMagenta: "purple", ansiCyan: "cyan", ansiWhite: "white", ansiBrightBlack: "brightBlack",
      ansiBrightRed: "brightRed", ansiBrightGreen: "brightGreen", ansiBrightYellow: "brightYellow",
      ansiBrightBlue: "brightBlue", ansiBrightMagenta: "brightPurple", ansiBrightCyan: "brightCyan",
      ansiBrightWhite: "brightWhite",
    }).map(([key, slot]) => [`terminal.${key}`, c[palette.ansi[slot]]])),
    "textLink.foreground": c.blue, "textLink.activeForeground": c.cyan,
    "titleBar.activeBackground": c.bg1, "titleBar.activeForeground": c.fg0,
    "titleBar.inactiveBackground": c.bg0, "titleBar.inactiveForeground": c.muted,
  },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: c.muted, fontStyle: "italic" } },
    { scope: ["keyword", "storage", "storage.type", "storage.modifier"], settings: { foreground: c.violet } },
    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: c.blue } },
    { scope: ["entity.name.type", "entity.name.class", "entity.name.namespace", "support.type"], settings: { foreground: c.indigo } },
    { scope: ["string", "string.quoted", "string.template"], settings: { foreground: c.green } },
    { scope: ["constant.numeric", "constant.language", "constant.character"], settings: { foreground: c.pink } },
    { scope: ["variable.language", "support.variable"], settings: { foreground: c.cyan } },
    { scope: ["variable.parameter"], settings: { foreground: c.amber } },
    { scope: ["entity.name.tag"], settings: { foreground: c.red } },
    { scope: ["entity.other.attribute-name"], settings: { foreground: c.violet } },
    { scope: ["constant.other.symbol", "string.regexp", "constant.character.escape"], settings: { foreground: c.aqua } },
    { scope: ["keyword.operator", "punctuation.accessor"], settings: { foreground: c.cyan } },
    { scope: ["markup.heading"], settings: { foreground: c.violet, fontStyle: "bold" } },
    { scope: [
      "markup.raw", "markup.inline.raw", "markup.raw.block", "markup.fenced_code",
      "markup.inline.raw.string.markdown", "markup.raw.block.markdown",
    ], settings: { foreground: c.aqua } },
    { scope: [
      "punctuation.definition.raw.markdown", "punctuation.definition.markdown",
      "punctuation.definition.fenced.markdown",
    ], settings: { foreground: c.muted } },
    { scope: ["markup.underline.link"], settings: { foreground: c.blue } },
    { scope: ["markup.inserted"], settings: { foreground: c.green } },
    { scope: ["markup.deleted"], settings: { foreground: c.red } },
  ],
  semanticTokenColors: {
    namespace: c.indigo, type: c.indigo, class: c.indigo, enum: c.indigo, interface: c.indigo,
    struct: c.indigo, typeParameter: c.indigo, parameter: c.amber, variable: c.fg0, property: c.fg0,
    enumMember: c.pink, function: c.blue, method: c.blue, macro: c.cyan, keyword: c.violet,
    comment: { foreground: c.muted, italic: true }, string: c.green, number: c.pink,
    regexp: c.aqua, operator: c.cyan, decorator: c.orange,
  },
};

const zedSettings = {
  project_panel: { dock: "right" },
  outline_panel: { dock: "right" },
  collaboration_panel: { dock: "right" },
  git_panel: { dock: "right" },
  agent: { dock: "left" },
  ui_font_family: "IBM Plex Sans",
  ui_font_size: 16,
  buffer_font_family: "JetBrainsMono Nerd Font",
  buffer_font_size: 15,
  buffer_line_height: { custom: 1.7 },
  theme: { mode: "dark", light: "Catppuccin Latte", dark: "Tokyo Night Clear High Contrast" },
  languages: {
    Markdown: {
      soft_wrap: "editor_width",
      show_wrap_guides: false,
      tab_size: 2,
      format_on_save: "off",
      buffer_font_family: "IBM Plex Sans",
      buffer_font_size: 16,
      buffer_line_height: { custom: 1.8 },
    },
  },
};

const vscodeSettings = {
  "workbench.colorTheme": palette.name,
  "workbench.sideBar.location": "right",
  "workbench.panel.defaultLocation": "bottom",
  "editor.fontFamily": "'JetBrainsMono Nerd Font', monospace",
  "editor.fontSize": 15,
  "editor.lineHeight": 26,
  "window.titleBarStyle": "custom",
  "[markdown]": {
    "editor.fontFamily": "'JetBrainsMono Nerd Font', monospace",
    "editor.fontSize": 15,
    "editor.lineHeight": 26,
    "editor.wordWrap": "on",
    "editor.rulers": [],
    "editor.tabSize": 2,
    "editor.formatOnSave": false,
  },
};

const vscodeMarkdownPreview = `/* Generated to mirror the Zed Markdown preview layout. */
body {
  box-sizing: border-box;
  max-width: 1230px;
  margin: 0 auto;
  padding: 24px 0 64px;
  font-family: "IBM Plex Sans", sans-serif;
  font-size: 16px;
  line-height: 1.8;
  color: ${c.fg1};
}
h1 { font-size: 32px; }
h2 { font-size: 28px; }
h3 { font-size: 23px; }
h1, h2 { border-bottom-color: ${c.bg3}; }
a { color: ${c.cyan}; }
code { color: ${c.fg0}; background: ${c.bg2}; }
pre { border: 1px solid ${c.bg3}; border-radius: 10px; background: ${c.bg0}; }
pre code { background: transparent; }
blockquote { border-left-color: ${c.dim}; color: ${c.muted}; }
.hljs-keyword, .hljs-literal, .hljs-symbol, .hljs-name { color: ${c.violet}; }
.hljs-built_in, .hljs-type, .hljs-title, .hljs-function { color: ${c.blue}; }
.hljs-number, .hljs-class, .hljs-variable, .hljs-template-variable { color: ${c.pink}; }
.hljs-string, .hljs-meta-string { color: ${c.green}; }
.hljs-regexp, .hljs-template-tag { color: ${c.aqua}; }
.hljs-comment, .hljs-quote { color: ${c.muted}; font-style: italic; }
.hljs-meta, .hljs-meta-keyword, .hljs-tag { color: ${c.cyan}; }
.hljs-attr, .hljs-attribute, .hljs-builtin-name { color: ${c.amber}; }
.hljs-bullet, .hljs-selector-tag, .hljs-selector-id, .hljs-selector-class,
.hljs-selector-attr, .hljs-selector-pseudo { color: ${c.orange}; }
.pi-kit-shell-command { color: ${c.blue}; }
.pi-kit-shell-argument { color: ${c.green}; }
.pi-kit-shell-option { color: ${c.pink}; }
.pi-kit-shell-operator, .pi-kit-shell-variable { color: ${c.cyan}; }
.pi-kit-shell-comment { color: ${c.muted}; font-style: italic; }
`;

const vscodeMarkdownPreviewScript = `(() => {
  const shellClasses = ["language-bash", "language-shell", "language-sh", "language-zsh"];
  const tokenPattern = /(\\s+|#[^\\n]*|"(?:\\\\.|[^"\\\\])*"|'[^']*'|&&|\\|\\||[|;]|\\$\\{?[-A-Za-z_][A-Za-z0-9_]*\\}?|--?[A-Za-z0-9][A-Za-z0-9_-]*|[^\\s|;]+)/g;

  function highlightShell(code) {
    if (code.dataset.piKitHighlighted === "true") return;
    const source = code.textContent ?? "";
    code.replaceChildren();
    let expectCommand = true;
    for (const token of source.match(tokenPattern) ?? []) {
      const span = document.createElement("span");
      span.textContent = token;
      if (/^\\s+$/.test(token)) {
        if (token.includes("\\n")) expectCommand = true;
      } else if (token.startsWith("#")) {
        span.className = "pi-kit-shell-comment";
      } else if (/^(?:&&|\\|\\||[|;])$/.test(token)) {
        span.className = "pi-kit-shell-operator";
        expectCommand = true;
      } else if (expectCommand) {
        span.className = "pi-kit-shell-command";
        expectCommand = false;
      } else if (token.startsWith("-")) {
        span.className = "pi-kit-shell-option";
      } else if (token.startsWith("$")) {
        span.className = "pi-kit-shell-variable";
      } else {
        span.className = "pi-kit-shell-argument";
      }
      code.append(span);
    }
    code.dataset.piKitHighlighted = "true";
  }

  function highlight() {
    for (const code of document.querySelectorAll("pre > code")) {
      if (shellClasses.some((name) => code.classList.contains(name))) highlightShell(code);
    }
  }

  highlight();
  new MutationObserver(highlight).observe(document.documentElement, { childList: true, subtree: true });
})();
`;

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
  ["themes/zed/recommended-settings.json", json(zedSettings)],
  ["themes/vscode/tokyo-night-clear-color-theme.json", json(vscode)],
  ["themes/vscode/recommended-settings.json", json(vscodeSettings)],
  ["themes/vscode/markdown-preview.css", vscodeMarkdownPreview],
  ["themes/vscode/markdown-preview.js", vscodeMarkdownPreviewScript],
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
