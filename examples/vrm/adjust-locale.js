const english = {
  "StarLite · 模型调校": "StarLite · Model adjustments",
  "模型调校": "Model adjustments",
  "本地预览 · 不修改模型文件": "Local preview · Model files stay unchanged",
  "模型预览": "Model preview",
  "预览模型": "Preview model",
  "正在读取模型…": "Reading model…",
  "跟随光标": "Follow pointer",
  "暂停": "Pause",
  "检查动作": "Preview motion",
  "让站姿更适合你的角色": "Make the stance fit your character",
  "姿态与跟随": "Pose and following",
  "全部还原": "Reset all",
  "姿态调节只作用于系统默认 Idle，保留呼吸；检查其他动作时不会套用这些修正。": "Pose adjustments affect built-in Idle only and keep its breathing. Other motions play without these corrections.",
  "基础调节": "Basic adjustments",
  "更多调节": "More adjustments",
  "用于 Hexo": "Use in Hexo",
  "把以下内容合并到现有的": "Merge this into your existing",
  "配置下。含姿态调节时会明确选用系统 Idle；仅调视线时保留原来的 Idle。模型路径由你设置。": "configuration. Pose changes explicitly select built-in Idle; gaze-only changes retain the original Idle. Set your own model path.",
  "Hexo 调节配置": "Hexo adjustment configuration",
  "复制配置": "Copy configuration",
  "滑条即时预览，不重新加载模型。调节在本页按模型分别保留；刷新后恢复默认。": "Sliders update without reloading. Adjustments stay separate for each model on this page and reset on refresh."
};
/** Static preview chrome only. Never translate model metadata or user content. */
export function translateAdjustmentPage(document, locale) {
  document.documentElement.lang = locale;
  if (locale !== 'en') return;
  const walk = document.createTreeWalker(document.documentElement, 4);
  let node;
  while ((node = walk.nextNode())) {
    const text = node.textContent.trim();
    if (Object.hasOwn(english, text)) node.textContent = node.textContent.replace(text, english[text]);
  }
  for (const element of document.querySelectorAll('[aria-label]')) {
    const label = element.getAttribute('aria-label');
    if (Object.hasOwn(english, label)) element.setAttribute('aria-label', english[label]);
  }
}
