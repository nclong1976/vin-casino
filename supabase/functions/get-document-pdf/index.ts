/**
 * Edge Function cấp link tải PDF đã ký (spec mục 8.1 - U4).
 *
 * GET ?id=<document_id> hoặc POST { document_id } với JWT của người nhận văn
 * bản hoặc Admin. Trả signed URL 5 phút của bucket private signed-documents
 * và ghi nhật ký 'downloaded'. Người nhận chỉ tải được khi đợt phát hành cho
 * phép (delivery_settings.permissions.recipient_can_download_pdf, mặc định có).
 */

import { CORS, authedUser, json, serviceClient } from "../_shared/esign/http.ts";

const URL_TTL_SECONDS = 300;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const user = await authedUser(req);
  if (!user) return json({ error: "UNAUTHENTICATED" }, 401);

  let id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id && req.method === "POST") id = String((await req.json().catch(() => ({})))?.document_id ?? "");
  if (!id) return json({ error: "BAD_REQUEST" }, 400);

  const db = serviceClient();
  const { data: doc, error } = await db.from("custom_documents").select("id, user_id, doc_no, pdf_status, pdf_path, campaign_id").eq("id", id).maybeSingle();
  if (error) return json({ error: "INTERNAL" }, 500);

  const { data: isAdmin } = doc ? await user.client.rpc("is_admin") : { data: false };
  const allowed = !!doc && (doc.user_id === user.id || isAdmin === true);
  if (!doc || !allowed) return json({ error: "NOT_FOUND" }, 404);
  if (isAdmin !== true && doc.campaign_id) {
    const { data: campaign } = await db.from("document_campaigns").select("delivery_settings").eq("id", doc.campaign_id).maybeSingle();
    if (campaign?.delivery_settings?.permissions?.recipient_can_download_pdf === false) {
      return json({ error: "DOWNLOAD_DISABLED", message: "Văn bản này không cho phép tải PDF" }, 403);
    }
  }
  if (doc.pdf_status === "purged") return json({ error: "PURGED", message: "Bản PDF đã hết thời gian lưu trữ" }, 410);
  if (doc.pdf_status !== "ready" || !doc.pdf_path) return json({ error: "NOT_READY", pdf_status: doc.pdf_status }, 409);

  const fileName = `${String(doc.doc_no || doc.id).replace(/[^\w.-]+/g, "-")}.pdf`;
  const { data: signed, error: urlError } = await db.storage.from("signed-documents").createSignedUrl(doc.pdf_path, URL_TTL_SECONDS, { download: fileName });
  if (urlError || !signed?.signedUrl) return json({ error: "INTERNAL" }, 500);

  await db.from("document_events").insert({ document_id: doc.id, event: "downloaded", actor_id: user.id });
  return json({ url: signed.signedUrl, expires_in: URL_TTL_SECONDS, file_name: fileName });
});
