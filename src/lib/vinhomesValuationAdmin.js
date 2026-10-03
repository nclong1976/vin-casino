import { supabase } from "@/lib/supabase";
import { TYPE_ORDER, DIRECTION_ORDER, VIEW_ORDER } from "@/lib/vinhomesValuation";

/**
 * Admin cấu hình "Định giá thử" Vinhomes. Ghi thẳng vào các bảng vh_* (RLS
 * chỉ cho is_admin() ghi); ràng buộc CHECK trong DB là lớp chặn cuối, các hàm
 * validate ở đây báo lỗi bằng lời thường trước khi gửi.
 */

export const DEFAULT_CONFIG = {
  k_type: { apartment: 1, shophouse: 1.35, villa: 1.2 },
  k_dir: { DN: 1.03, N: 1.02, D: 1.01, B: 1, DB: 1, TN: 0.99, TB: 0.98, T: 0.97 },
  k_view: { none: 1, park: 1.04, lake: 1.06, sea: 1.1 },
  corner_factor: 1.08,
  floor_step_pct: 0.3,
  floor_cap_pct: 6,
  band_pct: 6,
  area_ranges: { apartment: [45, 120], shophouse: [75, 150], villa: [150, 400] },
  rent_yield: { apartment: 4.5, shophouse: 6, villa: 3.5 },
  vacancy_pct: 10,
  opex_pct: 1,
  growth_pct: 5,
  payment_schedule: [
    { label: "Ký hợp đồng mua bán", pct: 20, month: 0 },
    { label: "Đợt 2", pct: 10, month: 3 },
    { label: "Đợt 3", pct: 10, month: 6 },
    { label: "Nhận nhà", pct: 55, month: 18 },
    { label: "Nhận sổ hồng", pct: 5, month: 30 },
  ],
  early_discount_pct: 5,
};

const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
const inRange = (v, min, max) => Number.isFinite(num(v)) && num(v) >= min && num(v) <= max;

/** Trả danh sách lỗi (rỗng = hợp lệ). Loại hình nào có trong k_type là loại hình dự án có bán. */
export function validateConfig(cfg) {
  const errors = [];
  const types = Object.keys(cfg.k_type || {});
  if (types.length === 0) errors.push("Phải có ít nhất một loại hình.");
  types.forEach((t) => {
    if (!inRange(cfg.k_type[t], 0.1, 5)) errors.push(`Hệ số loại hình ${t} phải từ 0,1 đến 5.`);
    const r = cfg.area_ranges?.[t];
    if (!Array.isArray(r) || !(num(r[0]) > 0) || !(num(r[1]) > num(r[0]))) errors.push(`Khoảng diện tích ${t}: số sau phải lớn hơn số trước.`);
    if (!inRange(cfg.rent_yield?.[t] ?? 0, 0, 30)) errors.push(`Tỉ suất thuê ${t} phải từ 0% đến 30%.`);
  });
  if (Object.keys(cfg.k_dir || {}).length === 0) errors.push("Phải có ít nhất một hướng nhà.");
  Object.entries(cfg.k_dir || {}).forEach(([k, v]) => {
    if (!inRange(v, 0.5, 2)) errors.push(`Hệ số hướng ${k} phải từ 0,5 đến 2.`);
  });
  Object.entries(cfg.k_view || {}).forEach(([k, v]) => {
    if (!inRange(v, 0.5, 3)) errors.push(`Hệ số hướng nhìn ${k} phải từ 0,5 đến 3.`);
  });
  if (!inRange(cfg.corner_factor, 0.5, 3)) errors.push("Hệ số căn góc phải từ 0,5 đến 3.");
  if (!inRange(cfg.floor_step_pct, 0, 5)) errors.push("% tăng mỗi tầng phải từ 0 đến 5.");
  if (!inRange(cfg.floor_cap_pct, 0, 50)) errors.push("Mức tăng tối đa theo tầng phải từ 0% đến 50%.");
  if (!inRange(cfg.band_pct, 0, 30)) errors.push("Biên độ sàn–trần phải từ 0% đến 30%.");
  if (!inRange(cfg.vacancy_pct, 0, 100)) errors.push("Tỉ lệ trống phải từ 0% đến 100%.");
  if (!inRange(cfg.opex_pct, 0, 20)) errors.push("Chi phí vận hành phải từ 0% đến 20%/năm.");
  if (!inRange(cfg.growth_pct, -20, 50)) errors.push("Mức tăng giá mặc định phải từ -20% đến 50%/năm.");
  if (!inRange(cfg.early_discount_pct, 0, 50)) errors.push("Chiết khấu thanh toán sớm phải từ 0% đến 50%.");
  errors.push(...validateSchedule(cfg.payment_schedule));
  return errors;
}

export function validateSchedule(schedule) {
  const errors = [];
  if (!Array.isArray(schedule) || schedule.length === 0) return ["Tiến độ thanh toán phải có ít nhất một đợt."];
  let total = 0;
  let lastMonth = -1;
  schedule.forEach((p, i) => {
    if (!String(p.label || "").trim()) errors.push(`Đợt ${i + 1}: thiếu tên.`);
    if (!inRange(p.pct, 0.01, 100)) errors.push(`Đợt ${i + 1}: % phải lớn hơn 0.`);
    if (!Number.isInteger(num(p.month)) || num(p.month) < 0) errors.push(`Đợt ${i + 1}: tháng phải là số nguyên từ 0.`);
    else if (num(p.month) < lastMonth) errors.push(`Đợt ${i + 1}: tháng phải không nhỏ hơn đợt trước.`);
    else lastMonth = num(p.month);
    total += num(p.pct) || 0;
  });
  if (Math.abs(total - 100) > 0.001) errors.push(`Tổng các đợt phải bằng 100% (hiện ${Math.round(total * 100) / 100}%).`);
  return errors;
}

/** Ép chuỗi nhập từ form sang số trước khi ghi. */
export function normalizeConfig(cfg) {
  const mapNum = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, num(v)]));
  return {
    k_type: mapNum(cfg.k_type),
    k_dir: mapNum(cfg.k_dir),
    k_view: mapNum(cfg.k_view),
    corner_factor: num(cfg.corner_factor),
    floor_step_pct: num(cfg.floor_step_pct),
    floor_cap_pct: num(cfg.floor_cap_pct),
    band_pct: num(cfg.band_pct),
    area_ranges: Object.fromEntries(Object.keys(cfg.k_type || {}).map((t) => [t, (cfg.area_ranges?.[t] || []).map(num)])),
    rent_yield: Object.fromEntries(Object.keys(cfg.k_type || {}).map((t) => [t, num(cfg.rent_yield?.[t] ?? 0)])),
    vacancy_pct: num(cfg.vacancy_pct),
    opex_pct: num(cfg.opex_pct),
    growth_pct: num(cfg.growth_pct),
    payment_schedule: (cfg.payment_schedule || []).map((p) => ({ label: String(p.label).trim(), pct: num(p.pct), month: num(p.month) })),
    early_discount_pct: num(cfg.early_discount_pct),
  };
}

const UNIT_TYPE_ALIASES = { "can ho": "apartment", "căn hộ": "apartment", apartment: "apartment", shophouse: "shophouse", "biet thu": "villa", "biệt thự": "villa", villa: "villa" };

/**
 * Nhập nhiều mã căn: mỗi dòng "mã, loại hình, diện tích, hướng, tầng, góc (có/không), hướng nhìn".
 * Trả { units, errors }. Loại hình nhận "căn hộ / shophouse / biệt thự" hoặc mã tiếng Anh.
 */
export function parseUnitsText(text) {
  const units = [];
  const errors = [];
  String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const [code, type, area, dir, floor, corner, view] = line.split(/[,;\t]/).map((s) => (s || "").trim());
      const t = UNIT_TYPE_ALIASES[(type || "").toLowerCase()];
      const d = (dir || "").toUpperCase();
      const v = (view || "none").toLowerCase();
      const row = i + 1;
      if (!code) return errors.push(`Dòng ${row}: thiếu mã căn.`);
      if (!t) return errors.push(`Dòng ${row}: loại hình "${type}" không hợp lệ.`);
      if (!(Number(area) > 0)) return errors.push(`Dòng ${row}: diện tích không hợp lệ.`);
      if (!DIRECTION_ORDER.includes(d)) return errors.push(`Dòng ${row}: hướng "${dir}" không hợp lệ (dùng D, T, N, B, DN, DB, TN, TB).`);
      if (!VIEW_ORDER.includes(v)) return errors.push(`Dòng ${row}: hướng nhìn "${view}" không hợp lệ.`);
      units.push({
        code: code.toUpperCase(),
        type: t,
        area: Number(area),
        direction: d,
        floor: floor && Number(floor) > 0 ? Math.round(Number(floor)) : null,
        is_corner: /^(co|có|yes|1|x|true)$/i.test(corner || ""),
        view: v,
      });
    });
  return { units, errors };
}

export { TYPE_ORDER, DIRECTION_ORDER, VIEW_ORDER };

// ───────────── Đọc / ghi ─────────────

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export async function loadProjectValuationData(projectId) {
  const [config, zones, units, history] = await Promise.all([
    supabase.from("vh_valuation_config").select("*").eq("project_id", projectId).maybeSingle().then(check),
    supabase.from("vh_zones").select("*").eq("project_id", projectId).order("sort_order").order("name").then(check),
    supabase.from("vh_units").select("*").eq("project_id", projectId).order("code").then(check),
    supabase.from("vh_price_history").select("*").eq("project_id", projectId).order("month", { ascending: false }).then(check),
  ]);
  return { config, zones: zones || [], units: units || [], history: history || [] };
}

export const saveConfig = (projectId, cfg) =>
  supabase
    .from("vh_valuation_config")
    .upsert({ project_id: projectId, ...normalizeConfig(cfg), updated_at: new Date().toISOString() })
    .then(check);

export const saveZone = (zone) =>
  supabase
    .from("vh_zones")
    .upsert({ ...(zone.id ? { id: zone.id } : {}), project_id: zone.project_id, name: zone.name.trim(), types: zone.types, k_zone: Number(zone.k_zone), sort_order: Number(zone.sort_order) || 0 })
    .then(check);

export const deleteZone = (id) => supabase.from("vh_zones").delete().eq("id", id).then(check);

export const saveUnits = (projectId, units) =>
  supabase
    .from("vh_units")
    .upsert(units.map((u) => ({ ...u, project_id: projectId, zone_id: u.zone_id || null })), { onConflict: "project_id,code" })
    .then(check);

export const deleteUnit = (projectId, code) => supabase.from("vh_units").delete().eq("project_id", projectId).eq("code", code).then(check);

export const savePricePoint = (projectId, type, month, price) =>
  supabase
    .from("vh_price_history")
    .upsert({ project_id: projectId, type, month: `${month}-01`, price_per_m2: Number(price) }, { onConflict: "project_id,type,month" })
    .then(check);

export const deletePricePoint = (projectId, type, month) =>
  supabase.from("vh_price_history").delete().eq("project_id", projectId).eq("type", type).eq("month", month).then(check);

export const loadLoans = () => supabase.from("vh_loan_products").select("*").order("sort_order").order("name").then(check);

export const saveLoan = (loan) =>
  supabase
    .from("vh_loan_products")
    .upsert({
      ...(loan.id ? { id: loan.id } : {}),
      name: loan.name.trim(),
      max_ltv: Number(loan.max_ltv),
      years: Number(loan.years),
      promo_rate: Number(loan.promo_rate),
      promo_months: Number(loan.promo_months) || 0,
      float_rate: Number(loan.float_rate),
      source_note: (loan.source_note || "").trim() || "Lãi suất minh hoạ do VinClub cấu hình",
      is_active: !!loan.is_active,
      sort_order: Number(loan.sort_order) || 0,
    })
    .then(check);

export const deleteLoan = (id) => supabase.from("vh_loan_products").delete().eq("id", id).then(check);

export function validateLoan(l) {
  const e = [];
  if (!String(l.name || "").trim()) e.push("Thiếu tên gói vay.");
  if (!inRange(l.max_ltv, 0.01, 0.9)) e.push("Tỉ lệ cho vay phải từ 1% đến 90%.");
  if (!Number.isInteger(num(l.years)) || !inRange(l.years, 1, 35)) e.push("Thời hạn vay phải từ 1 đến 35 năm.");
  if (!inRange(l.promo_rate, 0, 29.99)) e.push("Lãi ưu đãi phải từ 0% đến dưới 30%.");
  if (!Number.isInteger(num(l.promo_months || 0)) || num(l.promo_months || 0) < 0) e.push("Số tháng ưu đãi phải là số nguyên từ 0.");
  if (!inRange(l.float_rate, 0, 29.99)) e.push("Lãi thả nổi phải từ 0% đến dưới 30%.");
  return e;
}

export const loadLeads = (projectId) =>
  supabase
    .from("vh_valuation_requests")
    .select("id, user_id, action, input, result, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(500)
    .then(check);
