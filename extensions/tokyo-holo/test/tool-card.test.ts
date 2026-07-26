import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { resolveGlyphs } from "../src/glyphs.ts";
import { DEFAULT_MIN_WIDTH, renderCollapsedToolGroup, renderExpandedToolCard } from "../src/tool-card.ts";
import type { ToolSummary } from "../src/tool-summaries.ts";

const widths = [1, 8, 20, 24, 36, 60, 88, 120];
const ansi = "\x1b[36mread\x1b[39m docs/themes.md · 200 lines";

const itemSets: string[][] = [
  [],
  ["read docs/themes.md · 200 lines"],
  ["read docs/themes.md · 200 lines", "ran npm test · 12s · ok"],
  [
    "read docs/themes.md · 200 lines",
    "listed examples/extensions · 14 entries",
    "listed src/theme · 6 files",
    "ran npm test · 12s · ok",
  ],
  Array.from({ length: 10 }, (_, i) => `read very/long/path/to/file-${i}.ts · ${i + 1} lines`),
  ["read src/コンポーネント/東京.ts · 12 lines", "ran echo 你好世界 · ok"],
  [ansi, "ran npm run test -- --watch=false · 1.2s · ok"],
  ["ran npm run test -- --watch=false · ok"],
];

test("expanded tool card never exceeds requested width", () => {
  for (const width of widths) {
    for (const items of itemSets) {
      const lines = renderExpandedToolCard(items, { width });
      assert.ok(lines.length >= 1, `expected at least one line for width ${width}`);
      for (const line of lines) {
        assert.ok(visibleWidth(line) <= width, `line width ${visibleWidth(line)} > ${width}: ${line}`);
        assert.notEqual(line, "", "no generated blank lines");
      }
    }
  }
});

test("expanded tool card preserves asymmetric frame grammar", () => {
  for (const width of widths.filter((w) => w >= DEFAULT_MIN_WIDTH)) {
    for (const items of itemSets.filter((set) => set.length > 0)) {
      const lines = renderExpandedToolCard(items, { width });
      const lineWidths = lines.map(visibleWidth);
      assert.ok(lineWidths.every((w) => w === lineWidths[0]), `non-uniform widths at width ${width}`);
      assert.equal(lines.length, items.length + 1);
      assert.match(lines[0]!, /^╭ tools · \d+ /);
      assert.ok(lines[0]!.endsWith("╮"));
      assert.ok(lines.at(-1)!.startsWith("╰ "));
      assert.ok(lines.at(-1)!.endsWith("╯"));
      if (items.length > 1) {
        for (const middle of lines.slice(1, -1)) {
          assert.ok(middle.startsWith("│ "));
          assert.ok(middle.endsWith(" │"));
        }
      }
    }
  }
});

test("expanded card preserves ANSI content (strip yields the same as plain at same width)", () => {
  const ansiItem = "\x1b[31mfailed\x1b[39m: src/a.ts";
  const plainItem = "failed: src/a.ts";
  const ansi = renderExpandedToolCard([ansiItem], { width: 60 });
  const plain = renderExpandedToolCard([plainItem], { width: 60 });
  const strip = (s: string) => s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  assert.equal(ansi.length, plain.length);
  for (let i = 0; i < ansi.length; i++) {
    assert.equal(strip(ansi[i]!), strip(plain[i]!));
  }
});

test("generated top rail uses solid box rail, never ASCII hyphen filler", () => {
  const lines = renderExpandedToolCard(["ran npm run test -- --watch=false · ok"], { width: 60 });
  assert.ok(lines[0]!.includes("─"));
  assert.equal(lines[0]!.includes("-"), false);
});

test("expanded tool card wraps frame chars in styleFrame and body in styleBody (sentinel callbacks)", () => {
  const F = (s: string) => `<F:${s}:F>`;
  const B = (s: string) => `<B:${s}:B>`;
  const lines = renderExpandedToolCard(["read a.ts · 1 line", "ran npm test · ok"], {
    width: 60,
    styles: { frame: F, body: B },
  });
  const joined = lines.join("\n");
  // Each frame corner appears exactly once, wrapped.
  for (const corner of ["╭", "╮", "╰", "╯"]) {
    const matches = joined.match(new RegExp(`<F:${corner}:F>`, "g")) ?? [];
    assert.equal(matches.length, 1, `corner ${corner} should be wrapped in styleFrame exactly once`);
  }
  // Side wall │ appears wrapped per middle row.
  const wallMatches = joined.match(/<F:│:F>/g) ?? [];
  assert.ok(wallMatches.length >= 2, `expected ≥2 wrapped │ wall chars, got ${wallMatches.length}`);
  // Rail filler is wrapped frame-side too.
  assert.match(joined, /<F:[─]+:F>/);
  // Body content lives inside <B:...:B> wrappers.
  assert.match(joined, /<B: tools · 2 :B>/);
  assert.match(joined, /<B:[^>]*read a\.ts · 1 line[^>]*:B>/);
});

test("collapsed tool group is concise and width-safe", () => {
  const glyphs = resolveGlyphs("unicode");
  const summaries: ToolSummary[] = [
    {
      toolCallId: "1",
      toolName: "read",
      kind: "read",
      label: "read",
      state: "success",
      primary: "a.ts",
      shortLine: "read a.ts · 1 line",
      groupNoun: "file",
      order: 0,
    },
    {
      toolCallId: "2",
      toolName: "ls",
      kind: "ls",
      label: "listed",
      state: "success",
      primary: "src",
      shortLine: "listed src · 4 entries",
      groupNoun: "dir",
      order: 1,
    },
    {
      toolCallId: "3",
      toolName: "bash",
      kind: "bash",
      label: "ran",
      state: "success",
      primary: "npm test",
      shortLine: "ran npm test · ok",
      groupNoun: "cmd",
      order: 2,
    },
  ];

  const line = renderCollapsedToolGroup(summaries, { width: 38, glyphs });
  assert.ok(visibleWidth(line) <= 38);
  assert.match(line, /^∙ read 1 file, listed 1 dir, ran 1 cmd/);
});
