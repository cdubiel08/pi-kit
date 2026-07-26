import test from "node:test";
import assert from "node:assert/strict";
import { resolveGlyphs } from "../src/glyphs.ts";

test("unicode glyphs are safe defaults", () => {
  const glyphs = resolveGlyphs("unicode");
  assert.equal(glyphs.pi, "π");
  assert.equal(glyphs.ai, "⬡");
  assert.equal(glyphs.ctx, "⛶");
  assert.equal(glyphs.folder, "~/");
  assert.equal(glyphs.git, "git:");
  assert.equal(glyphs.token, "¤");
  assert.equal(glyphs.error, "‼");
});

test("nerd glyph mode opts into richer folder and git glyphs", () => {
  const glyphs = resolveGlyphs("nerd");
  assert.equal(glyphs.pi, "\uE22C");
  assert.equal(glyphs.ai, "⬡");
  assert.equal(glyphs.ctx, "\uf50c");
  assert.equal(glyphs.folder, "");
  assert.equal(glyphs.git, "");
  assert.equal(glyphs.token, "\uede8");
  assert.equal(glyphs.quietSuccess, "∙");
});

test("ascii fallback remains readable", () => {
  const glyphs = resolveGlyphs("ascii");
  assert.equal(glyphs.pi, "pi");
  assert.equal(glyphs.ai, "ai");
  assert.equal(glyphs.token, "$");
  assert.equal(glyphs.quietSuccess, ".");
  assert.equal(glyphs.success, "ok");
  assert.equal(glyphs.error, "!!");
});
