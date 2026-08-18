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
  const stateKey = "__hexoInox2dWidgetState";
  const state = (globalThis[stateKey] ??= {});
  const nextGeneration = () => {
    state.generation = Number.isSafeInteger(state.generation)
      ? state.generation + 1
      : 1;
    return state.generation;
  };
  const ensureMounted = async () => {
    const hosts = Array.from(document.querySelectorAll("[data-inochi2d-widget-host]"));
    if (!options.showOnMobile && globalThis.matchMedia(mobileQuery).matches) {
      nextGeneration();
      state.controller?.destroy();
      state.controller = undefined;
      state.host = undefined;
      state.mountHost = undefined;
      hosts.forEach((node) => node.remove());
      return;
    }

    let host = hosts.find((candidate) => candidate.isConnected);
    if (!host) {
      host = document.createElement("div");
      host.dataset.inochi2dWidgetHost = "";
      document.body.append(host);
    }
    for (const duplicate of hosts) {
      if (duplicate !== host) duplicate.remove();
    }

    if (state.controller && state.host === host && host.isConnected) return;
    if (state.mounting && state.mountHost === host) return state.mounting;
    const generation = nextGeneration();
    state.controller?.destroy();
    state.controller = undefined;
    state.host = host;
    state.mountHost = host;
    const mounting = import(options.entryUrl)
      .then(async (runtime) => {
        const controller = await runtime.mountInochi2DWidget(host, options.config);
        if (
          state.generation !== generation ||
          state.host !== host ||
          !host.isConnected ||
          (!options.showOnMobile && globalThis.matchMedia(mobileQuery).matches)
        ) {
          controller.destroy();
          return;
        }
        state.controller = controller;
      })
      .finally(() => {
        if (state.mounting === mounting) {
          state.mounting = undefined;
          state.mountHost = undefined;
        }
      });
    state.mounting = mounting;
    return mounting;
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
