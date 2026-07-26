import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  ASCII_PI_LOGO,
  DEFAULT_WELCOME_OPTIONS,
  formatRelativeTime,
  renderWelcomePanel,
  shouldShow,
} from "../src/welcome.ts";

test("formatRelativeTime: 12 hours → 12h ago", () => {
  assert.equal(formatRelativeTime(12 * 3600_000), "12h ago");
});

test("formatRelativeTime: under 5s → just now", () => {
  assert.equal(formatRelativeTime(2_000), "just now");
});

test("formatRelativeTime: 90s → 1m ago", () => {
  assert.equal(formatRelativeTime(90_000), "1m ago");
});

test("formatRelativeTime: 2 days → 2d ago", () => {
  assert.equal(formatRelativeTime(2 * 24 * 3600_000), "2d ago");
});

test("shouldShow: auto mode gates on startup OR resume", () => {
  assert.equal(shouldShow("auto", "startup"), true);
  assert.equal(shouldShow("auto", "resume"), true);
  assert.equal(shouldShow("auto", "reload"), false);
  assert.equal(shouldShow("auto", "new"), false);
  assert.equal(shouldShow("auto", "fork"), false);
});

test("shouldShow: startup mode only fires on startup", () => {
  assert.equal(shouldShow("startup", "startup"), true);
  assert.equal(shouldShow("startup", "resume"), false);
});

test("shouldShow: always always; never never", () => {
  for (const r of ["startup", "reload", "new", "resume", "fork"] as const) {
    assert.equal(shouldShow("always", r), true);
    assert.equal(shouldShow("never", r), false);
  }
});

test("renderWelcomePanel omits MCP section when showMcp:false", () => {
  const panel = renderWelcomePanel(
    {
      greeting: "Welcome back!",
      modelLabel: "qwen3.6-27b",
      modelProvider: "mlx-local",
      mcpServers: [{ name: "example-server", ok: 2, total: 2 }],
      recentSessions: [],
    },
    88,
    { ...DEFAULT_WELCOME_OPTIONS, showMcp: false },
    5,
  );
  const joined = panel.lines.join("\n");
  assert.equal(joined.includes("MCP"), false, "MCP section should be absent");
  assert.equal(joined.includes("example-server"), false, "MCP entries should be absent");
});

test("renderWelcomePanel shows footer countdown", () => {
  const panel = renderWelcomePanel(
    { greeting: "Welcome!", modelLabel: "m", modelProvider: "" },
    80,
    DEFAULT_WELCOME_OPTIONS,
    5,
  );
  assert.ok(panel.lines.join("\n").includes("(5s)"));
});

test("renderWelcomePanel renders ASCII π logo lines when showLogo:true", () => {
  const panel = renderWelcomePanel(
    { greeting: "Welcome back!", modelLabel: "m", modelProvider: "" },
    88,
    DEFAULT_WELCOME_OPTIONS,
    5,
  );
  // ASCII π has 7 lines; gradient wraps each visible char in SGR runs so we
  // can only assert that the lines contain SGR true-color escapes — proof
  // the logo got the gradient treatment.
  const joined = panel.lines.join("\n");
  assert.match(joined, /\x1b\[38;2;\d+;\d+;\d+m/);
  // ASCII_PI_LOGO is exported with at least 5 lines.
  assert.ok(ASCII_PI_LOGO.length >= 5);
});

test("renderWelcomePanel stays width-safe on narrow terminals", () => {
  for (const width of [1, 10, 24, 49]) {
    const panel = renderWelcomePanel(
      { greeting: "Welcome back!", modelLabel: "very-long-model-label", modelProvider: "provider" },
      width,
      DEFAULT_WELCOME_OPTIONS,
      5,
    );
    assert.ok(panel.lines.every((line) => visibleWidth(line) <= width), `line exceeded width ${width}`);
  }
});

test("renderWelcomePanel snapshot-ish: width=88 has top + bottom frame at expected width", () => {
  const panel = renderWelcomePanel(
    { greeting: "Welcome!", modelLabel: "m", modelProvider: "" },
    88,
    DEFAULT_WELCOME_OPTIONS,
  );
  // Top frame starts with ╭─ pi agent and ends with ╮
  assert.match(panel.lines[0]!, /^╭─ pi agent ─+╮$/);
  // Bottom frame starts with ╰ ends with ╯
  assert.ok(panel.lines.at(-1)!.startsWith("╰"));
  assert.ok(panel.lines.at(-1)!.endsWith("╯"));
});
