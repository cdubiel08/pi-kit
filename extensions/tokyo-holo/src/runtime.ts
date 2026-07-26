// Shared runtime handle. Populated when the editor's TUI is constructed
// (see prompt-rail.ts TokyoHoloEditor); read by sibling modules that need
// to nudge a re-render from event handlers — most importantly the tool
// grouping code, which has to reflow the leader card the moment a
// follower joins the batch.
export interface RuntimeHandle {
  requestRender?: () => void;
  restoreCursor?: () => void;
}
