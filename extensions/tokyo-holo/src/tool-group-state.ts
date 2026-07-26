import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeHandle } from "./runtime.ts";
import { summarizeTool, type SummaryInput, type ToolSummary } from "./tool-summaries.ts";

interface ToolRecord {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  startedAt?: number;
  endedAt?: number;
  order: number;
  summary?: ToolSummary;
  isError?: boolean;
}

export interface ToolBatch {
  batchId: string;
  turnIndex: number;
  startedAt: number;
  toolCallIds: string[];
  leaderToolCallId?: string;
  finalized: boolean;
}

export type ToolRenderRole = "single" | "leader" | "follower";

// TG3: cap the number of toolCallIds held in memory. Long-running sessions
// can accumulate thousands of calls; bound at MAX_RECORDS and evict the
// oldest finalised batches when over budget.
const MAX_RECORDS = 256;

export class ToolGroupState {
  private batches = new Map<string, ToolBatch>();
  private callToBatch = new Map<string, string>();
  private records = new Map<string, ToolRecord>();
  private currentBatch?: ToolBatch;
  private nextBatchId = 0;
  private nextOrder = 0;

  startTurn(turnIndex: number): void {
    const batch: ToolBatch = {
      batchId: `turn-${turnIndex}-${this.nextBatchId++}`,
      turnIndex,
      startedAt: Date.now(),
      toolCallIds: [],
      finalized: false,
    };
    this.currentBatch = batch;
    this.batches.set(batch.batchId, batch);
  }

  endTurn(turnIndex: number): void {
    if (this.currentBatch?.turnIndex === turnIndex) {
      this.currentBatch.finalized = true;
      this.currentBatch = undefined;
    }
    this.evictIfOverflowing();
  }

  // Drop the oldest finalised batches (and their records) until we're back
  // within MAX_RECORDS. Never touches the currentBatch.
  private evictIfOverflowing(): void {
    while (this.records.size > MAX_RECORDS) {
      const oldest = [...this.batches.values()]
        .filter((b) => b.finalized)
        .sort((a, b) => a.startedAt - b.startedAt)[0];
      if (!oldest) return;
      for (const callId of oldest.toolCallIds) {
        this.records.delete(callId);
        this.callToBatch.delete(callId);
      }
      this.batches.delete(oldest.batchId);
    }
  }

  recordStart(toolCallId: string, toolName: string, args?: Record<string, unknown>, startedAt = Date.now()): void {
    const existingBatchId = this.callToBatch.get(toolCallId);
    if (!existingBatchId) {
      const batch = this.currentBatch ?? this.ensureAdhocBatch();
      this.callToBatch.set(toolCallId, batch.batchId);
      batch.toolCallIds.push(toolCallId);
      batch.leaderToolCallId ??= toolCallId;
    }

    const existing = this.records.get(toolCallId);
    if (existing) {
      existing.toolName = toolName;
      existing.args = args ?? existing.args;
      existing.startedAt ??= startedAt;
      return;
    }

    this.records.set(toolCallId, {
      toolCallId,
      toolName,
      args,
      startedAt,
      order: this.nextOrder++,
    });
  }

  recordSummary(summary: ToolSummary): void {
    const existing = this.records.get(summary.toolCallId);
    if (existing) {
      existing.summary = summary;
      existing.endedAt = summary.endedAt ?? existing.endedAt;
      existing.isError = summary.state === "error";
      return;
    }
    this.records.set(summary.toolCallId, {
      toolCallId: summary.toolCallId,
      toolName: summary.toolName,
      order: summary.order,
      summary,
      endedAt: summary.endedAt,
      isError: summary.state === "error",
    });
  }

  recordEnd(
    toolCallId: string,
    toolName: string,
    result: SummaryInput["result"],
    isError: boolean | undefined,
  ): void {
    const existing = this.records.get(toolCallId);
    if (!existing) {
      this.recordStart(toolCallId, toolName, undefined, Date.now());
    }
    const record = this.records.get(toolCallId)!;
    record.endedAt = Date.now();
    record.isError = Boolean(isError);
    if (result) {
      record.summary = summarizeTool({
        toolCallId,
        toolName,
        args: record.args,
        result,
        isError: Boolean(isError),
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        order: record.order,
      });
    }
  }

  getRole(toolCallId: string): ToolRenderRole {
    const batch = this.getBatchForCall(toolCallId);
    if (!batch || batch.toolCallIds.length <= 1) return "single";
    return batch.leaderToolCallId === toolCallId ? "leader" : "follower";
  }

  getSummariesForCall(toolCallId: string): ToolSummary[] {
    const batch = this.getBatchForCall(toolCallId);
    if (!batch) {
      const record = this.records.get(toolCallId);
      return record ? [this.summaryForRecord(record)] : [];
    }
    return batch.toolCallIds
      .map((id) => this.records.get(id))
      .filter((record): record is ToolRecord => Boolean(record))
      .map((record) => this.summaryForRecord(record))
      .sort((a, b) => a.order - b.order);
  }

  getBatchSizeForCall(toolCallId: string): number {
    return this.getBatchForCall(toolCallId)?.toolCallIds.length ?? 1;
  }

  private getBatchForCall(toolCallId: string): ToolBatch | undefined {
    const batchId = this.callToBatch.get(toolCallId);
    return batchId ? this.batches.get(batchId) : undefined;
  }

  private summaryForRecord(record: ToolRecord): ToolSummary {
    if (record.summary) return record.summary;
    return summarizeTool({
      toolCallId: record.toolCallId,
      toolName: record.toolName,
      args: record.args,
      isPartial: true,
      startedAt: record.startedAt,
      order: record.order,
    });
  }

  private ensureAdhocBatch(): ToolBatch {
    const batch: ToolBatch = {
      batchId: `adhoc-${this.nextBatchId++}`,
      turnIndex: -1,
      startedAt: Date.now(),
      toolCallIds: [],
      finalized: false,
    };
    this.currentBatch = batch;
    this.batches.set(batch.batchId, batch);
    return batch;
  }
}

export function installToolGroupEvents(
  pi: ExtensionAPI,
  groups: ToolGroupState,
  runtime?: RuntimeHandle,
): void {
  pi.on("turn_start", async (event, ctx) => {
    if (ctx.mode !== "tui") return;
    groups.startTurn(event.turnIndex);
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    if (ctx.mode !== "tui") return;
    // wasSingle/isNowMulti detect the 1→2 batch transition. The leader's
    // ToolGroupComponent snapshotted its render at batch size 1; without
    // this nudge it never reflows to show the joining follower.
    const wasSingle = groups.getBatchSizeForCall(event.toolCallId) <= 1;
    groups.recordStart(event.toolCallId, event.toolName, event.args as Record<string, unknown> | undefined);
    const isNowMulti = groups.getBatchSizeForCall(event.toolCallId) > 1;
    if (wasSingle && isNowMulti) runtime?.requestRender?.();
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    if (ctx.mode !== "tui") return;
    groups.recordEnd(event.toolCallId, event.toolName, event.result, event.isError);
    // Pending → final transition: card flips from spinner to summary; pi de-dupes excess renders.
    runtime?.requestRender?.();
  });

  pi.on("turn_end", async (event, ctx) => {
    if (ctx.mode !== "tui") return;
    groups.endTurn(event.turnIndex);
  });
}
