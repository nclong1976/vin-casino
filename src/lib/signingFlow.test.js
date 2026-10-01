import { describe, it, expect } from "vitest";
import { SLOT_TARGET, buildSignRequest, missingTargets, requiredCount } from "./signingFlow";

const FIELDS = [
  { id: "ky_nhay", type: "initials", required: true, anchor: { kind: "every_page_footer" } },
  { id: "ok", type: "checkbox", required: true, anchor: { kind: "flow" } },
  { id: "ghi_chu", type: "text", required: false, anchor: { kind: "flow" } },
  { id: "mst", type: "text", required: true, anchor: { kind: "flow" } },
  { id: "ngay", type: "date", required: true, anchor: { kind: "flow" } },
];

describe("missingTargets", () => {
  it("lists required items in reading order: body fields, signature box, footer initials", () => {
    expect(missingTargets(FIELDS, {}, { needSlot: true, mainSignature: null })).toEqual(["ok", "mst", SLOT_TARGET, "ky_nhay"]);
  });

  it("drops items once filled; unchecked boxes and blank text still count as missing", () => {
    const draft = { ok: { value_bool: false }, mst: { value_text: "  " }, ky_nhay: { dataUrl: "data:image/png;base64,AA" } };
    expect(missingTargets(FIELDS, draft, { needSlot: true, mainSignature: { dataUrl: "x" } })).toEqual(["ok", "mst"]);
    const done = { ...draft, ok: { value_bool: true }, mst: { value_text: "0101" } };
    expect(missingTargets(FIELDS, done, { needSlot: true, mainSignature: { dataUrl: "x" } })).toEqual([]);
  });

  it("skips the signature box for acknowledge-only documents", () => {
    expect(missingTargets([], {}, { needSlot: false, mainSignature: null })).toEqual([]);
    expect(requiredCount(FIELDS, false)).toBe(3);
    expect(requiredCount(FIELDS, true)).toBe(4);
  });
});

describe("buildSignRequest", () => {
  it("sends the main signature and every field value", () => {
    const body = buildSignRequest({
      doc: { id: "d1", content_sha256: "h" },
      idempotencyKey: "k",
      needSlot: true,
      mainSignature: { method: "typed", dataUrl: "data:sig", typedText: "Nguyễn A", font: "Great Vibes", saveForLater: true },
      draft: { ok: { type: "checkbox", value_bool: true }, ky_nhay: { type: "initials", dataUrl: "data:ini" }, mst: { type: "text", value_text: "0101" } },
    });
    expect(body).toMatchObject({ document_id: "d1", method: "typed", image_png_base64: "data:sig", typed_text: "Nguyễn A", save_for_later: true, consent: true, content_sha256: "h" });
    expect(body.fields).toEqual([
      { field_id: "ok", image_png_base64: null, value_bool: true, value_text: null },
      { field_id: "ky_nhay", image_png_base64: "data:ini", value_bool: null, value_text: null },
      { field_id: "mst", image_png_base64: null, value_bool: null, value_text: "0101" },
    ]);
  });

  it("uses acknowledge without an image when no signature box is required", () => {
    const body = buildSignRequest({ doc: { id: "d1", content_sha256: "h" }, idempotencyKey: "k", needSlot: false, mainSignature: null, draft: {} });
    expect(body.method).toBe("acknowledge");
    expect(body.image_png_base64).toBeNull();
    expect(body.fields).toEqual([]);
  });
});
