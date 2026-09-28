import { describe, it, expect } from "vitest";
import { buildPublishedDocument, snapshotLetterhead, templateBody } from "./publish";
import { computeContentHash } from "./canonical";

const letterhead = {
  header: { org_name: "VinClub", place: "Hà Nội" },
  footer: { lines: ["Hotline"] },
  issuer: { name: "Đại diện", title: "TGĐ", seal_url: "s", signature_url: "g" },
  theme: {},
  // cột thừa của bảng không được lọt vào snapshot
  id: "lh_1",
  status: "published",
};

const template = {
  name: "Thông báo",
  title_template: "Thông báo V/v {{subject}}",
  body_delta: { ops: [{ insert: "Kính gửi " }, { insert: { variable: "user_name" } }, { insert: "\n" }, { insert: { variable: "notice_content" } }, { insert: "\n" }] },
  variables: [
    { key: "subject", type: "text", scope: "campaign", required: true },
    { key: "notice_content", type: "richtext", scope: "campaign", required: true },
  ],
  layout: { slots: [] },
};

const base = {
  template,
  letterhead,
  recipient: { full_name: "Nguyễn Văn A" },
  campaignValues: { subject: "phí dịch vụ", notice_content: { ops: [{ insert: "Nội dung\n" }] } },
  issuedAt: new Date("2026-09-28T03:00:00Z"),
  docNo: "VC/2026/000001",
  docId: "doc_1",
};

describe("buildPublishedDocument", () => {
  it("resolves title and body per recipient and snapshots the letterhead", async () => {
    const d = await buildPublishedDocument(base);
    expect(d.title).toBe("Thông báo V/v phí dịch vụ");
    expect(d.rendered_model.ops.map((o) => o.insert).join("")).toBe("Kính gửi Nguyễn Văn A\nNội dung\n");
    expect(Object.keys(d.letterhead_snapshot).sort()).toEqual(["footer", "header", "issuer", "theme"]);
    expect(d.layout_snapshot.slots.map((s) => s.id)).toEqual(["recipient", "issuer"]);
    expect(d.slot_boxes.recipient).toBeTruthy();
    expect(d.missingRequired).toEqual([]);
    expect(d.requires_signature).toBe(true);
    expect(d.created_date).toBe("2026-09-28T03:00:00.000Z");
  });

  it("hash matches computeContentHash of the stored columns", async () => {
    const d = await buildPublishedDocument(base);
    const again = await computeContentHash({
      title: d.title,
      rendered_model: d.rendered_model,
      layout_snapshot: d.layout_snapshot,
      letterhead_snapshot: d.letterhead_snapshot,
    });
    expect(d.content_sha256).toBe(again);
  });

  it("differs per recipient and reports missing required values", async () => {
    const a = await buildPublishedDocument(base);
    const b = await buildPublishedDocument({ ...base, recipient: { full_name: "Trần B" } });
    expect(a.content_sha256).not.toBe(b.content_sha256);
    const missing = await buildPublishedDocument({ ...base, campaignValues: {} });
    expect(missing.missingRequired).toEqual(["subject", "notice_content"]);
  });

  it("falls back to the phase-1 plain-text body", () => {
    expect(templateBody({ body: "Xin chào {{HO_TEN}}" }).ops).toEqual([{ insert: "Xin chào " }, { insert: { variable: "ho_ten" } }, { insert: "\n" }]);
    expect(snapshotLetterhead(null)).toEqual({ header: {}, footer: {}, issuer: {}, theme: {} });
  });
});
