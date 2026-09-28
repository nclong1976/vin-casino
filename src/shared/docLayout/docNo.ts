/**
 * Số văn bản theo header.doc_no_pattern của Khung văn bản, vd
 * "VC/{{yyyy}}/{{seq}}" -> "VC/2026/000123". {{seq}} lấy từ sequence
 * document_no_seq phía server; năm/tháng/ngày theo giờ Việt Nam.
 */

import { VN_TIME_ZONE } from "./resolve";

export const DEFAULT_DOC_NO_PATTERN = "VC/{{yyyy}}/{{seq}}";

export function formatDocNo(pattern: string | null | undefined, seq: number | bigint, issuedAt: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(issuedAt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const values: Record<string, string> = {
    yyyy: get("year"),
    yy: get("year").slice(-2),
    mm: get("month"),
    dd: get("day"),
    seq: String(seq).padStart(6, "0"),
  };
  const out = String(pattern || DEFAULT_DOC_NO_PATTERN).replace(/\{\{\s*([a-z]+)\s*\}\}/gi, (m, key: string) => values[key.toLowerCase()] ?? m);
  // Luôn có số thứ tự để doc_no không trùng dù Admin bỏ {{seq}} khỏi mẫu.
  return /\{\{\s*seq\s*\}\}/i.test(String(pattern || DEFAULT_DOC_NO_PATTERN)) ? out : `${out}/${values.seq}`;
}
