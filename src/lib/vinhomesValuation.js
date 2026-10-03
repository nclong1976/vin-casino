import { supabase } from "@/lib/supabase";

/**
 * "Định giá thử" Vinhomes - Giai đoạn 1. Mọi phép tính chạy trong RPC
 * valuate_unit trên Postgres (hệ số do Admin cấu hình, xem migration
 * 20261013090000_vinhomes_valuation_phase1.sql); file này chỉ gọi hàm và
 * đổi mã / lỗi sang lời thường.
 */

export const TYPE_LABELS = { apartment: "Căn hộ", shophouse: "Shophouse", villa: "Biệt thự" };
export const TYPE_ORDER = ["apartment", "shophouse", "villa"];

export const DIRECTION_LABELS = {
  D: "Đông",
  T: "Tây",
  N: "Nam",
  B: "Bắc",
  DN: "Đông Nam",
  DB: "Đông Bắc",
  TN: "Tây Nam",
  TB: "Tây Bắc",
};
export const DIRECTION_ORDER = ["DN", "N", "D", "DB", "B", "TN", "T", "TB"];

export const VIEW_LABELS = { none: "Nội khu", park: "Công viên", lake: "Hồ", sea: "Biển" };
export const VIEW_ORDER = ["none", "park", "lake", "sea"];

export const SCENARIO_LABELS = { conservative: "Thận trọng", base: "Cơ sở", optimistic: "Lạc quan" };

export const VH_ERROR_MESSAGES = {
  VH_PROJECT_NOT_FOUND: "Không tìm thấy dự án.",
  VH_NO_BASE_PRICE: "Dự án chưa có đơn giá để định giá.",
  VH_NO_CONFIG: "Dự án chưa được cấu hình định giá.",
  VH_UNIT_NOT_FOUND: "Không tìm thấy mã căn này.",
  VH_BAD_TYPE: "Dự án không có loại hình này.",
  VH_BAD_DIRECTION: "Hướng nhà không hợp lệ.",
  VH_BAD_AREA: "Diện tích nằm ngoài khoảng của loại hình đã chọn.",
  VH_ZONE_NOT_FOUND: "Không tìm thấy phân khu.",
  VH_TYPE_NOT_IN_ZONE: "Phân khu này không có loại hình đã chọn.",
  VH_LOGIN_REQUIRED: "Vui lòng đăng nhập để tiếp tục.",
  VH_BAD_ACTION: "Thao tác không hợp lệ.",
};

export function vhErrorMessage(error, fallback = "Không định giá được, vui lòng thử lại.") {
  const msg = String(error?.message || error || "");
  const code = Object.keys(VH_ERROR_MESSAGES).find((c) => msg.includes(c));
  return code ? VH_ERROR_MESSAGES[code] : fallback;
}

/** Số tiền gọn: 5,95 tỷ / 595 triệu / 12.500 đ. */
export function fmtMoney(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (abs >= 1e6) return `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu`;
  return `${Math.round(v).toLocaleString("vi-VN")} đ`;
}

export const fmtVnd = (n) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")} đ`;

/** Kẹp diện tích vào khoảng [min, max] của loại hình. */
export function clampArea(area, range) {
  const [min, max] = Array.isArray(range) ? range.map(Number) : [0, Infinity];
  const a = Number(area);
  if (!Number.isFinite(a)) return Math.round((min + max) / 2) || min;
  return Math.min(max, Math.max(min, a));
}

/** Đầu vào gửi lên RPC (bỏ trường rỗng / không áp dụng cho loại hình). */
export function buildValuationInput(form) {
  const unit = (form.unitCode || "").trim().toUpperCase();
  return {
    type: form.type,
    area: Number(form.area),
    direction: form.direction,
    zone_id: form.zoneId || null,
    unit_code: unit || null,
    floor: form.type === "apartment" && Number(form.floor) > 0 ? Number(form.floor) : null,
    is_corner: form.type !== "apartment" && !!form.isCorner,
    view: form.view || "none",
    years: Number(form.years) || 5,
  };
}

export async function fetchValuationForm(projectId) {
  const { data, error } = await supabase.rpc("get_vh_valuation_form", { p_project_id: projectId });
  if (error) throw error;
  return data;
}

export async function valuateUnit(projectId, input) {
  const { data, error } = await supabase.rpc("valuate_unit", {
    p_project_id: projectId,
    p_type: input.type,
    p_area: input.area,
    p_direction: input.direction,
    p_zone_id: input.zone_id,
    p_unit_code: input.unit_code,
    p_floor: input.floor,
    p_is_corner: input.is_corner,
    p_view: input.view,
    p_years: input.years,
  });
  if (error) throw error;
  return data;
}

/** action: 'consult' | 'notify' | 'reserve'. Máy chủ tự tính lại từ input. */
export async function createValuationLead(projectId, action, input) {
  const { data, error } = await supabase.rpc("create_vh_lead", {
    p_project_id: projectId,
    p_action: action,
    p_input: input,
  });
  if (error) throw error;
  return data;
}
