import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, getLastConfigError, loadConfig } from "../src/config.ts";

function withTempConfig(content?: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "tokyo-holo-cfg-"));
  const path = join(dir, "tokyo-holo.config.json");
  if (content !== undefined) writeFileSync(path, content);
  return { dir, path };
}

test("loadConfig returns defaults when no file exists", () => {
  const { dir, path } = withTempConfig();
  try {
    const cfg = loadConfig({ globalPath: path });
    assert.deepEqual(cfg, DEFAULT_CONFIG);
    assert.equal(getLastConfigError(), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig applies global overrides", () => {
  const { dir, path } = withTempConfig(
    JSON.stringify({ glyphMode: "ascii", maxToolCardWidth: 60, welcomeOverlay: "never" }),
  );
  try {
    const cfg = loadConfig({ globalPath: path });
    assert.equal(cfg.glyphMode, "ascii");
    assert.equal(cfg.maxToolCardWidth, 60);
    assert.equal(cfg.welcomeOverlay, "never");
    assert.equal(getLastConfigError(), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig records lastConfigError on malformed JSON and falls back to defaults", () => {
  const { dir, path } = withTempConfig("{ bad json");
  try {
    const cfg = loadConfig({ globalPath: path });
    assert.deepEqual(cfg, DEFAULT_CONFIG);
    const err = getLastConfigError();
    assert.notEqual(err, undefined);
    assert.match(err!, /tokyo-holo\.config\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig clears lastConfigError on the next successful load", () => {
  const bad = withTempConfig("{ bad");
  const good = withTempConfig(JSON.stringify({ glyphMode: "unicode" }));
  try {
    loadConfig({ globalPath: bad.path });
    assert.notEqual(getLastConfigError(), undefined);
    loadConfig({ globalPath: good.path });
    assert.equal(getLastConfigError(), undefined);
  } finally {
    rmSync(bad.dir, { recursive: true, force: true });
    rmSync(good.dir, { recursive: true, force: true });
  }
});
