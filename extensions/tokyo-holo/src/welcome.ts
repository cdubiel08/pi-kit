import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { basename } from "node:path";
import type { WelcomeOverlayMode } from "./config.ts";
import { LOGO_PALETTE, gradientLines } from "./gradient.ts";

export interface WelcomeOptions {
  mode: WelcomeOverlayMode;
  dismissAfterMs: number;
  showLogo: boolean;
  showRecentSessions: boolean;
  showMcp: boolean;
}

export const DEFAULT_WELCOME_OPTIONS: WelcomeOptions = {
  mode: "auto",
  dismissAfterMs: 5000,
  showLogo: true,
  showRecentSessions: true,
  showMcp: true,
};

export type SessionReason = "startup" | "reload" | "new" | "resume" | "fork";

export function shouldShow(mode: WelcomeOverlayMode, reason: SessionReason): boolean {
  if (mode === "never") return false;
  if (mode === "always") return true;
  if (mode === "startup") return reason === "startup";
  // "auto" — startup OR resume; suppressed on reload/new/fork
  return reason === "startup" || reason === "resume";
}

export function formatRelativeTime(deltaMs: number): string {
  const secs = Math.max(0, Math.floor(deltaMs / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// 7-line ASCII π that renders well with a vertical pink → cream → mint gradient.
export const ASCII_PI_LOGO: string[] = [
  " ▒█▓▒  ",
  "▒██▒▒▒ ",
  "███████",
  "▒▒▒██▒▒",
  " ▒█▓▒  ",
  "  ▒▓   ",
  "   ▒   ",
];

export interface WelcomeData {
  greeting: string;       // "Welcome back!" / "Welcome!"
  modelLabel: string;     // e.g. "qwen3.6-27b"
  modelProvider: string;  // e.g. "mlx-local"
  contextFiles?: number;
  extensions?: number;
  skills?: number;
  mcpServers?: Array<{ name: string; ok: number; total: number; tokens?: number }>;
  recentSessions?: Array<{ cwd: string; relative: string }>;
}

export interface WelcomePanel {
  lines: string[];
}

const SECTION_HR = "────────────────────────────────────────";
const FRAME_TOP = "╭─ pi agent ";
const FRAME_TOP_END = "╮";
const FRAME_SIDE_L = "│ ";
const FRAME_SIDE_R = " │";
const FRAME_BOTTOM = "╰";
const FRAME_BOTTOM_END = "╯";

function padTo(s: string, width: number): string {
  // ANSI-aware: pad/truncate based on visible width, not byte length, so
  // SGR escape sequences don't get sliced mid-stream.
  const vw = visibleWidth(s);
  if (vw >= width) return truncateToWidth(s, width, "");
  return s + " ".repeat(width - vw);
}

function centerTo(s: string, width: number): string {
  const vw = visibleWidth(s);
  if (vw >= width) return truncateToWidth(s, width, "");
  const left = Math.floor((width - vw) / 2);
  const right = width - vw - left;
  return " ".repeat(left) + s + " ".repeat(right);
}

function frame(lines: string[], width: number, footer?: string): string[] {
  const inner = Math.max(10, width - FRAME_SIDE_L.length - FRAME_SIDE_R.length);
  const topFill = Math.max(0, width - FRAME_TOP.length - FRAME_TOP_END.length);
  const out: string[] = [];
  out.push(FRAME_TOP + "─".repeat(topFill) + FRAME_TOP_END);
  for (const line of lines) {
    out.push(FRAME_SIDE_L + padTo(line, inner) + FRAME_SIDE_R);
  }
  const footText = footer ?? "";
  if (footText) {
    const footFill = Math.max(2, width - footText.length - 2 - FRAME_BOTTOM.length - FRAME_BOTTOM_END.length);
    const half = Math.floor(footFill / 2);
    const rest = footFill - half;
    out.push(FRAME_BOTTOM + "─".repeat(half) + " " + footText + " " + "─".repeat(rest) + FRAME_BOTTOM_END);
  } else {
    out.push(FRAME_BOTTOM + "─".repeat(width - 2) + FRAME_BOTTOM_END);
  }
  return out;
}

export function renderWelcomePanel(
  data: WelcomeData,
  width: number,
  options: WelcomeOptions,
  remainingSeconds?: number,
): WelcomePanel {
  const safeWidth = Math.max(1, Math.floor(width));
  if (safeWidth < 50) {
    const compact = [
      "pi agent",
      data.greeting,
      `${data.modelLabel}${data.modelProvider ? ` · ${data.modelProvider}` : ""}`,
      remainingSeconds !== undefined ? `Continuing in ${Math.max(0, Math.ceil(remainingSeconds))}s` : "",
    ].filter(Boolean);
    return { lines: compact.map((line) => truncateToWidth(line, safeWidth, "…")) };
  }

  const innerWidth = safeWidth - 4; // sides + padding
  const leftWidth = options.showLogo ? 24 : 0;
  const dividerWidth = options.showLogo ? 3 : 0; // " │ "
  const rightWidth = Math.max(20, innerWidth - leftWidth - dividerWidth);

  const logoLines: string[] = options.showLogo
    ? gradientLines(ASCII_PI_LOGO, LOGO_PALETTE)
    : [];

  const rightCol: string[] = [];

  // Greeting + model
  rightCol.push("Tips");
  rightCol.push("  / for commands");
  rightCol.push("  ! to run bash");
  rightCol.push("  /settings to customize Pi");
  rightCol.push("");
  rightCol.push(SECTION_HR.slice(0, rightWidth));

  // Loaded
  const loaded: string[] = ["Loaded"];
  if (data.contextFiles !== undefined) loaded.push(`  ✓ ${data.contextFiles} context file${data.contextFiles === 1 ? "" : "s"}`);
  else loaded.push("  ✓ — context files");
  if (data.extensions !== undefined) loaded.push(`  ✓ ${data.extensions} extension${data.extensions === 1 ? "" : "s"}`);
  if (data.skills !== undefined) loaded.push(`  ✓ ${data.skills} skill${data.skills === 1 ? "" : "s"}`);
  rightCol.push(...loaded);
  rightCol.push("");

  // MCP
  if (options.showMcp && data.mcpServers && data.mcpServers.length > 0) {
    rightCol.push(SECTION_HR.slice(0, rightWidth));
    rightCol.push("MCP");
    for (const s of data.mcpServers) {
      const tokens = s.tokens !== undefined ? `  ${s.tokens.toLocaleString()} tokens` : "";
      rightCol.push(`  ● ${s.name}  ${s.ok}/${s.total}${tokens}`);
    }
    rightCol.push("");
  }

  // Recent sessions
  if (options.showRecentSessions && data.recentSessions && data.recentSessions.length > 0) {
    rightCol.push(SECTION_HR.slice(0, rightWidth));
    rightCol.push("Recent sessions");
    for (const s of data.recentSessions.slice(0, 3)) {
      rightCol.push(`  · ${s.cwd}  (${s.relative})`);
    }
  }

  // Compose two-column rows. Reference layout: greeting first, large π logo
  // underneath, model/provider below the logo.
  const leftCol = [
    "",
    data.greeting,
    "",
    ...logoLines,
    "",
    data.modelLabel,
    data.modelProvider,
  ];
  const rowCount = Math.max(leftCol.length, rightCol.length);
  const rows: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    const l = leftCol[i] ?? "";
    const r = rightCol[i] ?? "";
    if (options.showLogo) rows.push(centerTo(l, leftWidth) + " │ " + r);
    else rows.push(r);
  }

  const footer = remainingSeconds !== undefined
    ? `Closing automatically (${Math.max(0, Math.ceil(remainingSeconds))}s)`
    : undefined;

  return { lines: frame(rows, safeWidth, footer) };
}

export function installWelcomeOverlay(pi: ExtensionAPI, options: Partial<WelcomeOptions> = {}): void {
  const opts: WelcomeOptions = { ...DEFAULT_WELCOME_OPTIONS, ...options };
  if (opts.mode === "never") return;

  const widgetKey = "tokyo-holo-welcome";
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;

  const clearTimers = () => {
    if (dismissTimer) clearTimeout(dismissTimer);
    if (tickTimer) clearInterval(tickTimer);
    dismissTimer = undefined;
    tickTimer = undefined;
  };

  pi.on("session_start", async (event, ctx) => {
    if (ctx.mode !== "tui") return;
    if (!shouldShow(opts.mode, event.reason as SessionReason)) return;

    const startedAt = Date.now();
    const dataPromise = collectWelcomeData(pi, ctx);
    const data = await dataPromise;

    const update = () => {
      const elapsed = Date.now() - startedAt;
      const remaining = (opts.dismissAfterMs - elapsed) / 1000;
      if (remaining <= 0) {
        clearTimers();
        ctx.ui.setWidget(widgetKey, undefined);
        return;
      }
      ctx.ui.setWidget(
        widgetKey,
        () => ({
          render(width) {
            return renderWelcomePanel(data, Math.min(88, width), opts, remaining).lines;
          },
          invalidate() {},
        }),
        { placement: "aboveEditor" },
      );
    };

    update();
    tickTimer = setInterval(update, 1000);
    dismissTimer = setTimeout(() => {
      clearTimers();
      ctx.ui.setWidget(widgetKey, undefined);
    }, opts.dismissAfterMs);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    clearTimers();
    ctx.ui.setWidget(widgetKey, undefined);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearTimers();
    if (ctx.mode === "tui") ctx.ui.setWidget(widgetKey, undefined);
  });
}

function displaySessionCwd(cwd: string): string {
  return basename(cwd) || "~";
}

async function collectWelcomeData(pi: ExtensionAPI, ctx: ExtensionContext): Promise<WelcomeData> {
  const modelId: string = ctx.model?.id ?? ctx.model?.name ?? "model";
  const provider = modelId.includes("/") ? modelId.split("/")[0]! : "";
  const modelLabel = modelId.includes("/") ? modelId.split("/").pop()! : modelId;

  // Best-effort recent-sessions lookup. SessionManager.listAll is a static
  // method on the agent's session-manager module; guard everything so
  // missing-export errors don't break the welcome overlay.
  let recentSessions: WelcomeData["recentSessions"];
  try {
    const mod: any = await import("@earendil-works/pi-coding-agent");
    if (mod?.SessionManager?.listAll) {
      const all = await mod.SessionManager.listAll();
      const now = Date.now();
      recentSessions = (all as any[])
        .filter((s) => typeof s?.cwd === "string")
        .sort((a, b) => (b?.lastActivityAt ?? 0) - (a?.lastActivityAt ?? 0))
        .slice(0, 3)
        .map((s) => ({
          cwd: displaySessionCwd(s.cwd),
          relative: formatRelativeTime(now - (s.lastActivityAt ?? now)),
        }));
    }
  } catch {
    recentSessions = undefined;
  }

  return {
    greeting: ctx.cwd ? "Welcome back!" : "Welcome!",
    modelLabel,
    modelProvider: provider,
    contextFiles: undefined,
    extensions: undefined,
    skills: undefined,
    mcpServers: undefined,
    recentSessions,
  };
}
