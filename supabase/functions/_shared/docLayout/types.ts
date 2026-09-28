// FILE SINH TỰ ĐỘNG từ src/shared/docLayout bởi scripts/sync-shared.mjs - không sửa tay.
/**
 * Kiểu dữ liệu dùng chung của bộ dàn trang văn bản điện tử (Giai đoạn 2 -
 * xem docs/design/e-sign-letterhead-spec.md mục 3.4 và 5).
 *
 * Thư mục src/shared/docLayout/ là TypeScript thuần: KHÔNG import React,
 * DOM, Node hay Deno. Cùng một mã nguồn chạy trên trình duyệt (preview,
 * trang ký) và trong Supabase Edge Function (tạo PDF) - scripts/
 * sync-shared.mjs chép thư mục này sang supabase/functions/_shared/.
 */

/** Thuộc tính định dạng được hỗ trợ - đúng tập ở mục 3.4 của spec. */
export interface DeltaAttributes {
  // Inline (gắn trên đoạn chữ)
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  // Block (gắn trên ký tự "\n" kết thúc dòng, theo đúng quy ước Quill)
  header?: 1 | 2 | 3;
  align?: "left" | "center" | "right" | "justify";
  list?: "ordered" | "bullet";
  indent?: number;
}

/** Biến động được lưu dạng embed để không bị gõ vỡ giữa chừng. */
export interface VariableEmbed {
  variable: string;
}

export interface DeltaOp {
  insert: string | VariableEmbed;
  attributes?: DeltaAttributes;
}

export interface Delta {
  ops: DeltaOp[];
}

export type VariableType = "text" | "richtext" | "date" | "money" | "number";
export type VariableScope = "campaign" | "recipient";

export interface VariableDef {
  key: string;
  label?: string;
  type?: VariableType;
  scope?: VariableScope;
  required?: boolean;
}

/** Giá trị biến: chuỗi, số, ngày ISO, hoặc Delta (cho richtext). */
export type VariableValue = string | number | Delta | null | undefined;

export type VariableValues = Record<string, VariableValue>;

/** Thông tin người nhận dùng để sinh biến hệ thống. */
export interface RecipientInfo {
  id?: string;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  identifier?: string | null;
  id_card_number?: string | null;
  membership_tier?: string | null;
  vip_level?: string | null;
}

/** Ngữ cảnh phát hành dùng để sinh biến hệ thống. */
export interface SystemContext {
  /** Thời điểm phát hành. */
  issuedAt: Date;
  docNo?: string;
  docId?: string;
  title?: string;
  issuerName?: string;
  issuerTitle?: string;
  dueAt?: Date | string | null;
  /** Chỉ có sau khi ký. */
  signedAt?: Date | string | null;
  signerName?: string | null;
}
