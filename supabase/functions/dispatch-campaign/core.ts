/**
 * Logic phát hành một đợt văn bản (spec mục 8.2), tách khỏi Supabase để test
 * được bằng dữ liệu giả (core.test.ts). index.ts cung cấp DispatchRepo thật.
 *
 * Mỗi lần gọi xử lý nhiều lô cho tới khi hết ngân sách thời gian rồi trả về;
 * lần gọi sau chạy tiếp từ dispatch_cursor. Lô bị chạy lại không tạo văn bản
 * trùng (unique campaign_id + user_id, xem esign_insert_campaign_batch).
 */

import {
  buildPublishedDocument,
  formatDocNo,
  type Delta,
  type LetterheadSnapshot,
  type RecipientInfo,
  type TemplateForPublish,
  type VariableValues,
} from "../_shared/docLayout/index.ts";

export interface Campaign {
  id: string;
  template_id: string;
  template_version: number;
  title?: string | null;
  campaign_values?: VariableValues | null;
  audience: Record<string, unknown> & { type: string; per_recipient_values?: Record<string, VariableValues> };
  due_at?: string | null;
  retention_days?: number | null;
  status: string;
  scheduled_at?: string | null;
  dispatch_cursor?: string | null;
  template_snapshot?: (TemplateForPublish & { id?: string; category?: string | null; retention_days?: number | null; letterhead_id?: string | null }) | null;
  letterhead_snapshot?: LetterheadSnapshot | null;
  resolved_retention_days?: number | null;
  created_by?: string | null;
  updated_at?: string | null;
}

export type TemplateRow = NonNullable<Campaign["template_snapshot"]> & { status?: string | null; version?: number | null };

export interface Recipient extends RecipientInfo {
  id: string;
}

export interface DocumentRow {
  id: string;
  user_id: string;
  title: string;
  document_type: string;
  content: string;
  created_by: string | null;
  created_date: string;
  template_id: string;
  variables_values: VariableValues;
  letterhead_snapshot: LetterheadSnapshot;
  layout_snapshot: unknown;
  rendered_model: Delta;
  slot_boxes: unknown;
  content_sha256: string;
  doc_no: string;
  requires_signature: boolean;
  due_at: string | null;
  retention_days: number;
}

export interface FailedRecipient {
  user_id: string;
  reason: string;
}

export interface DispatchRepo {
  getCampaign(id: string): Promise<Campaign | null>;
  /** Chuyển sang 'dispatching' nếu (và chỉ nếu) trạng thái hiện tại khớp; trả về bản ghi mới hoặc null. */
  claimCampaign(id: string, expected: { status: string; updated_at?: string | null }): Promise<Campaign | null>;
  saveSnapshots(id: string, patch: Pick<Campaign, "template_snapshot" | "letterhead_snapshot" | "resolved_retention_days">): Promise<void>;
  loadTemplate(id: string): Promise<TemplateRow | null>;
  /** null → khung mặc định. */
  loadLetterhead(id: string | null): Promise<LetterheadSnapshot | null>;
  loadDefaultRetentionDays(): Promise<number | null>;
  audiencePage(audience: Campaign["audience"], after: string | null, limit: number): Promise<Recipient[]>;
  nextDocNumbers(count: number): Promise<number[]>;
  insertBatch(campaignId: string, docs: DocumentRow[], cursor: string | null, failed: FailedRecipient[]): Promise<number>;
  finish(campaignId: string): Promise<void>;
  fail(campaignId: string, message: string): Promise<void>;
}

export interface DispatchOptions {
  now?: () => Date;
  /** Thời gian tối đa cho 1 lần gọi (ms). */
  budgetMs?: number;
  batchSize?: number;
  verifyBaseUrl?: string;
  newDocumentId?: () => string;
  /** Sau bao lâu không có tiến triển thì coi đợt 'dispatching' là bị treo. */
  staleAfterMs?: number;
}

export type DispatchResult =
  | { outcome: "done"; inserted: number }
  | { outcome: "continue"; inserted: number }
  | { outcome: "busy" | "not_due" | "skipped"; inserted: 0; status: string }
  | { outcome: "failed"; inserted: number; error: string };

function plainText(delta: Delta): string {
  return delta.ops
    .map((op) => (typeof op.insert === "string" ? op.insert : ""))
    .join("")
    .trim();
}

export async function runDispatch(repo: DispatchRepo, campaignId: string, options: DispatchOptions = {}): Promise<DispatchResult> {
  const now = options.now || (() => new Date());
  const budgetMs = options.budgetMs ?? 100_000;
  const batchSize = options.batchSize ?? 200;
  const staleAfterMs = options.staleAfterMs ?? 90_000;
  const newId = options.newDocumentId || (() => `doc_${crypto.randomUUID().replace(/-/g, "")}`);
  const startedAt = now().getTime();

  let campaign = await repo.getCampaign(campaignId);
  if (!campaign) return { outcome: "failed", inserted: 0, error: "Không tìm thấy đợt phát hành" };

  // ── Nhận việc ──
  if (campaign.status === "scheduled") {
    if (campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > now().getTime()) {
      return { outcome: "not_due", inserted: 0, status: campaign.status };
    }
  } else if (campaign.status === "dispatching") {
    const last = campaign.updated_at ? new Date(campaign.updated_at).getTime() : 0;
    if (now().getTime() - last < staleAfterMs) return { outcome: "busy", inserted: 0, status: campaign.status };
  } else {
    return { outcome: "skipped", inserted: 0, status: campaign.status };
  }
  const claimed = await repo.claimCampaign(campaignId, { status: campaign.status, updated_at: campaign.updated_at });
  if (!claimed) return { outcome: "busy", inserted: 0, status: campaign.status };
  campaign = claimed;

  let inserted = 0;
  try {
    // ── Chụp mẫu + khung 1 lần cho cả đợt ──
    if (!campaign.template_snapshot || !campaign.letterhead_snapshot) {
      const template = await repo.loadTemplate(campaign.template_id);
      if (!template) throw new Error("Mẫu không tồn tại");
      if (template.status && template.status !== "published") throw new Error("Mẫu chưa xuất bản");
      const letterhead = await repo.loadLetterhead(template.letterhead_id || null);
      if (!letterhead) throw new Error("Không có Khung văn bản (chưa đặt khung mặc định?)");
      const defaultRetention = await repo.loadDefaultRetentionDays();
      const retention = campaign.retention_days ?? template.retention_days ?? defaultRetention ?? 0;
      const template_snapshot = {
        id: template.id,
        name: template.name,
        category: template.category,
        title_template: template.title_template,
        body_delta: template.body_delta,
        body: template.body,
        variables: template.variables,
        layout: template.layout,
        requires_signature: template.requires_signature,
        letterhead_id: template.letterhead_id,
        retention_days: template.retention_days,
      };
      const patch = {
        template_snapshot,
        letterhead_snapshot: { header: letterhead.header || {}, footer: letterhead.footer || {}, issuer: letterhead.issuer || {}, theme: letterhead.theme || {} },
        resolved_retention_days: retention,
      };
      await repo.saveSnapshots(campaign.id, patch);
      campaign = { ...campaign, ...patch };
    }

    const template = campaign.template_snapshot as TemplateRow;
    const letterhead = campaign.letterhead_snapshot as LetterheadSnapshot;
    const retention = campaign.resolved_retention_days ?? 0;
    let cursor = campaign.dispatch_cursor ?? null;

    // ── Lô ──
    while (now().getTime() - startedAt < budgetMs) {
      const recipients = await repo.audiencePage(campaign.audience, cursor, batchSize);
      if (recipients.length === 0) {
        await repo.finish(campaign.id);
        return { outcome: "done", inserted };
      }
      const numbers = await repo.nextDocNumbers(recipients.length);
      const docs: DocumentRow[] = [];
      const failed: FailedRecipient[] = [];

      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        const recipientValues = campaign.audience.per_recipient_values?.[r.id] || {};
        const issuedAt = now();
        const id = newId();
        const draft = await buildPublishedDocument({
          template,
          letterhead,
          recipient: r,
          campaignValues: campaign.campaign_values || {},
          recipientValues,
          issuedAt,
          docNo: formatDocNo(letterhead.header?.doc_no_pattern, numbers[i], issuedAt),
          docId: id,
          dueAt: campaign.due_at,
          verifyBaseUrl: options.verifyBaseUrl,
        });
        if (draft.missingRequired.length) {
          failed.push({ user_id: r.id, reason: `Thiếu giá trị: ${draft.missingRequired.join(", ")}` });
          continue;
        }
        if (draft.exceedsMaxPages) {
          failed.push({ user_id: r.id, reason: "Văn bản vượt quá 10 trang" });
          continue;
        }
        docs.push({
          id,
          user_id: r.id,
          title: draft.title,
          document_type: template.category || "Văn bản",
          content: plainText(draft.rendered_model),
          created_by: campaign.created_by ?? null,
          created_date: draft.created_date,
          template_id: campaign.template_id,
          variables_values: recipientValues,
          letterhead_snapshot: draft.letterhead_snapshot,
          layout_snapshot: draft.layout_snapshot,
          rendered_model: draft.rendered_model,
          slot_boxes: draft.slot_boxes,
          content_sha256: draft.content_sha256,
          doc_no: draft.doc_no,
          requires_signature: draft.requires_signature,
          due_at: campaign.due_at ?? null,
          retention_days: retention,
        });
      }

      cursor = recipients[recipients.length - 1].id;
      inserted += await repo.insertBatch(campaign.id, docs, cursor, failed);

      if (recipients.length < batchSize) {
        await repo.finish(campaign.id);
        return { outcome: "done", inserted };
      }
    }
    return { outcome: "continue", inserted };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await repo.fail(campaign.id, message);
    return { outcome: "failed", inserted, error: message };
  }
}
