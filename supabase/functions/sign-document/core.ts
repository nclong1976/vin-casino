/**
 * Logic ký văn bản (spec mục 8.3), tách khỏi Supabase để test (core.test.ts).
 * Mọi dữ kiện có giá trị bằng chứng (thời điểm ký, tên người ký, câu đồng ý)
 * do server quyết định; client chỉ gửi ảnh chữ ký.
 */

import { normalizeFields, type FieldConfig } from "../_shared/docLayout/index.ts";

export const CONSENT_TEXT = "Tôi đã đọc, hiểu và đồng ý với toàn bộ nội dung văn bản trên.";
export const MAX_SIGNATURE_BYTES = 500 * 1024;
export const MAX_SIGNATURE_WIDTH = 2400;
export const MAX_SIGNATURE_HEIGHT = 1200;
const METHODS = ["draw", "upload", "typed", "saved", "acknowledge"] as const;
export type SignMethod = (typeof METHODS)[number];

/** Giá trị người nhận gửi cho 1 trường (spec hợp đồng mục 5.2). */
export interface FieldInput {
  field_id: string;
  image_png_base64?: string | null;
  saved_signature_id?: string | null;
  value_bool?: boolean | null;
  value_text?: string | null;
}

/** Giá trị trường đã kiểm tra, lưu vào custom_documents.field_values. */
export interface FieldValue {
  type: FieldConfig["type"];
  value_text?: string | null;
  value_bool?: boolean | null;
  asset_path?: string | null;
  /** Ảnh dạng data URL để trang web hiển thị (bucket signed-documents là private). */
  image_data_url?: string | null;
  method?: string | null;
}

export interface SignRequest {
  document_id: string;
  idempotency_key: string;
  method: SignMethod;
  image_png_base64?: string | null;
  typed_text?: string | null;
  font?: string | null;
  saved_signature_id?: string | null;
  save_for_later?: boolean;
  consent: boolean;
  content_sha256: string;
  fields: FieldInput[];
}

export type SignErrorCode =
  | "BAD_REQUEST"
  | "CONSENT_REQUIRED"
  | "INVALID_SIGNATURE_IMAGE"
  | "NOT_FOUND"
  | "ALREADY_SIGNED"
  | "REVOKED"
  | "EXPIRED"
  | "DOCUMENT_CHANGED"
  | "NOT_ESIGN_DOCUMENT"
  | "READ_REQUIRED"
  | "FIELD_REQUIRED"
  | "INVALID_FIELD_VALUE";

export class SignError extends Error {
  constructor(public code: SignErrorCode, message?: string) {
    super(message || code);
  }
}

export const HTTP_STATUS: Record<SignErrorCode, number> = {
  BAD_REQUEST: 400,
  CONSENT_REQUIRED: 422,
  INVALID_SIGNATURE_IMAGE: 422,
  NOT_FOUND: 404,
  ALREADY_SIGNED: 409,
  REVOKED: 409,
  EXPIRED: 409,
  DOCUMENT_CHANGED: 409,
  NOT_ESIGN_DOCUMENT: 422,
  READ_REQUIRED: 409,
  FIELD_REQUIRED: 422,
  INVALID_FIELD_VALUE: 422,
};

export function parseSignRequest(body: unknown): SignRequest {
  const b = (body || {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const req: SignRequest = {
    document_id: str(b.document_id),
    idempotency_key: str(b.idempotency_key),
    method: str(b.method) as SignMethod,
    image_png_base64: typeof b.image_png_base64 === "string" ? b.image_png_base64 : null,
    typed_text: typeof b.typed_text === "string" ? b.typed_text.slice(0, 120) : null,
    font: typeof b.font === "string" ? b.font.slice(0, 60) : null,
    saved_signature_id: typeof b.saved_signature_id === "string" ? b.saved_signature_id : null,
    save_for_later: b.save_for_later === true,
    consent: b.consent === true,
    content_sha256: str(b.content_sha256).toLowerCase(),
    fields: parseFieldInputs(b.fields),
  };
  if (!req.document_id || !req.idempotency_key || req.idempotency_key.length > 100 || !METHODS.includes(req.method)) {
    throw new SignError("BAD_REQUEST", "Thiếu document_id / idempotency_key hoặc method không hợp lệ");
  }
  if (!/^[0-9a-f]{64}$/.test(req.content_sha256)) throw new SignError("BAD_REQUEST", "content_sha256 không hợp lệ");
  if (!req.consent) throw new SignError("CONSENT_REQUIRED");
  return req;
}

function parseFieldInputs(raw: unknown): FieldInput[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 60) throw new SignError("BAD_REQUEST", "fields không hợp lệ");
  return raw.map((f) => {
    const r = (f || {}) as Record<string, unknown>;
    if (typeof r.field_id !== "string" || !r.field_id) throw new SignError("BAD_REQUEST", "Thiếu field_id");
    return {
      field_id: r.field_id.slice(0, 40),
      image_png_base64: typeof r.image_png_base64 === "string" ? r.image_png_base64 : null,
      saved_signature_id: typeof r.saved_signature_id === "string" ? r.saved_signature_id : null,
      value_bool: typeof r.value_bool === "boolean" ? r.value_bool : null,
      value_text: typeof r.value_text === "string" ? r.value_text : null,
    };
  });
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:image\/png;base64,/, "").replace(/\s+/g, "");
  let bin: string;
  try {
    bin = atob(clean);
  } catch {
    throw new SignError("INVALID_SIGNATURE_IMAGE", "Ảnh chữ ký không phải base64 hợp lệ");
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Kiểm tra PNG (chữ ký 8 byte + IHDR) và trả về kích thước; ném lỗi nếu không hợp lệ. */
export function inspectPng(bytes: Uint8Array): { width: number; height: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || sig.some((b, i) => bytes[i] !== b)) throw new SignError("INVALID_SIGNATURE_IMAGE", "Chỉ nhận ảnh PNG");
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") throw new SignError("INVALID_SIGNATURE_IMAGE", "PNG hỏng");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (bytes.length > MAX_SIGNATURE_BYTES) throw new SignError("INVALID_SIGNATURE_IMAGE", "Ảnh chữ ký quá 500 KB");
  if (width < 20 || height < 10 || width > MAX_SIGNATURE_WIDTH || height > MAX_SIGNATURE_HEIGHT) {
    throw new SignError("INVALID_SIGNATURE_IMAGE", `Kích thước ảnh ${width}×${height} không hợp lệ`);
  }
  return { width, height };
}

export interface DocumentForSign {
  id: string;
  user_id: string;
  status: string;
  rendered_model: unknown;
  content_sha256: string | null;
  requires_signature: boolean;
  signature_meta?: Record<string, unknown> | null;
  layout_snapshot?: { fields?: FieldConfig[] } | null;
  read_completed_at?: string | null;
  signer_name?: string | null;
  signed_at?: string | null;
  pdf_status?: string | null;
  pdf_expires_at?: string | null;
}

export interface SignResult {
  document_id: string;
  status: string;
  signer_name: string | null;
  signed_at: string | null;
  pdf_status: string | null;
  pdf_expires_at: string | null;
  idempotent_replay?: boolean;
}

export interface RecordArgs {
  documentId: string;
  userId: string;
  method: SignMethod;
  signatureDataUrl: string | null;
  signaturePath: string | null;
  meta: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  consentText: string;
  fieldValues: Record<string, FieldValue>;
}

export interface SignRepo {
  loadDocument(documentId: string, userId: string): Promise<DocumentForSign | null>;
  loadSavedSignature(signatureId: string, userId: string): Promise<string | null>;
  uploadSignature(path: string, png: Uint8Array): Promise<void>;
  /** Gọi RPC esign_record_signature; ném SignError với mã tương ứng. */
  record(args: RecordArgs): Promise<SignResult>;
  saveSignature(userId: string, dataUrl: string, label: string): Promise<void>;
  queueRender(documentId: string): void;
}

export async function signDocument(
  repo: SignRepo,
  userId: string,
  req: SignRequest,
  ctx: { ip: string | null; userAgent: string | null },
): Promise<SignResult> {
  const doc = await repo.loadDocument(req.document_id, userId);
  if (!doc) throw new SignError("NOT_FOUND");
  if (!doc.rendered_model) throw new SignError("NOT_ESIGN_DOCUMENT");

  // Gửi lại đúng yêu cầu đã xử lý (mạng chập chờn / bấm 2 lần) → trả kết quả cũ.
  if (doc.status !== "pending" && doc.signature_meta?.idempotency_key === req.idempotency_key) {
    return {
      document_id: doc.id,
      status: doc.status,
      signer_name: doc.signer_name ?? null,
      signed_at: doc.signed_at ?? null,
      pdf_status: doc.pdf_status ?? null,
      pdf_expires_at: doc.pdf_expires_at ?? null,
      idempotent_replay: true,
    };
  }
  if (doc.status === "revoked") throw new SignError("REVOKED");
  if (doc.status === "expired") throw new SignError("EXPIRED");
  if (doc.status !== "pending") throw new SignError("ALREADY_SIGNED");
  if (doc.content_sha256 && doc.content_sha256 !== req.content_sha256) throw new SignError("DOCUMENT_CHANGED");

  if (!doc.read_completed_at) throw new SignError("READ_REQUIRED", "Vui lòng đọc hết văn bản trước khi ký");

  if (!doc.requires_signature && req.method !== "acknowledge") throw new SignError("BAD_REQUEST", "Văn bản này chỉ cần xác nhận đã đọc");
  if (doc.requires_signature && req.method === "acknowledge") throw new SignError("BAD_REQUEST", "Văn bản này cần chữ ký");

  let png: Uint8Array | null = null;
  if (req.method === "saved") {
    const dataUrl = req.saved_signature_id ? await repo.loadSavedSignature(req.saved_signature_id, userId) : null;
    if (!dataUrl) throw new SignError("INVALID_SIGNATURE_IMAGE", "Không tìm thấy chữ ký đã lưu");
    png = base64ToBytes(dataUrl);
  } else if (req.method !== "acknowledge") {
    if (!req.image_png_base64) throw new SignError("INVALID_SIGNATURE_IMAGE", "Thiếu ảnh chữ ký");
    png = base64ToBytes(req.image_png_base64);
  }

  // Kiểm tra mọi trường TRƯỚC khi lưu bất cứ ảnh nào.
  const fieldPlan = await planFields(repo, userId, doc, req.fields);

  let dataUrl: string | null = null;
  let path: string | null = null;
  const meta: Record<string, unknown> = { idempotency_key: req.idempotency_key };
  if (png) {
    const { width, height } = inspectPng(png);
    meta.width = width;
    meta.height = height;
    if (req.method === "typed") {
      meta.typed_text = req.typed_text;
      meta.font = req.font;
    }
    if (req.method === "saved") meta.source_signature_id = req.saved_signature_id;
    dataUrl = `data:image/png;base64,${bytesToBase64(png)}`;
    path = `${userId}/${doc.id}.signature.png`;
    await repo.uploadSignature(path, png);
  }

  const fieldValues: Record<string, FieldValue> = {};
  for (const item of fieldPlan) {
    if (item.png) {
      const assetPath = `${userId}/${doc.id}.field-${item.field.id}.png`;
      await repo.uploadSignature(assetPath, item.png);
      fieldValues[item.field.id] = { ...item.value, asset_path: assetPath };
    } else {
      fieldValues[item.field.id] = item.value;
    }
  }

  const result = await repo.record({
    documentId: doc.id,
    userId,
    method: req.method,
    signatureDataUrl: dataUrl,
    signaturePath: path,
    meta,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    consentText: CONSENT_TEXT,
    fieldValues,
  });

  if (req.save_for_later && dataUrl && req.method !== "saved") {
    await repo.saveSignature(userId, dataUrl, req.method === "typed" ? `Nét chữ: ${req.typed_text || ""}`.slice(0, 80) : "Chữ ký").catch(() => undefined);
  }
  repo.queueRender(doc.id);
  return result;
}

interface FieldPlanItem {
  field: FieldConfig;
  value: FieldValue;
  png: Uint8Array | null;
}

/** Đối chiếu giá trị gửi lên với các trường của văn bản (lấy từ snapshot, không tin client). */
export async function planFields(repo: SignRepo, userId: string, doc: DocumentForSign, inputs: FieldInput[]): Promise<FieldPlanItem[]> {
  const fields = normalizeFields(doc.layout_snapshot?.fields);
  const byId = new Map(inputs.map((f) => [f.field_id, f]));
  const plan: FieldPlanItem[] = [];
  for (const field of fields) {
    const input = byId.get(field.id);
    const required = field.required !== false;
    switch (field.type) {
      case "signature":
      case "initials": {
        let png: Uint8Array | null = null;
        let method = "draw";
        if (input?.image_png_base64) {
          png = base64ToBytes(input.image_png_base64);
        } else if (input?.saved_signature_id) {
          const saved = await repo.loadSavedSignature(input.saved_signature_id, userId);
          if (!saved) throw new SignError("INVALID_FIELD_VALUE", `Không tìm thấy chữ ký đã lưu (${field.id})`);
          png = base64ToBytes(saved);
          method = "saved";
        }
        if (!png) {
          if (required) throw new SignError("FIELD_REQUIRED", field.id);
          continue;
        }
        try {
          inspectPng(png);
        } catch (e) {
          throw new SignError("INVALID_FIELD_VALUE", `${field.id}: ${(e as Error).message}`);
        }
        plan.push({ field, value: { type: field.type, method, image_data_url: `data:image/png;base64,${bytesToBase64(png)}` }, png });
        break;
      }
      case "checkbox": {
        const checked = input?.value_bool === true;
        if (!checked && (required || field.options?.must_be_checked)) throw new SignError("FIELD_REQUIRED", field.id);
        plan.push({ field, value: { type: "checkbox", value_bool: checked }, png: null });
        break;
      }
      case "text": {
        const text = String(input?.value_text || "").normalize("NFC").replace(/\s+/g, " ").trim();
        const max = field.options?.max_length || 200;
        if (text.length > max) throw new SignError("INVALID_FIELD_VALUE", `${field.id}: tối đa ${max} ký tự`);
        if (!text && required) throw new SignError("FIELD_REQUIRED", field.id);
        plan.push({ field, value: { type: "text", value_text: text }, png: null });
        break;
      }
      case "date":
        // Ngày ký do Postgres điền (esign_record_signature).
        plan.push({ field, value: { type: "date", value_text: null }, png: null });
        break;
    }
  }
  return plan;
}
