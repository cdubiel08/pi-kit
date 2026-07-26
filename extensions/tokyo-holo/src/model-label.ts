// Abbreviate provider/model strings down to something the prompt rail can
// fit comfortably. Pure — no I/O, no env reads.

export interface ModelLabelSource {
  id?: string;
  name?: string;
  provider?: string;
  api?: string;
}

function cleanRawModel(model: string | undefined): string {
  if (!model) return "";
  return model.includes("/") ? model.split("/").pop()! : model;
}

// Rewritten regex table (Phase 14 follow-up to Phase 6):
// - claude/sonnet/opus collapsed BEFORE generic "claude-" stripping so
//   the dated suffix gets dropped without leaving "sonnet-4-5" behind
// - qwen `-8bit`, `-instruct`, etc. always trimmed after the size token
// - mlx-local/openai-codex provider prefix stripped first
export function abbreviateModel(model: string | undefined): string {
  const withoutProvider = cleanRawModel(model);
  if (!withoutProvider) return "model";

  // claude family (must run before generic claude- stripping)
  if (/^claude-?sonnet-?4-?[56]/i.test(withoutProvider)) return "sonnet";
  if (/^claude-?opus-?4-?[567]/i.test(withoutProvider)) return "opus";
  if (/^claude-?haiku-?4-?5/i.test(withoutProvider)) return "haiku";

  // qwen → drop quantization / instruct suffix, keep size
  const qwen = withoutProvider.match(/^qwen(\d+\.?\d*)-?(\d+b)/i);
  if (qwen) return `qwen${qwen[1]}-${qwen[2]?.toLowerCase()}`;

  // gpt family
  if (/^gpt-5\.5/i.test(withoutProvider)) return "gpt-5.5";
  if (/^gpt-5\.0/i.test(withoutProvider)) return "gpt-5";

  // Generic cleanup
  return withoutProvider
    .replace(/^claude-/, "")
    .replace(/-20\d{6}$/, "")
    .replace(/-latest$/, "");
}

export function formatModelLabel(model: ModelLabelSource | undefined): string {
  if (!model) return "model";
  const raw = cleanRawModel(model.name || model.id);
  if (!raw) return "model";
  const gpt = raw.match(/^gpt-(\d+(?:\.\d+)?)(?:[- ]+(sol|terra|luna))?/i);
  if (gpt) {
    const variant = gpt[2];
    const tail = variant ? ` ${variant[0]!.toUpperCase()}${variant.slice(1).toLowerCase()}` : "";
    return `GPT-${gpt[1]}${tail}`;
  }

  const compact = abbreviateModel(raw);
  if (compact === "sonnet") return "Sonnet";
  if (compact === "opus") return "Opus";
  if (compact === "haiku") return "Haiku";
  if (/^qwen/i.test(compact)) return compact.replace(/^qwen/i, "Qwen");
  return compact;
}
