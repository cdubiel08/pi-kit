// Output-parsing heuristics for tool-summary metrics. Extracted from
// tool-summaries.ts so the tricky branches around truncation notices,
// "no matches", and ripgrep-style outputs are independently testable.

const TRUNCATION_NOTICE_SPLIT = /\n\s*\n\[/;

function trimBeforeTruncationNotice(value: string): string {
  return value.split(TRUNCATION_NOTICE_SPLIT)[0] ?? value;
}

export function countHits(output: string): number {
  const trimmed = output.trim();
  if (!trimmed) return 0;
  if (/^No matches found$/i.test(trimmed)) return 0;
  const body = trimBeforeTruncationNotice(trimmed);
  // ripgrep style: `path:line:` — prefer those when present, otherwise
  // count non-empty lines.
  const ripgrepHits = body.split("\n").filter((line) => /:\d+:/.test(line)).length;
  if (ripgrepHits > 0) return ripgrepHits;
  return body.split("\n").filter(Boolean).length;
}

export function countEntries(output: string): number {
  const trimmed = output.trim();
  if (!trimmed) return 0;
  if (/^No files found matching pattern$/i.test(trimmed)) return 0;
  if (/^\(empty directory\)$/i.test(trimmed)) return 0;
  const body = trimBeforeTruncationNotice(trimmed);
  return body.split("\n").filter((line) => line.trim().length > 0).length;
}

export function lineCountFromContent(content: string): number {
  if (!content) return 0;
  const body = trimBeforeTruncationNotice(content);
  return body.split("\n").length;
}

export function countDisplayLines(text: string): number {
  if (!text) return 0;
  const body = trimBeforeTruncationNotice(text);
  return body.split("\n").filter((line) => line.length > 0).length || (body.length > 0 ? 1 : 0);
}

export function hasTruncation(details: Record<string, unknown>): boolean {
  const truncation = details.truncation;
  return Boolean(
    (truncation && typeof truncation === "object" && (truncation as Record<string, unknown>).truncated) ||
      details.linesTruncated ||
      details.matchLimitReached ||
      details.resultLimitReached ||
      details.entryLimitReached,
  );
}
