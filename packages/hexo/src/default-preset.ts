import type { HexoWidgetConfig } from "./types";

export const WEIGUANG_VERSION = "weiguang-v3.0.0-starlite.1";
export const WEIGUANG_CACHE_DIRECTORY = `node_modules/.cache/hexo-starlite/${WEIGUANG_VERSION}`;
export const WEIGUANG_POSITION = { right: 112, bottom: 160 } as const;
const release = `https://github.com/StarCried/starlite/releases/download/${WEIGUANG_VERSION}`;
export const WEIGUANG_ASSETS = [
  { file: "Weiguang-StarLite-Blog.vrm", url: `${release}/Weiguang-StarLite-Blog.vrm`, bytes: 9116328, sha256: "d98a431d84c015787a3239eaf709a7b3b075b4353c10ac59a3023f5ca4c05b8b" },
  { file: "LICENSE-Weiguang.md", url: `${release}/LICENSE-Weiguang.md`, bytes: 4399, sha256: "c36c593d2932e4cfb0d451a8acf69c8444abbbab1a255300abc42efe4d36a211" },
  { file: "ASSET-SOURCES.md", url: `${release}/ASSET-SOURCES.md`, bytes: 2595, sha256: "2b1616fcd4d6009e5810953e703e2bcb9a907c7a29906735ad1c6f92cd24e066" },
] as const;

// The public Weiguang blog preset; artwork remains in the separately licensed release.
const PRESET = {
  "backend": "vrm",
  "neutralAnimation": "Idle",
  "embeddedAnimations": [
    "Idle",
    "GentleWave",
    "HighFive",
    "HighWave",
    "StumbleAndRecover",
    "PlayfulScare",
    "RaisedHandWave",
    "Stretch",
    "BackStretch",
    "AbsentmindedWait",
    "Thinking",
    "HaveAnIdea",
    "AwkwardHeadScratch"
  ],
  "mobile": {
    "show": false,
    "breakpoint": 900
  },
  "render": {
    "fps": 60,
    "maxDevicePixelRatio": 1,
    "fitPadding": 0.92
  },
  "camera": {
    "yawDegrees": 0,
    "pitchDegrees": 5,
    "fovDegrees": 20,
    "targetHeight": 0.54
  },
  "display": {
    "width": 260,
    "height": 390
  },
  "gaze": {
    "maxYawDegrees": 25,
    "maxPitchDegrees": 15,
    "smoothingMs": 100
  },
  "ambient": {
    "animations": [
      "Idle"
    ]
  },
  "interactions": {
    "pointer": true,
    "passThrough": true,
    "drag": false,
    "click": {
      "animations": [
        "GentleWave",
        "HighFive",
        "HighWave",
        "StumbleAndRecover",
        "PlayfulScare",
        "Thinking",
        "HaveAnIdea",
        "AwkwardHeadScratch"
      ]
    }
  },
  "dialogue": {
    "enter": {
      "delayMs": 500,
      "durationMs": 6300,
      "linesByAnimation": {
        "RaisedHandWave": [
          "嗨！我是微光！",
          "欢迎来我的小窝~",
          "你好呀，今天想看些什么？"
        ]
      },
      "animation": "RaisedHandWave"
    },
    "click": {
      "durationMs": 6300,
      "linesByAnimation": {
        "GentleWave": [
          "嗨~",
          "有什么想聊的？可以留下评论或者联系社交媒体哦~",
          "喜欢我的文章吗？诶，只是喜欢戳我吗？"
        ],
        "HighFive": [
          "High Five!",
          "耶！"
        ],
        "HighWave": [
          "你好你好！欢迎你来~",
          "我是小狼微光！可以在顶部的“微光”页更了解我哦",
          "很高兴认识你！在评论可以留下你的想法~"
        ],
        "StumbleAndRecover": [
          "嗷……好痛……是你干的吗？呃，不是吗……",
          "啊！……没事，就当没看到好吗",
          "为什么我们不再为摔倒而哭泣？是学会了保护自己，还是接纳了疼痛……嗯，只是为了思考这个问题才摔的……"
        ],
        "PlayfulScare": [
          "饿狼扑食！",
          "哇！没吓到你吗……"
        ],
        "Thinking": [
          "产出作品、表达思想、探索规律和不断体验，哪个是你最想要的？哪个是我最想要的……",
          "AI 最后会把人类圈养起来吗？人类现在难道不也活在科学理论、社会制度、思想文化等的圈养中吗？一个更好的圈有什么不好的？如果再给人类加个“有选择的自由”的幻想……",
          "宇宙在熵增，生命却在熵减，人类更是。这应该就是逆天吧……嗯，希望我能越来越逆天"
        ],
        "HaveAnIdea": [
          "写东西给别人看，是不是也算某种暴露癖？应该不是，毕竟是我仔细包装过的。",
          "嗯……这样的话……哦哦我会了！这是水题！"
        ],
        "AwkwardHeadScratch": [
          "遇到 BUG 或者有想吐槽的？请告诉我！就是麻烦下口轻点……"
        ]
      },
      "animation": "GentleWave",
      "animations": [
        "GentleWave",
        "HighFive",
        "HighWave",
        "StumbleAndRecover",
        "PlayfulScare",
        "Thinking",
        "HaveAnIdea",
        "AwkwardHeadScratch"
      ]
    },
    "idle": {
      "durationMs": 9000,
      "intervalMinMs": 60000,
      "intervalMaxMs": 120000,
      "linesByAnimation": {
        "Stretch": [
          "唔——",
          "站着好累……下版本加个坐着的动作好了",
          "我猜你坐了很久了，一起舒展一下吧。"
        ],
        "BackStretch": [
          "呼吸……放松……遁入虚无……",
          "呼吸……放松……遁入智瞳……不对！",
          "啊……我的腰……一定要记得多活动啊……"
        ],
        "AbsentmindedWait": [
          "在看我的日记、技术博客还是题解？肯定不是题解……",
          "平时喜欢做什么？我平时喜欢睡大觉",
          "你站在桥上看风景，看风景的人在楼上看你。"
        ],
        "Thinking": [
          "产出作品、表达思想、探索规律和不断体验，哪个是你最想要的？哪个是我最想要的……",
          "AI 最后会把人类圈养起来吗？人类现在难道不也活在科学理论、社会制度、思想文化等的圈养中吗？一个更好的圈有什么不好的？如果再给人类加个“有选择的自由”的幻想……",
          "宇宙在熵增，生命却在熵减，人类更是。这应该就是逆天吧……嗯，希望我能越来越逆天"
        ],
        "RaisedHandWave": [
          "觉得可以给我添加新功能或优化？欢迎向 starlite 项目贡献！",
          "你知道吗？虽然我是工程师，但看板娘组件主要使用 AI 开发，大部分时间都花在了手搓模型上。建模感觉比小时候的橡皮泥好玩~"
        ],
        "HaveAnIdea": [
          "写东西给别人看，是不是也算某种暴露癖？应该不是，毕竟是我仔细包装过的。",
          "嗯……这样的话……哦哦我会了！这是水题！"
        ],
        "AwkwardHeadScratch": [
          "遇到 BUG 或者有想吐槽的？请告诉我！就是麻烦下口轻点……"
        ]
      },
      "animation": "Stretch",
      "animations": [
        "Stretch",
        "BackStretch",
        "AbsentmindedWait",
        "Thinking",
        "RaisedHandWave",
        "HaveAnIdea",
        "AwkwardHeadScratch"
      ]
    }
  }
} satisfies HexoWidgetConfig;

/** Only a model-free VRM configuration opts into the bundled public preset. */
export function isDefaultPreset(input?: HexoWidgetConfig): boolean {
  return input?.enable !== false && input?.backend !== "inochi2d"
    && input?.model === undefined && input?.bundle === undefined;
}

/** Resolve fresh defaults without ever merging character behavior into another model. */
export function resolveDefaultPreset(
  input: HexoWidgetConfig | undefined,
  modelPath: string,
): HexoWidgetConfig {
  if (!isDefaultPreset(input)) return clone(input!);
  const defaults = {
    ...PRESET,
    enable: true,
    model: modelPath,
    position: WEIGUANG_POSITION,
    publication: {
      confirm: true,
      allowRedistribution: true,
      sourceSha256: WEIGUANG_ASSETS[0].sha256,
    },
  };
  const output = merge(defaults, input ?? {}) as HexoWidgetConfig;
  const overrides = input?.dialogue;
  if (overrides) {
    for (const scene of ["enter", "click", "idle"] as const) {
      if (isRecord(overrides[scene])) {
        output.dialogue![scene] = mergeScene(PRESET.dialogue[scene], overrides[scene]);
      }
    }
  }
  const click = input?.interactions?.click;
  if (isRecord(click)) {
    output.interactions!.click = mergeSelection(PRESET.interactions.click, click) as Exclude<NonNullable<HexoWidgetConfig["interactions"]>["click"], false | undefined>;
  }
  // Dialogue owns click playback when enabled. An interaction override also
  // replaces its inherited pool unless the caller supplied explicit dialogue.
  if (click !== undefined && !Object.hasOwn(overrides ?? {}, "click")) {
    output.dialogue!.click = click === false ? false
      : mergeScene(PRESET.dialogue.click, click);
  }
  return output;
}

type RecordValue = Record<string, unknown>;
function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Own entries and Object.fromEntries keep __proto__ inert. Every object and
// array is copied, so resolving one blog cannot mutate another blog's defaults.
function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(child => clone(child)) as T;
  if (isRecord(value)) return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, clone(child)]),
  ) as T;
  return value;
}
function merge(base: object, override: object): RecordValue {
  const entries = new Map(Object.entries(base).map(([key, value]) => [key, clone(value)]));
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const previous = entries.get(key);
    entries.set(key, isRecord(previous) && isRecord(value)
      ? merge(previous, value) : clone(value));
  }
  return Object.fromEntries(entries);
}
function mergeSelection(base: object, override: RecordValue): RecordValue {
  const output = merge(base, override);
  if (Object.hasOwn(override, "animation") && !Object.hasOwn(override, "animations")) {
    delete output.animations;
  } else if (Object.hasOwn(override, "animations") && !Object.hasOwn(override, "animation")) {
    delete output.animation;
  }
  return output;
}
type DialogueScene = Exclude<NonNullable<HexoWidgetConfig["dialogue"]>["click"], false | undefined>;
function mergeScene(base: object, override: RecordValue): DialogueScene {
  const output = mergeSelection(base, override);
  const changedSelection = Object.hasOwn(override, "animation") || Object.hasOwn(override, "animations");
  const names = Array.isArray(output.animations) ? output.animations : [output.animation];
  const selectMapping = (mapping: RecordValue): RecordValue => Object.fromEntries(names
    .filter((name): name is string => typeof name === "string" && Object.hasOwn(mapping, name))
    .map(name => [name, clone(mapping[name])]));
  if (Object.hasOwn(override, "linesByAnimation")) {
    delete output.lines;
    const inherited = isRecord((base as RecordValue).linesByAnimation)
      ? (base as RecordValue).linesByAnimation as RecordValue : {};
    output.linesByAnimation = isRecord(override.linesByAnimation)
      ? merge(changedSelection ? selectMapping(inherited) : inherited, override.linesByAnimation)
      : clone(override.linesByAnimation);
  } else if (Object.hasOwn(override, "lines")) {
    delete output.linesByAnimation;
  } else if (changedSelection && isRecord(output.linesByAnimation)) {
    output.linesByAnimation = selectMapping(output.linesByAnimation);
  }
  return output as DialogueScene;
}
