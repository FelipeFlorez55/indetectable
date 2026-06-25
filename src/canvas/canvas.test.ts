// Canvas pure-logic tests (specs 01/02). DOM-free: getStroke is pure JS and we
// avoid Path2D here. Rendering-to-canvas is left to an opt-in jsdom test.

import { describe, it, expect } from "vitest";
import { toCanvasPoint } from "./capture.ts";
import { toStrokeInput, getOutline, strokeBBox, PROCEDURAL_STYLE } from "./render.ts";
import type { Point } from "../detector/index.ts";

describe("toCanvasPoint", () => {
  it("maps client coords into canvas space via the rect", () => {
    expect(toCanvasPoint({ clientX: 130, clientY: 90 }, { left: 30, top: 20 })).toEqual({
      x: 100,
      y: 70,
    });
  });
});

const pts: Point[] = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: Math.sin(i) * 3, t: i * 16 }));

describe("toStrokeInput ([x,y]-only contract, §6.3/§13.3)", () => {
  it("drops t and pressure, keeps order", () => {
    const input = toStrokeInput(pts);
    expect(input).toHaveLength(pts.length);
    expect(input[0]).toEqual([0, 0]);
    expect(input.every((p) => p.length === 2)).toBe(true);
  });
  it("does not mutate the input points", () => {
    const before = JSON.stringify(pts);
    toStrokeInput(pts);
    expect(JSON.stringify(pts)).toBe(before);
  });
});

describe("getOutline (perfect-freehand integration)", () => {
  it("returns a non-empty outline polygon for a multi-point stroke", () => {
    expect(getOutline(pts, PROCEDURAL_STYLE).length).toBeGreaterThan(0);
  });
  it("depends only on x,y — differing timestamps/pressure don't change the outline", () => {
    const sameXY: Point[] = pts.map((p) => ({ x: p.x, y: p.y, t: p.t * 99 + 7 }));
    expect(getOutline(sameXY, PROCEDURAL_STYLE)).toEqual(getOutline(pts, PROCEDURAL_STYLE));
  });
});

describe("strokeBBox (F4)", () => {
  it("is the min/max extent of the points", () => {
    const s = { points: [
      { x: 10, y: 50, t: 0 }, { x: 30, y: 20, t: 1 }, { x: 5, y: 80, t: 2 },
    ] };
    expect(strokeBBox(s)).toEqual({ x: 5, y: 20, w: 25, h: 60 });
  });
  it("is zero-sized for an empty stroke", () => {
    expect(strokeBBox({ points: [] })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});
