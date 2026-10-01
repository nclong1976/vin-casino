/** Bộ lọc người nhận văn bản (spec hợp đồng mục 2.4) - hàm thuần dùng chung. */

export const EMPTY_FILTERS = {
  membership_tier: [],
  vip_level: [],
  exclude_locked: true,
  created_from: "",
  created_to: "",
  min_total_deposited: "",
  project_ids: [],
  active_investment: false,
};

export const fmtMoney = (n) => (n === null || n === undefined || n === "" ? "" : Number(n).toLocaleString("vi-VN"));

/** Mô tả ngắn bộ lọc cho màn tóm tắt. */
export function describeFilters(f = {}, projectsById = {}) {
  const parts = [];
  if (f.membership_tier?.length) parts.push(`hạng ${f.membership_tier.join(", ")}`);
  if (f.vip_level?.length) parts.push(`VIP ${f.vip_level.join(", ")}`);
  if (f.created_from || f.created_to) parts.push(`tham gia ${f.created_from || "…"} → ${f.created_to || "…"}`);
  if (f.min_total_deposited) parts.push(`đã nạp ≥ ${fmtMoney(f.min_total_deposited)} đ`);
  if (f.project_ids?.length) parts.push(`đầu tư ${f.project_ids.map((id) => projectsById[id]?.title || projectsById[id]?.name || "dự án").join(", ")}`);
  if (f.active_investment) parts.push("khoản đầu tư chưa tất toán");
  if (f.exclude_locked !== false) parts.push("bỏ tài khoản khoá");
  return parts.join(" · ") || "Tất cả hội viên";
}

/** Bỏ khoá rỗng trước khi lưu / gửi server. */
export function cleanFilters(f) {
  const out = {};
  for (const [k, v] of Object.entries({ ...EMPTY_FILTERS, ...(f || {}) })) {
    if (Array.isArray(v) ? v.length : v !== "" && v !== null && v !== undefined) out[k] = v;
  }
  out.exclude_locked = f?.exclude_locked !== false;
  return out;
}
