import { describe, it, expect } from "vitest";
import { DEFAULT_THEME, ILLUSTRATIVE_FOOTER, ILLUSTRATIVE_TEXT, PAGE_HEIGHT_MM, layoutDocument, normalizeFields, normalizeLayout } from "./layout";
import { buildLayoutInput } from "./documentInput";
import { collectFieldAnchors, normalizeDelta, resolveDelta } from "./resolve";

const BODY_BOTTOM = PAGE_HEIGHT_MM - DEFAULT_THEME.margins_mm.bottom;
const para = (text) => [{ insert: text }, { insert: "\n" }];
const anchor = (id) => ({ insert: { field_anchor: id } });
const LONG = "Điều khoản dài dùng để đẩy nội dung sang trang sau. ".repeat(12);

const FIELDS = [
  { id: "ok_dieu5", type: "checkbox", label: "Tôi đã đọc và đồng ý Điều 5", required: true, options: { must_be_checked: true } },
  { id: "ky_nhay", type: "initials", anchor: { kind: "every_page_footer", align: "right", pages: "all_but_last" } },
  { id: "ma_so_thue", type: "text", label: "Mã số thuế", size_mm: { w: 60, h: 7 } },
];

function input(ops, extra = {}) {
  return { title: "Hợp đồng", body: { ops }, layout: { fields: FIELDS }, ...extra };
}

const texts = (r) => r.pages.flatMap((p) => p.items.filter((i) => i.kind === "text").map((i) => i.text)).join(" ");

describe("field anchors in Delta", () => {
  it("keeps anchors through normalize and resolve", () => {
    const delta = { ops: [{ insert: "Điều 5" }, anchor("OK_Dieu5 "), { insert: "\n" }] };
    expect(normalizeDelta(delta).ops[1]).toEqual({ insert: { field_anchor: "ok_dieu5" } });
    expect(resolveDelta(delta).delta.ops).toContainEqual({ insert: { field_anchor: "ok_dieu5" } });
    expect(collectFieldAnchors(normalizeDelta(delta))).toEqual(["ok_dieu5"]);
  });
});

describe("normalizeFields", () => {
  it("drops invalid/duplicate fields and clamps sizes", () => {
    const out = normalizeFields([
      { id: "a", type: "signature", size_mm: { w: 500, h: 1 } },
      { id: "a", type: "date" },
      { id: "", type: "text" },
      { id: "b", type: "nope" },
      { id: "c", type: "checkbox", size_mm: { w: 8, h: 4 } },
      { id: "d", type: "date", anchor: { kind: "every_page_footer" } },
    ]);
    expect(out.map((f) => f.id)).toEqual(["a", "c", "d"]);
    expect(out[0].size_mm).toEqual({ w: 90, h: 12 });
    expect(out[1].size_mm).toEqual({ w: 4, h: 4 });
    // chỉ ký nháy mới được lặp ở chân trang
    expect(out[2].anchor).toEqual({ kind: "flow" });
  });

  it("defaults to no illustrative label", () => {
    expect(normalizeLayout(null).illustrative_label).toBe(false);
    expect(normalizeLayout({ illustrative_label: true }).illustrative_label).toBe(true);
    expect(normalizeLayout({ illustrative_label: false }).illustrative_label).toBe(false);
  });
});

describe("layout of fields", () => {
  it("places a flow field right after its anchor paragraph, per recipient content", () => {
    const short = layoutDocument(input([...para("Điều 1."), { insert: "Điều 5." }, anchor("ok_dieu5"), { insert: "\n" }, ...para("Điều 6.")]));
    const long = layoutDocument(input([...para(LONG), ...para(LONG), { insert: "Điều 5." }, anchor("ok_dieu5"), { insert: "\n" }, ...para("Điều 6.")]));
    const a = short.fieldBoxes.ok_dieu5[0];
    const b = long.fieldBoxes.ok_dieu5[0];
    expect(a.page).toBe(0);
    expect(b.page > a.page || b.y_mm > a.y_mm).toBe(true);

    // "Điều 6." nằm dưới ô xác nhận, không bị đè
    const line6 = short.pages[a.page].items.find((i) => i.kind === "text" && i.text.includes("Điều 6"));
    expect(line6.y).toBeGreaterThan(a.y_mm + a.h_mm);
    expect(texts(short)).toContain("Tôi đã đọc và đồng ý Điều 5");
  });

  it("places fields without an anchor after the body", () => {
    const r = layoutDocument(input(para("Nội dung")));
    expect(r.fieldBoxes.ma_so_thue).toHaveLength(1);
    expect(r.fieldBoxes.ok_dieu5).toHaveLength(1);
  });

  it("repeats initials in the footer of every page but the last, below the body area", () => {
    const r = layoutDocument(input([...para(LONG), ...para(LONG), ...para(LONG), ...para(LONG), ...para(LONG)]));
    expect(r.pageCount).toBeGreaterThan(1);
    const boxes = r.fieldBoxes.ky_nhay;
    expect(boxes.map((b) => b.page)).toEqual([...Array(r.pageCount - 1).keys()]);
    const reserve = 12 + 3.5 + 2;
    for (const b of boxes) expect(b.y_mm).toBeGreaterThan(BODY_BOTTOM - reserve);
    // chữ thân không chạm vùng ký nháy
    for (const p of r.pages) {
      for (const it of p.items) if (it.kind === "text" && it.y < BODY_BOTTOM - reserve) expect(it.y).toBeLessThan(BODY_BOTTOM - reserve + 0.01);
    }
  });

  it("draws checkbox ticks and text values from field_values", () => {
    const doc = {
      title: "HĐ",
      rendered_model: { ops: para("Nội dung") },
      layout_snapshot: { fields: FIELDS },
      signed_at: "2026-10-01T07:00:00Z",
      field_values: { ok_dieu5: { type: "checkbox", value_bool: true }, ma_so_thue: { type: "text", value_text: "0101234567" } },
    };
    const r = layoutDocument(buildLayoutInput(doc));
    expect(texts(r)).toContain("0101234567");
    const box = r.fieldBoxes.ok_dieu5[0];
    const tick = r.pages[box.page].items.filter((i) => i.kind === "line" && i.thickness === 0.45 && i.x1 >= box.x_mm && i.x2 <= box.x_mm + box.w_mm);
    expect(tick.length).toBe(2);
  });

  it("labels signatures as illustrative only when turned on", () => {
    const def = layoutDocument(input(para("x")));
    expect(texts(def)).not.toContain(ILLUSTRATIVE_FOOTER);
    const on = layoutDocument(input(para("x"), { layout: { fields: FIELDS, illustrative_label: true } }));
    expect(texts(on)).toContain(ILLUSTRATIVE_TEXT);
    expect(texts(on)).toContain(ILLUSTRATIVE_FOOTER);
    const off = layoutDocument(input(para("x"), { layout: { fields: FIELDS, illustrative_label: false } }));
    expect(texts(off)).not.toContain(ILLUSTRATIVE_TEXT);
    expect(texts(off)).not.toContain(ILLUSTRATIVE_FOOTER);
  });
});
