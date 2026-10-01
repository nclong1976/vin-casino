/**
 * Tạo PDF cho 1 văn bản đã ký (spec mục 8.4). Logic thuần - index.ts cung cấp
 * RenderRepo thật, core.test.ts dùng dữ liệu giả.
 */

import { buildLayoutInput, layoutDocument, sha256Hex, type PublishedDocument } from "../_shared/docLayout/index.ts";
import { renderPdf, type PdfFontBytes } from "../_shared/docLayout/pdf.ts";

export interface DocumentForPdf extends PublishedDocument {
  id: string;
  user_id: string;
  doc_no: string;
  content_sha256: string;
  signature_content?: string | null;
  signature_path?: string | null;
  signature_method?: string | null;
  signed_ip?: string | null;
  signed_user_agent?: string | null;
  consent_text?: string | null;
}

export interface RenderRepo {
  /** Nhận job; trả về số lần thử hoặc null nếu không có việc (đã xong / đang chạy / hết lượt). */
  claim(documentId: string): Promise<number | null>;
  loadDocument(documentId: string): Promise<DocumentForPdf | null>;
  loadSignature(doc: DocumentForPdf): Promise<Uint8Array | null>;
  /** Ảnh trường ký nháy / chữ ký phụ trong bucket signed-documents. */
  loadAsset(path: string): Promise<Uint8Array | null>;
  fetchImage(url: string): Promise<Uint8Array | null>;
  fonts(): Promise<PdfFontBytes>;
  upload(path: string, pdf: Uint8Array): Promise<void>;
  finish(documentId: string, path: string, sha256: string): Promise<void>;
  fail(documentId: string, error: string): Promise<void>;
}

/** data:image/png;base64,... → bytes. */
export function dataUrlToBytes(dataUrl: string | null | undefined): Uint8Array | null {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  const bin = atob(m[2]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface RenderOptions {
  verifyBaseUrl?: string;
}

export type RenderResult =
  | { outcome: "done"; path: string; sha256: string; bytes: number; ms: number }
  | { outcome: "skipped" }
  | { outcome: "failed"; error: string };

export async function renderDocumentPdf(repo: RenderRepo, documentId: string, options: RenderOptions = {}): Promise<RenderResult> {
  const attempts = await repo.claim(documentId);
  if (attempts === null) return { outcome: "skipped" };
  const started = Date.now();

  try {
    const doc = await repo.loadDocument(documentId);
    if (!doc) throw new Error("Không tìm thấy văn bản");
    if (!doc.rendered_model) throw new Error("Không phải văn bản Giai đoạn 2");
    if (!doc.signed_at) throw new Error("Văn bản chưa ký");

    const layout = layoutDocument(buildLayoutInput(doc, { verifyBaseUrl: options.verifyBaseUrl }));

    // Ảnh của khung văn bản (logo, con dấu, chữ ký đại diện) + chữ ký người nhận.
    const urls = new Set<string>();
    for (const page of layout.pages) for (const it of page.items) if (it.kind === "image") urls.add(it.src);
    const images: Record<string, Uint8Array | undefined> = {};
    await Promise.all([...urls].map(async (u) => (images[u] = (await repo.fetchImage(u)) ?? undefined)));
    const signature = (await repo.loadSignature(doc)) ?? dataUrlToBytes(doc.signature_content);

    const fieldImages: Record<string, Uint8Array | undefined> = {};
    await Promise.all(
      Object.entries(doc.field_values || {}).map(async ([id, v]) => {
        const bytes = (v?.asset_path ? await repo.loadAsset(v.asset_path) : null) ?? dataUrlToBytes(v?.image_data_url);
        if (bytes) fieldImages[id] = bytes;
      }),
    );

    // Chữ ký chỉ mang tính minh hoạ (spec hợp đồng Q4): không thêm trang
    // "chứng nhận ký"; nhật ký vẫn xem được trong trang Admin.
    const pdf = await renderPdf(
      layout,
      { fonts: await repo.fonts(), images, signatures: signature ? { recipient: signature } : {}, fieldImages },
      { title: doc.title || doc.doc_no, docNo: doc.doc_no, contentSha256: doc.content_sha256, creationDate: new Date(doc.signed_at) },
    );

    const sha256 = await sha256Hex(pdf);
    const path = `${doc.user_id}/${doc.id}.pdf`;
    await repo.upload(path, pdf);
    await repo.finish(documentId, path, sha256);
    return { outcome: "done", path, sha256, bytes: pdf.length, ms: Date.now() - started };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await repo.fail(documentId, `lần ${attempts}: ${error}`);
    return { outcome: "failed", error };
  }
}
