import test from "node:test";
import assert from "node:assert/strict";
import { abbreviateModel, formatModelLabel } from "../src/model-label.ts";

test("returns 'model' for undefined / empty", () => {
  assert.equal(abbreviateModel(undefined), "model");
  assert.equal(abbreviateModel(""), "model");
});

test("strips mlx-local provider prefix and quantization", () => {
  assert.equal(abbreviateModel("mlx-local/qwen3.6-27b-8bit"), "qwen3.6-27b");
});

test("strips openai-codex provider prefix", () => {
  assert.equal(abbreviateModel("openai-codex/gpt-5.5"), "gpt-5.5");
});

test("formats GPT labels like the reference prompt", () => {
  assert.equal(
    formatModelLabel({ id: "gpt-5.3", name: "gpt-5.3", provider: "openai-codex", api: "openai-codex-responses" }),
    "GPT-5.3",
  );
  assert.equal(formatModelLabel({ id: "gpt-5.5", name: "gpt-5.5", provider: "openai" }), "GPT-5.5");
});

test("preserves GPT-5.6 Sol, Terra, and Luna variant tails", () => {
  assert.equal(
    formatModelLabel({ id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai-codex" }),
    "GPT-5.6 Sol",
  );
  assert.equal(
    formatModelLabel({ id: "gpt-5.6-terra", provider: "openai-codex" }),
    "GPT-5.6 Terra",
  );
  assert.equal(
    formatModelLabel({ id: "gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "openai-codex" }),
    "GPT-5.6 Luna",
  );
});

test("collapses claude-sonnet-4-5-<date> to 'sonnet'", () => {
  assert.equal(abbreviateModel("claude-sonnet-4-5-20251022"), "sonnet");
  assert.equal(abbreviateModel("claude-sonnet-4-6"), "sonnet");
});

test("collapses claude-opus-4-N to 'opus'", () => {
  assert.equal(abbreviateModel("claude-opus-4-5"), "opus");
  assert.equal(abbreviateModel("claude-opus-4-7"), "opus");
});

test("collapses claude-haiku-4-5 to 'haiku'", () => {
  assert.equal(abbreviateModel("claude-haiku-4-5-20251001"), "haiku");
});

test("qwen2.5-72b-instruct → qwen2.5-72b", () => {
  assert.equal(abbreviateModel("qwen2.5-72b-instruct"), "qwen2.5-72b");
});

test("qwen3.6-27b-8bit → qwen3.6-27b", () => {
  assert.equal(abbreviateModel("qwen3.6-27b-8bit"), "qwen3.6-27b");
});

test("unknown models fall through with -latest / dated suffix stripped", () => {
  assert.equal(abbreviateModel("anything-latest"), "anything");
  assert.equal(abbreviateModel("foo-20251212"), "foo");
});
