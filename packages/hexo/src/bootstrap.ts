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
  const stateKey = "__hexoStarLiteWidgetState";
  const state = (globalThis[stateKey] ??= {});
  const media = globalThis.matchMedia(mobileQuery);
  const retryDelays = [2000, 5000, 15000];
  state.retryCount ??= 0;
  const canLoad = () => document.visibilityState !== "hidden" && globalThis.navigator.onLine !== false &&
    (options.showOnMobile || !media.matches);
  const clearRetry = () => {
    globalThis.clearTimeout(state.retryTimer);
    state.retryTimer = undefined;
  };
  const unavailable = (host) => {
    // Keep dimensions for camera/layout measurement, but never cover the page.
    host.style.setProperty("visibility", "hidden", "important");
    host.style.setProperty("pointer-events", "none", "important");
  };
  const scheduleRetry = () => {
    if (!state.failed || state.retryTimer !== undefined || state.retryCount >= retryDelays.length || !canLoad()) return;
    const generation = state.generation;
    state.retryTimer = globalThis.setTimeout(() => {
      state.retryTimer = undefined;
      if (state.generation !== generation || !state.failed || !canLoad()) return;
      state.pendingRetry = true;
      state.failed = false;
      // A timed-out shader compilation can settle late. Give the next attempt
      // its own host so that destroying the old controller cannot alter it.
      state.host?.remove();
      state.host = undefined;
      state.scheduleMount();
    }, Math.max(0, state.retryAt - globalThis.Date.now()));
  };
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
    const hosts = Array.from(document.querySelectorAll("[data-starlite-widget-host]"));
    if (!options.showOnMobile && media.matches) {
      nextGeneration();
      clearRetry();
      state.observer?.disconnect();
      state.observer = undefined;
      state.abort?.abort();
      state.controller?.destroy();
      state.controller = undefined;
      state.host = undefined;
      state.mountHost = undefined;
      state.mounting = undefined;
      hosts.forEach((node) => node.remove());
      return;
    }

    // PJAX may replace the containing fragment. Reattach our original DOM node,
    // including its canvas, pending load, bubble and controller, before deduplicating.
    let host = state.host ?? hosts.find((candidate) => candidate.isConnected);
    if (!host) {
      host = document.createElement("div");
      host.dataset.starliteWidgetHost = "";
    }
    if (!host.isConnected) document.body.append(host);
    for (const duplicate of hosts) {
      if (duplicate !== host) duplicate.remove();
    }

    if (state.controller && state.host === host && host.isConnected) return;
    if (state.mounting && state.mountHost === host) return state.mounting;
    state.host = host;
    unavailable(host);
    if (state.failed) { scheduleRetry(); return; }
    if (!canLoad()) return;
    if (state.pendingRetry) { state.retryCount += 1; state.pendingRetry = false; }
    const generation = nextGeneration();
    state.observer?.disconnect();
    state.abort?.abort();
    const abort = new AbortController();
    state.abort = abort;
    state.controller?.destroy();
    state.controller = undefined;
    state.host = host;
    state.mountHost = host;
    const fail = () => {
      if (state.generation !== generation || abort.signal.aborted) return;
      nextGeneration();
      state.observer?.disconnect();
      state.observer = undefined;
      unavailable(host);
      abort.abort();
      state.controller?.destroy();
      state.controller = undefined;
      state.mounting = undefined;
      state.mountHost = undefined;
      host.replaceChildren();
      state.failed = true;
      state.retryAt = globalThis.Date.now() + (retryDelays[state.retryCount] ?? 0);
      scheduleRetry();
    };
    // Context loss does not necessarily emit an error event. Both backends
    // expose their terminal fallback status on the host before mount settles.
    const observer = new globalThis.MutationObserver(() => {
      if (host.dataset.modelStatus === "fallback" || host.dataset.inochi2dStatus === "fallback") fail();
    });
    observer.observe(host, {attributes:true,attributeFilter:["data-model-status","data-inochi2d-status"]});
    state.observer = observer;
    // Failed module imports can remain cached by the browser. Only failed
    // imports get a bounded new URL; a loaded runtime is reused for model retries.
    const entryUrl = new URL(options.entryUrl, document.baseURI);
    if (state.retryCount) entryUrl.searchParams.set("starlite-retry", String(state.retryCount));
    const mounting = (state.runtime ? Promise.resolve(state.runtime) : import(entryUrl.href))
      .then(async (runtime) => {
        abort.signal.throwIfAborted();
        state.runtime = runtime;
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
        if (controller.status === "fallback") { fail(); return; }
        if (controller.status !== "disabled") {
          host.style.removeProperty("visibility");
          host.style.removeProperty("pointer-events");
          if (options.config.interactions?.passThrough) host.style.pointerEvents = "none";
          rememberEntry();
        }
      })
      .catch(fail)
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
    // Reattaching a ready/pending instance is cheap and must not wait behind
    // rendering work in an idle queue after PJAX has replaced its fragment.
    if (state.controller || state.mounting) { void ensureMounted(); return; }
    if (state.scheduled) return;
    state.scheduled = true;
    const run = () => { state.scheduled = false; void ensureMounted(); };
    if (globalThis.requestIdleCallback) globalThis.requestIdleCallback(run, {timeout:1000});
    else globalThis.setTimeout(run, 0);
  };
  state.scheduleMount = scheduleMount;
  state.resumeRecovery = () => {
    if (!canLoad()) { clearRetry(); return; }
    if (state.failed) scheduleRetry();
    else scheduleMount();
  };
  if (!state.listenerBound) {
    document.addEventListener("pjax:complete", () => state.scheduleMount());
    media.addEventListener("change", () => state.scheduleMount());
    document.addEventListener("visibilitychange", () => state.resumeRecovery());
    globalThis.addEventListener("online", () => state.resumeRecovery());
    globalThis.addEventListener("offline", () => state.resumeRecovery());
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
