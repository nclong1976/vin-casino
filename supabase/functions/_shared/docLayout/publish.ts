// FILE SINH TỰ ĐỘNG từ src/shared/docLayout bởi scripts/sync-shared.mjs - không sửa tay.
/**
 * Dựng MỘT văn bản đã phát hành cho MỘT người nhận từ Mẫu + Khung văn bản +
 * giá trị biến (spec mục 4.5, 5, 8.2). Bản xem trước trong màn Admin và Edge
 * Function dispatch-campaign gọi CÙNG hàm này, nên thứ Admin xem trước đúng
 * là thứ người nhận sẽ thấy.
 */

import type { Delta, RecipientInfo, VariableDef, VariableValues } from "./types.ts";
import {
  buildSystemVariables,
  legacyBodyToDelta,
  resolveDelta,
  resolveTemplateString,
} from "./resolve.ts";
import { computeContentHash } from "./canonical.ts";
import {
  layoutDocument,
  normalizeLayout,
  type LayoutResult,
  type LetterheadSnapshot,
  type SlotBox,
  type TemplateLayout,
} from "./layout.ts";
import { buildLayoutInput } from "./documentInput.ts";

/** Các cột của document_templates cần để phát hành. */
export interface TemplateForPublish {
  name?: string | null;
  title_template?: string | null;
  body_delta?: Delta | null;
  /** Thân plain-text của mẫu Giai đoạn 1 - dùng khi chưa có body_delta. */
  body?: string | null;
  variables?: VariableDef[] | null;
  layout?: TemplateLayout | null;
  requires_signature?: boolean | null;
}

export interface PublishInput {
  template: TemplateForPublish;
  letterhead: LetterheadSnapshot | null | undefined;
  recipient: RecipientInfo | null | undefined;
  campaignValues?: VariableValues;
  recipientValues?: VariableValues;
  issuedAt: Date;
  docNo: string;
  docId?: string;
  dueAt?: Date | string | null;
  verifyBaseUrl?: string;
}

export interface PublishedDocumentDraft {
  title: string;
  doc_no: string;
  created_date: string;
  rendered_model: Delta;
  letterhead_snapshot: LetterheadSnapshot;
  layout_snapshot: Required<TemplateLayout>;
  slot_boxes: Record<string, SlotBox>;
  content_sha256: string;
  requires_signature: boolean;
  /** Kết quả dàn trang (để xem trước). Không lưu vào DB. */
  layout: LayoutResult;
  missingRequired: string[];
  unknown: string[];
  exceedsMaxPages: boolean;
  unsupportedChars: string[];
}

/** Chỉ giữ 4 phần của Khung văn bản mà văn bản cần - bản sao sâu, bất biến. */
export function snapshotLetterhead(letterhead: LetterheadSnapshot | null | undefined): LetterheadSnapshot {
  const lh = letterhead || {};
  return JSON.parse(
    JSON.stringify({ header: lh.header || {}, footer: lh.footer || {}, issuer: lh.issuer || {}, theme: lh.theme || {} }),
  );
}

/** Thân mẫu dạng Delta; mẫu Giai đoạn 1 (chỉ có body) được chuyển đổi. */
export function templateBody(template: TemplateForPublish): Delta {
  if (template.body_delta && Array.isArray(template.body_delta.ops) && template.body_delta.ops.length > 0) {
    return template.body_delta;
  }
  return legacyBodyToDelta(template.body || "");
}

export async function buildPublishedDocument(input: PublishInput): Promise<PublishedDocumentDraft> {
  const { template, recipient, issuedAt, docNo } = input;
  const letterhead_snapshot = snapshotLetterhead(input.letterhead);
  const layout_snapshot = normalizeLayout(template.layout);
  const definitions = template.variables || [];
  const issuer = letterhead_snapshot.issuer || {};

  const systemContext = {
    issuedAt,
    docNo,
    docId: input.docId,
    issuerName: issuer.name,
    issuerTitle: issuer.title,
    dueAt: input.dueAt,
  };
  const valueInput = { definitions, campaignValues: input.campaignValues, recipientValues: input.recipientValues };

  const titleSystem = buildSystemVariables(recipient, systemContext);
  const title = resolveTemplateString(template.title_template || template.name || "", { ...valueInput, system: titleSystem }).trim();
  const system = buildSystemVariables(recipient, { ...systemContext, title });

  const resolved = resolveDelta(templateBody(template), { ...valueInput, system });

  const doc = {
    id: input.docId,
    title,
    doc_no: docNo,
    created_date: issuedAt.toISOString(),
    rendered_model: resolved.delta,
    letterhead_snapshot,
    layout_snapshot,
  };
  const content_sha256 = await computeContentHash(doc);
  const layout = layoutDocument(buildLayoutInput({ ...doc, content_sha256 }, { verifyBaseUrl: input.verifyBaseUrl }));

  return {
    title,
    doc_no: docNo,
    created_date: doc.created_date,
    rendered_model: resolved.delta,
    letterhead_snapshot,
    layout_snapshot,
    slot_boxes: layout.slotBoxes,
    content_sha256,
    requires_signature: template.requires_signature !== false,
    layout,
    missingRequired: resolved.missingRequired,
    unknown: resolved.unknown,
    exceedsMaxPages: layout.exceedsMaxPages,
    unsupportedChars: layout.unsupportedChars,
  };
}
