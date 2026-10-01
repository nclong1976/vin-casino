/**
 * Thay biến động trên Quill Delta (spec mục 5.2).
 *
 * Không có HTML ở bất kỳ bước nào: giá trị biến luôn được chèn như văn bản
 * thuần (hoặc Delta con đã lọc định dạng với biến richtext), nên nội dung
 * Admin/biến không thể mang theo mã chạy được khi hiển thị.
 */

import type {
  Delta,
  DeltaAttributes,
  DeltaOp,
  FieldAnchorEmbed,
  RecipientInfo,
  SystemContext,
  VariableDef,
  VariableValue,
  VariableValues,
} from "./types";

export const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** Bảng màu chữ cố định mà toolbar cho phép (spec 3.4). */
export const ALLOWED_COLORS = ["#000000", "#948154", "#1a3c8f", "#b91c1c", "#6b7280"];

const INLINE_KEYS = ["bold", "italic", "underline", "color"] as const;
const MAX_INDENT = 1;

/** Key biến chuẩn: snake_case chữ thường; so khớp không phân biệt hoa/thường. */
/** Mã trường: chữ thường, số, gạch dưới - tối đa 40 ký tự. */
export function normalizeFieldId(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
}

/** Embed điểm neo trường (`{ field_anchor }`) hay không. */
export function isFieldAnchor(insert: DeltaOp["insert"]): insert is FieldAnchorEmbed {
  return typeof insert === "object" && insert !== null && typeof (insert as FieldAnchorEmbed).field_anchor === "string";
}

/** Mã các trường được neo trong thân văn bản (theo thứ tự xuất hiện). */
export function collectFieldAnchors(body: Delta | null | undefined): string[] {
  const seen = new Set<string>();
  for (const op of body?.ops || []) {
    if (op && isFieldAnchor(op.insert)) {
      const id = normalizeFieldId(op.insert.field_anchor);
      if (id) seen.add(id);
    }
  }
  return [...seen];
}

export function normalizeVariableKey(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function isNewline(op: DeltaOp): boolean {
  return op.insert === "\n";
}

/**
 * Chỉ giữ thuộc tính nằm trong tập được hỗ trợ. Thuộc tính block chỉ hợp lệ
 * trên op "\n"; thuộc tính inline chỉ hợp lệ trên op chữ/biến.
 */
export function filterAllowedAttributes(
  attrs: Record<string, unknown> | undefined,
  block: boolean,
): DeltaAttributes | undefined {
  if (!attrs || typeof attrs !== "object") return undefined;
  const out: DeltaAttributes = {};
  if (block) {
    if (attrs.header === 1 || attrs.header === 2 || attrs.header === 3) out.header = attrs.header;
    if (attrs.align === "center" || attrs.align === "right" || attrs.align === "justify") out.align = attrs.align;
    if (attrs.list === "ordered" || attrs.list === "bullet") out.list = attrs.list;
    const indent = Number(attrs.indent);
    if (Number.isInteger(indent) && indent > 0) out.indent = Math.min(indent, MAX_INDENT);
  } else {
    for (const key of INLINE_KEYS) {
      if (key === "color") {
        const color = typeof attrs.color === "string" ? attrs.color.toLowerCase() : "";
        if (ALLOWED_COLORS.includes(color) && color !== "#000000") out.color = color;
      } else if (attrs[key] === true) {
        out[key] = true;
      }
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sameAttributes(a?: DeltaAttributes, b?: DeltaAttributes): boolean {
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  if (ka.length !== kb.length) return false;
  return ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

function withAttributes(insert: DeltaOp["insert"], attributes?: DeltaAttributes): DeltaOp {
  return attributes ? { insert, attributes } : { insert };
}

/**
 * Tách mọi op chữ có chứa "\n" thành các op riêng (Quill cho phép "a\nb"
 * trong 1 op khi không có định dạng block), chuẩn hoá NFC, lọc định dạng,
 * gộp các op chữ liền kề cùng định dạng, và bảo đảm Delta kết thúc bằng "\n".
 */
export function normalizeDelta(input: Delta | DeltaOp[] | null | undefined): Delta {
  const source = Array.isArray(input) ? input : input?.ops || [];
  const out: DeltaOp[] = [];

  const push = (op: DeltaOp) => {
    const last = out[out.length - 1];
    if (
      last &&
      typeof op.insert === "string" &&
      typeof last.insert === "string" &&
      op.insert !== "\n" &&
      last.insert !== "\n" &&
      sameAttributes(last.attributes, op.attributes)
    ) {
      last.insert += op.insert;
      return;
    }
    out.push(op);
  };

  for (const op of source) {
    if (!op || op.insert === undefined || op.insert === null) continue;
    if (typeof op.insert === "object") {
      const anchor = normalizeFieldId((op.insert as { field_anchor?: string }).field_anchor || "");
      if (anchor) {
        push({ insert: { field_anchor: anchor } });
        continue;
      }
      const key = normalizeVariableKey((op.insert as { variable?: string }).variable || "");
      if (key) push(withAttributes({ variable: key }, filterAllowedAttributes(op.attributes as Record<string, unknown>, false)));
      continue;
    }
    const text = String(op.insert).normalize("NFC").replace(/\r\n?/g, "\n");
    const parts = text.split("\n");
    parts.forEach((part, i) => {
      if (part) push(withAttributes(part, filterAllowedAttributes(op.attributes as Record<string, unknown>, false)));
      if (i < parts.length - 1) {
        // "\n" nằm giữa chuỗi nhiều dòng chỉ mang định dạng block khi op đó
        // là đúng 1 ký tự "\n" (quy ước Quill); ngược lại là đoạn thường.
        const blockAttrs = text === "\n" ? filterAllowedAttributes(op.attributes as Record<string, unknown>, true) : undefined;
        push(withAttributes("\n", blockAttrs));
      }
    });
  }

  if (out.length === 0 || !isNewline(out[out.length - 1])) out.push({ insert: "\n" });
  return { ops: out };
}

/** Chuyển văn bản thuần (nội dung Giai đoạn 1) thành Delta, mỗi dòng 1 đoạn. */
export function plainTextToDelta(text: string): Delta {
  return normalizeDelta([{ insert: `${String(text || "").replace(/\s+$/, "")}\n` }]);
}

/**
 * Chuyển thân mẫu Giai đoạn 1 (plain-text có `{{BIEN}}`) thành Delta với
 * biến dạng embed - dùng khi mở một mẫu cũ trong trình soạn mới.
 */
export function legacyBodyToDelta(body: string): Delta {
  const ops: DeltaOp[] = [];
  const re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  const text = String(body || "");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) ops.push({ insert: text.slice(last, m.index) });
    ops.push({ insert: { variable: m[1] } });
    last = m.index + m[0].length;
  }
  if (last < text.length) ops.push({ insert: text.slice(last) });
  ops.push({ insert: "\n" });
  return normalizeDelta(ops);
}

// ─── Định dạng giá trị ────────────────────────────────────────────────────

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function vnDateParts(date: Date): { dd: string; mm: string; yyyy: string; hh: string; mi: string; ss: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return { dd: get("day"), mm: get("month"), yyyy: get("year"), hh: get("hour"), mi: get("minute"), ss: get("second") };
}

/** dd/MM/yyyy theo giờ Việt Nam. */
export function formatVnDate(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const { dd, mm, yyyy } = vnDateParts(d);
  return `${dd}/${mm}/${yyyy}`;
}

/** "ngày 28 tháng 09 năm 2026" theo giờ Việt Nam. */
export function formatVnDateLong(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const { dd, mm, yyyy } = vnDateParts(d);
  return `ngày ${dd} tháng ${mm} năm ${yyyy}`;
}

/** "HH:mm:ss dd/MM/yyyy (GMT+7)" - dùng cho giờ ký. */
export function formatVnDateTime(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const { dd, mm, yyyy, hh, mi, ss } = vnDateParts(d);
  return `${hh}:${mi}:${ss} ${dd}/${mm}/${yyyy} (GMT+7)`;
}

/** 1234567 -> "1.234.567". Chuỗi không phải số được giữ nguyên. */
export function formatMoney(value: VariableValue): string {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  const digits = raw.replace(/[.,\s]/g, "");
  if (!/^-?\d+$/.test(digits)) return raw;
  const negative = digits.startsWith("-");
  const body = (negative ? digits.slice(1) : digits).replace(/^0+(?=\d)/, "");
  return `${negative ? "-" : ""}${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Che số CCCD/CMND: giữ 4 số đầu, 3 số cuối. */
export function maskIdCard(value: string | null | undefined): string {
  const s = String(value || "").trim();
  if (s.length <= 7) return s ? "*".repeat(s.length) : "";
  return `${s.slice(0, 4)}${"*".repeat(s.length - 7)}${s.slice(-3)}`;
}

function isDelta(value: unknown): value is Delta {
  return !!value && typeof value === "object" && Array.isArray((value as Delta).ops);
}

/** Văn bản 1 dòng: bỏ xuống dòng và ký tự điều khiển, chuẩn hoá NFC. */
function toInlineText(value: VariableValue): string {
  if (value === null || value === undefined) return "";
  const text = isDelta(value)
    ? value.ops.map((op) => (typeof op.insert === "string" ? op.insert : "")).join("")
    : String(value);
  // eslint-disable-next-line no-control-regex
  return text.normalize("NFC").replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

/** Định dạng giá trị 1 biến không phải richtext thành chuỗi hiển thị. */
export function formatVariableValue(def: VariableDef | undefined, value: VariableValue): string {
  switch (def?.type) {
    case "date":
      return isDelta(value) ? toInlineText(value) : formatVnDate(value as string) || toInlineText(value);
    case "money":
      return formatMoney(toInlineText(value));
    default:
      return toInlineText(value);
  }
}

// ─── Biến hệ thống ────────────────────────────────────────────────────────

/** Danh mục biến hệ thống (spec 5.1) - luôn có, không cần khai báo trong mẫu. */
export const SYSTEM_VARIABLE_KEYS = [
  "user_name",
  "user_email",
  "user_phone",
  "user_identifier",
  "id_card_number",
  "membership_tier",
  "vip_level",
  "date",
  "date_long",
  "doc_no",
  "doc_id",
  "title",
  "issuer_name",
  "issuer_title",
  "due_date",
  "signed_at",
  "signer_name",
] as const;

export function buildSystemVariables(user: RecipientInfo | null | undefined, ctx: SystemContext): Record<string, string> {
  const u = user || {};
  return {
    user_name: String(u.full_name || u.name || "").trim(),
    user_email: String(u.email || ""),
    user_phone: String(u.phone || ""),
    user_identifier: String(u.identifier || ""),
    id_card_number: maskIdCard(u.id_card_number),
    membership_tier: String(u.membership_tier || ""),
    vip_level: String(u.vip_level || ""),
    date: formatVnDate(ctx.issuedAt),
    date_long: formatVnDateLong(ctx.issuedAt),
    doc_no: String(ctx.docNo || ""),
    doc_id: String(ctx.docId || ""),
    title: String(ctx.title || ""),
    issuer_name: String(ctx.issuerName || ""),
    issuer_title: String(ctx.issuerTitle || ""),
    due_date: formatVnDate(ctx.dueAt),
    signed_at: formatVnDateTime(ctx.signedAt),
    signer_name: String(ctx.signerName || ""),
  };
}

// ─── Thay biến ────────────────────────────────────────────────────────────

export interface ResolveInput {
  /** Khai báo biến của mẫu (document_templates.variables). */
  definitions?: VariableDef[];
  /** Biến hệ thống (buildSystemVariables). */
  system?: Record<string, string>;
  /** Giá trị scope=campaign. */
  campaignValues?: VariableValues;
  /** Giá trị scope=recipient - ghi đè campaign. */
  recipientValues?: VariableValues;
}

export interface ResolveResult {
  delta: Delta;
  /** Biến required không có giá trị - caller phải chặn phát hành. */
  missingRequired: string[];
  /** Biến dùng trong thân nhưng không có giá trị lẫn khai báo. */
  unknown: string[];
}

function lowerKeys(values: VariableValues | Record<string, string> | undefined): VariableValues {
  const out: VariableValues = {};
  Object.entries(values || {}).forEach(([k, v]) => {
    out[normalizeVariableKey(k)] = v;
  });
  return out;
}

function hasValue(value: VariableValue): boolean {
  if (value === null || value === undefined) return false;
  if (isDelta(value)) return value.ops.some((op) => typeof op.insert !== "string" || op.insert.trim() !== "");
  return String(value).trim() !== "";
}

function buildLookup(input: ResolveInput) {
  const defs = new Map<string, VariableDef>();
  (input.definitions || []).forEach((d) => {
    const key = normalizeVariableKey(d.key);
    if (key) defs.set(key, { ...d, key });
  });
  // Phải ghi đè trái: hệ thống < campaign < recipient.
  const values: VariableValues = {
    ...lowerKeys(input.system),
    ...lowerKeys(input.campaignValues),
    ...lowerKeys(input.recipientValues),
  };
  return { defs, values };
}

/** Kiểm tra biến required (kể cả biến không xuất hiện trong thân). */
export function findMissingRequired(input: ResolveInput): string[] {
  const { defs, values } = buildLookup(input);
  return [...defs.values()].filter((d) => d.required && !hasValue(values[d.key])).map((d) => d.key);
}

/**
 * Thay mọi embed `{variable}` trong Delta bằng giá trị thật.
 *
 * - Biến richtext: chèn Delta con (đã lọc định dạng), bỏ "\n" cuối cùng của
 *   nó để phần chữ phía sau biến vẫn nằm cùng đoạn.
 * - Biến khác: chèn văn bản 1 dòng, giữ định dạng inline của embed.
 * - Biến không có giá trị: bỏ trống (không để lộ "{{...}}" cho người nhận).
 */
export function resolveDelta(body: Delta | null | undefined, input: ResolveInput = {}): ResolveResult {
  const { defs, values } = buildLookup(input);
  const systemKeys = new Set(Object.keys(lowerKeys(input.system)));
  const unknown = new Set<string>();
  const ops: DeltaOp[] = [];

  for (const op of normalizeDelta(body).ops) {
    if (typeof op.insert === "string" || isFieldAnchor(op.insert)) {
      ops.push(op);
      continue;
    }
    const key = op.insert.variable;
    const def = defs.get(key);
    const value = values[key];
    if (!def && !systemKeys.has(key) && !hasValue(value)) unknown.add(key);
    if (!hasValue(value)) continue;

    if (def?.type === "richtext" && isDelta(value)) {
      const inner = normalizeDelta(value).ops;
      inner.pop(); // "\n" kết thúc của Delta con
      ops.push(...inner);
    } else {
      const text = formatVariableValue(def, value);
      if (text) ops.push(withAttributes(text, op.attributes));
    }
  }

  return {
    delta: normalizeDelta(ops),
    missingRequired: findMissingRequired(input),
    unknown: [...unknown],
  };
}

/**
 * Thay `{{key}}` trong chuỗi 1 dòng (title_template, doc_no_pattern, dòng
 * footer...). Biến thiếu được thay bằng chuỗi rỗng.
 */
export function resolveTemplateString(template: string, input: ResolveInput = {}): string {
  const { defs, values } = buildLookup(input);
  return String(template || "")
    .replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, raw: string) => {
      const key = normalizeVariableKey(raw);
      return formatVariableValue(defs.get(key), values[key]);
    })
    .normalize("NFC");
}

/** Danh sách key biến xuất hiện trong thân (theo thứ tự, không trùng). */
export function collectVariableKeys(body: Delta | null | undefined): string[] {
  const seen = new Set<string>();
  for (const op of body?.ops || []) {
    if (op && typeof op.insert === "object" && op.insert) {
      const key = normalizeVariableKey((op.insert as { variable?: string }).variable || "");
      if (key) seen.add(key);
    }
  }
  return [...seen];
}
