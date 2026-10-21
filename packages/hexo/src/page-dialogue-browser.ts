/** Serialized into the bootstrap: no imports, network requests or theme selectors. */
export function readPageDialogue(document: Document, pathname: string, pageRoot = "/"): {
  id: string;
  lines: readonly string[];
  animation?: string;
  triggers: readonly ("click" | "idle")[];
  mode: "replace" | "merge";
  order: "sequential" | "random";
} | null {
  const decodePath = (input: unknown): string | undefined => {
    if (typeof input !== "string" || input.length > 4096 || /[?#\\\u0000-\u001f]/u.test(input) || input.startsWith("//") || /^[a-z][a-z\d+.-]*:/iu.test(input)) return undefined;
    try {
      const parts = input.replace(/^\//u, "").split("/").map(part => decodeURIComponent(part));
      if (parts.some((part, index) => part === "." || part === ".." || /[/\\\u0000-\u001f]/u.test(part) || (!part && index < parts.length - 1))) return undefined;
      return parts.join("/");
    } catch { return undefined; }
  };
  const normalize = (input: string): string => !input || input.endsWith("/") ? `${input}index.html`
    : !input.slice(input.lastIndexOf("/") + 1).includes(".") ? `${input}/index.html` : input;
  const root = decodePath(pageRoot), current = decodePath(pathname);
  if (root === undefined || current === undefined) return null;
  const prefix = root && !root.endsWith("/") ? `${root}/` : root;
  if (prefix && !current.startsWith(prefix) && current !== prefix.slice(0, -1)) return null;
  const id = normalize(prefix ? current.slice(prefix.length) : current);
  const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  let result: ReturnType<typeof readPageDialogue> = null;
  for (const marker of document.querySelectorAll('script[type="application/json"][data-starlite-page-dialogue]')) {
    const raw = marker.textContent ?? "";
    if (!raw || raw.length > 140 * 1024) continue;
    try {
      const payload: unknown = JSON.parse(raw);
      if (!record(payload) || Object.keys(payload).some(key => !["path", "context"].includes(key))) continue;
      const path = decodePath(payload.path);
      if (path === undefined || normalize(path) !== id) continue;
      const context = payload.context;
      if (!record(context) || Object.keys(context).some(key => !["lines", "animation", "triggers", "mode", "order"].includes(key))) return null;
      if (!Array.isArray(context.lines) || context.lines.length < 1 || context.lines.length > 128) return null;
      const lines: string[] = [];
      for (const line of context.lines) {
        if (typeof line !== "string") return null;
        const text = line.trim(), size = new TextEncoder().encode(text).byteLength;
        if (!size || size > 1024) return null;
        lines.push(text);
      }
      const animation = context.animation;
      if (animation !== undefined && (typeof animation !== "string" || !animation.trim() || new TextEncoder().encode(animation).byteLength > 1024)) return null;
      const triggers = context.triggers;
      if (!Array.isArray(triggers) || triggers.length < 1 || triggers.length > 2 || triggers.some(value => value !== "click" && value !== "idle") || new Set(triggers).size !== triggers.length) return null;
      if (context.mode !== "replace" && context.mode !== "merge" || context.order !== "sequential" && context.order !== "random") return null;
      const next: NonNullable<ReturnType<typeof readPageDialogue>> = { id, lines, ...(animation === undefined ? {} : { animation: animation as string }), triggers: triggers as ("click" | "idle")[], mode: context.mode, order: context.order };
      if (result && JSON.stringify(result) !== JSON.stringify(next)) return null;
      result = next;
    } catch { /* Invalid page data must never prevent the blog or model loading. */ }
  }
  return result;
}
