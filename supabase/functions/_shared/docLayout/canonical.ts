// FILE SINH TỰ ĐỘNG từ src/shared/docLayout bởi scripts/sync-shared.mjs - không sửa tay.
/**
 * JSON chuẩn hoá + SHA-256 cho content_sha256 (spec mục 4.5).
 *
 * Trình duyệt, Node 22 và Deno đều có globalThis.crypto.subtle, nên cùng
 * một hàm cho ra cùng một hash ở mọi phía.
 */

/** JSON với khoá object được sắp xếp; bỏ khoá có giá trị undefined. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value === undefined ? null : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ContentHashInput {
  letterhead_snapshot: unknown;
  layout_snapshot: unknown;
  title: string;
  rendered_model: unknown;
}

/** content_sha256 của một văn bản đã phát hành. */
export function computeContentHash(doc: ContentHashInput): Promise<string> {
  return sha256Hex(
    canonicalJson({
      letterhead_snapshot: doc.letterhead_snapshot ?? null,
      layout_snapshot: doc.layout_snapshot ?? null,
      title: doc.title ?? "",
      rendered_model: doc.rendered_model ?? null,
    }),
  );
}
