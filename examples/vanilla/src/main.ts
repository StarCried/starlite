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
  },
};
const mannequinProfile: Pick<
  WidgetConfig,
  "ambient" | "display" | "parameters" | "render"
> = {
  display: { width: 390, height: 540 },
  render: { autoFit: true },
  parameters: {
    breath: { id: "Body - Up/Down", scale: 0.08 },
    eyeOpenLeft: { id: "Left Eye - Blink", scale: -1, offset: 1 },
    eyeOpenRight: { id: "Right Eye - Blink", scale: -1, offset: 1 },
    eyeX: [
      { id: "Left Eye - Gaze", axis: "x", scale: 0.4 },
      { id: "Right Eye - Gaze", axis: "x", scale: 0.4 },
    ],
    eyeY: [
      { id: "Left Eye - Gaze", axis: "y", scale: -0.55 },
      { id: "Right Eye - Gaze", axis: "y", scale: -0.55 },
    ],
    headX: [
      { id: "Head - Pitch/Yaw", axis: "x", scale: 0.35 },
      { id: "Body - Yaw", scale: 0.12 },
    ],
    headY: { id: "Head - Pitch/Yaw", axis: "y", scale: 0.5 },
    bodyX: "Body - Roll",
  },
  ambient: {
    parameters: [
      {
        id: "Tail - Left/Right Swing",
        minimum: -0.55,
        maximum: 0.55,
        periodMs: 4_200,
      },
      {
        id: "Tail - Left/Right Tip Swing",
        minimum: -0.35,
        maximum: 0.35,
        periodMs: 4_200,
        phase: 1 / 6,
      },
    ],
  },
};
const dialogueAnimations: NonNullable<WidgetConfig["animations"]> = [
  {
    name: "Greeting",
    timestepMs: 100,
    length: 2,
    leadIn: -1,
    leadOut: -1,
    weight: 1,
    lanes: [
      {
        parameter: "Breath",
        defaultValues: [0, 0],
        interpolation: "linear",
        keyframes: [
          { frame: 0, value: 0, tension: 0 },
          { frame: 2, value: 0.05, tension: 0 },
        ],
      },
    ],
  },
  {
    name: "Click",
    timestepMs: 100,
    length: 2,
    leadIn: -1,
    leadOut: -1,
    weight: 1,
    lanes: [
      {
        parameter: "Breath",
        defaultValues: [0, 0],
        interpolation: "linear",
        keyframes: [
          { frame: 0, value: 0, tension: 0 },
          { frame: 2, value: 0.1, tension: 0 },
        ],
      },
    ],
  },
];
const manualDialogue = {
  enter: {
    animation: "Click",
    lines: ["模型已加载，可以开始检查。", "欢迎来到 Inochi2D 网页预览。"],
    durationMs: 5_000,
  },
  idle: {
    animation: "Click",
    lines: ["这是一次自然状态对话。", "头发和袖子应由模型物理继续响应。"],
    intervalMinMs: 8_000,
    intervalMaxMs: 12_000,
    durationMs: 5_000,
  },
  click: {
    animation: "Click",
    lines: ["你点击了模型。", "Click 动画和这句话应同时出现。"],
    durationMs: 5_000,
  },
} satisfies NonNullable<WidgetConfig["dialogue"]>;
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
  const dialogueTest = search.get("dialogue") === "1";
  const fastIdleTest = search.get("idle") === "fast";
  const modelDialogue = fastIdleTest
    ? {
        ...manualDialogue,
        idle: {
          ...manualDialogue.idle,
          intervalMinMs: 5_000,
          intervalMaxMs: 5_000,
        },
      }
    : manualDialogue;
  const model =
    mode === "missing"
      ? "/models/missing.inp"
      : mode === "corrupt"
        ? "/models/corrupt.inp"
        : mode === "cross-origin"
          ? "http://127.0.0.1:4175/puppet.inp"
          : "/models/puppet.inp";
  const animations =
    profile === "aka" || profile === "mannequin"
      ? await fetch("/models/manifest.json")
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(
                `prepared model manifest returned HTTP ${response.status}`,
              );
            }
            return response.json() as Promise<{
              animations?: WidgetConfig["animations"];
            }>;
          })
          .then((manifest) => {
            if (!manifest.animations) {
              throw new Error("prepared model manifest has no animations");
            }
            return manifest.animations;
          })
      : undefined;
  await mountInochi2DWidget(host, {
    model,
    fallback: "/fallback.svg",
    mobile: { show: false, breakpoint },
    ...(profile === "aka"
      ? {
          ...akaProfile,
          animations: animations!,
          ...(dialogueTest ? { dialogue: modelDialogue } : {}),
          interactions: {
            click: dialogueTest ? false : { animation: "Click" },
          },
        }
      : profile === "mannequin"
        ? {
            ...mannequinProfile,
            animations: animations!,
            ...(dialogueTest ? { dialogue: modelDialogue } : {}),
            interactions: {
              click: dialogueTest ? false : { animation: "Click" },
            },
          }
      : dialogueTest
        ? {
            animations: dialogueAnimations,
            dialogue: {
              enter: {
                animation: "Greeting",
                lines: ["Welcome <b>friend</b>"],
                durationMs: 10_000,
              },
              click: {
                animation: "Click",
                lines: ["Clicked <img src=x>"],
                durationMs: 10_000,
              },
            },
            interactions: { click: false },
          }
        : { interactions: { click: false } }),
  });
  document.body.dataset.widgetBootstrap = "mounted";
}
