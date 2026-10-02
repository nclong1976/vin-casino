import { describe, it, expect } from "vitest";
import { vnTime, buildSeries, seriesStats, trendColor, intradaySeries } from "./stockChart";

describe("vnTime", () => {
  it("9:00 giờ VN = 2:00 UTC", () => {
    expect(new Date(vnTime("2026-10-05", 9)).toISOString()).toBe("2026-10-05T02:00:00.000Z");
  });
});

describe("buildSeries", () => {
  const from = Date.parse("2026-10-05T02:00:00Z");
  const now = Date.parse("2026-10-05T05:00:00Z");

  it("thêm giá đầu kỳ và giá hiện tại, sắp xếp theo thời gian", () => {
    const s = buildSeries({
      ticks: [
        { ts: "2026-10-05T04:00:00Z", price: "18500" },
        { ts: "2026-10-05T03:00:00Z", price: "18400" },
      ],
      from,
      now,
      startPrice: 18350,
      lastPrice: 18450,
    });
    expect(s.map((x) => x.p)).toEqual([18350, 18400, 18500, 18450]);
    expect(s[0].t).toBe(from);
    expect(s[3].t).toBe(now);
  });

  it("bỏ tick ngoài kỳ, không nhân đôi điểm đầu", () => {
    const s = buildSeries({
      ticks: [
        { ts: "2026-10-04T03:00:00Z", price: "1" },
        { ts: "2026-10-05T02:00:00Z", price: "18400" },
      ],
      from,
      now,
      startPrice: 18350,
    });
    expect(s).toEqual([{ t: from, p: 18400 }]);
  });

  it("không có tick: đường phẳng từ đầu kỳ tới hiện tại", () => {
    const s = buildSeries({ from, now, startPrice: 100, lastPrice: 100 });
    expect(s).toEqual([
      { t: from, p: 100 },
      { t: now, p: 100 },
    ]);
  });
});

describe("seriesStats", () => {
  it("tính chênh lệch, %, cao / thấp", () => {
    const st = seriesStats([
      { t: 1, p: 100 },
      { t: 2, p: 120 },
      { t: 3, p: 90 },
      { t: 4, p: 110 },
    ]);
    expect(st).toMatchObject({ start: 100, end: 110, change: 10, pct: 10, high: 120, low: 90, flat: false });
  });

  it("rỗng => null; đứng giá => flat", () => {
    expect(seriesStats([])).toBeNull();
    expect(seriesStats([{ t: 1, p: 5 }, { t: 2, p: 5 }]).flat).toBe(true);
  });
});

describe("trendColor", () => {
  it("xanh / đỏ / vàng", () => {
    expect(trendColor(1)).toBe("#10b981");
    expect(trendColor(-1)).toBe("#ef4444");
    expect(trendColor(0)).toBe("#d4af37");
  });
});

describe("intradaySeries", () => {
  it("bắt đầu từ giá tham chiếu lúc 9:00", () => {
    const now = Date.parse("2026-10-05T04:00:00Z");
    const s = intradaySeries({
      ticks: [{ ts: "2026-10-05T03:00:00Z", price: 19000 }],
      quote: { reference_price: 18350, last_price: 19000 },
      dateStr: "2026-10-05",
      now,
    });
    expect(s.map((x) => x.p)).toEqual([18350, 19000, 19000]);
    expect(s[0].t).toBe(vnTime("2026-10-05", 9));
  });

  it("trước 9:00: phiên chưa mở, không có điểm", () => {
    const now = Date.parse("2026-10-05T01:00:00Z");
    expect(intradaySeries({ quote: { reference_price: 100, last_price: 100 }, dateStr: "2026-10-05", now })).toEqual([]);
  });
});
