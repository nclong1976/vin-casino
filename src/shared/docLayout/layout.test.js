import { describe, it, expect } from "vitest";
import {
  DEFAULT_THEME,
  MAX_PAGES,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  layoutDocument,
  placeSignatureImage,
  slotImageArea,
} from "./layout";
import { NOTO_SERIF, measureTextMm } from "./metrics";

const M = DEFAULT_THEME.margins_mm;
const CONTENT_LEFT = M.left;
const CONTENT_RIGHT = PAGE_WIDTH_MM - M.right;
const BODY_BOTTOM = PAGE_HEIGHT_MM - M.bottom;
const EPS = 1e-6;

const letterhead = {
  header: { org_name: "VinClub", show_national_motto: true, place: "Hà Nội" },
  footer: { lines: ["VinClub · Hotline 1900 0000"], show_page_number: true, show_hash: true, show_qr: true },
  issuer: { name: "Đại diện VinClub", title: "Ban điều hành", seal_url: "https://x/seal.png", signature_url: "https://x/sig.png" },
};

const para = (text, block) => [{ insert: text }, block ? { insert: "\n", attributes: block } : { insert: "\n" }];
const LOREM =
  "Căn cứ quy chế hoạt động của VinClub, Ban điều hành trân trọng thông báo tới quý hội viên về việc điều chỉnh chính sách phí dịch vụ áp dụng từ kỳ tới, đề nghị quý hội viên đọc kỹ và ký xác nhận.";

function baseInput(ops, extra = {}) {
  return {
    letterhead,
    title: "Thông báo điều chỉnh phí",
    body: { ops },
    docNo: "VC/2026/000123",
    placeDateText: "Hà Nội, ngày 28 tháng 09 năm 2026",
    hashShort: "9f2c1ab0",
    verifyUrl: "https://example.com/verify/VC-2026-000123",
    ...extra,
  };
}

const texts = (page) => page.items.filter((i) => i.kind === "text");
const allText = (result) => result.pages.flatMap(texts).map((t) => t.text).join(" ");

describe("layoutDocument", () => {
  it("is deterministic", () => {
    const input = baseInput([...para(LOREM), ...para(LOREM, { align: "justify" })]);
    expect(layoutDocument(input)).toEqual(layoutDocument(input));
  });

  it("renders letterhead header, title and footer", () => {
    const r = layoutDocument(baseInput(para("Nội dung")));
    const t = allText(r);
    expect(t).toContain("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM");
    expect(t).toContain("Độc lập - Tự do - Hạnh phúc");
    expect(t).toContain("VINCLUB");
    expect(t).toContain("Số: VC/2026/000123");
    expect(t).toContain("THÔNG BÁO ĐIỀU CHỈNH PHÍ");
    expect(t).toContain("Mã VB: VC/2026/000123 · Trang 1/1 · SHA-256: 9f2c1ab0");
    expect(r.pages[0].items.some((i) => i.kind === "qr" && i.value.includes("verify"))).toBe(true);
  });

  it("omits the national motto when disabled", () => {
    const r = layoutDocument({ ...baseInput(para("x")), letterhead: { ...letterhead, header: { org_name: "A", show_national_motto: false } } });
    expect(allText(r)).not.toContain("CỘNG HÒA");
  });

  it("keeps every text item inside the page content width", () => {
    const longWord = "A".repeat(400);
    const r = layoutDocument(baseInput([...para(LOREM, { align: "justify" }), ...para(longWord), ...para(LOREM, { align: "right" }), ...para(LOREM, { list: "bullet", indent: 1 })]));
    for (const page of r.pages) {
      for (const t of texts(page)) {
        expect(t.x).toBeGreaterThanOrEqual(CONTENT_LEFT - EPS);
        expect(t.x + t.width).toBeLessThanOrEqual(CONTENT_RIGHT + EPS);
      }
    }
  });

  it("text item widths match the shared metrics table", () => {
    const r = layoutDocument(baseInput(para("Tiếng Việt có dấu: Ưu đãi đặc biệt")));
    for (const t of texts(r.pages[0])) {
      expect(t.width).toBeCloseTo(measureTextMm(NOTO_SERIF.styles[t.font], t.text, t.sizePt), 9);
    }
  });

  it("justifies all lines but the last to the full content width", () => {
    const r = layoutDocument(baseInput([...para(LOREM + " " + LOREM, { align: "justify" })]));
    const body = texts(r.pages[0]).filter((t) => t.sizePt === DEFAULT_THEME.font_size_pt);
    const lines = new Map();
    body.forEach((t) => lines.set(t.y, [...(lines.get(t.y) || []), t]));
    const ys = [...lines.keys()].sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(2);
    ys.slice(0, -1).forEach((y) => {
      const items = lines.get(y);
      const last = items[items.length - 1];
      expect(items[0].x).toBeCloseTo(CONTENT_LEFT, 6);
      expect(last.x + last.width).toBeCloseTo(CONTENT_RIGHT, 6);
    });
    const lastLine = lines.get(ys[ys.length - 1]);
    const end = lastLine[lastLine.length - 1];
    expect(end.x + end.width).toBeLessThan(CONTENT_RIGHT - 1);
  });

  it("centers and right-aligns lines", () => {
    const r = layoutDocument(baseInput([...para("Giữa", { align: "center" }), ...para("Phải", { align: "right" })]));
    const center = texts(r.pages[0]).find((t) => t.text === "Giữa");
    const right = texts(r.pages[0]).find((t) => t.text === "Phải");
    expect(center.x + center.width / 2).toBeCloseTo((CONTENT_LEFT + CONTENT_RIGHT) / 2, 6);
    expect(right.x + right.width).toBeCloseTo(CONTENT_RIGHT, 6);
  });

  it("keeps inline styles as separate runs", () => {
    const r = layoutDocument(
      baseInput([{ insert: "Thường " }, { insert: "đậm", attributes: { bold: true } }, { insert: " và " }, { insert: "gạch", attributes: { underline: true, italic: true } }, { insert: "\n" }]),
    );
    const t = texts(r.pages[0]);
    expect(t.find((i) => i.text === "đậm").font).toBe("bold");
    const u = t.find((i) => i.text === "gạch");
    expect(u.font).toBe("italic");
    expect(u.underline).toBe(true);
  });

  it("numbers ordered lists and resets after a normal paragraph", () => {
    const r = layoutDocument(
      baseInput([
        ...para("Một", { list: "ordered" }),
        ...para("Hai", { list: "ordered" }),
        ...para("Con", { list: "ordered", indent: 1 }),
        ...para("Ba", { list: "ordered" }),
        ...para("Chấm", { list: "bullet" }),
        ...para("Thường"),
        ...para("Lại một", { list: "ordered" }),
      ]),
    );
    const markers = texts(r.pages[0]).filter((t) => /^(\d+\.|[a-z]\.|•)$/.test(t.text)).map((t) => t.text);
    expect(markers).toEqual(["1.", "2.", "a.", "3.", "•", "1."]);
  });

  it("paginates long bodies and keeps body text above the bottom margin", () => {
    const ops = Array.from({ length: 60 }, () => para(LOREM, { align: "justify" })).flat();
    const r = layoutDocument(baseInput(ops));
    expect(r.pageCount).toBeGreaterThan(2);
    expect(r.exceedsMaxPages).toBe(false);
    for (const page of r.pages) {
      for (const t of texts(page).filter((i) => i.sizePt === DEFAULT_THEME.font_size_pt)) {
        expect(t.y).toBeLessThanOrEqual(BODY_BOTTOM + EPS);
        expect(t.y).toBeGreaterThanOrEqual(M.top);
      }
    }
    expect(allText(r)).toContain(`Trang ${r.pageCount}/${r.pageCount}`);
  });

  it("flags documents longer than the page limit", () => {
    const ops = Array.from({ length: 400 }, () => para(LOREM)).flat();
    const r = layoutDocument(baseInput(ops));
    expect(r.pageCount).toBeGreaterThan(MAX_PAGES);
    expect(r.exceedsMaxPages).toBe(true);
  });

  it("never leaves a heading alone at the bottom of a page", () => {
    for (let n = 20; n <= 45; n++) {
      const ops = [...Array.from({ length: n }, () => para("Dòng ngắn")).flat(), ...para("Mục II", { header: 2 }), ...para(LOREM)];
      const r = layoutDocument(baseInput(ops));
      r.pages.slice(0, -1).forEach((page) => {
        const body = texts(page).filter((t) => t.y <= BODY_BOTTOM);
        expect(body[body.length - 1].text).not.toBe("Mục II");
      });
    }
  });

  it("keeps the signature zone together and reports slot boxes on its page", () => {
    for (let n = 25; n <= 40; n++) {
      const ops = Array.from({ length: n }, () => para("Dòng ngắn")).flat();
      const r = layoutDocument(baseInput(ops));
      const { recipient, issuer } = r.slotBoxes;
      expect(recipient.page).toBe(r.pageCount - 1);
      expect(issuer.page).toBe(recipient.page);
      expect(recipient.y_mm + recipient.h_mm).toBeLessThanOrEqual(BODY_BOTTOM + EPS);
      expect(issuer.y_mm + issuer.h_mm).toBeLessThanOrEqual(BODY_BOTTOM + EPS);
      const page = r.pages[recipient.page];
      const heading = texts(page).find((t) => t.text === "NGƯỜI NHẬN");
      expect(heading).toBeTruthy();
      expect(heading.y).toBeLessThan(recipient.y_mm);
    }
  });

  it("places recipient bottom-left and issuer bottom-right with configured sizes", () => {
    const layout = {
      slots: [
        { id: "recipient", role: "recipient", column: "left", align: "center", heading: "NGƯỜI NHẬN", box: { w_mm: 70, h_mm: 25 }, show_name: true, show_signed_at: true },
        { id: "issuer", role: "issuer", column: "right", align: "center", heading: "BÊN PHÁT HÀNH", box: { w_mm: 60, h_mm: 30, offset_x_mm: 500 }, show_name: true },
      ],
    };
    const r = layoutDocument({ ...baseInput(para("x")), layout });
    const colW = (CONTENT_RIGHT - CONTENT_LEFT) / 2;
    const { recipient, issuer } = r.slotBoxes;
    expect(recipient.w_mm).toBe(70);
    expect(recipient.x_mm + recipient.w_mm / 2).toBeCloseTo(CONTENT_LEFT + colW / 2, 6);
    // offset lớn bị kẹp lại trong cột phải
    expect(issuer.x_mm).toBeGreaterThanOrEqual(CONTENT_LEFT + colW - EPS);
    expect(issuer.x_mm + issuer.w_mm).toBeLessThanOrEqual(CONTENT_RIGHT + EPS);
  });

  it("auto-fills the issuer slot with seal, signature and name", () => {
    const r = layoutDocument(baseInput(para("x")));
    const page = r.pages[r.slotBoxes.issuer.page];
    const roles = page.items.filter((i) => i.kind === "image").map((i) => i.role);
    expect(roles).toEqual(expect.arrayContaining(["seal", "issuer_signature"]));
    expect(texts(page).some((t) => t.text === "Đại diện VinClub")).toBe(true);
    expect(texts(page).some((t) => t.text === "Ban điều hành")).toBe(true);
  });

  it("fills recipient name and signed time inside the box once signed", () => {
    const unsigned = layoutDocument(baseInput(para("x")));
    const signed = layoutDocument({
      ...baseInput(para("x")),
      slotFills: { recipient: { name: "Nguyễn Văn A", signedAtText: "14:32:05 28/09/2026 (GMT+7)" } },
    });
    expect(allText(unsigned)).not.toContain("Nguyễn Văn A");
    const box = signed.slotBoxes.recipient;
    const page = signed.pages[box.page];
    for (const text of ["Nguyễn Văn A", "14:32:05 28/09/2026 (GMT+7)"]) {
      const item = texts(page).find((t) => t.text === text);
      expect(item).toBeTruthy();
      expect(item.y).toBeGreaterThan(box.y_mm);
      expect(item.y).toBeLessThanOrEqual(box.y_mm + box.h_mm);
      expect(item.x).toBeGreaterThanOrEqual(box.x_mm);
      expect(item.x + item.width).toBeLessThanOrEqual(box.x_mm + box.w_mm + EPS);
    }
  });

  it("truncates a signer name that is too long for the box", () => {
    const r = layoutDocument({ ...baseInput(para("x")), slotFills: { recipient: { name: "Nguyễn ".repeat(30) } } });
    const box = r.slotBoxes.recipient;
    const name = texts(r.pages[box.page]).find((t) => t.text.startsWith("Nguyễn"));
    expect(name.text.endsWith("…")).toBe(true);
    expect(name.x + name.width).toBeLessThanOrEqual(box.x_mm + box.w_mm + EPS);
  });

  it("marks unresolved variables and reports unsupported characters", () => {
    const r = layoutDocument(baseInput([{ insert: "Xin chào " }, { insert: { variable: "user_name" } }, { insert: " 中文\n" }]));
    const ph = texts(r.pages[0]).find((t) => t.placeholder);
    expect(ph.text).toBe("{{user_name}}");
    expect(r.unsupportedChars).toEqual(["中", "文"]);
  });
});

describe("signature image placement", () => {
  it("reserves name/time bands at the bottom of the slot", () => {
    const area = slotImageArea({ show_name: true, show_signed_at: true }, { x: 10, y: 100, w: 60, h: 25 });
    expect(area).toEqual({ x: 12, y: 102, w: 56, h: 11 });
  });

  it("contains the image, centers it and sits it on the bottom edge", () => {
    const area = { x: 12, y: 102, w: 56, h: 11 };
    const wide = placeSignatureImage(area, 1200, 100);
    expect(wide.w).toBeCloseTo(56, 9);
    expect(wide.y + wide.h).toBeCloseTo(113, 9);
    const tall = placeSignatureImage(area, 100, 100);
    expect(tall.h).toBeCloseTo(11, 9);
    expect(tall.x + tall.w / 2).toBeCloseTo(40, 9);
    expect(placeSignatureImage(area, 0, 10).w).toBe(0);
  });
});
