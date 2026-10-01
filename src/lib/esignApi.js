import { supabase } from "@/lib/supabase";

/**
 * Gọi RPC / bảng / Edge Function của tính năng ký văn bản (Giai đoạn 2) mà
 * lớp base44.entities không bao được (bảng khoá kép, RPC, function).
 * Mọi hàm ném lỗi thật khi thất bại để UI báo đúng.
 */

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

// ─── Nhóm người dùng ──────────────────────────────────────────────────────

export async function listGroupMembers(groupId, { search = "", page = 0, pageSize = 50 } = {}) {
  let q = supabase
    .from("user_group_members")
    .select("user_id, added_at, users!inner(id, full_name, name, email, phone, identifier, membership_tier)", { count: "exact" })
    .eq("group_id", groupId)
    .order("added_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  const s = search.trim();
  if (s) {
    const like = `%${s.replace(/[%_,()]/g, " ")}%`;
    q = q.or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},identifier.ilike.${like}`, { referencedTable: "users" });
  }
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { rows: data || [], total: count || 0 };
}

export async function addGroupMembers(groupId, userIds, addedBy) {
  if (!userIds.length) return 0;
  const rows = userIds.map((user_id) => ({ group_id: groupId, user_id, added_by: addedBy || null }));
  unwrap(await supabase.from("user_group_members").upsert(rows, { onConflict: "group_id,user_id", ignoreDuplicates: true }));
  return rows.length;
}

export async function removeGroupMembers(groupId, userIds) {
  if (!userIds.length) return;
  unwrap(await supabase.from("user_group_members").delete().eq("group_id", groupId).in("user_id", userIds));
}

export async function importGroupMembers(groupId, identifiers) {
  return unwrap(await supabase.rpc("import_group_members", { p_group_id: groupId, p_identifiers: identifiers }));
}

export async function previewGroup(filters, limit = 20) {
  return unwrap(await supabase.rpc("preview_group", { p_filters: filters, p_limit: limit }));
}

// ─── Phát hành ────────────────────────────────────────────────────────────

export async function countAudience(audience) {
  return unwrap(await supabase.rpc("count_campaign_audience", { p_audience: audience }));
}

/** Lỗi từ Edge Function kèm mã (vd ALREADY_SIGNED) và HTTP status. */
export class EsignFunctionError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let detail = error.message;
    let code;
    try {
      const payload = await error.context?.json?.();
      code = payload?.error;
      detail = payload?.message || payload?.error || detail;
    } catch {
      // giữ message gốc
    }
    throw new EsignFunctionError(detail, code, error.context?.status);
  }
  return data;
}

/** Gọi Edge Function dispatch-campaign (JWT admin hiện tại được gửi kèm). */
export async function invokeDispatch(campaignId) {
  return invokeFunction("dispatch-campaign", { campaign_id: campaignId });
}

// ─── Người nhận ký ─────────────────────────────────────────────────────────

/** Ký văn bản qua Edge Function sign-document. Lỗi có .code (ALREADY_SIGNED...). */
export async function signDocument(body) {
  return invokeFunction("sign-document", body);
}

/** Link tải PDF đã ký (signed URL 5 phút). */
export async function getDocumentPdfUrl(documentId) {
  return invokeFunction("get-document-pdf", { document_id: documentId });
}

export async function markDocumentViewed(documentId) {
  return unwrap(await supabase.rpc("mark_document_viewed", { p_document_id: documentId }));
}

/** Người nhận đã cuộn hết văn bản (bắt buộc trước khi ký). */
export async function markDocumentRead(documentId, pagesSeen = null, durationMs = null) {
  return unwrap(
    await supabase.rpc("mark_document_read", {
      p_document_id: documentId,
      p_pages_seen: pagesSeen,
      p_duration_ms: durationMs === null ? null : Math.round(durationMs),
    }),
  );
}

/** Kiểm tra công khai theo số văn bản (+ SHA-256 của file nếu có). */
export async function verifyDocument(docNo, sha256 = null) {
  return unwrap(await supabase.rpc("verify_document", { p_doc_no: docNo, p_sha256: sha256 }));
}

export async function requeueDocumentPdf(documentId) {
  return unwrap(await supabase.rpc("esign_requeue_pdf", { p_document_id: documentId }));
}

/** Theo dõi 1 văn bản (pdf_status đổi sang 'ready'...). Trả hàm huỷ. */
export function watchDocument(documentId, onChange) {
  const channel = supabase
    .channel(`esign-doc-${documentId}-${Math.random().toString(36).slice(2, 8)}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "custom_documents", filter: `id=eq.${documentId}` }, (p) => onChange(p.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function revokeCampaign(campaignId, onlyUnsigned = true) {
  return unwrap(await supabase.rpc("revoke_document_campaign", { p_campaign_id: campaignId, p_only_unsigned: onlyUnsigned }));
}

export async function remindCampaign(campaignId) {
  return unwrap(await supabase.rpc("remind_document_campaign", { p_campaign_id: campaignId }));
}

export async function setDocumentRetention(documentId, retentionDays, legalHold) {
  return unwrap(
    await supabase.rpc("set_document_retention", { p_document_id: documentId, p_retention_days: retentionDays, p_legal_hold: legalHold }),
  );
}

// ─── Đọc dữ liệu theo dõi ─────────────────────────────────────────────────

const DOC_TRACK_COLUMNS =
  "id, user_id, title, doc_no, status, requires_signature, due_at, created_date, delivered_at, first_viewed_at, signed_at, signer_name, signed_ip, pdf_status, pdf_expires_at, retention_days, legal_hold, locked_at, revoked_reason, reminder_count";

export async function listCampaignDocuments(campaignId) {
  return unwrap(await supabase.from("custom_documents").select(DOC_TRACK_COLUMNS).eq("campaign_id", campaignId).order("created_date", { ascending: true }).limit(10000));
}

/** Đếm trạng thái văn bản cho nhiều đợt một lượt: { [campaignId]: {total, viewed, signed, pdf} }. */
export async function campaignProgress(campaignIds) {
  if (!campaignIds.length) return {};
  const rows = unwrap(
    await supabase.from("custom_documents").select("campaign_id, status, first_viewed_at, signed_at, pdf_status").in("campaign_id", campaignIds).limit(50000),
  );
  const out = {};
  for (const r of rows || []) {
    const p = (out[r.campaign_id] ||= { total: 0, viewed: 0, signed: 0, pdf: 0, revoked: 0 });
    p.total += 1;
    if (r.first_viewed_at) p.viewed += 1;
    if (r.signed_at) p.signed += 1;
    if (r.pdf_status === "ready") p.pdf += 1;
    if (r.status === "revoked") p.revoked += 1;
  }
  return out;
}

// ─── Đợt 2: trạng thái chi tiết, thao tác hàng loạt, thống kê ────────────

/** Người nhận đã tải văn bản về máy (danh sách "Văn bản của tôi" / trang văn bản). */
export async function markDocumentsDelivered(documentIds, device = null) {
  if (!documentIds?.length) return 0;
  return unwrap(await supabase.rpc("mark_documents_delivered", { p_document_ids: documentIds, p_device: device }));
}

export async function remindDocuments(documentIds) {
  return unwrap(await supabase.rpc("remind_documents", { p_document_ids: documentIds }));
}

export async function extendDocumentDue(documentIds, dueAt) {
  return unwrap(await supabase.rpc("extend_document_due", { p_document_ids: documentIds, p_due_at: dueAt }));
}

export async function revokeDocuments(documentIds, reason) {
  return unwrap(await supabase.rpc("revoke_documents", { p_document_ids: documentIds, p_reason: reason }));
}

export async function approveDocuments(documentIds, status = "approved") {
  const { data, error } = await supabase.from("custom_documents").update({ status }).in("id", documentIds).eq("status", "signed").select("id");
  if (error) throw new Error(error.message);
  return data?.length || 0;
}

export async function documentStats(days = 30) {
  return unwrap(await supabase.rpc("esign_document_stats", { p_days: days }));
}

const BOARD_COLUMNS =
  "id, user_id, title, doc_no, status, requires_signature, due_at, created_date, created_by, campaign_id, template_id, delivered_at, first_viewed_at, read_completed_at, signed_at, signer_name, signed_ip, locked_at, pdf_status, pdf_expires_at, retention_days, legal_hold, revoked_reason, reminder_count, last_reminded_at";

/**
 * Bảng "Hợp đồng & Văn bản" (spec 2.5). status là trạng thái hiển thị
 * (sent/delivered/viewed/expired... - xem esignStatus.js), lọc trên server.
 */
export async function listDocuments({ status, templateId, campaignId, from, to, userIds, search, dueSoon, ids, page = 0, pageSize = 50 } = {}) {
  let q = supabase.from("custom_documents").select(BOARD_COLUMNS, { count: "exact" }).not("rendered_model", "is", null);
  const nowIso = new Date().toISOString();
  if (status === "sent") q = q.eq("status", "pending").is("delivered_at", null).is("first_viewed_at", null).or(`due_at.is.null,due_at.gte.${nowIso}`);
  else if (status === "delivered") q = q.eq("status", "pending").not("delivered_at", "is", null).is("first_viewed_at", null).or(`due_at.is.null,due_at.gte.${nowIso}`);
  else if (status === "viewed") q = q.eq("status", "pending").not("first_viewed_at", "is", null).or(`due_at.is.null,due_at.gte.${nowIso}`);
  else if (status === "expired") q = q.or(`status.eq.expired,and(status.eq.pending,due_at.lt.${nowIso})`);
  else if (status === "open") q = q.eq("status", "pending");
  else if (status) q = q.eq("status", status);
  if (dueSoon) q = q.eq("status", "pending").gte("due_at", nowIso).lte("due_at", new Date(Date.now() + 48 * 3600 * 1000).toISOString());
  if (ids?.length) q = q.in("id", ids);
  if (templateId) q = q.eq("template_id", templateId);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  if (from) q = q.gte("created_date", from);
  if (to) q = q.lte("created_date", to);
  const s = String(search || "").trim().replace(/[%_,()]/g, " ");
  if (s || userIds) {
    const parts = [];
    if (s) parts.push(`doc_no.ilike.%${s}%`, `title.ilike.%${s}%`);
    if (userIds?.length) parts.push(`user_id.in.(${userIds.map((id) => `"${id}"`).join(",")})`);
    if (parts.length) q = q.or(parts.join(","));
    else return { rows: [], total: 0 };
  }
  const { data, error, count } = await q.order("created_date", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: data || [], total: count || 0 };
}

export async function listDocumentEvents(documentId) {
  return unwrap(
    await supabase.from("document_events").select("id, event, actor_id, ip, user_agent, device, data, created_at").eq("document_id", documentId).order("created_at", { ascending: true }),
  );
}

export async function recentDocumentEvents(limit = 15) {
  return unwrap(
    await supabase
      .from("document_events")
      .select("id, event, actor_id, ip, user_agent, data, created_at, document_id, custom_documents(title, doc_no, user_id)")
      .order("created_at", { ascending: false })
      .limit(limit),
  );
}

export function watchDocumentsTable(onChange) {
  const channel = supabase
    .channel(`esign-docs-${Math.random().toString(36).slice(2, 8)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "custom_documents" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
