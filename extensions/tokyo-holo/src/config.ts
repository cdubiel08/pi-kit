import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { GlyphMode } from "./glyphs.ts";

export type WelcomeOverlayMode = "auto" | "startup" | "always" | "never";

export interface TokyoHoloConfig {
  glyphMode: GlyphMode;
  compactTools: boolean;
  groupSequentialTools: boolean;
  maxToolCardWidth: number;
  shimmer: boolean;
  pulseOnSubmit: boolean;
  pulseOnToolReturn: boolean;
  hideDefaultFooter: boolean;
  hideDefaultWorkingIndicator: boolean;
  promptRail: boolean;
  hardwareBarCursor: boolean;
  welcomeOverlay: WelcomeOverlayMode;
  welcomeDismissMs: number;
  editPreview: boolean;
  editPreviewLines: number;
  editPreviewMaxWidth: number;
  editPreviewIndent: number;
}

export const DEFAULT_CONFIG: TokyoHoloConfig = {
  glyphMode: "auto",
  compactTools: false,
  groupSequentialTools: true,
  maxToolCardWidth: 88,
  shimmer: false,
  pulseOnSubmit: false,
  pulseOnToolReturn: false,
  hideDefaultFooter: false,
  hideDefaultWorkingIndicator: false,
  promptRail: true,
  hardwareBarCursor: false,
  welcomeOverlay: "auto",
  welcomeDismissMs: 5000,
  editPreview: true,
  editPreviewLines: 12,
  editPreviewMaxWidth: 100,
  editPreviewIndent: 2,
};

function welcomeOverlayOr(value: unknown, fallback: WelcomeOverlayMode): WelcomeOverlayMode {
  return value === "auto" || value === "startup" || value === "always" || value === "never" ? value : fallback;
}

function defaultGlobalConfigPath(): string {
  const configDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  return join(configDir, "tokyo-holo.config.json");
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

// C3: Math.round (not Math.floor) so 4.9 → 5 rather than 4. Clamped after rounding.
function numberOr(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function glyphModeOr(value: unknown, fallback: GlyphMode): GlyphMode {
  return value === "auto" || value === "nerd" || value === "unicode" || value === "ascii" ? value : fallback;
}

// C2: when JSON.parse fails we remember why so the /tokyo-holo command can
// tell the user instead of silently sticking with defaults.
let lastConfigError: string | undefined;
let resolvedConfigPath: string = defaultGlobalConfigPath();

export function getLastConfigError(): string | undefined {
  return lastConfigError;
}

function parseConfigOrThrow(path: string): Partial<TokyoHoloConfig> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  return {
    glyphMode: glyphModeOr(parsed.glyphMode, DEFAULT_CONFIG.glyphMode),
    compactTools: booleanOr(parsed.compactTools, DEFAULT_CONFIG.compactTools),
    groupSequentialTools: booleanOr(parsed.groupSequentialTools, DEFAULT_CONFIG.groupSequentialTools),
    maxToolCardWidth: numberOr(parsed.maxToolCardWidth, DEFAULT_CONFIG.maxToolCardWidth, 24, 160),
    shimmer: booleanOr(parsed.shimmer, DEFAULT_CONFIG.shimmer),
    pulseOnSubmit: booleanOr(parsed.pulseOnSubmit, DEFAULT_CONFIG.pulseOnSubmit),
    pulseOnToolReturn: booleanOr(parsed.pulseOnToolReturn, DEFAULT_CONFIG.pulseOnToolReturn),
    hideDefaultFooter: booleanOr(parsed.hideDefaultFooter, DEFAULT_CONFIG.hideDefaultFooter),
    hideDefaultWorkingIndicator: booleanOr(
      parsed.hideDefaultWorkingIndicator,
      DEFAULT_CONFIG.hideDefaultWorkingIndicator,
    ),
    promptRail: booleanOr(parsed.promptRail, DEFAULT_CONFIG.promptRail),
    hardwareBarCursor: booleanOr(parsed.hardwareBarCursor, DEFAULT_CONFIG.hardwareBarCursor),
    welcomeOverlay: welcomeOverlayOr(parsed.welcomeOverlay, DEFAULT_CONFIG.welcomeOverlay),
    welcomeDismissMs: numberOr(parsed.welcomeDismissMs, DEFAULT_CONFIG.welcomeDismissMs, 1000, 60000),
    editPreview: booleanOr(parsed.editPreview, DEFAULT_CONFIG.editPreview),
    editPreviewLines: numberOr(parsed.editPreviewLines, DEFAULT_CONFIG.editPreviewLines, 1, 80),
    editPreviewMaxWidth: numberOr(parsed.editPreviewMaxWidth, DEFAULT_CONFIG.editPreviewMaxWidth, 40, 180),
    editPreviewIndent: numberOr(parsed.editPreviewIndent, DEFAULT_CONFIG.editPreviewIndent, 0, 12),
  };
}

export interface LoadConfigOptions {
  // Override the global config path. Pass an empty string to disable config
  // lookup. Tests use this to avoid reading the developer's real config.
  globalPath?: string;
}

// Configuration is intentionally global-only. Reading project-local files
// during extension startup would happen before a project trust decision.
export function loadConfig(options: LoadConfigOptions = {}): TokyoHoloConfig {
  lastConfigError = undefined;
  const fallbackPath = defaultGlobalConfigPath();
  const path = options.globalPath !== undefined ? options.globalPath : fallbackPath;
  resolvedConfigPath = path || fallbackPath;
  if (!path || !existsSync(path)) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...parseConfigOrThrow(path) };
  } catch (err) {
    lastConfigError = `${path}: ${err instanceof Error ? err.message : String(err)}`;
    return { ...DEFAULT_CONFIG };
  }
}

export function getConfigPath(): string {
  return resolvedConfigPath;
}
