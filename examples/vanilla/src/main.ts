await import("./site.css");

import type { WidgetConfig } from "inochi2d-web";

export {};

const breakpoint = 768;
const akaProfile: Pick<WidgetConfig, "parameters" | "render"> = {
  render: { initialScale: 0.075 },
  parameters: {
    breath: "Breath",
    eyeOpenLeft: { id: "Eye:: Left:: Blink", scale: -1, offset: 1 },
    eyeOpenRight: { id: "Eye:: Right:: Blink", scale: -1, offset: 1 },
    eyeX: ["Eye:: Left:: Move", "Eye:: Right:: Move"],
    eyeY: null,
    headX: [
      { id: "Head:: Yaw-Pitch", axis: "x" },
      { id: "Body:: Yaw-Pitch", axis: "x", scale: 0.35 },
    ],
    headY: [
      { id: "Head:: Yaw-Pitch", axis: "y" },
      { id: "Body:: Yaw-Pitch", axis: "y", scale: 0.2 },
    ],
    bodyX: "Body:: Roll",
    click: [
      { id: "Head:: Roll", scale: 0.8 },
      { id: "Arm:: Left:: Move", scale: 2 },
      { id: "Arm:: Right:: Move", scale: 2 },
    ],
  },
};
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
  const search = new URLSearchParams(location.search);
  const mode = search.get("model");
  const profile = search.get("profile");
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
    ...(profile === "aka" ? akaProfile : {}),
  });
  document.body.dataset.widgetBootstrap = "mounted";
}
