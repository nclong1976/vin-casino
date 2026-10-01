/**
 * Edge Function ký văn bản (spec mục 8.3).
 *
 * POST (Authorization: Bearer <JWT người dùng>)
 * { document_id, idempotency_key, method, image_png_base64?, typed_text?, font?,
 *   saved_signature_id?, save_for_later?, consent, content_sha256,
 *   fields?: [{ field_id, image_png_base64?, saved_signature_id?, value_bool?, value_text? }] }
 *
 * Kiểm tra quyền sở hữu + trạng thái + hash nội dung, lưu PNG chữ ký vào bucket
 * private, ghi chữ ký bằng RPC esign_record_signature (thời điểm ký = now()
 * của Postgres), rồi gọi render-document-pdf ở nền.
 */

import { HTTP_STATUS, SignError, parseSignRequest, signDocument, type SignRepo, type SignResult, type SignErrorCode } from "./core.ts";
import { CORS, authedUser, clientIp, fireAndForget, json, serviceClient } from "../_shared/esign/http.ts";

function repo(): SignRepo {
  const db = serviceClient();
  return {
    async loadDocument(id, userId) {
      const { data, error } = await db
        .from("custom_documents")
        .select("id, user_id, status, rendered_model, content_sha256, requires_signature, signature_meta, layout_snapshot, read_completed_at, signer_name, signed_at, pdf_status, pdf_expires_at")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async loadSavedSignature(signatureId, userId) {
      const { data } = await db.from("signatures").select("content").eq("id", signatureId).eq("user_id", userId).maybeSingle();
      return typeof data?.content === "string" && data.content.startsWith("data:image/png;base64,") ? data.content : null;
    },
    async uploadSignature(path, png) {
      const { error } = await db.storage.from("signed-documents").upload(path, png, { contentType: "image/png", upsert: true });
      if (error) throw new Error(`Lưu ảnh chữ ký lỗi: ${error.message}`);
    },
    async record(a) {
      const { data, error } = await db.rpc("esign_record_signature", {
        p_document_id: a.documentId,
        p_user_id: a.userId,
        p_method: a.method,
        p_signature_content: a.signatureDataUrl,
        p_signature_path: a.signaturePath,
        p_signature_meta: a.meta,
        p_ip: a.ip,
        p_user_agent: a.userAgent,
        p_consent_text: a.consentText,
        p_field_values: a.fieldValues,
      });
      if (error) {
        const code = (Object.keys(HTTP_STATUS) as SignErrorCode[]).find((c) => error.message.includes(c));
        if (code) throw new SignError(code);
        throw new Error(error.message);
      }
      return data as SignResult;
    },
    async saveSignature(userId, dataUrl, label) {
      await db.from("signatures").insert({ id: `sig_${crypto.randomUUID().replace(/-/g, "")}`, user_id: userId, type: "draw", content: dataUrl, label });
    },
    queueRender(documentId) {
      fireAndForget("render-document-pdf", { document_id: documentId });
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await authedUser(req);
  if (!user) return json({ error: "UNAUTHENTICATED" }, 401);

  try {
    const body = parseSignRequest(await req.json().catch(() => null));
    const result = await signDocument(repo(), user.id, body, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
    return json(result);
  } catch (e) {
    if (e instanceof SignError) return json({ error: e.code, message: e.message }, HTTP_STATUS[e.code]);
    console.error("sign-document", e);
    return json({ error: "INTERNAL", message: "Không ký được văn bản, vui lòng thử lại" }, 500);
  }
});
