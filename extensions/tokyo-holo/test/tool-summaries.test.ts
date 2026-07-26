import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTool, summarizeToolGroup } from "../src/tool-summaries.ts";

const textResult = (text: string, details?: unknown) => ({ content: [{ type: "text", text }], details });

test("read summary uses path and line count", () => {
  const summary = summarizeTool({
    toolCallId: "r1",
    toolName: "read",
    args: { path: "docs/themes.md" },
    result: textResult("one\ntwo\nthree"),
  });
  assert.equal(summary.shortLine, "read docs/themes.md · 3 lines");
  assert.equal(summary.state, "success");
});

test("read summary detects image content", () => {
  const summary = summarizeTool({
    toolCallId: "r2",
    toolName: "read",
    args: { path: "screen.png" },
    result: { content: [{ type: "image", data: "abc", mimeType: "image/png" }], details: undefined },
  });
  assert.equal(summary.shortLine, "read screen.png · image");
});

test("bash summary formats success duration and error exit code", () => {
  const ok = summarizeTool({
    toolCallId: "b1",
    toolName: "bash",
    args: { command: "npm test" },
    result: textResult("(no output)"),
    startedAt: 1_000,
    endedAt: 13_000,
  });
  assert.equal(ok.shortLine, "ran npm test · 12s · ok");

  const failed = summarizeTool({
    toolCallId: "b2",
    toolName: "bash",
    args: { command: "npm test" },
    result: textResult("stderr line\n\nCommand exited with code 1"),
    isError: true,
  });
  assert.equal(failed.state, "error");
  assert.equal(failed.metric, "exit 1");
  assert.equal(failed.errorExcerpt, "stderr line");
});

test("edit summary computes unicode diff stats", () => {
  const summary = summarizeTool({
    toolCallId: "e1",
    toolName: "edit",
    args: { path: "src/foo.ts" },
    result: textResult("Successfully replaced", {
      diff: "--- a/src/foo.ts\n+++ b/src/foo.ts\n@@\n-old\n+new\n+line\n context",
    }),
  });
  assert.equal(summary.shortLine, "edited src/foo.ts · +2 −1");
});

test("write summary uses args content line count", () => {
  const summary = summarizeTool({
    toolCallId: "w1",
    toolName: "write",
    args: { path: "theme.json", content: "a\nb" },
    result: textResult("Successfully wrote 3 bytes"),
  });
  assert.equal(summary.shortLine, "wrote theme.json · 2 lines");
});

test("grep/find/ls summaries count hits and entries", () => {
  const grep = summarizeTool({
    toolCallId: "g1",
    toolName: "grep",
    args: { pattern: "toolPendingBg" },
    result: textResult("a.ts:1: toolPendingBg\nb.ts:2: toolPendingBg"),
  });
  assert.equal(grep.shortLine, "scanned \"toolPendingBg\" · 2 hits");

  const find = summarizeTool({
    toolCallId: "f1",
    toolName: "find",
    args: { pattern: "*.ts" },
    result: textResult("a.ts\nb.ts"),
  });
  assert.equal(find.shortLine, "listed *.ts · 2 files");

  const ls = summarizeTool({
    toolCallId: "l1",
    toolName: "ls",
    args: { path: "src" },
    result: textResult("a.ts\nsubdir/"),
  });
  assert.equal(ls.shortLine, "listed src · 2 entries");
});

test("truncation marks summary as warning", () => {
  const summary = summarizeTool({
    toolCallId: "g2",
    toolName: "grep",
    args: { pattern: "x" },
    result: textResult("a.ts:1: x\nb.ts:2: x", { truncation: { truncated: true } }),
  });
  assert.equal(summary.state, "warning");
  assert.equal(summary.shortLine, "scanned \"x\" · 2 hits · truncated");
});

test("group summary pluralizes in first occurrence order", () => {
  const items = [
    summarizeTool({ toolCallId: "1", toolName: "read", args: { path: "a" }, result: textResult("x"), order: 0 }),
    summarizeTool({ toolCallId: "2", toolName: "find", args: { pattern: "*.ts" }, result: textResult("a.ts"), order: 1 }),
    summarizeTool({ toolCallId: "3", toolName: "ls", args: { path: "src" }, result: textResult("b.ts"), order: 2 }),
    summarizeTool({ toolCallId: "4", toolName: "bash", args: { command: "npm test" }, result: textResult("ok"), order: 3 }),
  ];
  assert.equal(summarizeToolGroup(items), "read 1 file, listed 2 dirs, ran 1 cmd");
});
