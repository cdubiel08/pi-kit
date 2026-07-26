import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type ChipStyle =
  | "logo"
  | "accent"
  | "text"
  | "muted"
  | "dim"
  | "warning"
  | "error"
  | "gradient"
  | "violet"
  | "pink"
  | "aqua"
  | "blue"
  | "green";

export interface ChipSegment {
  text: string;
  style: ChipStyle;
}

export interface Chip {
  id: string;
  icon?: string;
  label?: string;
  value: string;
  segments?: ChipSegment[];
  // Higher priority = kept longer. Keep identity/model/context before status/noise.
  priority: number;
  style: ChipStyle;
}

export const CHIP_SEPARATOR = " ❯ ";

// Style each chip segment. Caller provides a styler that maps a ChipStyle to
// an ANSI-styled string. Keeps chip-rail.ts decoupled from any particular
// theme implementation so it can be tested with sentinel callbacks.
export type ChipStyler = (style: ChipStyle, text: string) => string;

function chipText(chip: Chip): string {
  if (chip.segments) return chip.segments.map((segment) => segment.text).join("");
  const parts: string[] = [];
  if (chip.icon) parts.push(chip.icon);
  if (chip.label) parts.push(chip.label);
  if (chip.value) parts.push(chip.value);
  return parts.join(" ").trim();
}

function renderChip(chip: Chip, style: ChipStyler): string {
  if (chip.segments) return chip.segments.map((segment) => style(segment.style, segment.text)).join("");
  return style(chip.style, chipText(chip));
}

export function chipVisibleWidth(chip: Chip): number {
  return visibleWidth(chipText(chip));
}

function totalLayoutWidth(chips: Chip[], sepWidth: number): number {
  if (chips.length === 0) return 0;
  const chipWidths = chips.reduce((sum, c) => sum + chipVisibleWidth(c), 0);
  return chipWidths + sepWidth * Math.max(0, chips.length - 1);
}

export function layoutChips(chips: Chip[], width: number): Chip[] {
  if (chips.length === 0) return [];
  const sepWidth = visibleWidth(CHIP_SEPARATOR);
  // Drop chips in ascending priority order until the layout fits.
  const ordered = [...chips];
  while (totalLayoutWidth(ordered, sepWidth) > width && ordered.length > 1) {
    // Find lowest-priority chip and remove it.
    let lowIdx = 0;
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i]!.priority < ordered[lowIdx]!.priority) lowIdx = i;
    }
    ordered.splice(lowIdx, 1);
  }
  return ordered;
}

export function composeChipLine(chips: Chip[], style: ChipStyler): string {
  if (chips.length === 0) return "";
  const sep = style("muted", CHIP_SEPARATOR);
  const parts: string[] = [];
  for (const chip of chips) {
    const text = chipText(chip);
    if (!text) continue;
    parts.push(renderChip(chip, style));
  }
  return parts.join(sep);
}

// Trim the composed line to a hard visible-width cap. ANSI-safe via truncateToWidth.
export function fitChipLine(line: string, width: number, ellipsis = "…"): string {
  return truncateToWidth(line, Math.max(1, width), ellipsis);
}
