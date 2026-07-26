export type GlyphMode = "auto" | "nerd" | "unicode" | "ascii";

export interface GlyphSet {
  pi: string;
  ai: string;
  io: string;
  ctx: string;
  folder: string;
  git: string;
  token: string;
  quietSuccess: string;
  success: string;
  error: string;
  rail: string;
  dot: string;
}

const UNICODE_GLYPHS: GlyphSet = {
  pi: "π",
  ai: "⬡",
  io: "⇅",
  ctx: "⛶",
  folder: "~/",
  git: "git:",
  token: "¤",
  quietSuccess: "∙",
  success: "✓",
  error: "‼",
  rail: "─",
  dot: "·",
};

const NERD_GLYPHS: GlyphSet = {
  ...UNICODE_GLYPHS,
  // Nerd Fonts Font Awesome Extension: fae-pi (U+E22C). Natural pi glyph,
  // not boxed; the prompt rail renders the logo segment bold.
  pi: "\uE22C",
  ai: "⬡",
  ctx: "\uf50c",
  folder: "",
  git: "",
  token: "\uede8",
};

const ASCII_GLYPHS: GlyphSet = {
  pi: "pi",
  ai: "ai",
  io: "io",
  ctx: "%",
  folder: "cwd",
  git: "git:",
  token: "$",
  quietSuccess: ".",
  success: "ok",
  error: "!!",
  rail: ".",
  dot: ".",
};

// G2/G3: env vars rarely expose the active font and KITTY_WINDOW_ID just
// tells you the terminal, not the font. The opt-in env var is the only
// reliable signal; everything else was guesswork. Conservative default:
// unicode, unless the user explicitly says PI_TOKYO_HOLO_NERD_FONT=1.
function looksLikeNerdFontTerminal(): boolean {
  return process.env.PI_TOKYO_HOLO_NERD_FONT === "1";
}

// Promote the rail glyph to a single source (TC6: tool-card.ts no longer
// owns a duplicate `const DEFAULT_RAIL`).
export const DEFAULT_RAIL = "─";

export function resolveGlyphs(mode: GlyphMode = "auto"): GlyphSet {
  switch (mode) {
    case "nerd":
      return { ...NERD_GLYPHS };
    case "unicode":
      return { ...UNICODE_GLYPHS };
    case "ascii":
      return { ...ASCII_GLYPHS };
    case "auto":
    default:
      return looksLikeNerdFontTerminal() ? { ...NERD_GLYPHS } : { ...UNICODE_GLYPHS };
  }
}
