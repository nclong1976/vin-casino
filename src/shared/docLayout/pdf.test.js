// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderPdf } from "./pdf";
import { buildPublishedDocument } from "./publish";

const fontDir = path.resolve(__dirname, "../../../public/fonts/noto-serif");
const fonts = {
  regular: fs.readFileSync(path.join(fontDir, "NotoSerif-Regular.ttf")),
  bold: fs.readFileSync(path.join(fontDir, "NotoSerif-Bold.ttf")),
  italic: fs.readFileSync(path.join(fontDir, "NotoSerif-Italic.ttf")),
  boldItalic: fs.readFileSync(path.join(fontDir, "NotoSerif-BoldItalic.ttf")),
};

// PNG 1x1 đỏ, hợp lệ.
const PNG_1PX = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

async function sample(paragraphs = 3) {
  const body = { ops: [] };
  for (let i = 0; i < paragraphs; i++) {
    body.ops.push({ insert: `Đoạn ${i + 1}: Căn cứ quy chế hoạt động, Ban điều hành trân trọng thông báo nội dung điều chỉnh tới Quý hội viên, đề nghị đọc kỹ và ký xác nhận.` });
    body.ops.push({ insert: "\n", attributes: { align: "justify" } });
  }
  return buildPublishedDocument({
    template: { title_template: "Thông báo kiểm thử", body_delta: body, variables: [] },
    letterhead: {
      header: { org_name: "VinClub", place: "Hà Nội" },
      footer: { lines: ["VinClub"], show_qr: true, show_hash: true },
      issuer: { name: "Đại diện", seal_url: "seal", signature_url: "sig" },
    },
    recipient: { full_name: "Nguyễn Văn A" },
    issuedAt: new Date("2026-09-28T03:00:00Z"),
    docNo: "VC/2026/000001",
    docId: "doc_1",
    verifyBaseUrl: "https://app.test/verify/",
  });
}

describe("renderPdf", () => {
  it("renders every layout page plus the certificate page with metadata", async () => {
    const draft = await sample(3);
    const bytes = await renderPdf(
      draft.layout,
      { fonts, images: { seal: PNG_1PX, sig: PNG_1PX }, signatures: { recipient: PNG_1PX } },
      { title: draft.title, docNo: draft.doc_no, contentSha256: draft.content_sha256, creationDate: new Date("2026-09-28T07:00:00Z") },
      {
        docNo: draft.doc_no,
        docId: "doc_1",
        title: draft.title,
        contentSha256: draft.content_sha256,
        signerName: "Nguyễn Văn A",
        signedAtText: "14:00:00 28/09/2026 (GMT+7)",
        signedIp: "1.2.3.4",
        userAgent: "Mozilla/5.0",
        methodText: "Vẽ tay",
        consentText: "Tôi đã đọc và đồng ý",
        events: [{ atText: "10:00 28/09/2026", label: "Phát hành" }],
        verifyUrl: "https://app.test/verify/VC",
        generatedAtText: "14:00:05 28/09/2026 (GMT+7)",
      },
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(draft.layout.pageCount + 1);
    expect(parsed.getSubject()).toBe("VC/2026/000001");
    expect(parsed.getKeywords()).toBe(draft.content_sha256);
    const [w, h] = [parsed.getPage(0).getWidth(), parsed.getPage(0).getHeight()];
    expect(w).toBeCloseTo(595.28, 1);
    expect(h).toBeCloseTo(841.89, 1);
    // font subset: văn bản 1 trang không nên nặng quá vài trăm KB
    expect(bytes.length).toBeLessThan(400_000);
  });

  it("skips images it cannot decode instead of failing", async () => {
    const draft = await sample(1);
    const bytes = await renderPdf(draft.layout, { fonts, images: { seal: new Uint8Array([1, 2, 3]) } }, { title: draft.title });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(draft.layout.pageCount);
  });

  it("handles multi-page documents", async () => {
    const draft = await sample(40);
    expect(draft.layout.pageCount).toBeGreaterThan(1);
    const bytes = await renderPdf(draft.layout, { fonts }, { title: draft.title });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(draft.layout.pageCount);
  });
});
