// Holographic gradient utilities.
//
// All functions are pure — no `Date.now()` reads inside. Callers pass the
// shimmer position so animation timing stays in the prompt-rail/welcome layer.

export type Rgb = readonly [number, number, number];

export interface GradientStop {
  position: number; // 0..1
  color: Rgb;
}

const ANSI_REGEX = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][\s\S]*?(?:\x07|\x1b\\)|\x1b_[\s\S]*?\x1b\\/y;

function clamp01(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function sgr(rgb: Rgb): string {
  return `\x1b[38;2;${clampByte(rgb[0])};${clampByte(rgb[1])};${clampByte(rgb[2])}m`;
}

const SGR_RESET_FG = "\x1b[39m";

export function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k] as const;
}

function colorAtPosition(stops: GradientStop[], pos: number): Rgb {
  if (stops.length === 0) return [255, 255, 255];
  if (stops.length === 1) return stops[0]!.color;
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const p = clamp01(pos);
  if (p <= sorted[0]!.position) return sorted[0]!.color;
  if (p >= sorted.at(-1)!.position) return sorted.at(-1)!.color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i]!;
    const hi = sorted[i + 1]!;
    if (p >= lo.position && p <= hi.position) {
      const span = hi.position - lo.position || 1;
      return lerpRgb(lo.color, hi.color, (p - lo.position) / span);
    }
  }
  return sorted.at(-1)!.color;
}

export function gradientStops(stops: GradientStop[], n: number): Rgb[] {
  if (n <= 0) return [];
  if (n === 1) return [colorAtPosition(stops, 0.5)];
  const out: Rgb[] = [];
  for (let i = 0; i < n; i++) {
    out.push(colorAtPosition(stops, i / (n - 1)));
  }
  return out;
}

// Tokenize a string into a flat list of ANSI escape sequences (passthrough)
// and visible grapheme-ish characters (where one entry covers one display cell
// — close enough for the printable ASCII / common Unicode we care about).
type Token = { kind: "ansi"; value: string } | { kind: "char"; value: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    ANSI_REGEX.lastIndex = i;
    const match = ANSI_REGEX.exec(text);
    if (match && match.index === i) {
      tokens.push({ kind: "ansi", value: match[0] });
      i += match[0].length;
      continue;
    }
    // Detect surrogate pair / multi-byte scalar.
    const code = text.codePointAt(i)!;
    const ch = String.fromCodePoint(code);
    tokens.push({ kind: "char", value: ch });
    i += ch.length;
  }
  return tokens;
}

function countVisible(tokens: Token[]): number {
  let n = 0;
  for (const t of tokens) if (t.kind === "char") n++;
  return n;
}

export function gradientLine(text: string, stops: GradientStop[]): string {
  const tokens = tokenize(text);
  const visible = countVisible(tokens);
  if (visible === 0) return text;
  const colors = gradientStops(stops, visible);
  let out = "";
  let visIdx = 0;
  for (const t of tokens) {
    if (t.kind === "ansi") {
      out += t.value;
    } else {
      out += sgr(colors[visIdx]!) + t.value + SGR_RESET_FG;
      visIdx++;
    }
  }
  return out;
}

export function gradientLines(
  lines: string[],
  stops: GradientStop[],
  options?: { horizontal?: GradientStop[] },
): string[] {
  if (lines.length === 0) return [];
  const verticals = gradientStops(stops, lines.length);
  return lines.map((line, i) => {
    if (options?.horizontal) {
      // Blend per cell: average the vertical slot color with the horizontal stop.
      const tokens = tokenize(line);
      const visible = countVisible(tokens);
      if (visible === 0) return line;
      const horiz = gradientStops(options.horizontal, visible);
      const v = verticals[i]!;
      let out = "";
      let idx = 0;
      for (const t of tokens) {
        if (t.kind === "ansi") {
          out += t.value;
        } else {
          const h = horiz[idx]!;
          const blended: Rgb = [(v[0] + h[0]) / 2, (v[1] + h[1]) / 2, (v[2] + h[2]) / 2];
          out += sgr(blended) + t.value + SGR_RESET_FG;
          idx++;
        }
      }
      return out;
    }
    return gradientLine(line, [{ position: 0, color: verticals[i]! }, { position: 1, color: verticals[i]! }]);
  });
}

export function shimmerCellColor(
  i: number,
  total: number,
  pos: number,
  shimmerWidth: number,
  idleStops: GradientStop[],
  pulse?: Rgb,
): Rgb {
  if (pulse) return pulse;
  if (pos < 0 || total <= 0) return colorAtPosition(idleStops, total <= 1 ? 0 : i / (total - 1));
  const distance = Math.abs(i - pos);
  if (distance >= shimmerWidth) {
    return colorAtPosition(idleStops, total <= 1 ? 0 : i / (total - 1));
  }
  const idle = colorAtPosition(idleStops, total <= 1 ? 0 : i / (total - 1));
  const highlight: Rgb = [255, 255, 255];
  // Linear falloff: distance 0 → fully highlight, distance shimmerWidth-1 → fully idle.
  const t = 1 - distance / shimmerWidth;
  return lerpRgb(idle, highlight, t);
}

export const HOLO_PALETTE: GradientStop[] = [
  { position: 0.0, color: [245, 189, 230] }, // pink — visible at the left corner
  { position: 0.22, color: [198, 160, 246] }, // mauve
  { position: 0.48, color: [138, 173, 244] }, // blue — keeps the long rail from reading gray
  { position: 0.74, color: [139, 213, 202] }, // teal
  { position: 1.0, color: [245, 169, 127] }, // peach — visible at the right corner
];

export const LOGO_PALETTE: GradientStop[] = [
  { position: 0.0, color: [245, 189, 230] }, // pink
  { position: 0.48, color: [245, 224, 220] }, // rosewater / cream
  { position: 1.0, color: [166, 218, 149] }, // green mint
];

export const ACCENT_PALETTE: GradientStop[] = [
  { position: 0.0, color: [245, 169, 127] }, // peach
  { position: 0.5, color: [183, 189, 248] }, // lavender
  { position: 1.0, color: [139, 213, 202] }, // teal
];
