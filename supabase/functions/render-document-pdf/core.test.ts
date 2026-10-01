import { assert, assertEquals } from "jsr:@std/assert@1";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { renderDocumentPdf, dataUrlToBytes, type DocumentForPdf, type RenderRepo } from "./core.ts";
import { buildPublishedDocument, sha256Hex } from "../_shared/docLayout/index.ts";

const FONT_DIR = new URL("../../../public/fonts/noto-serif/", import.meta.url);
const fonts = {
  regular: await Deno.readFile(new URL("NotoSerif-Regular.ttf", FONT_DIR)),
  bold: await Deno.readFile(new URL("NotoSerif-Bold.ttf", FONT_DIR)),
  italic: await Deno.readFile(new URL("NotoSerif-Italic.ttf", FONT_DIR)),
  boldItalic: await Deno.readFile(new URL("NotoSerif-BoldItalic.ttf", FONT_DIR)),
};
const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

async function signedDoc(): Promise<DocumentForPdf> {
  const draft = await buildPublishedDocument({
    template: { title_template: "Thông báo", body_delta: { ops: [{ insert: "Nội dung kiểm thử tiếng Việt có dấu.\n" }] } },
    letterhead: { header: { org_name: "VinClub" }, issuer: { name: "Đại diện", seal_url: "https://x/seal.png" } },
    recipient: { full_name: "Nguyễn Văn A" },
    issuedAt: new Date("2026-09-28T03:00:00Z"),
    docNo: "VC/2026/000001",
    docId: "doc_1",
  });
  return {
    id: "doc_1",
    user_id: "u1",
    title: draft.title,
    doc_no: draft.doc_no,
    created_date: draft.created_date,
    rendered_model: draft.rendered_model,
    letterhead_snapshot: draft.letterhead_snapshot,
    layout_snapshot: draft.layout_snapshot,
    content_sha256: draft.content_sha256,
    signer_name: "Nguyễn Văn A",
    signed_at: "2026-09-28T07:32:05Z",
    signature_content: PNG_DATA_URL,
    signature_method: "draw",
    signed_ip: "1.2.3.4",
  };
}

class FakeRepo implements RenderRepo {
  uploaded: { path: string; pdf: Uint8Array } | null = null;
  finished: { path: string; sha256: string } | null = null;
  failed: string | null = null;
  constructor(public doc: DocumentForPdf | null, public claimResult: number | null = 1) {}
  claim() {
    return Promise.resolve(this.claimResult);
  }
  loadDocument() {
    return Promise.resolve(this.doc);
  }
  loadSignature() {
    return Promise.resolve(null);
  }
  loadAsset() {
    return Promise.resolve(null);
  }
  fetchImage() {
    return Promise.resolve(null);
  }
  fonts() {
    return Promise.resolve(fonts);
  }
  upload(path: string, pdf: Uint8Array) {
    this.uploaded = { path, pdf };
    return Promise.resolve();
  }
  finish(_id: string, path: string, sha256: string) {
    this.finished = { path, sha256 };
    return Promise.resolve();
  }
  fail(_id: string, error: string) {
    this.failed = error;
    return Promise.resolve();
  }
}

Deno.test("renders, uploads and records the PDF hash", async () => {
  const repo = new FakeRepo(await signedDoc());
  const r = await renderDocumentPdf(repo, "doc_1", { verifyBaseUrl: "https://app.test/verify/" });
  assertEquals(r.outcome, "done");
  assertEquals(repo.uploaded?.path, "u1/doc_1.pdf");
  assertEquals(repo.finished?.sha256, await sha256Hex(repo.uploaded!.pdf));
  const pdf = await PDFDocument.load(repo.uploaded!.pdf);
  assertEquals(pdf.getPageCount(), 1); // chữ ký minh hoạ: không có trang chứng nhận
  assertEquals(pdf.getSubject(), "VC/2026/000001");
  if (r.outcome === "done") assert(r.ms < 3000, `render took ${r.ms} ms`);
});

Deno.test("skips when there is no job to claim", async () => {
  const repo = new FakeRepo(await signedDoc(), null);
  assertEquals((await renderDocumentPdf(repo, "doc_1")).outcome, "skipped");
  assertEquals(repo.uploaded, null);
});

Deno.test("records a failure for unsigned documents", async () => {
  const doc = { ...(await signedDoc()), signed_at: null };
  const repo = new FakeRepo(doc);
  const r = await renderDocumentPdf(repo, "doc_1");
  assertEquals(r.outcome, "failed");
  assert(repo.failed?.includes("chưa ký"));
});

Deno.test("decodes data URLs", () => {
  assertEquals(dataUrlToBytes(PNG_DATA_URL)?.[0], 0x89);
  assertEquals(dataUrlToBytes("nope"), null);
});
