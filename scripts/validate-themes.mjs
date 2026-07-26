import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const requiredColors = [
  "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text",
  "thinkingText", "selectedBg", "userMessageBg", "userMessageText", "customMessageBg", "customMessageText",
  "customMessageLabel", "toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput", "mdHeading",
  "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr",
  "mdListBullet", "toolDiffAdded", "toolDiffRemoved", "toolDiffContext", "syntaxComment", "syntaxKeyword",
  "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator",
  "syntaxPunctuation", "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh",
  "thinkingXhigh", "bashMode",
];

const allowedTopLevel = new Set(["$schema", "name", "vars", "colors", "export"]);
const allowedColors = new Set([...requiredColors, "thinkingMax"]);
const allowedExport = new Set(["pageBg", "cardBg", "infoBg"]);
const colorPattern = /^#[0-9a-f]{6}$/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateColor(value, vars, location) {
  if (Number.isInteger(value)) {
    assert(value >= 0 && value <= 255, `${location}: palette index must be between 0 and 255`);
    return;
  }
  assert(typeof value === "string", `${location}: expected a string or palette index`);
  assert(value === "" || colorPattern.test(value) || Object.hasOwn(vars, value), `${location}: unknown color value ${JSON.stringify(value)}`);
}

const themeDir = new URL("../themes/", import.meta.url);
const files = (await readdir(themeDir)).filter((file) => file.endsWith(".json")).sort();
assert(files.length > 0, "No theme JSON files found");

for (const file of files) {
  const path = join(themeDir.pathname, file);
  const theme = JSON.parse(await readFile(path, "utf8"));
  const vars = theme.vars ?? {};
  const colors = theme.colors ?? {};

  assert(typeof theme.name === "string" && theme.name.length > 0 && !theme.name.includes("/"), `${file}: invalid name`);
  for (const key of Object.keys(theme)) assert(allowedTopLevel.has(key), `${file}: unsupported top-level property ${key}`);
  for (const key of requiredColors) assert(Object.hasOwn(colors, key), `${file}: missing colors.${key}`);
  for (const key of Object.keys(colors)) assert(allowedColors.has(key), `${file}: unsupported colors.${key}`);
  for (const [key, value] of Object.entries(vars)) validateColor(value, vars, `${file}: vars.${key}`);
  for (const [key, value] of Object.entries(colors)) validateColor(value, vars, `${file}: colors.${key}`);
  for (const [key, value] of Object.entries(theme.export ?? {})) {
    assert(allowedExport.has(key), `${file}: unsupported export.${key}`);
    validateColor(value, vars, `${file}: export.${key}`);
  }
}

console.log(`Validated ${files.length} theme(s): ${files.join(", ")}`);
