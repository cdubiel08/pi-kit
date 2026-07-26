import type { ChipStyle } from "./chip-rail.ts";

export type StatusKind = "idle" | "working" | "ok" | "warn" | "error" | "info";

export interface StatusChip {
  kind: StatusKind;
  icon: string;
  label: string;
  ttlMs?: number;
}

// Map kind → chip style for the rail chip; same kind drives the footer color.
export function chipStyleForKind(kind: StatusKind): ChipStyle {
  switch (kind) {
    case "error": return "error";
    case "warn": return "warning";
    case "ok": return "green";
    case "working": return "accent";
    case "info": return "text";
    case "idle":
    default: return "dim";
  }
}

export interface ThemeLike {
  fg(color: string, text: string): string;
}

// Build a themed footer string for a given chip + theme. Pure — takes a
// theme-like with fg(color, text) and returns the styled text.
export function themedChip(chip: StatusChip, theme: ThemeLike): string {
  const color = themeColorForKind(chip.kind);
  const icon = chip.icon ? `${chip.icon} ` : "";
  return theme.fg(color, `${icon}${chip.label}`);
}

function themeColorForKind(kind: StatusKind): string {
  switch (kind) {
    case "error": return "error";
    case "warn": return "warning";
    case "ok": return "success";
    case "working": return "accent";
    case "info": return "muted";
    case "idle":
    default: return "dim";
  }
}

export interface StatusPushers {
  // Pushes the chip to the prompt rail. null clears.
  pushRail(chip: StatusChip | null): void;
  // Pushes a themed string to the footer (or undefined to clear).
  pushFooter(text: string | undefined): void;
  // Provides a theme to render the footer text. null if no UI yet.
  getTheme(): ThemeLike | null;
}

export class StatusSurface {
  private current: StatusChip | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pushers: StatusPushers;

  constructor(pushers: StatusPushers) {
    this.pushers = pushers;
  }

  get(): StatusChip | null {
    return this.current;
  }

  set(chip: StatusChip | null): void {
    this.clearTimer();
    this.current = chip;
    this.pushers.pushRail(chip);
    const theme = this.pushers.getTheme();
    if (chip && theme) this.pushers.pushFooter(themedChip(chip, theme));
    else this.pushers.pushFooter(undefined);
    if (chip?.ttlMs && chip.ttlMs > 0) {
      this.timer = setTimeout(() => {
        if (this.current === chip) this.set(null);
      }, chip.ttlMs);
    }
  }

  dispose(): void {
    this.clearTimer();
    this.current = null;
    this.pushers.pushRail(null);
    this.pushers.pushFooter(undefined);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
