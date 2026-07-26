import test from "node:test";
import assert from "node:assert/strict";
import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import { railGradientPosition, stripFakeEditorCursor } from "../src/prompt-rail.ts";

test("railGradientPosition keeps idle endpoints continuous", () => {
  assert.equal(railGradientPosition(0, 8, 0), 0);
  assert.equal(railGradientPosition(7, 8, 0), 1);
});

test("railGradientPosition wraps only when activity phase is non-zero", () => {
  assert.equal(railGradientPosition(0, 8, 0.25), 0.25);
  assert.equal(railGradientPosition(7, 8, 0.25), 0.25);
});

test("stripFakeEditorCursor preserves marker and removes reverse-video cell", () => {
  assert.equal(
    stripFakeEditorCursor(`> abc${CURSOR_MARKER}\x1b[7md\x1b[0mef`),
    `> abc${CURSOR_MARKER}def`,
  );
});

test("stripFakeEditorCursor keeps end-of-line cursor spacer for hardware cursor", () => {
  assert.equal(
    stripFakeEditorCursor(`> abc${CURSOR_MARKER}\x1b[7m \x1b[0m   `),
    `> abc${CURSOR_MARKER}    `,
  );
});
