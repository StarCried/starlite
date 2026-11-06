import { expect, it } from "vitest";
import { isModelDrag } from "../src/drag-gesture";

it("classifies both hosts' drag threshold in CSS pixels, including diagonal movement", () => {
  expect(isModelDrag(0, 0)).toBe(false);
  expect(isModelDrag(6, 0)).toBe(false);
  expect(isModelDrag(0, -6)).toBe(false);
  expect(isModelDrag(3, 4)).toBe(false);
  expect(isModelDrag(6.01, 0)).toBe(true);
  expect(isModelDrag(-4, -5)).toBe(true);
});

it("rejects non-finite displacement", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(isModelDrag(value, 7)).toBe(false);
    expect(isModelDrag(7, value)).toBe(false);
  }
});
