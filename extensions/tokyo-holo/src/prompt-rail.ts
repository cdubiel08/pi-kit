import { homedir } from "node:os";
import path from "node:path";
import { CustomEditor, type ExtensionAPI, type ExtensionContext, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, truncateToWidth, visibleWidth, type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import {
  composeChipLine,
  fitChipLine,
  layoutChips,
  type Chip,
  type ChipSegment,
  type ChipStyle,
  type ChipStyler,
} from "./chip-rail.ts";
import type { TokyoHoloConfig } from "./config.ts";
import { LOGO_PALETTE, gradientLine, lerpRgb, type GradientStop, type Rgb } from "./gradient.ts";
import type { GlyphSet } from "./glyphs.ts";
import { formatModelLabel } from "./model-label.ts";
import type { RuntimeHandle } from "./runtime.ts";
import { chipStyleForKind, StatusSurface, type StatusChip, type ThemeLike } from "./status.ts";

interface PromptRailState {
  glyphs: GlyphSet;
  modelLabel: string;
  thinkingLevel?: string;
  cwd: string;
  branch?: string;
  repoName?: string;
  dirty: boolean;
  tokens?: number | null;
  contextWindow?: number | null;
  percent?: number | null;
  turnOutputTokens?: number | null;
  turnOutputEstimated?: boolean;
  turnOutputChars: number;
  turnCompletedOutputTokens: number;
  turnActiveOutputTokens: number;
  turnActiveOutputEstimated: boolean;
  turnCommittedMessages: WeakSet<object>;
  turnCommittedMessageKeys: Set<string>;
  working: boolean;
  frame: number;
  pulseColor?: keyof typeof COLORS;
  pulseUntil?: number;
  statusChip?: { icon: string; label: string; style: ChipStyle };
  requestRender?: () => void;
}

// Prompt rail palette aligned with the `tokyo-night-clear` theme. Keep these
// colors intentionally higher-contrast than the original Tokyo Holo pastels so
// the rail preserves the theme's primary goal: vividness with functional
// clarity at a glance.
const COLORS = {
  dim: [95, 115, 143],
  muted: [141, 162, 191],
  text: [230, 237, 247],
  rosewater: [255, 184, 204],
  cyan: [0, 213, 255],
  aqua: [46, 230, 166],
  blue: [77, 163, 255],
  violet: [180, 124, 255],
  lavender: [124, 140, 255],
  pink: [255, 94, 196],
  peach: [255, 159, 67],
  amber: [255, 209, 102],
  green: [66, 230, 108],
  teal: [46, 230, 166],
  red: [255, 92, 122],
} as const;

const PULSE_MS = 420;
const PROMPT_RAIL_GLYPH = "━";
const PROMPT_CORNER_OPEN = "┏";
const PROMPT_CORNER_CLOSE = "┓";
const HARDWARE_BLINKING_BAR_CURSOR = "\x1b[?12h\x1b[5 q";
const RESTORE_TERMINAL_CURSOR = "\x1b[?12l\x1b[0 q";

const TOKYO_NIGHT_CLEAR_RAIL_SPACE: GradientStop[] = [
  { position: 0.0, color: COLORS.cyan },
  { position: 0.22, color: COLORS.blue },
  { position: 0.42, color: COLORS.violet },
  { position: 0.62, color: COLORS.pink },
  { position: 0.78, color: COLORS.aqua },
  { position: 0.9, color: COLORS.green },
  { position: 1.0, color: COLORS.peach },
];

// Keep the visible rail in the cool Tokyo Night range by default: cyan → blue
// → violet → pink. The green/orange tail is reserved for activity pulses and
// full-palette experimentation, but the resting prompt should read crisp rather
// than rainbow.
const RAIL_COLOR_SPACE_LIMIT = 0.62;
const ACTIVITY_PULSE_FRAMES = 60;
const ACTIVITY_BURST_FRACTION = 0.41;
const ACTIVITY_PHASE_SPAN = 1.0;

function cubicBezierPoint(a1: number, a2: number, t: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * t * a1 + 3 * inv * t * t * a2 + t * t * t;
}

function cubicBezierSlope(a1: number, a2: number, t: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * a1 + 6 * inv * t * (a2 - a1) + 3 * t * t * (1 - a2);
}

function cubicBezierEase(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const target = Math.max(0, Math.min(1, x));
  let t = target;
  for (let i = 0; i < 5; i++) {
    const xAtT = cubicBezierPoint(x1, x2, t);
    const slope = cubicBezierSlope(x1, x2, t);
    if (Math.abs(slope) < 1e-5) break;
    t = Math.max(0, Math.min(1, t - (xAtT - target) / slope));
  }
  return cubicBezierPoint(y1, y2, t);
}

function activityPhase(frame: number): number {
  const cycle = ACTIVITY_PULSE_FRAMES;
  const cyclePos = (frame % cycle) / cycle;
  if (cyclePos >= ACTIVITY_BURST_FRACTION) return 0;

  const burstPos = cyclePos / ACTIVITY_BURST_FRACTION;
  const eased = cubicBezierEase(0.22, 0.0, 0.16, 1.0, burstPos);
  return ACTIVITY_PHASE_SPAN * eased;
}

function railSpaceColorAt(stops: GradientStop[], pos: number): Rgb {
  const p = Math.max(0, Math.min(1, pos));
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  if (p <= sorted[0]!.position) return sorted[0]!.color;
  if (p >= sorted.at(-1)!.position) return sorted.at(-1)!.color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i]!;
    const hi = sorted[i + 1]!;
    if (p >= lo.position && p <= hi.position) {
      return lerpRgb(lo.color, hi.color, (p - lo.position) / (hi.position - lo.position || 1));
    }
  }
  return sorted.at(-1)!.color;
}

function limitedRailPalette(stops: GradientStop[], limit: number): GradientStop[] {
  const cap = Math.max(0.01, Math.min(1, limit));
  const kept = stops
    .filter((stop) => stop.position < cap)
    .map((stop) => ({ position: stop.position / cap, color: stop.color }));
  kept.push({ position: 1, color: railSpaceColorAt(stops, cap) });
  return kept;
}

const RAIL_PALETTE: GradientStop[] = limitedRailPalette(TOKYO_NIGHT_CLEAR_RAIL_SPACE, RAIL_COLOR_SPACE_LIMIT);

function byte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbParams(rgb: readonly [number, number, number]): string {
  return `${byte(rgb[0])};${byte(rgb[1])};${byte(rgb[2])}`;
}

function fg(rgb: readonly [number, number, number], text: string): string {
  return `\x1b[38;2;${rgbParams(rgb)}m${text}\x1b[39m`;
}

function fgBold(rgb: readonly [number, number, number], text: string): string {
  return `\x1b[1;38;2;${rgbParams(rgb)}m${text}\x1b[22;39m`;
}

function fgRail(rgb: Rgb, text: string): string {
  return `\x1b[1;38;2;${rgbParams(rgb)}m${text}\x1b[22;39m`;
}

function stripAnsi(value: string): string {
  return value
    .replace(/\x1b_[\s\S]*?\x1b\\/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "");
}

function isEditorRailLine(line: string): boolean {
  const plain = stripAnsi(line);
  return /^─+$/.test(plain) || /^─── [↑↓] \d+ more /.test(plain);
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 10_000) return `${(value / 1000).toFixed(0)}k`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatPercent(value: number): string {
  if (Math.abs(value) < 10) return value.toFixed(1);
  return String(Math.round(value));
}

function formatContext(state: PromptRailState): string {
  const percent = state.percent == null ? "?%" : `${formatPercent(state.percent)}%`;
  const limit = state.contextWindow ?? null;
  if (limit && limit > 0) return `${percent}/${formatNumber(limit)}`;
  if (state.tokens != null) return `${percent}/${formatNumber(state.tokens)}`;
  return percent;
}

function formatTurnOutput(state: PromptRailState): string | undefined {
  if (state.turnOutputTokens == null) return undefined;
  return formatNumber(state.turnOutputTokens);
}

// Model label formatting lives in model-label.ts so it can be tested in isolation.

function displayCwd(cwd: string): string {
  const home = homedir();
  if (cwd === home) return "~";
  if (cwd.startsWith(`${home}${path.sep}`)) return `~${cwd.slice(home.length)}`;
  return cwd;
}

function shortenCwd(cwd: string, widthBudget: number): string {
  const display = displayCwd(cwd);
  if (visibleWidth(display) <= widthBudget) return display;
  const parts = display.split(/[\\/]+/).filter(Boolean);
  if (display.startsWith("~") && parts.length >= 2) {
    const tail = parts.slice(-2).join("/");
    const candidate = `~/${tail}`;
    if (visibleWidth(candidate) <= widthBudget) return candidate;
  }
  return truncateToWidth(display, Math.max(1, widthBudget), "…");
}

export function requestHardwareBarCursor(tui: TUI): () => void {
  tui.setShowHardwareCursor(true);
  tui.terminal.write(HARDWARE_BLINKING_BAR_CURSOR);
  return () => {
    tui.setShowHardwareCursor(false);
    tui.terminal.write(RESTORE_TERMINAL_CURSOR);
  };
}

function railGlyph(glyphs: GlyphSet): string {
  return glyphs.rail === "." ? "." : PROMPT_RAIL_GLYPH;
}

function railCells(glyphs: GlyphSet, width: number): number {
  const railWidth = Math.max(1, visibleWidth(railGlyph(glyphs)));
  return Math.max(0, Math.floor(width / railWidth));
}

function pulseColor(state: PromptRailState): Rgb | undefined {
  if (!state.pulseColor || !state.pulseUntil) return undefined;
  if (Date.now() > state.pulseUntil) {
    state.pulseColor = undefined;
    state.pulseUntil = undefined;
    return undefined;
  }
  return COLORS[state.pulseColor];
}

export function railGradientPosition(index: number, total: number, phase = 0): number {
  const safeTotal = Math.max(1, total);
  const u = safeTotal <= 1 ? 0 : index / (safeTotal - 1);
  const wrappedPhase = ((phase % 1) + 1) % 1;
  if (wrappedPhase < 1e-6 || 1 - wrappedPhase < 1e-6) return u;

  const shifted = u + wrappedPhase;
  return shifted <= 1 ? shifted : shifted - 1;
}

function railColorAt(index: number, total: number, state: PromptRailState, pulse?: Rgb): Rgb {
  if (pulse) return pulse;
  // Working state is indicated by an eased full-wrap burst through the capped
  // Catppuccin color space, not by adding text/noise to the prompt. At rest,
  // keep the right endpoint at palette position 1 instead of modulo-wrapping
  // it back to pink; the closing corner should continue the rail to its left.
  const phase = state.working ? activityPhase(state.frame) : 0;
  return railSpaceColorAt(RAIL_PALETTE, railGradientPosition(index, total, phase));
}

function coloredRail(
  glyphs: GlyphSet,
  width: number,
  state: PromptRailState,
  startCell = 0,
  totalCells = width,
  pulse?: Rgb,
): string {
  const rail = railGlyph(glyphs);
  const cells = railCells(glyphs, width);
  if (cells <= 0) return "";

  let rendered = "";
  for (let i = 0; i < cells; i++) {
    rendered += fgRail(railColorAt(startCell + i, totalCells, state, pulse), rail);
  }
  return rendered;
}

function chip(id: string, priority: number, segments: ChipSegment[], style: ChipStyle = "text"): Chip {
  return { id, value: "", priority, style, segments };
}

function buildChips(state: PromptRailState): Chip[] {
  const g = state.glyphs;
  const chips: Chip[] = [];
  chips.push(chip("pi", 100, [{ text: g.pi, style: "logo" }]));
  chips.push(chip("cwd", 75, [{ text: shortenCwd(state.cwd, 44), style: "aqua" }]));
  if (state.branch) {
    const branch = `${state.branch}${state.dirty ? "*" : ""}`;
    const label = state.repoName ?? branch;
    const segments: ChipSegment[] = [{ text: g.git, style: "blue" }];
    if (state.repoName) {
      segments.push({ text: ` ${label}`, style: "violet" }, { text: ` (${branch})`, style: "green" });
    } else {
      segments.push({ text: ` ${branch}`, style: "green" });
    }
    chips.push(chip("branch", 65, segments));
  }
  const modelSegments: ChipSegment[] = [
    { text: g.ai, style: "pink" },
    { text: ` ${state.modelLabel}`, style: "pink" },
  ];
  if (state.thinkingLevel) {
    modelSegments.push({ text: ` ${g.dot} `, style: "muted" }, { text: state.thinkingLevel, style: "error" });
  }
  chips.push(chip("model", 90, modelSegments));
  if (state.percent != null || state.tokens != null || state.contextWindow != null) {
    const ctxSegments: ChipSegment[] = [
      { text: g.ctx, style: "muted" },
      { text: ` ${formatContext(state)}`, style: "muted" },
    ];
    const out = formatTurnOutput(state);
    if (out) {
      ctxSegments.push(
        { text: ` ${g.token}`, style: "muted" },
        { text: "↓", style: "muted" },
        { text: out, style: "blue" },
      );
    }
    chips.push(chip("ctx", 80, ctxSegments));
  }
  if (state.statusChip) {
    chips.push({
      id: "status",
      icon: state.statusChip.icon,
      value: state.statusChip.label,
      priority: 55,
      style: state.statusChip.style,
    });
  }
  return chips;
}

const STYLE_TO_COLOR: Record<ChipStyle, Rgb | undefined> = {
  logo: COLORS.peach,
  accent: COLORS.peach,
  text: COLORS.text,
  aqua: COLORS.aqua,
  blue: COLORS.blue,
  muted: COLORS.muted,
  dim: COLORS.dim,
  warning: COLORS.amber,
  error: COLORS.red,
  violet: COLORS.violet,
  pink: COLORS.pink,
  green: COLORS.green,
  gradient: undefined,
};

function makeChipStyler(): ChipStyler {
  return (style, text) => {
    if (style === "gradient") {
      return gradientLine(text, LOGO_PALETTE);
    }
    const color = STYLE_TO_COLOR[style] ?? COLORS.muted;
    return style === "logo" ? fgBold(color, text) : fg(color, text);
  };
}

export function stripFakeEditorCursor(line: string): string {
  const markerAt = line.indexOf(CURSOR_MARKER);
  if (markerAt === -1) return line;

  const markerEnd = markerAt + CURSOR_MARKER.length;
  const beforeAndMarker = line.slice(0, markerEnd);
  const afterMarker = line.slice(markerEnd);
  return beforeAndMarker + afterMarker.replace(/^\x1b\[7m([\s\S]*?)\x1b\[(?:0|27)m/, "$1");
}

function renderTopRail(state: PromptRailState, width: number): string {
  const pulse = pulseColor(state);
  const cornerOpen = fgRail(railColorAt(0, width, state, pulse), PROMPT_CORNER_OPEN);
  // Match the reference: one high-information chip run begins immediately at
  // the left edge, and the remaining rule carries a continuous pastel gradient
  // across the rest of the terminal. Corners use the same gradient, never gray.
  const leadRailWidth = 0;
  const fixed = 2 + leadRailWidth + 2 + 1; // corners + lead rail + spaces + min trailing rail
  const chipBudget = Math.max(1, width - fixed);
  const chips = layoutChips(buildChips(state), chipBudget);
  const styler = makeChipStyler();
  const composed = composeChipLine(chips, styler);
  const trimmed = fitChipLine(composed, chipBudget);
  const trimmedVisible = visibleWidth(trimmed);
  const lead = coloredRail(state.glyphs, leadRailWidth, state, 1, width, pulse);
  const rightRailWidth = Math.max(0, width - 2 - leadRailWidth - 2 - trimmedVisible);
  // Use the visible trailing rail as its own color span. The prior whole-width
  // mapping spent most of the visible rail in a narrow lavender band, which read
  // as gray. Local mapping keeps the Catppuccin gradient visible end-to-end.
  const rightTotal = Math.max(1, rightRailWidth);
  const right = coloredRail(state.glyphs, rightRailWidth, state, 0, rightTotal, pulse);
  const cornerClose = fgRail(railColorAt(rightTotal - 1, rightTotal, state, pulse), PROMPT_CORNER_CLOSE);
  const line = cornerOpen + lead + " " + trimmed + " " + right + cornerClose;
  return truncateToWidth(line, width, "…");
}

export class TokyoHoloEditor extends CustomEditor {
  private railState: PromptRailState;
  private runtime?: RuntimeHandle;
  private hardwareBarCursor: boolean;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    railState: PromptRailState,
    runtime?: RuntimeHandle,
    hardwareBarCursor = false,
  ) {
    super(tui, theme, keybindings, { paddingX: 2 });
    this.railState = railState;
    this.runtime = runtime;
    this.hardwareBarCursor = hardwareBarCursor;
    const requestRender = () => this.tui.requestRender();
    if (this.hardwareBarCursor && this.runtime) {
      this.runtime.restoreCursor = requestHardwareBarCursor(this.tui);
    }
    this.railState.requestRender = requestRender;
    // Seed the shared runtime handle so sibling modules (tool-group-state) can
    // nudge re-renders on batch transitions / tool completion.
    if (this.runtime) this.runtime.requestRender = requestRender;
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    const lines = super.render(safeWidth);
    if (lines.length === 0) return [renderTopRail(this.railState, safeWidth)];

    const result = [...lines];
    result[0] = renderTopRail(this.railState, safeWidth);

    // The stock editor includes a closing rail. The target prompt has only the
    // informative top rail plus the live input line, so remove the redundant
    // bottom rule instead of restyling it into a second prompt.
    for (let i = result.length - 1; i >= 1; i--) {
      if (isEditorRailLine(result[i] ?? "")) {
        result.splice(i, 1);
        break;
      }
    }

    return result.map((line) =>
      truncateToWidth(this.hardwareBarCursor ? stripFakeEditorCursor(line) : line, safeWidth, "…"),
    );
  }
}

function syncStateFromContext(state: PromptRailState, ctx: ExtensionContext, pi?: ExtensionAPI): void {
  state.cwd = ctx.cwd;
  state.modelLabel = formatModelLabel(ctx.model);
  const usage = ctx.getContextUsage?.();
  state.tokens = usage?.tokens ?? state.tokens ?? null;
  state.contextWindow = usage?.contextWindow ?? state.contextWindow ?? null;
  state.percent = usage?.percent ?? state.percent ?? null;
  try {
    const lvl = pi?.getThinkingLevel?.() as string | undefined;
    state.thinkingLevel = typeof lvl === "string" && lvl !== "off" ? lvl : undefined;
  } catch {
    // missing API — fine, chip omits it
  }
  state.requestRender?.();
}

// P17: cache the last refresh per-cwd for 1s so a burst of tool ends doesn't
// fire dozens of `git` calls. Forced refresh on cwd change.
const GIT_REFRESH_MIN_INTERVAL_MS = 1000;
let lastGitRefreshAt = 0;
let lastGitRefreshCwd: string | undefined;

async function refreshGitState(pi: ExtensionAPI, ctx: ExtensionContext, state: PromptRailState): Promise<void> {
  const now = Date.now();
  if (
    ctx.cwd === lastGitRefreshCwd &&
    now - lastGitRefreshAt < GIT_REFRESH_MIN_INTERVAL_MS
  ) {
    return;
  }
  lastGitRefreshAt = now;
  lastGitRefreshCwd = ctx.cwd;
  try {
    const branch = await pi.exec("git", ["-C", ctx.cwd, "rev-parse", "--abbrev-ref", "HEAD"], { timeout: 1500, signal: ctx.signal });
    if (branch.code !== 0) {
      state.branch = undefined;
      state.repoName = undefined;
      state.dirty = false;
      state.requestRender?.();
      return;
    }
    const branchName = branch.stdout.trim();
    const [root, dirty] = await Promise.all([
      pi.exec("git", ["-C", ctx.cwd, "rev-parse", "--show-toplevel"], { timeout: 1500, signal: ctx.signal }),
      pi.exec("git", ["-C", ctx.cwd, "status", "--porcelain"], { timeout: 1500, signal: ctx.signal }),
    ]);
    state.branch = branchName && branchName !== "HEAD" ? branchName : "detached";
    state.repoName = root.code === 0 ? path.basename(root.stdout.trim()) : undefined;
    state.dirty = dirty.code === 0 && dirty.stdout.trim().length > 0;
    state.requestRender?.();
  } catch {
    state.branch = undefined;
    state.repoName = undefined;
    state.dirty = false;
    state.requestRender?.();
  }
}

function emptyFooter() {
  return {
    render() {
      return [];
    },
    invalidate() {},
  };
}

function setPulse(
  state: PromptRailState,
  color: keyof typeof COLORS,
  enabled: boolean,
  ensureAnimation?: () => void,
): void {
  if (!enabled) return;
  state.pulseColor = color;
  state.pulseUntil = Date.now() + PULSE_MS;
  // P14: a pulse needs the timer running even when not 'working'.
  ensureAnimation?.();
  state.requestRender?.();
}

function resultHasWarning(result: unknown): boolean {
  const details = result && typeof result === "object" ? (result as { details?: Record<string, unknown> }).details : undefined;
  if (!details || typeof details !== "object") return false;
  const truncation = details.truncation;
  return Boolean(
    (truncation && typeof truncation === "object" && (truncation as Record<string, unknown>).truncated) ||
      details.linesTruncated ||
      details.matchLimitReached ||
      details.resultLimitReached ||
      details.entryLimitReached,
  );
}

function resetTurnOutput(state: PromptRailState): void {
  state.turnOutputTokens = 0;
  state.turnOutputEstimated = false;
  state.turnOutputChars = 0;
  state.turnCompletedOutputTokens = 0;
  state.turnActiveOutputTokens = 0;
  state.turnActiveOutputEstimated = false;
  state.turnCommittedMessages = new WeakSet<object>();
  state.turnCommittedMessageKeys = new Set<string>();
  state.requestRender?.();
}

function outputUsageFrom(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const usage = (value as { usage?: { output?: unknown } }).usage;
  const output = usage?.output;
  return typeof output === "number" && Number.isFinite(output) ? Math.max(0, Math.round(output)) : undefined;
}

function setTurnOutput(state: PromptRailState, tokens: number, estimated: boolean): void {
  if (state.turnOutputTokens === tokens && state.turnOutputEstimated === estimated) return;
  state.turnOutputTokens = tokens;
  state.turnOutputEstimated = estimated;
  state.requestRender?.();
}

function publishTurnOutput(state: PromptRailState): void {
  setTurnOutput(state, state.turnCompletedOutputTokens + state.turnActiveOutputTokens, state.turnActiveOutputEstimated);
}

function resetActiveTurnOutput(state: PromptRailState): void {
  state.turnOutputChars = 0;
  state.turnActiveOutputTokens = 0;
  state.turnActiveOutputEstimated = false;
  publishTurnOutput(state);
}

function applyActiveUsageOutput(state: PromptRailState, source: unknown, final = false): boolean {
  const output = outputUsageFrom(source);
  if (output === undefined || (!final && output <= 0)) return false;
  state.turnActiveOutputTokens = output;
  state.turnActiveOutputEstimated = false;
  publishTurnOutput(state);
  return true;
}

function commitAssistantOutput(state: PromptRailState, source: unknown): boolean {
  const output = outputUsageFrom(source);
  if (source && typeof source === "object") {
    if (state.turnCommittedMessages.has(source)) return false;
    state.turnCommittedMessages.add(source);
    const message = source as { timestamp?: unknown; model?: unknown; usage?: { output?: unknown } };
    const key = `${String(message.timestamp ?? "")}:${String(message.model ?? "")}:${String(output ?? "")}`;
    if (key !== "::" && state.turnCommittedMessageKeys.has(key)) return false;
    if (key !== "::") state.turnCommittedMessageKeys.add(key);
  }
  const committed = output ?? state.turnActiveOutputTokens;
  if (committed <= 0) return false;
  state.turnCompletedOutputTokens += committed;
  resetActiveTurnOutput(state);
  return true;
}

function updateOutputEstimate(state: PromptRailState, delta: string): void {
  if (!delta) return;
  state.turnOutputChars += delta.length;
  const estimated = Math.max(1, Math.ceil(state.turnOutputChars / 4));
  if (state.turnActiveOutputEstimated || state.turnActiveOutputTokens === 0) {
    state.turnActiveOutputTokens = estimated;
    state.turnActiveOutputEstimated = true;
    publishTurnOutput(state);
  }
}

function updateTurnOutputFromAssistantEvent(state: PromptRailState, event: unknown): void {
  if (!event || typeof event !== "object") return;
  const e = event as { type?: string; delta?: unknown; partial?: unknown; message?: unknown; error?: unknown };
  if (e.type === "start") resetActiveTurnOutput(state);
  if (e.type === "done") {
    commitAssistantOutput(state, e.message);
    return;
  }
  if (e.type === "error") {
    commitAssistantOutput(state, e.error);
    return;
  }
  if (applyActiveUsageOutput(state, e.partial, false)) return;
  if (typeof e.delta === "string" && (e.type === "text_delta" || e.type === "thinking_delta" || e.type === "toolcall_delta")) {
    updateOutputEstimate(state, e.delta);
  }
}

export function installPromptRail(
  pi: ExtensionAPI,
  config: TokyoHoloConfig,
  glyphs: GlyphSet,
  runtime?: RuntimeHandle,
): void {
  if (!config.promptRail) return;

  const state: PromptRailState = {
    glyphs,
    modelLabel: "model",
    cwd: process.cwd(),
    dirty: false,
    working: false,
    frame: 0,
    tokens: null,
    contextWindow: null,
    percent: null,
    turnOutputTokens: null,
    turnOutputEstimated: false,
    turnOutputChars: 0,
    turnCompletedOutputTokens: 0,
    turnActiveOutputTokens: 0,
    turnActiveOutputEstimated: false,
    turnCommittedMessages: new WeakSet<object>(),
    turnCommittedMessageKeys: new Set<string>(),
  };
  let animationTimer: ReturnType<typeof setInterval> | undefined;
  let tuiActive = false;
  let statusSurface: StatusSurface | undefined;
  let previousEditorFactory: ReturnType<ExtensionContext["ui"]["getEditorComponent"]>;
  let activeUi: { setStatus(key: string, text: string | undefined): void; theme: ThemeLike } | undefined;

  const stopAnimation = () => {
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = undefined;
    }
  };

  const ensureAnimation = () => {
    if (animationTimer || (!state.working && !config.pulseOnSubmit && !config.pulseOnToolReturn)) return;
    animationTimer = setInterval(() => {
      const pulseActive = state.pulseUntil !== undefined && Date.now() <= state.pulseUntil;
      // P14: stop the timer when nothing animated needs it. agent_start /
      // setPulse will restart it. Saves CPU + battery on idle terminals.
      if (!state.working && !pulseActive) {
        stopAnimation();
        return;
      }
      state.frame++;
      state.requestRender?.();
    }, 80);
  };

  pi.on("session_start", async (_event, ctx) => {
    tuiActive = ctx.mode === "tui";
    if (!tuiActive) return;
    syncStateFromContext(state, ctx, pi);
    ensureAnimation();
    previousEditorFactory = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new TokyoHoloEditor(tui, theme, keybindings, state, runtime, config.hardwareBarCursor),
    );
    activeUi = ctx.ui;
    statusSurface = new StatusSurface({
      pushRail(chip) {
        if (chip) {
          state.statusChip = { icon: chip.icon, label: chip.label, style: chipStyleForKind(chip.kind) };
        } else {
          state.statusChip = undefined;
        }
        state.requestRender?.();
      },
      pushFooter(text) {
        activeUi?.setStatus("tokyo-holo", text);
      },
      getTheme() {
        return activeUi?.theme ?? null;
      },
    });
    if (config.hideDefaultFooter) ctx.ui.setFooter(() => emptyFooter());
    if (config.hideDefaultWorkingIndicator) {
      ctx.ui.setWorkingVisible(false);
      ctx.ui.setWorkingIndicator({ frames: [] });
    }
    void refreshGitState(pi, ctx, state);
  });

  pi.on("model_select", async (_event, ctx) => {
    if (!tuiActive) return;
    syncStateFromContext(state, ctx, pi);
  });

  // P16: only ONE submit pulse. before_agent_start fires earliest so the
  // user gets the fastest possible visual feedback that input was accepted.
  pi.on("before_agent_start", async (_event, ctx) => {
    if (!tuiActive) return;
    resetTurnOutput(state);
    setPulse(state, "aqua", config.pulseOnSubmit, ensureAnimation);
    syncStateFromContext(state, ctx, pi);
  });

  pi.on("agent_start", async (_event, ctx) => {
    if (!tuiActive) return;
    state.working = true;
    state.frame = 0;
    ensureAnimation();
    syncStateFromContext(state, ctx, pi);
    statusSurface?.set(null);
  });

  pi.on("message_update", async (event, _ctx) => {
    if (!tuiActive) return;
    updateTurnOutputFromAssistantEvent(state, event.assistantMessageEvent);
  });

  pi.on("message_end", async (event, _ctx) => {
    if (!tuiActive) return;
    if (event.message?.role === "assistant") commitAssistantOutput(state, event.message);
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!tuiActive) return;
    syncStateFromContext(state, ctx, pi);
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    if (!tuiActive) return;
    if (event.isError) {
      setPulse(state, "red", config.pulseOnToolReturn, ensureAnimation);
      statusSurface?.set({ kind: "error", icon: "‼", label: "error", ttlMs: 4000 });
    } else if (resultHasWarning(event.result)) {
      setPulse(state, "amber", config.pulseOnToolReturn, ensureAnimation);
      statusSurface?.set({ kind: "warn", icon: "▲", label: "truncated", ttlMs: 3000 });
    } else {
      setPulse(state, "teal", config.pulseOnToolReturn, ensureAnimation);
      statusSurface?.set(null);
    }
    syncStateFromContext(state, ctx, pi);
    void refreshGitState(pi, ctx, state);
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!tuiActive) return;
    state.working = false;
    setPulse(state, "teal", config.pulseOnToolReturn, ensureAnimation);
    syncStateFromContext(state, ctx, pi);
    statusSurface?.set(null);
    void refreshGitState(pi, ctx, state);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    // P18: timer cleanup must happen even when ctx.hasUI is false, otherwise
    // a session that briefly opened a UI then shut down with no UI would
    // leak the interval forever.
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = undefined;
    }
    statusSurface?.dispose();
    statusSurface = undefined;
    activeUi = undefined;
    runtime?.restoreCursor?.();
    if (runtime) {
      runtime.restoreCursor = undefined;
      runtime.requestRender = undefined;
    }
    const wasTuiActive = tuiActive;
    tuiActive = false;
    if (!wasTuiActive || ctx.mode !== "tui") return;
    ctx.ui.setEditorComponent(previousEditorFactory);
    previousEditorFactory = undefined;
    if (config.hideDefaultFooter) ctx.ui.setFooter(undefined);
    if (config.hideDefaultWorkingIndicator) {
      ctx.ui.setWorkingIndicator();
      ctx.ui.setWorkingVisible(true);
    }
  });
}
