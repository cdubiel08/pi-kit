import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getConfigPath, getLastConfigError, loadConfig } from "./src/config.ts";
import { resolveGlyphs } from "./src/glyphs.ts";
import { installPromptRail } from "./src/prompt-rail.ts";
import type { RuntimeHandle } from "./src/runtime.ts";
import { installToolGroupEvents, ToolGroupState } from "./src/tool-group-state.ts";
import { registerCompactToolRenderers } from "./src/tool-renderers.ts";
import { installWelcomeOverlay } from "./src/welcome.ts";

export default function tokyoHolo(pi: ExtensionAPI) {
  const config = loadConfig();
  const glyphs = resolveGlyphs(config.glyphMode);
  const groups = new ToolGroupState();
  const runtime: RuntimeHandle = {};

  if (config.compactTools) installToolGroupEvents(pi, groups, runtime);
  installPromptRail(pi, config, glyphs, runtime);
  installWelcomeOverlay(pi, {
    mode: config.welcomeOverlay,
    dismissAfterMs: config.welcomeDismissMs,
  });

  // Register renderer overrides once per extension runtime. Pi creates a fresh
  // runtime when sessions are replaced or resources are reloaded.
  let renderersInstalled = false;
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui" || renderersInstalled) return;
    registerCompactToolRenderers(pi, ctx.cwd, config, glyphs, groups);
    renderersInstalled = true;
  });

  pi.registerCommand("tokyo-holo", {
    description: "Show Tokyo Holo extension status and config path.",
    handler: async (_args, ctx) => {
      const themeKnown = ctx.hasUI ? ctx.ui.getTheme("tokyo-holo") !== undefined : false;
      const lines = [
        `Tokyo Holo loaded`,
        `theme: ${themeKnown ? "available" : "not discovered yet"}`,
        `glyphMode: ${config.glyphMode}`,
        `compactTools: ${config.compactTools ? "on" : "off"}`,
        `promptRail: ${config.promptRail ? "on" : "off"}`,
        `groupSequentialTools: ${config.groupSequentialTools ? "on" : "off"}`,
        `config: ${getConfigPath()}`,
      ];
      const configError = getLastConfigError();
      if (configError) lines.push(`config error: ${configError} — using defaults`);
      ctx.ui.notify(lines.join("\n"), configError ? "warning" : "info");
    },
  });
}
