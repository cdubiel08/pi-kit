import test from "node:test";
import assert from "node:assert/strict";
import { installToolGroupEvents, ToolGroupState } from "../src/tool-group-state.ts";

const textResult = (text: string, details?: unknown) => ({ content: [{ type: "text", text }], details });

test("tool group state keeps source order and leader/follower roles", () => {
  const groups = new ToolGroupState();
  groups.startTurn(1);
  groups.recordStart("a", "read", { path: "a.ts" }, 100);
  groups.recordStart("b", "ls", { path: "src" }, 200);
  groups.recordStart("c", "bash", { command: "npm test" }, 300);

  assert.equal(groups.getRole("a"), "leader");
  assert.equal(groups.getRole("b"), "follower");
  assert.equal(groups.getRole("c"), "follower");

  groups.recordEnd("c", "bash", textResult("ok"), false);
  groups.recordEnd("a", "read", textResult("one\ntwo"), false);
  groups.recordEnd("b", "ls", textResult("x.ts\ny.ts"), false);

  const summaries = groups.getSummariesForCall("a");
  assert.deepEqual(
    summaries.map((summary) => summary.toolCallId),
    ["a", "b", "c"],
  );
  assert.equal(summaries[0]!.shortLine, "read a.ts · 2 lines");
  assert.equal(summaries[1]!.shortLine, "listed src · 2 entries");
  assert.match(summaries[2]!.shortLine, /^ran npm test · (?:\d+(?:\.\d+)?s · )?ok$/);
});

test("single tools remain single until a sibling appears", () => {
  const groups = new ToolGroupState();
  groups.startTurn(2);
  groups.recordStart("only", "grep", { pattern: "x" }, 100);
  assert.equal(groups.getRole("only"), "single");
  groups.recordEnd("only", "grep", textResult("a.ts:1: x"), false);
  assert.equal(groups.getSummariesForCall("only").length, 1);
});

test("installToolGroupEvents triggers requestRender on the 1→2 batch transition", async () => {
  const handlers = new Map<string, (event: any, ctx: any) => Promise<void>>();
  const fakePi = {
    on(name: string, handler: (event: any, ctx: any) => Promise<void>) {
      handlers.set(name, handler);
    },
  };
  const groups = new ToolGroupState();
  let renderCalls = 0;
  const runtime = { requestRender: () => void renderCalls++ };
  installToolGroupEvents(fakePi as any, groups, runtime);

  const ctx = { mode: "tui" };
  await handlers.get("turn_start")!({ turnIndex: 1 }, ctx);
  await handlers.get("tool_execution_start")!({ toolCallId: "a", toolName: "read", args: { path: "a.ts" } }, ctx);
  assert.equal(renderCalls, 0, "single-tool start should not trigger render");

  await handlers.get("tool_execution_start")!({ toolCallId: "b", toolName: "read", args: { path: "b.ts" } }, ctx);
  assert.equal(renderCalls, 1, "1→2 transition should trigger exactly one render");

  // Subsequent joiners still need reflows so the `tools · N` count stays accurate.
  await handlers.get("tool_execution_start")!({ toolCallId: "c", toolName: "read", args: { path: "c.ts" } }, ctx);
  assert.ok(renderCalls >= 2, "later follower joins also reflow");

  const before = renderCalls;
  await handlers.get("tool_execution_end")!({
    toolCallId: "a", toolName: "read", isError: false,
    result: { content: [{ type: "text", text: "x" }] },
  }, ctx);
  assert.equal(renderCalls, before + 1, "tool_execution_end nudges render so pending→final flips");
});

test("follower roles remain stable after endTurn finalizes the batch", () => {
  const groups = new ToolGroupState();
  groups.startTurn(3);
  groups.recordStart("p", "read", { path: "a.ts" }, 100);
  groups.recordStart("q", "read", { path: "b.ts" }, 200);
  groups.recordStart("r", "read", { path: "c.ts" }, 300);
  groups.recordEnd("p", "read", textResult("a"), false);
  groups.recordEnd("q", "read", textResult("b"), false);
  groups.recordEnd("r", "read", textResult("c"), false);
  groups.endTurn(3);

  assert.equal(groups.getRole("p"), "leader");
  assert.equal(groups.getRole("q"), "follower");
  assert.equal(groups.getRole("r"), "follower");
  assert.equal(groups.getBatchSizeForCall("p"), 3);
  assert.equal(groups.getSummariesForCall("p").length, 3);
});
