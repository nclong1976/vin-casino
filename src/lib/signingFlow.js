/**
 * Logic thuần của luồng ký phía người nhận (spec hợp đồng mục 3): mục nào
 * còn phải điền, và dữ liệu gửi lên Edge Function sign-document. Tách khỏi
 * PublishedDocumentPage.jsx để test.
 */

/** Mã đại diện cho khung ký người nhận (khác mã trường). */
export const SLOT_TARGET = "__slot";

export function isFieldFilled(field, value) {
  if (!value) return false;
  if (field.type === "signature" || field.type === "initials") return !!value.dataUrl;
  if (field.type === "checkbox") return value.value_bool === true;
  if (field.type === "text") return !!String(value.value_text || "").trim();
  return true;
}

/** Ngày ký do server điền nên không bao giờ "thiếu". */
function needsInput(field) {
  return field.type !== "date" && field.required !== false;
}

/**
 * Các mục bắt buộc còn trống, theo thứ tự người nhận gặp khi đọc: trường
 * trong nội dung → khung ký → ký nháy ở chân trang.
 */
export function missingTargets(fields, draft, { needSlot, mainSignature }) {
  const out = [];
  for (const f of fields) if (f.anchor?.kind !== "every_page_footer" && needsInput(f) && !isFieldFilled(f, draft[f.id])) out.push(f.id);
  if (needSlot && !mainSignature) out.push(SLOT_TARGET);
  for (const f of fields) if (f.anchor?.kind === "every_page_footer" && needsInput(f) && !isFieldFilled(f, draft[f.id])) out.push(f.id);
  return out;
}

/** Tổng số mục người nhận phải điền (để hiện tiến độ k/N). */
export function requiredCount(fields, needSlot) {
  return fields.filter(needsInput).length + (needSlot ? 1 : 0);
}

/** Body gửi Edge Function sign-document. */
export function buildSignRequest({ doc, idempotencyKey, needSlot, mainSignature, draft }) {
  return {
    document_id: doc.id,
    idempotency_key: idempotencyKey,
    method: needSlot ? mainSignature.method : "acknowledge",
    image_png_base64: needSlot ? mainSignature.dataUrl || null : null,
    typed_text: mainSignature?.typedText || null,
    font: mainSignature?.font || null,
    saved_signature_id: mainSignature?.savedSignatureId || null,
    save_for_later: !!mainSignature?.saveForLater,
    consent: true,
    content_sha256: doc.content_sha256,
    fields: Object.entries(draft).map(([field_id, v]) => ({
      field_id,
      image_png_base64: v.dataUrl || null,
      value_bool: typeof v.value_bool === "boolean" ? v.value_bool : null,
      value_text: typeof v.value_text === "string" ? v.value_text : null,
    })),
  };
}
