/**
 * Tạo PDF cho 1 văn bản đã ký (spec mục 8.4). Logic thuần - index.ts cung cấp
 * RenderRepo thật, core.test.ts dùng dữ liệu giả.
 */

import {
  buildLayoutInput,
  formatVnDateTime,
  layoutDocument,
  sha256Hex,
  type PublishedDocument,
} from "../_shared/docLayout/index.ts";
import { renderPdf, type CertificateEvent, type PdfFontBytes } from "../_shared/docLayout/pdf.ts";

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

export interface EventRow {
  event: string;
  created_at: string;
  ip?: string | null;
  data?: Record<string, unknown> | null;
}

export interface RenderRepo {
  /** Nhận job; trả về số lần thử hoặc null nếu không có việc (đã xong / đang chạy / hết lượt). */
  claim(documentId: string): Promise<number | null>;
  loadDocument(documentId: string): Promise<DocumentForPdf | null>;
  loadEvents(documentId: string): Promise<EventRow[]>;
  loadSignature(doc: DocumentForPdf): Promise<Uint8Array | null>;
  fetchImage(url: string): Promise<Uint8Array | null>;
  fonts(): Promise<PdfFontBytes>;
  upload(path: string, pdf: Uint8Array): Promise<void>;
  finish(documentId: string, path: string, sha256: string): Promise<void>;
  fail(documentId: string, error: string): Promise<void>;
}

const EVENT_LABELS: Record<string, string> = {
  dispatched: "Phát hành văn bản",
  delivered: "Gửi tới người nhận",
  viewed: "Người nhận mở văn bản",
  signed: "Người nhận ký",
};

const METHOD_LABELS: Record<string, string> = {
  draw: "Vẽ tay",
  upload: "Tải ảnh chữ ký",
  typed: "Tạo từ nét chữ",
  saved: "Chữ ký đã lưu",
  acknowledge: "Xác nhận đã đọc",
};

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
  now?: () => Date;
}

export type RenderResult =
  | { outcome: "done"; path: string; sha256: string; bytes: number; ms: number }
  | { outcome: "skipped" }
  | { outcome: "failed"; error: string };

export async function renderDocumentPdf(repo: RenderRepo, documentId: string, options: RenderOptions = {}): Promise<RenderResult> {
  const now = options.now || (() => new Date());
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

    const events = (await repo.loadEvents(documentId))
      .filter((e) => EVENT_LABELS[e.event])
      .map<CertificateEvent>((e) => ({
        atText: formatVnDateTime(e.created_at).replace(" (GMT+7)", ""),
        label: EVENT_LABELS[e.event],
        detail: e.event === "signed" && e.ip ? `IP ${e.ip}` : undefined,
      }));

    const verifyUrl = options.verifyBaseUrl ? `${options.verifyBaseUrl}${encodeURIComponent(doc.doc_no)}` : undefined;
    const pdf = await renderPdf(
      layout,
      { fonts: await repo.fonts(), images, signatures: signature ? { recipient: signature } : {} },
      { title: doc.title || doc.doc_no, docNo: doc.doc_no, contentSha256: doc.content_sha256, creationDate: new Date(doc.signed_at) },
      {
        docNo: doc.doc_no,
        docId: doc.id,
        title: doc.title || "",
        issuerOrg: doc.letterhead_snapshot?.header?.org_name,
        contentSha256: doc.content_sha256,
        signerName: doc.signer_name,
        signedAtText: formatVnDateTime(doc.signed_at),
        signedIp: doc.signed_ip,
        userAgent: doc.signed_user_agent,
        methodText: METHOD_LABELS[doc.signature_method || ""] || doc.signature_method,
        consentText: doc.consent_text,
        events,
        verifyUrl,
        generatedAtText: formatVnDateTime(now()),
      },
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
