import test from "node:test";
import assert from "node:assert/strict";
import { chipStyleForKind, StatusSurface, themedChip, type StatusChip, type ThemeLike } from "../src/status.ts";

const fakeTheme: ThemeLike = { fg: (color, text) => `<${color}:${text}>` };

function makeRecorder() {
  const railLog: (StatusChip | null)[] = [];
  const footerLog: (string | undefined)[] = [];
  return {
    railLog,
    footerLog,
    pushers: {
      pushRail(chip: StatusChip | null) {
        railLog.push(chip);
      },
      pushFooter(text: string | undefined) {
        footerLog.push(text);
      },
      getTheme() {
        return fakeTheme;
      },
    },
  };
}

test("StatusSurface set pushes to rail and footer", () => {
  const rec = makeRecorder();
  const surf = new StatusSurface(rec.pushers);
  surf.set({ kind: "working", icon: "●", label: "working" });
  assert.deepEqual(rec.railLog.at(-1), { kind: "working", icon: "●", label: "working" });
  assert.equal(rec.footerLog.at(-1), "<accent:● working>");
});

test("StatusSurface set null clears both", () => {
  const rec = makeRecorder();
  const surf = new StatusSurface(rec.pushers);
  surf.set({ kind: "working", icon: "●", label: "working" });
  surf.set(null);
  assert.equal(rec.railLog.at(-1), null);
  assert.equal(rec.footerLog.at(-1), undefined);
});

test("StatusSurface TTL auto-clears the chip", async () => {
  const rec = makeRecorder();
  const surf = new StatusSurface(rec.pushers);
  surf.set({ kind: "ok", icon: "●", label: "ready", ttlMs: 30 });
  assert.deepEqual(rec.railLog.at(-1)?.kind, "ok");
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(rec.railLog.at(-1), null, "TTL should auto-clear");
  assert.equal(rec.footerLog.at(-1), undefined);
});

test("StatusSurface replacement before TTL cancels prior timer", async () => {
  const rec = makeRecorder();
  const surf = new StatusSurface(rec.pushers);
  surf.set({ kind: "ok", icon: "●", label: "ready", ttlMs: 30 });
  // Replace before TTL fires.
  surf.set({ kind: "error", icon: "‼", label: "fail" });
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(rec.railLog.at(-1)?.kind, "error", "replacement should persist; old TTL ignored");
});

test("themedChip uses kind-mapped color", () => {
  assert.equal(themedChip({ kind: "error", icon: "‼", label: "fail" }, fakeTheme), "<error:‼ fail>");
  assert.equal(themedChip({ kind: "warn", icon: "▲", label: "trunc" }, fakeTheme), "<warning:▲ trunc>");
  assert.equal(themedChip({ kind: "ok", icon: "●", label: "ready" }, fakeTheme), "<success:● ready>");
  assert.equal(themedChip({ kind: "idle", icon: "·", label: "" }, fakeTheme), "<dim:· >");
});

test("chipStyleForKind maps each kind to a defined ChipStyle", () => {
  for (const kind of ["idle", "working", "ok", "warn", "error", "info"] as const) {
    const style = chipStyleForKind(kind);
    assert.ok(["logo", "accent", "text", "muted", "dim", "warning", "error", "violet", "pink", "aqua", "blue", "green", "gradient"].includes(style));
  }
});

test("dispose clears any pending timer and pushes nulls", async () => {
  const rec = makeRecorder();
  const surf = new StatusSurface(rec.pushers);
  surf.set({ kind: "ok", icon: "●", label: "ready", ttlMs: 30 });
  surf.dispose();
  const railLenAtDispose = rec.railLog.length;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(rec.railLog.length, railLenAtDispose, "no further pushes after dispose");
});
