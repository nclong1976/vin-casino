/** DispatchRepo thật trên Supabase (PostgREST + RPC) cho core.ts. */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Campaign, DispatchRepo, DocumentRow, FailedRecipient } from "./core.ts";
import type { LetterheadSnapshot } from "../_shared/docLayout/index.ts";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function supabaseRepo(db: SupabaseClient): DispatchRepo {
  return {
    async getCampaign(id) {
      return check(await db.from("document_campaigns").select("*").eq("id", id).maybeSingle()) as Campaign | null;
    },
    async claimCampaign(id, expected) {
      let q = db
        .from("document_campaigns")
        .update({ status: "dispatching", updated_at: new Date().toISOString(), last_error: null })
        .eq("id", id)
        .eq("status", expected.status);
      if (expected.updated_at) q = q.eq("updated_at", expected.updated_at);
      const rows = check(await q.select("*")) as Campaign[];
      return rows[0] ?? null;
    },
    async saveSnapshots(id, patch) {
      check(await db.from("document_campaigns").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
    },
    async loadTemplate(id) {
      return check(await db.from("document_templates").select("*").eq("id", id).maybeSingle());
    },
    async loadLetterhead(id) {
      const q = db.from("document_letterheads").select("header, footer, issuer, theme, status");
      const row = check(await (id ? q.eq("id", id) : q.eq("is_default", true)).maybeSingle()) as (LetterheadSnapshot & { status?: string }) | null;
      if (!row || row.status === "archived") return null;
      return { header: row.header, footer: row.footer, issuer: row.issuer, theme: row.theme };
    },
    async loadDefaultRetentionDays() {
      const row = check(await db.from("document_settings").select("config").eq("id", "default").maybeSingle()) as { config?: { default_retention_days?: number | null } } | null;
      return row?.config?.default_retention_days ?? null;
    },
    async audiencePage(audience, after, limit) {
      return check(await db.rpc("esign_audience_page", { p_audience: audience, p_after: after, p_limit: limit }));
    },
    async nextDocNumbers(count) {
      const rows = check(await db.rpc("esign_next_document_numbers", { p_count: count })) as number[];
      return rows.map(Number);
    },
    async insertBatch(campaignId, docs: DocumentRow[], cursor, failed: FailedRecipient[]) {
      return Number(check(await db.rpc("esign_insert_campaign_batch", { p_campaign_id: campaignId, p_docs: docs, p_cursor: cursor, p_failed: failed })));
    },
    async finish(campaignId) {
      const { count } = await db.from("custom_documents").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
      const now = new Date().toISOString();
      check(
        await db
          .from("document_campaigns")
          .update({ status: "sent", recipient_count: count ?? 0, dispatched_at: now, updated_at: now })
          .eq("id", campaignId)
          .eq("status", "dispatching"),
      );
    },
    async fail(campaignId, message) {
      // Về 'draft' + ghi lỗi để Admin sửa rồi phát hành lại; không để cron thử lặp vô hạn.
      check(await db.from("document_campaigns").update({ status: "draft", last_error: message, updated_at: new Date().toISOString() }).eq("id", campaignId));
    },
  };
}
