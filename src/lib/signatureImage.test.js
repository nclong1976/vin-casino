import { describe, expect, it } from "vitest";
import { dataUrlBytes, fitWithin, trimPadding } from "./signatureImage";

describe("signatureImage helpers", () => {
  it("fits inside the limit without upscaling", () => {
    expect(fitWithin(2400, 600)).toEqual({ width: 1200, height: 300, scale: 0.5 });
    expect(fitWithin(300, 100)).toEqual({ width: 300, height: 100, scale: 1 });
    expect(fitWithin(600, 1200).height).toBe(600);
  });

  it("pads the trimmed box but stays inside the image", () => {
    expect(trimPadding({ x: 2, y: 50, width: 100, height: 20 }, 110, 200, 8)).toEqual({ x: 0, y: 42, width: 110, height: 36 });
  });

  it("counts decoded bytes of a data URL", () => {
    expect(dataUrlBytes(`data:image/png;base64,${btoa("abcd")}`)).toBe(4);
    expect(dataUrlBytes(`data:image/png;base64,${btoa("abcde")}`)).toBe(5);
    expect(dataUrlBytes(`data:image/png;base64,${btoa("abcdef")}`)).toBe(6);
  });
});
