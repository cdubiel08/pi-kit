import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { DEFAULT_RAIL, type GlyphSet } from "./glyphs.ts";
import type { ToolSummary } from "./tool-summaries.ts";
import { summarizeToolGroup, worstState } from "./tool-summaries.ts";

export interface ToolCardStyles {
  // Applied to every frame character: ╭ ╮ ╰ ╯ │ and the rail glyph.
  frame?: (s: string) => string;
  // Applied to body text: title, item content, padding spaces between frames.
  body?: (s: string) => string;
}

export interface ToolCardOptions {
  width: number;
  maxWidth?: number;
  minWidth?: number;
  title?: string;
  rail?: string;
  ellipsis?: string;
  styles?: ToolCardStyles;
}

export const DEFAULT_MIN_WIDTH = 24;
export const DEFAULT_MAX_WIDTH = 88;
const MIN_TOP_RAIL = 4;
const MIN_LAST_RAIL = 1;
const DEFAULT_ELLIPSIS = "…";

const identity = (s: string) => s;

function repeatToWidth(pattern: string, width: number): string {
  if (width <= 0) return "";
  const patternWidth = Math.max(1, visibleWidth(pattern));
  const full = Math.floor(width / patternWidth);
  const remainder = width - full * patternWidth;
  return pattern.repeat(full) + (remainder > 0 ? truncateToWidth(pattern, remainder, "") : "");
}

function fitLine(line: string, width: number, ellipsis: string): string {
  return truncateToWidth(line, Math.max(1, width), ellipsis);
}

export function renderExpandedToolCard(items: string[], options: ToolCardOptions): string[] {
  const safeWidth = Math.max(1, Math.floor(options.width));
  const title = options.title ?? "tools";
  const rail = options.rail ?? DEFAULT_RAIL;
  const ellipsis = options.ellipsis ?? DEFAULT_ELLIPSIS;
  const F = options.styles?.frame ?? identity;
  const B = options.styles?.body ?? identity;

  if (items.length === 0) {
    return [fitLine(`${B("∙")} ${B(`${title} · 0`)}`, safeWidth, ellipsis)];
  }

  if (safeWidth < DEFAULT_MIN_WIDTH) {
    return [fitLine(`${B("∙")} ${B(`${title} · ${items.length}`)}`, safeWidth, ellipsis)];
  }

  const maxWidth = Math.min(options.maxWidth ?? DEFAULT_MAX_WIDTH, safeWidth);
  const minWidth = Math.min(options.minWidth ?? DEFAULT_MIN_WIDTH, maxWidth);

  const titleBody = ` ${title} · ${items.length} `;
  const topMin = visibleWidth("╭") + visibleWidth(titleBody) + MIN_TOP_RAIL + visibleWidth("╮");

  const middleMin =
    items.length > 1
      ? Math.max(
          ...items.slice(0, -1).map((item) => visibleWidth("│ ") + visibleWidth(item) + visibleWidth(" │")),
        )
      : 0;

  const last = items.at(-1) ?? "";
  const lastMin = visibleWidth("╰ ") + visibleWidth(last) + MIN_LAST_RAIL + visibleWidth("╯");

  const naturalWidth = Math.max(minWidth, topMin, middleMin, lastMin);
  const W = Math.max(1, Math.min(maxWidth, naturalWidth));

  const lines: string[] = [];

  const topRailWidth = Math.max(1, W - visibleWidth("╭") - visibleWidth(titleBody) - visibleWidth("╮"));
  lines.push(F("╭") + B(titleBody) + F(repeatToWidth(rail, topRailWidth)) + F("╮"));

  for (const item of items.slice(0, -1)) {
    const prefix = "│ ";
    const suffix = " │";
    const bodyW = Math.max(1, W - visibleWidth(prefix) - visibleWidth(suffix));
    const body = truncateToWidth(item, bodyW, ellipsis);
    const pad = " ".repeat(Math.max(0, bodyW - visibleWidth(body)));
    lines.push(F("│") + B(" " + body + pad + " ") + F("│"));
  }

  const lastPrefix = "╰ ";
  const lastSuffix = "╯";
  const available = Math.max(1, W - visibleWidth(lastPrefix) - visibleWidth(lastSuffix) - MIN_LAST_RAIL);
  const body = truncateToWidth(last, available, ellipsis);
  const lastRailWidth = Math.max(
    MIN_LAST_RAIL,
    W - visibleWidth(lastPrefix) - visibleWidth(body) - visibleWidth(lastSuffix),
  );
  lines.push(F("╰") + B(" " + body) + F(repeatToWidth(rail, lastRailWidth)) + F("╯"));

  // fitLine is ANSI-aware via visibleWidth/truncateToWidth from pi-tui.
  return lines.map((line) => fitLine(line, safeWidth, ellipsis));
}

function prefixForState(items: ToolSummary[], glyphs: GlyphSet): string {
  switch (worstState(items)) {
    case "error":
      return glyphs.error;
    case "warning":
    case "pending":
    case "success":
    default:
      return glyphs.quietSuccess;
  }
}

export function renderCollapsedToolGroup(
  items: ToolSummary[],
  options: { width: number; glyphs: GlyphSet; ellipsis?: string; styles?: ToolCardStyles },
): string {
  const safeWidth = Math.max(1, Math.floor(options.width));
  const ellipsis = options.ellipsis ?? DEFAULT_ELLIPSIS;
  const F = options.styles?.frame ?? identity;
  const B = options.styles?.body ?? identity;
  if (items.length === 0) {
    return truncateToWidth(`${F(options.glyphs.quietSuccess)} ${B("tools · 0")}`, safeWidth, ellipsis);
  }
  const body = summarizeToolGroup(items);
  return truncateToWidth(`${F(prefixForState(items, options.glyphs))} ${B(body)}`, safeWidth, ellipsis);
}
