import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const { choosePanorama, availableModes, hasGeo, validateGeo, isEquirectangular, validateHotspot, degToRad, radToDeg } = await import("./vinhomesMap");

const P = (id, mode, time, extra = {}) => ({ id, mode, time_of_day: time, ...extra });

describe("choosePanorama", () => {
  const panos = [P("fd", "flycam", "day", { is_default: true }), P("fn", "flycam", "night"), P("gd", "ground", "day", { zone_id: "z1" })];

  it("đúng chế độ + thời điểm", () => {
    expect(choosePanorama(panos, { mode: "flycam", time: "night" })).toEqual({ pano: panos[1], simulatedNight: false });
  });

  it("thiếu ảnh đêm thì dùng ảnh ngày và đánh dấu mô phỏng", () => {
    expect(choosePanorama(panos, { mode: "ground", time: "night" })).toEqual({ pano: panos[2], simulatedNight: true });
  });

  it("ưu tiên ảnh của phân khu đang xem", () => {
    const list = [...panos, P("gd2", "ground", "day", { zone_id: "z2" })];
    expect(choosePanorama(list, { mode: "ground", time: "day", zoneId: "z2" }).pano.id).toBe("gd2");
  });

  it("không có ảnh => null", () => {
    expect(choosePanorama([], { mode: "flycam" })).toEqual({ pano: null, simulatedNight: false });
  });

  it("availableModes theo ảnh có thật", () => {
    expect(availableModes(panos)).toEqual(["flycam", "ground"]);
    expect(availableModes([panos[0]])).toEqual(["flycam"]);
  });
});

describe("geo", () => {
  it("hasGeo cần đủ toạ độ", () => {
    expect(hasGeo({ lat: 10.7, lng: 106.7 })).toBe(true);
    expect(hasGeo({ lat: null, lng: null })).toBe(false);
    expect(hasGeo(null)).toBe(false);
  });

  it("validateGeo", () => {
    expect(validateGeo({ lat: 10.7, lng: 106.7, zoom: 15 })).toEqual([]);
    expect(validateGeo({ lat: "", lng: "", zoom: 15 })).toEqual([]);
    expect(validateGeo({ lat: 10, lng: "", zoom: 15 })).toHaveLength(1);
    expect(validateGeo({ lat: 95, lng: 200, zoom: 25 })).toHaveLength(3);
  });
});

describe("ảnh và điểm", () => {
  it("ảnh 360 phải tỉ lệ 2:1", () => {
    expect(isEquirectangular(6144, 3072)).toBe(true);
    expect(isEquirectangular(4000, 3000)).toBe(false);
  });

  it("validateHotspot theo loại", () => {
    expect(validateHotspot({ kind: "amenity", label: "Hồ bơi", yaw: 0.1, pitch: -0.2 })).toEqual([]);
    expect(validateHotspot({ kind: "zone", label: "Park", yaw: 0, pitch: 0 })).toHaveLength(1);
    expect(validateHotspot({ kind: "link", label: "", yaw: "", pitch: 0 })).toHaveLength(3);
  });

  it("đổi độ / radian", () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI);
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90);
  });
});

const { normalizePlanMarkers, zoneColor, validatePlanMarker, hasMasterplan, ZONE_COLORS } = await import("./vinhomesMap");

describe("sa bàn", () => {
  it("chuẩn hoá điểm: kẹp toạ độ, bán kính, bỏ điểm hỏng", () => {
    const out = normalizePlanMarkers([
      { kind: "zone", x: 120, y: -5, r: 99, label: " A " },
      { kind: "amenity", x: 10, y: 10, label: "B" },
      { kind: "ufo", x: 1, y: 1 },
      { kind: "lake", x: "abc", y: 1 },
    ]);
    expect(out).toEqual([
      { kind: "zone", x: 100, y: 0, r: 30, label: "A" },
      { kind: "amenity", x: 10, y: 10, label: "B" },
    ]);
  });

  it("màu phân khu theo thứ tự cố định", () => {
    const zones = [{ id: "a" }, { id: "b" }];
    expect(zoneColor("b", zones)).toBe(ZONE_COLORS[1]);
    expect(zoneColor("x", zones)).toBe(ZONE_COLORS[0]);
  });

  it("validatePlanMarker", () => {
    expect(validatePlanMarker({ kind: "park", label: "CV", x: 10, y: 20 })).toEqual([]);
    expect(validatePlanMarker({ kind: "zone", label: "", x: "", y: 1 })).toHaveLength(3);
  });

  it("hasMasterplan", () => {
    expect(hasMasterplan({ masterplan: { markers: [{ kind: "zone", x: 1, y: 1 }] } })).toBe(true);
    expect(hasMasterplan({ masterplan: { image_url: "x", markers: [] } })).toBe(true);
    expect(hasMasterplan({ masterplan: null })).toBe(false);
  });
});
