import type { HexoWidgetConfig } from "./types";

const weiguang: Record<string, string[]> = {
  RaisedHandWave: ["Hi! I'm Weiguang!", "Welcome to my little corner of the web.", "Hello! What would you like to read today?"],
  GentleWave: ["Hi there!", "Something on your mind? Leave a comment or say hello on social media.", "Enjoying the articles? Oh, you're just here to poke me?"],
  HighFive: ["High five!", "Yay!"],
  HighWave: ["Hello, hello! Welcome!", "I'm Weiguang, a little wolf. Nice to meet you!", "I'd love to hear your thoughts in the comments."],
  StumbleAndRecover: ["Ow... Was that you? Oh, it wasn't...", "Ah! ...I'm fine. Let's pretend you didn't see that.", "Do we stop crying when we fall because we learn to protect ourselves, or to accept the pain? Yes... I fell for philosophical reasons."],
  PlayfulScare: ["Here comes a hungry wolf!", "Boo! ...Not even a little startled?"],
  Thinking: ["Making things, sharing ideas, exploring, or experiencing life... Which matters most to you? Which matters most to me?", "Would an AI-built world feel like a cage? We already live within theories, institutions and cultures... Perhaps choice is what matters.", "The universe tends toward disorder, yet life builds little pockets of order. I hope I can keep building mine."],
  HaveAnIdea: ["Is sharing my writing a way of revealing myself? A carefully wrapped version, at least.", "Hmm... Wait... I've got it! That was easier than it looked."],
  AwkwardHeadScratch: ["Found a bug or have some feedback? Please tell me! Gently, if you can..."],
  Stretch: ["Mmm—", "Standing is tiring... Maybe a sitting animation next time?", "Have you been sitting for a while? Let's stretch together."],
  BackStretch: ["Breathe... Relax... Let your mind wander...", "Breathe... Relax... Wait, where was I going with this?", "Ah, my back... Remember to move around now and then."],
  AbsentmindedWait: ["Reading a journal entry, a technical post, or a solution? I'm guessing not the solution...", "What do you enjoy doing? I'm a big fan of naps.", "You watch the scenery from a bridge; someone upstairs is watching you."],
};
const bluefish: Record<string, string[]> = {
  StarLiteHappyWave: ["I'm right here.", "Hello! Take your time and enjoy reading."],
  StarLiteCuriousPeek: ["Found anything interesting today?", "Let me have a look too."],
  StarLiteSleepyStartle: ["Mm... I'm awake!", "Focus for a while, then remember to take a break."],
};

/** Translate shipped example text only, before applying the owner's overrides. */
export function englishPreset(preset: HexoWidgetConfig, id: "weiguang" | "bluefish"): HexoWidgetConfig {
  const result = structuredClone(preset);
  const library = id === "bluefish" ? bluefish : weiguang;
  for (const [scene, value] of Object.entries(result.dialogue ?? {})) {
    if (!value) continue;
    if (value.linesByAnimation) value.linesByAnimation = Object.fromEntries(
      Object.keys(value.linesByAnimation).map(name => [name, [...(library[name] ?? ["I'm here with you."])]]),
    );
    if (value.lines) value.lines = id === "bluefish" && scene === "enter"
      ? ["Hello! Welcome."] : [...(library[value.animation ?? ""] ?? ["I'm here with you."])];
  }
  if (id === "weiguang" && result.dialogue?.idle && result.dialogue.idle.linesByAnimation?.RaisedHandWave) {
    result.dialogue.idle.linesByAnimation = {...result.dialogue.idle.linesByAnimation, RaisedHandWave: [
      "Have an idea for StarLite? Contributions are welcome!",
      "Most of my creator's time went into making this model. It's a lot like playing with clay!",
    ]};
  }
  return result;
}
