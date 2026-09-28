import { collectVariableKeys, normalizeVariableKey, SYSTEM_VARIABLE_KEYS, templateBody } from "@/shared/docLayout";

/**
 * Kiểm tra trước khi xuất bản (spec 6.1, 6.2). Trả về { errors, warnings }:
 * errors chặn xuất bản, warnings chỉ nhắc.
 */

export function validateLetterhead(letterhead) {
  const errors = [];
  const header = letterhead?.header || {};
  const issuer = letterhead?.issuer || {};
  if (!String(letterhead?.name || "").trim()) errors.push("Chưa đặt tên Khung văn bản");
  if (!String(header.org_name || "").trim()) errors.push("Chưa nhập tên đơn vị phát hành");
  if (!String(issuer.name || "").trim()) errors.push("Chưa nhập tên người đại diện bên phát hành");
  // Chữ ký bên phát hành chèn tự động lúc phát hành (quyết định D1) - bắt buộc.
  if (!issuer.signature_url) errors.push("Chưa có ảnh chữ ký đại diện");
  if (!issuer.seal_url) errors.push("Chưa có ảnh con dấu");
  return { errors, warnings: [] };
}

const VARIABLE_KEY_RE = /^[a-z][a-z0-9_]*$/;

export function validateVariableDefinitions(variables = []) {
  const errors = [];
  const seen = new Set();
  const system = new Set(SYSTEM_VARIABLE_KEYS);
  for (const v of variables) {
    const key = normalizeVariableKey(v.key);
    if (!key || !VARIABLE_KEY_RE.test(key)) errors.push(`Mã biến "${v.key}" không hợp lệ (chữ thường, số, gạch dưới; bắt đầu bằng chữ)`);
    else if (system.has(key)) errors.push(`"${key}" trùng biến hệ thống`);
    else if (seen.has(key)) errors.push(`Biến "${key}" bị khai báo 2 lần`);
    seen.add(key);
  }
  return errors;
}

/**
 * @param template  dòng document_templates đang soạn
 * @param preview   kết quả buildPublishedDocument với giá trị mẫu (để biết số trang, ký tự lạ)
 */
export function validateTemplate(template, preview) {
  const errors = [];
  const warnings = [];
  if (!String(template?.name || "").trim()) errors.push("Chưa đặt tên mẫu");
  if (!String(template?.title_template || "").trim()) errors.push("Chưa nhập tiêu đề văn bản");

  const variables = template?.variables || [];
  errors.push(...validateVariableDefinitions(variables));

  const declared = new Set(variables.map((v) => normalizeVariableKey(v.key)));
  const system = new Set(SYSTEM_VARIABLE_KEYS);
  const bodyKeys = collectVariableKeys(templateBody(template || {}));
  const titleKeys = [...String(template?.title_template || "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => normalizeVariableKey(m[1]));
  const used = new Set([...bodyKeys, ...titleKeys]);

  for (const key of used) {
    if (!declared.has(key) && !system.has(key)) errors.push(`Biến "{{${key}}}" được dùng nhưng chưa khai báo`);
  }
  for (const v of variables) {
    const key = normalizeVariableKey(v.key);
    if (key && !used.has(key)) warnings.push(`Biến "${key}" đã khai báo nhưng không dùng trong tiêu đề/nội dung`);
  }
  if (titleKeys.some((k) => variables.find((v) => normalizeVariableKey(v.key) === k)?.type === "richtext")) {
    errors.push("Tiêu đề không dùng được biến kiểu văn bản nhiều dòng (richtext)");
  }

  const slots = template?.layout?.slots;
  const requiresSignature = template?.requires_signature !== false;
  if (requiresSignature && Array.isArray(slots) && slots.length > 0 && !slots.some((s) => s.role === "recipient")) {
    errors.push("Mẫu yêu cầu ký nhưng không có khung ký của người nhận");
  }

  if (preview?.exceedsMaxPages) errors.push(`Văn bản dài quá ${10} trang A4`);
  if (preview?.unsupportedChars?.length) {
    warnings.push(`Font không hỗ trợ các ký tự: ${preview.unsupportedChars.join(" ")} - sẽ hiển thị sai trong PDF`);
  }
  return { errors, warnings };
}
