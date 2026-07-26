import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { CHIP_SEPARATOR, composeChipLine, layoutChips, type Chip } from "../src/chip-rail.ts";

const sample: Chip[] = [
  { id: "pi", icon: "π", value: "", priority: 100, style: "gradient" },
  { id: "cwd", icon: "~/", value: "projects/pi-tokyo-holo", priority: 30, style: "muted" },
  { id: "branch", icon: "", label: "main", value: "", priority: 40, style: "violet" },
  { id: "model", icon: "✦", value: "qwen3.6-27b · xhigh", priority: 80, style: "aqua" },
  { id: "ctx", icon: "▰", value: "6%", priority: 60, style: "accent" },
  { id: "status", icon: "●", value: "working", priority: 20, style: "accent" },
];

test("layoutChips drops in priority order when over budget", () => {
  // Pick a width that only fits ~3 chips.
  const fitted = layoutChips(sample, 30);
  const kept = fitted.map((c) => c.id);
  // pi (100) and model (80) must always survive.
  assert.ok(kept.includes("pi"), "pi must survive");
  assert.ok(kept.includes("model"), "model must survive");
  // Lowest priority (status=20, cwd=30) drops first.
  assert.equal(kept.includes("status"), false, "status (lowest priority) dropped");
});

test("layoutChips returns the full set when width is generous", () => {
  const fitted = layoutChips(sample, 300);
  assert.equal(fitted.length, sample.length);
});

test("layoutChips never drops below the highest-priority chip alone", () => {
  const fitted = layoutChips(sample, 1);
  assert.equal(fitted.length, 1);
  assert.equal(fitted[0]!.priority, 100);
});

test("composeChipLine produces text with separators between chips", () => {
  const fitted = layoutChips(sample.slice(0, 3), 200);
  const line = composeChipLine(fitted, (_style, text) => text);
  const sepCount = (line.match(/❯/g) ?? []).length;
  assert.equal(sepCount, fitted.length - 1);
});

test("composeChipLine wraps each chip via the styler", () => {
  const fitted = layoutChips(sample.slice(0, 3), 200);
  const line = composeChipLine(fitted, (style, text) => `<${style}:${text}>`);
  for (const chip of fitted) {
    assert.ok(line.includes(`<${chip.style}:`), `missing style for ${chip.id}`);
  }
  // Separator uses muted style for visible, but not dominant, rail contrast.
  assert.ok(line.includes(`<muted:${CHIP_SEPARATOR}>`));
});

test("composeChipLine supports per-segment chip styling", () => {
  const line = composeChipLine([
    {
      id: "model",
      value: "",
      priority: 1,
      style: "text",
      segments: [
        { text: "⬡", style: "pink" },
        { text: " GPT-5.3", style: "pink" },
        { text: " · ", style: "muted" },
        { text: "xhigh", style: "error" },
        { text: " ", style: "muted" },
        { text: "¤", style: "muted" },
        { text: "↓", style: "muted" },
        { text: "42", style: "blue" },
      ],
    },
  ], (style, text) => `<${style}:${text}>`);
  assert.equal(line, "<pink:⬡><pink: GPT-5.3><muted: · ><error:xhigh><muted: ><muted:¤><muted:↓><blue:42>");
});

test("composeChipLine + visibleWidth stays within budget at widths 40/60/80/120", () => {
  for (const width of [40, 60, 80, 120]) {
    const fitted = layoutChips(sample, width);
    const line = composeChipLine(fitted, (_style, text) => text);
    assert.ok(visibleWidth(line) <= width, `width ${width}: got ${visibleWidth(line)} for line "${line}"`);
  }
});
