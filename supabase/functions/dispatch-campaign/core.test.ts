import { assert, assertEquals } from "jsr:@std/assert@1";
import { runDispatch, type Campaign, type DispatchRepo, type DocumentRow, type FailedRecipient, type Recipient, type TemplateRow } from "./core.ts";

const TEMPLATE: TemplateRow = {
  id: "tpl1",
  name: "Thông báo",
  category: "Thông báo",
  status: "published",
  title_template: "Thông báo V/v {{subject}}",
  body_delta: { ops: [{ insert: "Kính gửi " }, { insert: { variable: "user_name" } }, { insert: " - số tiền " }, { insert: { variable: "amount" } }, { insert: "\n" }] },
  variables: [
    { key: "subject", type: "text", scope: "campaign", required: true },
    { key: "amount", type: "money", scope: "recipient", required: true },
  ],
  layout: null,
  requires_signature: true,
  letterhead_id: null,
  retention_days: null,
};

const LETTERHEAD = {
  header: { org_name: "VinClub", doc_no_pattern: "VC/{{yyyy}}/{{seq}}", place: "Hà Nội" },
  footer: {},
  issuer: { name: "Đại diện", signature_url: "s", seal_url: "d" },
  theme: {},
};

function users(n: number): Recipient[] {
  return Array.from({ length: n }, (_, i) => ({ id: `u${String(i + 1).padStart(3, "0")}`, full_name: `Người ${i + 1}` }));
}

class FakeRepo implements DispatchRepo {
  campaign: Campaign;
  docs: DocumentRow[] = [];
  failed: FailedRecipient[] = [];
  seq = 0;
  finished = false;
  error: string | null = null;
  constructor(campaign: Partial<Campaign>, public recipients: Recipient[], public template: TemplateRow | null = TEMPLATE) {
    this.campaign = {
      id: "c1",
      template_id: "tpl1",
      template_version: 1,
      campaign_values: { subject: "phí" },
      audience: { type: "all", per_recipient_values: Object.fromEntries(recipients.map((r, i) => [r.id, { amount: 1000 * (i + 1) }])) },
      status: "scheduled",
      scheduled_at: null,
      updated_at: "2026-09-28T00:00:00Z",
      ...campaign,
    };
  }
  getCampaign() {
    return Promise.resolve({ ...this.campaign });
  }
  claimCampaign(_id: string, expected: { status: string }) {
    if (this.campaign.status !== expected.status) return Promise.resolve(null);
    this.campaign = { ...this.campaign, status: "dispatching" };
    return Promise.resolve({ ...this.campaign });
  }
  saveSnapshots(_id: string, patch: Partial<Campaign>) {
    Object.assign(this.campaign, patch);
    return Promise.resolve();
  }
  loadTemplate() {
    return Promise.resolve(this.template);
  }
  loadLetterhead() {
    return Promise.resolve(LETTERHEAD);
  }
  loadDefaultRetentionDays() {
    return Promise.resolve(365);
  }
  audiencePage(_a: unknown, after: string | null, limit: number) {
    return Promise.resolve(this.recipients.filter((r) => after === null || r.id > after).slice(0, limit));
  }
  nextDocNumbers(n: number) {
    return Promise.resolve(Array.from({ length: n }, () => ++this.seq));
  }
  insertBatch(_id: string, docs: DocumentRow[], cursor: string | null, failed: FailedRecipient[]) {
    const fresh = docs.filter((d) => !this.docs.some((x) => x.user_id === d.user_id));
    this.docs.push(...fresh);
    this.failed.push(...failed);
    this.campaign.dispatch_cursor = cursor;
    return Promise.resolve(fresh.length);
  }
  finish() {
    this.finished = true;
    this.campaign.status = "sent";
    return Promise.resolve();
  }
  fail(_id: string, message: string) {
    this.error = message;
    this.campaign.status = "draft";
    return Promise.resolve();
  }
}

const NOW = new Date("2026-09-28T03:00:00Z");
let idSeq = 0;
const opts = { now: () => NOW, newDocumentId: () => `doc_${++idSeq}` };

Deno.test("dispatches every recipient in batches and finishes", async () => {
  const repo = new FakeRepo({}, users(5));
  const r = await runDispatch(repo, "c1", { ...opts, batchSize: 2 });
  assertEquals(r, { outcome: "done", inserted: 5 });
  assert(repo.finished);
  assertEquals(repo.docs.length, 5);
  const first = repo.docs[0];
  assertEquals(first.title, "Thông báo V/v phí");
  assertEquals(first.content, "Kính gửi Người 1 - số tiền 1.000");
  assertEquals(first.doc_no, "VC/2026/000001");
  assertEquals(first.retention_days, 365);
  assertEquals(first.document_type, "Thông báo");
  assert(first.content_sha256.length === 64);
  assert((first.slot_boxes as Record<string, unknown>).recipient);
  assertEquals(new Set(repo.docs.map((d) => d.doc_no)).size, 5);
});

Deno.test("campaign retention overrides template and default; 0 means forever", async () => {
  const repo = new FakeRepo({ retention_days: 0 }, users(1));
  await runDispatch(repo, "c1", opts);
  assertEquals(repo.docs[0].retention_days, 0);
});

Deno.test("skips recipients missing a required per-recipient value", async () => {
  const repo = new FakeRepo({}, users(3));
  repo.campaign.audience.per_recipient_values = { u001: { amount: 1 } };
  const r = await runDispatch(repo, "c1", opts);
  assertEquals(r.inserted, 1);
  assertEquals(repo.failed.map((f) => f.user_id), ["u002", "u003"]);
  assert(repo.failed[0].reason.includes("amount"));
});

Deno.test("stops when the time budget runs out and resumes from the cursor", async () => {
  let t = NOW.getTime();
  const repo = new FakeRepo({}, users(5));
  const clock = () => new Date((t += 60));
  const first = await runDispatch(repo, "c1", { ...opts, now: clock, budgetMs: 100, batchSize: 2 });
  assertEquals(first.outcome, "continue");
  assert(repo.docs.length > 0 && repo.docs.length < 5);
  // Lần gọi sau: đợt đang 'dispatching' nhưng đã treo quá staleAfterMs.
  repo.campaign.updated_at = new Date(t - 10 * 60_000).toISOString();
  const second = await runDispatch(repo, "c1", { ...opts, now: clock, batchSize: 2 });
  assertEquals(second.outcome, "done");
  assertEquals(repo.docs.length, 5);
});

Deno.test("does not run a scheduled campaign early, nor a busy or finished one", async () => {
  const future = new FakeRepo({ scheduled_at: "2026-09-29T00:00:00Z" }, users(1));
  assertEquals((await runDispatch(future, "c1", opts)).outcome, "not_due");
  const busy = new FakeRepo({ status: "dispatching", updated_at: new Date(NOW.getTime() - 5_000).toISOString() }, users(1));
  assertEquals((await runDispatch(busy, "c1", opts)).outcome, "busy");
  const sent = new FakeRepo({ status: "sent" }, users(1));
  assertEquals((await runDispatch(sent, "c1", opts)).outcome, "skipped");
});

Deno.test("fails cleanly when the template is not published", async () => {
  const repo = new FakeRepo({}, users(1), { ...TEMPLATE, status: "draft" });
  const r = await runDispatch(repo, "c1", opts);
  assertEquals(r.outcome, "failed");
  assertEquals(repo.error, "Mẫu chưa xuất bản");
  assertEquals(repo.docs.length, 0);
});
