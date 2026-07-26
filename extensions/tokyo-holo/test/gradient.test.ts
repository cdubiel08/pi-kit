import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCENT_PALETTE,
  HOLO_PALETTE,
  LOGO_PALETTE,
  gradientLine,
  gradientLines,
  gradientStops,
  lerpRgb,
  shimmerCellColor,
  type Rgb,
} from "../src/gradient.ts";

test("lerpRgb boundary cases", () => {
  const a: Rgb = [0, 0, 0];
  const b: Rgb = [200, 100, 50];
  assert.deepEqual(lerpRgb(a, b, 0), [0, 0, 0]);
  assert.deepEqual(lerpRgb(a, b, 1), [200, 100, 50]);
  assert.deepEqual(lerpRgb(a, b, 0.5), [100, 50, 25]);
});

test("gradientStops returns n monotonically walking colors", () => {
  const colors = gradientStops(HOLO_PALETTE, 5);
  assert.equal(colors.length, 5);
  assert.deepEqual(colors[0], HOLO_PALETTE[0]!.color);
  assert.deepEqual(colors[4], HOLO_PALETTE.at(-1)!.color);
  // Distinct adjacent colors.
  for (let i = 1; i < colors.length; i++) {
    assert.notDeepEqual(colors[i], colors[i - 1], `stop ${i} should differ from ${i - 1}`);
  }
});

test("gradientLine preserves ANSI escapes around each visible char", () => {
  const input = "\x1b[1mabc\x1b[22m";
  const out = gradientLine(input, HOLO_PALETTE);
  // Three SGR true-color runs for a/b/c.
  const sgrMatches = out.match(/\x1b\[38;2;\d+;\d+;\d+m/g) ?? [];
  assert.equal(sgrMatches.length, 3);
  // Bold markers still present, in order.
  const boldOn = out.indexOf("\x1b[1m");
  const boldOff = out.indexOf("\x1b[22m");
  assert.notEqual(boldOn, -1);
  assert.notEqual(boldOff, -1);
  assert.ok(boldOn < boldOff);
  // Characters appear in original order.
  const stripped = out.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  assert.equal(stripped, "abc");
});

test("gradientLines applies per-line vertical color under LOGO_PALETTE", () => {
  const lines = ["##", "##", "##"];
  const out = gradientLines(lines, LOGO_PALETTE);
  assert.equal(out.length, 3);
  // Pull the first SGR color from each line and confirm they differ.
  const firstColor = (s: string) => s.match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/)?.slice(1).map(Number).join(",");
  const c0 = firstColor(out[0]!);
  const c1 = firstColor(out[1]!);
  const c2 = firstColor(out[2]!);
  assert.notEqual(c0, undefined);
  assert.notEqual(c1, undefined);
  assert.notEqual(c2, undefined);
  assert.notEqual(c0, c1);
  assert.notEqual(c1, c2);
});

test("shimmerCellColor: pos < 0 returns idle stop", () => {
  const idle: { position: number; color: Rgb }[] = [
    { position: 0, color: [10, 20, 30] },
    { position: 1, color: [10, 20, 30] },
  ];
  assert.deepEqual(shimmerCellColor(3, 8, -1, 5, idle), [10, 20, 30]);
});

test("shimmerCellColor: distance >= shimmerWidth returns idle", () => {
  const idle: { position: number; color: Rgb }[] = [
    { position: 0, color: [10, 20, 30] },
    { position: 1, color: [10, 20, 30] },
  ];
  // pos=0, i=10, shimmerWidth=5 → distance 10 > 5
  assert.deepEqual(shimmerCellColor(10, 16, 0, 5, idle), [10, 20, 30]);
});

test("shimmerCellColor: distance 0 returns highlight (white) blended fully", () => {
  const idle: { position: number; color: Rgb }[] = [
    { position: 0, color: [0, 0, 0] },
    { position: 1, color: [0, 0, 0] },
  ];
  const color = shimmerCellColor(4, 16, 4, 5, idle);
  // t=1 → fully white highlight
  assert.deepEqual(color, [255, 255, 255]);
});

test("shimmerCellColor: pulse overrides everything", () => {
  const idle: { position: number; color: Rgb }[] = [{ position: 0, color: [10, 20, 30] }];
  assert.deepEqual(shimmerCellColor(3, 8, -1, 5, idle, [255, 0, 0]), [255, 0, 0]);
});

test("ACCENT_PALETTE has at least 2 stops", () => {
  assert.ok(ACCENT_PALETTE.length >= 2);
});
