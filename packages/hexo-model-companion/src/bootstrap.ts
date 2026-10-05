import type { BrowserWidgetConfig } from "./types";

interface BootstrapOptions {
  entryUrl: string;
  config: BrowserWidgetConfig;
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
  const media = globalThis.matchMedia(mobileQuery);
  const entryKey = "model-companion:entered:" + (options.config.backend ?? "inochi2d") + ":" + options.config.model;
  const hasEntered = () => {
    try { return state.entered === entryKey || globalThis.sessionStorage.getItem(entryKey) === "1"; }
    catch { return state.entered === entryKey; }
  };
  const rememberEntry = () => {
    state.entered = entryKey;
    try { globalThis.sessionStorage.setItem(entryKey, "1"); } catch { /* Storage can be disabled. */ }
  };
  const nextGeneration = () => {
    state.generation = Number.isSafeInteger(state.generation)
      ? state.generation + 1
      : 1;
    return state.generation;
  };
  const ensureMounted = async () => {
    const hosts = Array.from(document.querySelectorAll("[data-inochi2d-widget-host]"));
    if (!options.showOnMobile && media.matches) {
      nextGeneration();
      state.abort?.abort();
      state.controller?.destroy();
      state.controller = undefined;
      state.host = undefined;
      state.mountHost = undefined;
      hosts.forEach((node) => node.remove());
      return;
    }

    // PJAX may replace the containing fragment. Reattach our original DOM node,
    // including its canvas, pending load, bubble and controller, before deduplicating.
    let host = state.host ?? hosts.find((candidate) => candidate.isConnected);
    if (!host) {
      host = document.createElement("div");
      host.dataset.inochi2dWidgetHost = "";
    }
    if (!host.isConnected) document.body.append(host);
    for (const duplicate of hosts) {
      if (duplicate !== host) duplicate.remove();
    }

    if (state.controller && state.host === host && host.isConnected) return;
    if (state.mounting && state.mountHost === host) return state.mounting;
    const generation = nextGeneration();
    state.abort?.abort();
    const abort = new AbortController();
    state.abort = abort;
    state.controller?.destroy();
    state.controller = undefined;
    state.host = host;
    state.mountHost = host;
    const mounting = import(options.entryUrl)
      .then(async (runtime) => {
        abort.signal.throwIfAborted();
        const config = hasEntered()
          ? {...options.config, dialogue:{...options.config.dialogue, enter:false}}
          : options.config;
        const controller = await runtime.mountModelWidget(host, config, {signal:abort.signal});
        // A load can finish between fragment replacement and pjax:complete.
        if (state.generation === generation && state.host === host &&
            (options.showOnMobile || !media.matches) && !host.isConnected) document.body.append(host);
        if (
          state.generation !== generation ||
          state.host !== host ||
          !host.isConnected ||
          (!options.showOnMobile && media.matches)
        ) {
          controller.destroy();
          return;
        }
        state.controller = controller;
        if (controller.status !== "fallback" && controller.status !== "disabled") rememberEntry();
      })
      .catch(() => {
        if (state.generation !== generation || abort.signal.aborted || !host.isConnected) return;
        host.replaceChildren();
        host.style.width = (options.config.display?.width ?? 320) + "px";
        host.style.height = (options.config.display?.height ?? 480) + "px";
        const image = document.createElement("img"); image.src = options.config.fallback; image.alt = "角色暂时无法加载";
        image.style.cssText = "width:100%;height:100%;object-fit:contain";
        host.append(image);
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

  const scheduleMount = () => {
    if (state.scheduled) return;
    state.scheduled = true;
    const run = () => { state.scheduled = false; void ensureMounted(); };
    if (globalThis.requestIdleCallback) globalThis.requestIdleCallback(run, {timeout:2000});
    else globalThis.setTimeout(run, 0);
  };
  state.scheduleMount = scheduleMount;
  if (!state.listenerBound) {
    document.addEventListener("pjax:complete", () => state.scheduleMount());
    media.addEventListener("change", () => state.scheduleMount());
    state.listenerBound = true;
  }
  if (document.readyState !== "loading") scheduleMount();
  else document.addEventListener("DOMContentLoaded", scheduleMount, {once:true});
})(${serialized});`;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
