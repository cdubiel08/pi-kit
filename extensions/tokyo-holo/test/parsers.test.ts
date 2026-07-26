import test from "node:test";
import assert from "node:assert/strict";
import { countDisplayLines, countEntries, countHits, hasTruncation, lineCountFromContent } from "../src/parsers.ts";

test("countHits: empty output → 0", () => {
  assert.equal(countHits(""), 0);
  assert.equal(countHits("   "), 0);
});

test("countHits: 'No matches found' notice → 0", () => {
  assert.equal(countHits("No matches found"), 0);
});

test("countHits: ripgrep style output counts colon-line patterns", () => {
  const rg = "src/a.ts:42: const x = 1\nsrc/b.ts:7: const y = 2";
  assert.equal(countHits(rg), 2);
});

test("countHits: truncation notice splits before counting", () => {
  const out = "src/a.ts:1: hit\nsrc/b.ts:2: hit\n\n[result limit reached]";
  assert.equal(countHits(out), 2);
});

test("countHits: falls back to non-empty line count when no ripgrep pattern", () => {
  assert.equal(countHits("file1\nfile2\nfile3"), 3);
});

test("countEntries: empty / sentinel outputs → 0", () => {
  assert.equal(countEntries(""), 0);
  assert.equal(countEntries("No files found matching pattern"), 0);
  assert.equal(countEntries("(empty directory)"), 0);
});

test("countEntries: counts non-empty trimmed lines, stops before truncation notice", () => {
  assert.equal(countEntries("a.ts\nb.ts\nc.ts\n\n[truncated 17 more entries]"), 3);
});

test("lineCountFromContent: empty / short content", () => {
  assert.equal(lineCountFromContent(""), 0);
  assert.equal(lineCountFromContent("one"), 1);
});

test("lineCountFromContent: stops before truncation notice", () => {
  assert.equal(lineCountFromContent("one\ntwo\nthree\n\n[trimmed 5 lines]"), 3);
});

test("countDisplayLines: counts non-empty lines, ignores notice trailer", () => {
  // Splits at the '\n\n[' delimiter, leaving "a\n\nb" → 2 non-empty lines.
  assert.equal(countDisplayLines("a\n\nb\n\n[notice]"), 2);
  assert.equal(countDisplayLines("only one line"), 1);
});

test("hasTruncation: detects truncation flags in details object", () => {
  assert.equal(hasTruncation({}), false);
  assert.equal(hasTruncation({ linesTruncated: true }), true);
  assert.equal(hasTruncation({ matchLimitReached: true }), true);
  assert.equal(hasTruncation({ entryLimitReached: true }), true);
  assert.equal(hasTruncation({ truncation: { truncated: true } }), true);
  assert.equal(hasTruncation({ truncation: { truncated: false } }), false);
});
