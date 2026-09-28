import { describe, it, expect } from "vitest";
import { luminance, makeLightPixelsTransparent, opaqueBounds } from "./imageBackground";

function rgba(pixels) {
  return new Uint8ClampedArray(pixels.flat());
}

describe("makeLightPixelsTransparent", () => {
  it("clears white pixels, keeps dark ink and feathers the edge", () => {
    const data = rgba([
      [255, 255, 255, 255],
      [20, 20, 60, 255],
      [185, 185, 185, 255],
    ]);
    makeLightPixelsTransparent(data, 200, 24);
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(255);
    expect(data[11]).toBeGreaterThan(0);
    expect(data[11]).toBeLessThan(255);
  });

  it("uses perceived luminance", () => {
    expect(luminance(255, 255, 255)).toBeCloseTo(255, 6);
    expect(luminance(0, 0, 255)).toBeLessThan(luminance(0, 255, 0));
  });
});

describe("opaqueBounds", () => {
  it("finds the tight box around visible pixels", () => {
    // 4x3, chỉ ô (1,1) và (2,2) có màu
    const px = Array.from({ length: 12 }, () => [0, 0, 0, 0]);
    px[1 * 4 + 1] = [0, 0, 0, 255];
    px[2 * 4 + 2] = [0, 0, 0, 255];
    expect(opaqueBounds(rgba(px), 4, 3)).toEqual({ x: 1, y: 1, width: 2, height: 2 });
  });

  it("returns null for a fully transparent image", () => {
    expect(opaqueBounds(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });
});
