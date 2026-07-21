import type { WidgetConfig } from "inochi2d-web" with { "resolution-mode": "import" };

interface BootstrapOptions {
  entryUrl: string;
  config: WidgetConfig;
  breakpoint: number;
  showOnMobile: boolean;
}

/** Build a self-contained browser module with a mobile guard before import(). */
export function createBootstrapSource(options: BootstrapOptions): string {
  const serialized = safeJson(options);
  return `
(async (options) => {
  const mobileQuery = \`(max-width: \${Math.max(0, options.breakpoint - 1)}px)\`;
  if (!options.showOnMobile && globalThis.matchMedia(mobileQuery).matches) {
    document.querySelectorAll("[data-inochi2d-widget-host]").forEach((node) => node.remove());
    return;
  }

  const stateKey = "__hexoInox2dWidgetState";
  const state = (globalThis[stateKey] ??= {});
  const ensureMounted = async () => {
    const hosts = Array.from(document.querySelectorAll("[data-inochi2d-widget-host]"));
    let host = hosts.find((candidate) => candidate.isConnected);
    if (!host) {
      host = document.createElement("div");
      host.dataset.inochi2dWidgetHost = "";
      document.body.append(host);
    }
    for (const duplicate of hosts) {
      if (duplicate !== host) duplicate.remove();
    }

    if (state.controller && state.host?.isConnected) return;
    if (state.mounting) return state.mounting;
    state.controller?.destroy();
    state.controller = undefined;
    state.host = host;
    state.mounting = import(options.entryUrl)
      .then(async (runtime) => {
        state.controller = await runtime.mountInochi2DWidget(host, options.config);
      })
      .finally(() => {
        state.mounting = undefined;
      });
    return state.mounting;
  };

  if (!state.listenerBound) {
    document.addEventListener("pjax:complete", () => void ensureMounted());
    state.listenerBound = true;
  }
  await ensureMounted();
})(${serialized});`;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
