// FILE SINH TỰ ĐỘNG từ src/shared/docLayout bởi scripts/sync-shared.mjs - không sửa tay.
/**
 * Dựng LayoutInput từ một dòng custom_documents đã phát hành. Trang web
 * (LetterheadRenderer) và Edge Function tạo PDF gọi CÙNG hàm này, nên hai
 * bên luôn dàn trang từ đúng một bộ dữ liệu.
 */

import type { Delta } from "./types.ts";
import type { FieldFill, LayoutInput, LetterheadSnapshot, TemplateLayout } from "./layout.ts";
import { formatVnDate, formatVnDateLong, formatVnDateTime, resolveTemplateString } from "./resolve.ts";

/** Giá trị 1 trường người nhận đã điền (custom_documents.field_values). */
export interface FieldValue {
  type?: string;
  value_text?: string | null;
  value_bool?: boolean | null;
  /** Ảnh chữ ký / ký nháy trong bucket signed-documents. */
  asset_path?: string | null;
  /** Cùng ảnh đó dạng data URL (trang web hiển thị). */
  image_data_url?: string | null;
  method?: string | null;
}

/** Các cột của custom_documents mà bộ dàn trang cần. */
export interface PublishedDocument {
  id?: string;
  title?: string | null;
  doc_no?: string | null;
  created_date?: string | null;
  rendered_model?: Delta | null;
  letterhead_snapshot?: LetterheadSnapshot | null;
  layout_snapshot?: TemplateLayout | null;
  content_sha256?: string | null;
  signer_name?: string | null;
  signed_at?: string | null;
  field_values?: Record<string, FieldValue> | null;
}

export interface DocumentInputOptions {
  /** Gốc URL trang verify, vd "https://app.example.com/verify/". */
  verifyBaseUrl?: string;
}

/** Văn bản có đi theo luồng Giai đoạn 2 (đã có snapshot dàn trang) hay không. */
export function isPublishedDocument(doc: PublishedDocument | null | undefined): boolean {
  return !!doc && !!doc.rendered_model && Array.isArray(doc.rendered_model.ops);
}

/** Giá trị chữ/ô tick của các trường để bộ dàn trang vẽ (ngày ký lấy theo signed_at). */
export function fieldFillsFor(doc: PublishedDocument): Record<string, FieldFill> {
  const fills: Record<string, FieldFill> = {};
  for (const [id, v] of Object.entries(doc.field_values || {})) {
    if (!v) continue;
    if (v.type === "checkbox") fills[id] = { checked: v.value_bool === true };
    else if (v.type === "date") fills[id] = { text: v.value_text || (doc.signed_at ? formatVnDate(doc.signed_at) : "") };
    else if (v.type === "text") fills[id] = { text: v.value_text || "" };
  }
  return fills;
}

export function buildLayoutInput(doc: PublishedDocument, options: DocumentInputOptions = {}): LayoutInput {
  const letterhead = doc.letterhead_snapshot || {};
  const docNo = doc.doc_no || "";
  const place = letterhead.header?.place || "";
  const dateLong = formatVnDateLong(doc.created_date || undefined);
  const system = { doc_no: docNo, doc_id: doc.id || "", title: doc.title || "" };

  return {
    letterhead,
    layout: doc.layout_snapshot || undefined,
    title: doc.title || "",
    body: doc.rendered_model,
    docNo,
    placeDateText: [place, dateLong].filter(Boolean).join(", "),
    footerLines: (letterhead.footer?.lines || []).map((line) => resolveTemplateString(line, { system })),
    hashShort: doc.content_sha256 ? doc.content_sha256.slice(0, 8) : undefined,
    verifyUrl: options.verifyBaseUrl && docNo ? `${options.verifyBaseUrl}${encodeURIComponent(docNo)}` : undefined,
    slotFills: doc.signed_at
      ? { recipient: { name: doc.signer_name || "", signedAtText: `Ký lúc ${formatVnDateTime(doc.signed_at)}` } }
      : undefined,
    fieldFills: fieldFillsFor(doc),
  };
}
