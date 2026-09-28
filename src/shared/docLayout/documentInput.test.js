import { describe, it, expect } from "vitest";
import { buildLayoutInput, isPublishedDocument } from "./documentInput";
import { layoutDocument } from "./layout";
import { qrRects } from "./qr";

const doc = {
  id: "doc_1",
  title: "Thông báo",
  doc_no: "VC/2026/000123",
  created_date: "2026-09-28T03:00:00Z",
  rendered_model: { ops: [{ insert: "Nội dung\n" }] },
  letterhead_snapshot: { header: { place: "Hà Nội", org_name: "VinClub" }, footer: { lines: ["Mã {{doc_no}}"], show_qr: true } },
  layout_snapshot: {},
  content_sha256: "9f2c1ab0deadbeef",
};

describe("buildLayoutInput", () => {
  it("detects phase-2 documents", () => {
    expect(isPublishedDocument(doc)).toBe(true);
    expect(isPublishedDocument({ content: "cũ" })).toBe(false);
    expect(isPublishedDocument(null)).toBe(false);
  });

  it("builds place/date, footer, hash and verify URL from the snapshot", () => {
    const input = buildLayoutInput(doc, { verifyBaseUrl: "https://app.test/verify/" });
    expect(input.placeDateText).toBe("Hà Nội, ngày 28 tháng 09 năm 2026");
    expect(input.footerLines).toEqual(["Mã VC/2026/000123"]);
    expect(input.hashShort).toBe("9f2c1ab0");
    expect(input.verifyUrl).toBe("https://app.test/verify/VC%2F2026%2F000123");
    expect(input.slotFills).toBeUndefined();
  });

  it("fills signer name and time once signed", () => {
    const input = buildLayoutInput({ ...doc, signer_name: "Nguyễn Văn A", signed_at: "2026-09-28T07:32:05Z" });
    expect(input.slotFills.recipient).toEqual({ name: "Nguyễn Văn A", signedAtText: "Ký lúc 14:32:05 28/09/2026 (GMT+7)" });
    expect(input.verifyUrl).toBeUndefined();
  });

  it("produces a layout end to end", () => {
    const r = layoutDocument(buildLayoutInput(doc, { verifyBaseUrl: "https://app.test/verify/" }));
    expect(r.pageCount).toBe(1);
    expect(r.slotBoxes.recipient).toBeTruthy();
  });
});

describe("qrRects", () => {
  it("encodes the value as horizontal runs of dark modules", () => {
    const { moduleCount, rects } = qrRects("https://app.test/verify/VC%2F2026%2F000123");
    expect(moduleCount).toBeGreaterThanOrEqual(21);
    expect(rects.length).toBeGreaterThan(0);
    // 3 ô định vị (finder) 7×7 ở các góc: hàng 0 bắt đầu bằng dải tối dài 7.
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 7 });
    rects.forEach((r) => {
      expect(r.x + r.w).toBeLessThanOrEqual(moduleCount);
    });
  });
});
