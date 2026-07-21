await import("./site.css");

export {};

const breakpoint = 768;
const host = document.querySelector<HTMLElement>("[data-inochi2d-widget-host]");

if (!host) {
  throw new Error("widget host is missing");
}

if (globalThis.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches) {
  host.remove();
  document.body.dataset.widgetBootstrap = "mobile-disabled";
} else {
  await import("inochi2d-web/widget.css");
  const { mountInochi2DWidget } = await import("inochi2d-web");
  const mode = new URLSearchParams(location.search).get("model");
  const model =
    mode === "missing"
      ? "/models/missing.inp"
      : mode === "corrupt"
        ? "/models/corrupt.inp"
        : mode === "cross-origin"
          ? "http://127.0.0.1:4175/puppet.inp"
          : "/models/puppet.inp";
  await mountInochi2DWidget(host, {
    model,
    fallback: "/fallback.svg",
    mobile: { show: false, breakpoint },
  });
  document.body.dataset.widgetBootstrap = "mounted";
}
