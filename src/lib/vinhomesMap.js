import { supabase } from "@/lib/supabase";

/**
 * Bản đồ dự án Vinhomes + ảnh 360° (Giai đoạn 2). Dữ liệu ở các bảng
 * vh_project_geo / vh_panoramas / vh_hotspots, ảnh ở Storage bucket
 * "vh-panoramas" (xem migration 20261014090000_vinhomes_map360_phase2.sql).
 */

// Nền bản đồ vector miễn phí, không cần khoá API (OpenFreeMap, dữ liệu OSM).
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
export const VIETNAM_VIEW = { center: [106.2, 16.2], zoom: 4.6 };
export const PANO_BUCKET = "vh-panoramas";

export const HOTSPOT_KINDS = { zone: "Phân khu", amenity: "Tiện ích", link: "Đi tới ảnh khác" };
export const AMENITY_ICONS = {
  pin: "📍",
  pool: "🏊",
  park: "🌳",
  school: "🏫",
  hospital: "🏥",
  mall: "🛍️",
  sport: "🏟️",
  beach: "🏖️",
  lake: "💧",
};
export const MODE_LABELS = { flycam: "Flycam", ground: "Mặt đất" };
export const TIME_LABELS = { day: "Ngày", night: "Đêm" };

export const degToRad = (d) => (Number(d) || 0) * (Math.PI / 180);
export const radToDeg = (r) => (Number(r) || 0) * (180 / Math.PI);

/**
 * Chọn ảnh 360° phù hợp nhất: đúng chế độ + thời điểm; không có ảnh đêm thì
 * dùng ảnh ngày cùng chế độ (giao diện làm tối và ghi "Mô phỏng"); không có
 * chế độ đó thì lấy ảnh mặc định / ảnh đầu tiên.
 */
export function choosePanorama(panos, { mode, time, zoneId } = {}) {
  const list = Array.isArray(panos) ? panos : [];
  if (list.length === 0) return { pano: null, simulatedNight: false };
  const byMode = list.filter((p) => !mode || p.mode === mode);
  const scoped = zoneId ? byMode.filter((p) => p.zone_id === zoneId) : [];
  const pool = scoped.length ? scoped : byMode;
  const exact = pool.find((p) => p.time_of_day === (time || "day"));
  if (exact) return { pano: exact, simulatedNight: false };
  const day = pool.find((p) => p.time_of_day === "day");
  if (day) return { pano: day, simulatedNight: time === "night" };
  const fallback = list.find((p) => p.is_default) || list[0];
  return { pano: fallback, simulatedNight: time === "night" && fallback.time_of_day !== "night" };
}

export const availableModes = (panos) => ["flycam", "ground"].filter((m) => (panos || []).some((p) => p.mode === m));

export const hasGeo = (g) => Number.isFinite(Number(g?.lat)) && Number.isFinite(Number(g?.lng)) && g?.lat !== null && g?.lng !== null;

export function validateGeo({ lat, lng, zoom }) {
  const errors = [];
  const empty = (v) => v === "" || v === null || v === undefined;
  if (empty(lat) !== empty(lng)) errors.push("Nhập đủ cả vĩ độ và kinh độ (hoặc để trống cả hai).");
  if (!empty(lat) && !(Number(lat) >= -90 && Number(lat) <= 90)) errors.push("Vĩ độ phải từ -90 đến 90.");
  if (!empty(lng) && !(Number(lng) >= -180 && Number(lng) <= 180)) errors.push("Kinh độ phải từ -180 đến 180.");
  if (!(Number(zoom) >= 3 && Number(zoom) <= 20)) errors.push("Mức phóng to phải từ 3 đến 20.");
  return errors;
}

/** Ảnh 360° chuẩn là ảnh toàn cảnh tỉ lệ 2:1 (equirectangular). */
export const isEquirectangular = (w, h) => w > 0 && h > 0 && Math.abs(w / h - 2) < 0.02;

// ───────────── Đọc ─────────────

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** 5 dự án VinHomes kèm toạ độ và ảnh 360° mặc định (để hiện ghim và ảnh xem trước). */
export async function loadMapOverview() {
  const [projects, geos, panos] = await Promise.all([
    supabase.from("investment_projects").select("id, title, name, location, image, price_per_m2, is_active, category").then(check),
    supabase.from("vh_project_geo").select("*").then(check),
    supabase.from("vh_panoramas").select("id, project_id, preview_url, image_url, is_default, mode, time_of_day").then(check),
  ]);
  const geoBy = Object.fromEntries((geos || []).map((g) => [g.project_id, g]));
  return (projects || [])
    .filter((p) => (p.category || "").trim() === "VinHomes")
    .map((p) => {
      const own = (panos || []).filter((x) => x.project_id === p.id);
      return { ...p, geo: geoBy[p.id] || null, panoCount: own.length, cover: own.find((x) => x.is_default) || own[0] || null };
    })
    .sort((a, b) => (a.title || "").localeCompare(b.title || "", "vi"));
}

export async function loadProject360(projectId) {
  const panos = await supabase.from("vh_panoramas").select("*").eq("project_id", projectId).order("sort_order").order("created_at").then(check);
  const ids = (panos || []).map((p) => p.id);
  const [hotspots, zones] = await Promise.all([
    ids.length ? supabase.from("vh_hotspots").select("*").in("pano_id", ids).then(check) : [],
    supabase.from("vh_zones").select("id, name, types").eq("project_id", projectId).order("sort_order").then(check),
  ]);
  return { panos: panos || [], hotspots: hotspots || [], zones: zones || [] };
}

// ───────────── Ghi (Admin) ─────────────

export const saveGeo = (projectId, g) =>
  supabase
    .from("vh_project_geo")
    .upsert({
      project_id: projectId,
      lat: g.lat === "" || g.lat == null ? null : Number(g.lat),
      lng: g.lng === "" || g.lng == null ? null : Number(g.lng),
      zoom: Number(g.zoom) || 15,
      verified: !!g.verified,
      area_ha: g.area_ha === "" || g.area_ha == null ? null : Number(g.area_ha),
      units_text: (g.units_text || "").trim() || null,
      highlights: (g.highlights || []).map((s) => String(s).trim()).filter(Boolean),
      updated_at: new Date().toISOString(),
    })
    .then(check);

/** Thu nhỏ ảnh trong trình duyệt: trả Blob JPEG có cạnh dài tối đa maxW. */
export async function resizeImage(file, maxW, quality = 0.86) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  return { blob, width: bmp.width, height: bmp.height };
}

/**
 * Tải ảnh 360° lên: bản đầy đủ (tối đa 6144px - vừa bộ nhớ đồ hoạ của hầu hết
 * điện thoại) và bản xem trước 1024px hiện ngay trong lúc chờ.
 */
export async function uploadPanorama(projectId, file, meta) {
  const flat = meta.projection === "flat";
  const full = await resizeImage(file, flat ? 4096 : 6144, 0.85);
  if (!flat && !isEquirectangular(full.width, full.height)) {
    throw new Error(`Ảnh 360° toàn cảnh phải có tỉ lệ 2:1 (ảnh này ${full.width}×${full.height}). Nếu là ảnh phối cảnh / flycam thường, chọn loại "Ảnh phối cảnh".`);
  }
  const preview = await resizeImage(file, 1024, 0.7);
  const base = `${projectId}/${Date.now()}`;
  const up = async (path, blob) => {
    const { error } = await supabase.storage.from(PANO_BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (error) throw error;
    return supabase.storage.from(PANO_BUCKET).getPublicUrl(path).data.publicUrl;
  };
  const imageUrl = await up(`${base}.jpg`, full.blob);
  const previewUrl = await up(`${base}_preview.jpg`, preview.blob);
  return supabase
    .from("vh_panoramas")
    .insert({
      project_id: projectId,
      title: (meta.title || "").trim(),
      mode: meta.mode,
      time_of_day: meta.time_of_day,
      zone_id: meta.zone_id || null,
      north_offset_deg: Number(meta.north_offset_deg) || 0,
      projection: flat ? "flat" : "equirect",
      hfov_deg: flat ? Math.min(360, Math.max(30, Number(meta.hfov_deg) || 120)) : 120,
      image_url: imageUrl,
      preview_url: previewUrl,
      storage_path: `${base}.jpg`,
      is_default: !!meta.is_default,
    })
    .select()
    .single()
    .then(check);
}

export const updatePanorama = (id, patch) => supabase.from("vh_panoramas").update(patch).eq("id", id).then(check);

/** Đặt ảnh mặc định: bỏ cờ ở ảnh khác trước (chỉ mục duy nhất trong DB). */
export async function setDefaultPanorama(projectId, id) {
  await supabase.from("vh_panoramas").update({ is_default: false }).eq("project_id", projectId).eq("is_default", true).then(check);
  return supabase.from("vh_panoramas").update({ is_default: true }).eq("id", id).then(check);
}

export async function deletePanorama(pano) {
  await supabase.from("vh_panoramas").delete().eq("id", pano.id).then(check);
  if (pano.storage_path) {
    const preview = pano.storage_path.replace(/\.jpg$/, "_preview.jpg");
    await supabase.storage.from(PANO_BUCKET).remove([pano.storage_path, preview]);
  }
}

export const saveHotspot = (h) =>
  supabase
    .from("vh_hotspots")
    .upsert({
      ...(h.id ? { id: h.id } : {}),
      pano_id: h.pano_id,
      kind: h.kind,
      yaw: Number(h.yaw),
      pitch: Number(h.pitch),
      label: h.label.trim(),
      description: (h.description || "").trim() || null,
      icon: h.icon || "pin",
      zone_id: h.kind === "zone" ? h.zone_id || null : null,
      target_pano_id: h.kind === "link" ? h.target_pano_id || null : null,
    })
    .then(check);

export const deleteHotspot = (id) => supabase.from("vh_hotspots").delete().eq("id", id).then(check);

export function validateHotspot(h) {
  const e = [];
  if (!String(h.label || "").trim()) e.push("Thiếu tên điểm.");
  const isNum = (v) => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
  if (!isNum(h.yaw) || !isNum(h.pitch)) e.push("Bấm vào ảnh để chọn vị trí điểm.");
  if (h.kind === "zone" && !h.zone_id) e.push("Chọn phân khu cho điểm này.");
  if (h.kind === "link" && !h.target_pano_id) e.push("Chọn ảnh 360° sẽ chuyển tới.");
  return e;
}

// ───────────── Sa bàn (masterplan) ─────────────

export const PLAN_KINDS = { zone: "Phân khu", amenity: "Tiện ích", lake: "Hồ / mặt nước", park: "Công viên", road: "Đường / hướng kết nối" };
// Màu phân khu theo thứ tự cố định (không đổi khi thêm / bớt phân khu khác).
export const ZONE_COLORS = ["#d9b54a", "#8ea4d2", "#e08e6d", "#b48ad1", "#5fb3a8", "#c98fa0", "#9aa86a", "#7f9fb0"];

const clampPct = (v) => Math.min(100, Math.max(0, Math.round(Number(v) * 10) / 10));

/** Chuẩn hoá danh sách điểm sa bàn: toạ độ 0–100, bán kính hợp lý, bỏ điểm hỏng. */
export function normalizePlanMarkers(markers) {
  return (Array.isArray(markers) ? markers : [])
    .filter((m) => m && PLAN_KINDS[m.kind] && Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.y)))
    .map((m) => ({
      ...m,
      x: clampPct(m.x),
      y: clampPct(m.y),
      ...(["zone", "lake", "park"].includes(m.kind) ? { r: Math.min(30, Math.max(3, Number(m.r) || 10)) } : {}),
      label: String(m.label || "").trim(),
    }));
}

/** Màu của phân khu theo thứ tự xuất hiện trong danh sách phân khu của dự án. */
export function zoneColor(zoneId, zones) {
  const i = (zones || []).findIndex((z) => z.id === zoneId);
  return ZONE_COLORS[(i < 0 ? 0 : i) % ZONE_COLORS.length];
}

export function validatePlanMarker(m) {
  const e = [];
  if (!PLAN_KINDS[m.kind]) e.push("Chọn loại điểm.");
  if (!String(m.label || "").trim()) e.push("Thiếu tên hiển thị.");
  if (m.kind === "zone" && !m.zone_id) e.push("Chọn phân khu cho vùng này.");
  const isNum = (v) => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
  if (!isNum(m.x) || !isNum(m.y)) e.push("Bấm lên sa bàn để chọn vị trí.");
  return e;
}

export const hasMasterplan = (geo) => !!(geo?.masterplan && (geo.masterplan.image_url || normalizePlanMarkers(geo.masterplan.markers).length));

export const saveMasterplan = (projectId, plan) =>
  supabase
    .from("vh_project_geo")
    .upsert({ project_id: projectId, masterplan: { ...plan, markers: normalizePlanMarkers(plan.markers) }, updated_at: new Date().toISOString() })
    .then(check);

/** Ảnh mặt bằng thật (không bắt buộc tỉ lệ 2:1), thu về tối đa 3000px. */
export async function uploadMasterplanImage(projectId, file) {
  const { blob } = await resizeImage(file, 3000, 0.88);
  const path = `${projectId}/masterplan_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(PANO_BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from(PANO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ───────────── Ảnh phối cảnh (không phải 360° toàn phần) ─────────────

export const PROJECTION_LABELS = { equirect: "Ảnh 360° toàn cảnh (tỉ lệ 2:1)", flat: "Ảnh phối cảnh / flycam góc rộng" };
export const isFlat = (pano) => pano?.projection === "flat";

/**
 * Đặt ảnh phối cảnh rộng hfov độ vào giữa một mặt cầu ảo để khung 360° hiển
 * thị đúng tỉ lệ (không kéo méo quanh 360°). Trả panoData cho Photo Sphere
 * Viewer và góc dọc của ảnh.
 */
export function flatPanoData(width, height, hfovDeg = 120) {
  let hfov = Math.min(360, Math.max(30, Number(hfovDeg) || 120));
  let fullWidth = Math.round((width * 360) / hfov);
  // Ảnh quá cao so với góc rộng đã chọn: thu hẹp góc ngang để ảnh vừa chiều dọc mặt cầu (không cắt ảnh).
  if (height > fullWidth / 2) {
    fullWidth = height * 2;
    hfov = (width / fullWidth) * 360;
  }
  const fullHeight = Math.round(fullWidth / 2);
  return {
    panoData: {
      isEquirectangular: true,
      fullWidth,
      fullHeight,
      croppedWidth: width,
      croppedHeight: height,
      croppedX: Math.round((fullWidth - width) / 2),
      croppedY: Math.round((fullHeight - height) / 2),
    },
    hfov,
    vfov: (height / fullHeight) * 180,
  };
}

/** Giữ khung nhìn (rộng viewH × cao viewV độ) nằm trong ảnh phối cảnh (hfov × vfov độ, tâm ở yaw 0). */
export function clampFlatPosition({ yaw, pitch }, { hfov, vfov }, { viewH, viewV }) {
  const wrap = (a) => {
    let x = a % (2 * Math.PI);
    if (x > Math.PI) x -= 2 * Math.PI;
    if (x < -Math.PI) x += 2 * Math.PI;
    return x;
  };
  const maxYaw = Math.max(0, degToRad((hfov - viewH) / 2));
  const maxPitch = Math.max(0, degToRad((vfov - viewV) / 2));
  const y = Math.min(maxYaw, Math.max(-maxYaw, wrap(yaw)));
  return { yaw: y < 0 ? y + 2 * Math.PI : y, pitch: Math.min(maxPitch, Math.max(-maxPitch, pitch)) };
}
