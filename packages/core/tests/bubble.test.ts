// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { DialogueBubble } from "../src/bubble.js";
const action = {scene:"click" as const,animation:"Click",line:"<img src=x onerror=alert(1)>",durationMs:1000};
afterEach(()=>{vi.useRealTimers();document.body.replaceChildren()});
it("shows text without a model or an animation and clears the old binding",()=>{
 const host=document.createElement("div"),bubble=new DialogueBubble(host);host.append(bubble.element);document.body.append(host);
 bubble.show(action,0);bubble.show({scene:"click",line:"Text only",durationMs:1000},100);
 expect(bubble.element.textContent).toBe("Text only");expect(bubble.element.dataset.modelAnimation).toBeUndefined();
 bubble.update(1100);expect(bubble.element.hidden).toBe(true);bubble.destroy();
});
it("renders safe accessible text and expires on the host clock",()=>{
 const host=document.createElement("div"),bubble=new DialogueBubble(host);host.append(bubble.element);document.body.append(host);
 bubble.show(action,100);expect(bubble.element.textContent).toBe(action.line);expect(bubble.element.querySelector("img")).toBeNull();
 expect(bubble.element.dataset.modelScene).toBe("click");expect(bubble.element.dataset.modelAnimation).toBe("Click");
 expect(bubble.element.getAttribute("role")).toBe("status");bubble.update(1099);expect(bubble.element.hidden).toBe(false);
 bubble.update(1100);expect(bubble.element.hidden).toBe(true);expect(bubble.element.textContent).toBe("");expect(bubble.element.dataset.modelScene).toBeUndefined();expect(bubble.element.dataset.modelAnimation).toBeUndefined();bubble.destroy();bubble.destroy();expect(host.childElementCount).toBe(0);
});
it("cancels reduced-motion timers on replacement and destroy",()=>{
 vi.useFakeTimers();const bubble=new DialogueBubble(document.createElement("div"));
 bubble.show(action,0,true);vi.advanceTimersByTime(500);bubble.show({...action,line:"next"},500,true);
 vi.advanceTimersByTime(500);expect(bubble.element.hidden).toBe(false);vi.advanceTimersByTime(500);expect(bubble.element.hidden).toBe(true);
 bubble.show(action,0,true);bubble.destroy();expect(vi.getTimerCount()).toBe(0);
});
it("keeps a bubble inside the horizontal viewport and uses the room below a top-edge host",()=>{
 const host=document.createElement("div"),bubble=new DialogueBubble(host);
 vi.spyOn(host,"getBoundingClientRect").mockReturnValue({left:-40,top:0,width:100,height:200} as DOMRect);
 vi.spyOn(bubble.element,"getBoundingClientRect").mockReturnValue({width:200,height:50} as DOMRect);
 bubble.show(action,0);expect(bubble.element.dataset.modelPlacement).toBe("below");expect(bubble.element.style.getPropertyValue("--model-bubble-shift-x")).toBe("102px");bubble.destroy();
});
