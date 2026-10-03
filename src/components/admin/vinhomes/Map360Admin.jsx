import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Trash2, Star, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  HOTSPOT_KINDS,
  AMENITY_ICONS,
  MODE_LABELS,
  TIME_LABELS,
  PROJECTION_LABELS,
  validateGeo,
  validateHotspot,
  saveGeo,
  loadProject360,
  uploadPanorama,
  updatePanorama,
  setDefaultPanorama,
  deletePanorama,
  saveHotspot,
  deleteHotspot,
} from "@/lib/vinhomesMap";
import { NumInput, Labeled, Section, Errors, PrimaryButton } from "./ui";
import PlanEditor from "./PlanEditor";

const PanoViewer = lazy(() => import("@/components/projects/map360/PanoViewer"));
const EMPTY_HS = { kind: "zone", label: "", icon: "pin", zone_id: "", target_pano_id: "", description: "", yaw: "", pitch: "" };

function GeoForm({ projectId }) {
  const [g, setG] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("vh_project_geo")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle()
      .then(({ data }) => setG({ lat: "", lng: "", zoom: 15, verified: false, area_ha: "", units_text: "", ...(data || {}), highlightsText: (data?.highlights || []).join("\n") }));
  }, [projectId]);

  if (!g) return null;
  const set = (k) => (v) => setG((x) => ({ ...x, [k]: v }));

  const save = async () => {
    const errs = validateGeo(g);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      await saveGeo(projectId, { ...g, highlights: g.highlightsText.split("\n") });
      toast.success("Đã lưu vị trí dự án");
    } catch (e) {
      toast.error(`Không lưu được: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Vị trí trên bản đồ"
      hint="Lấy toạ độ: mở Google Maps, nhấn giữ vào giữa dự án, chép 2 số hiện ra (vĩ độ, kinh độ). Để trống thì dự án không hiện trên bản đồ."
    >
      {!g.verified && g.lat !== "" && g.lat !== null && (
        <p className="text-[10.5px] text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">Toạ độ đang là vị trí tạm, chưa xác nhận. Kiểm tra lại rồi đánh dấu "Đã xác nhận".</p>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Labeled label="Vĩ độ">
          <NumInput step="0.0001" value={g.lat ?? ""} onChange={set("lat")} />
        </Labeled>
        <Labeled label="Kinh độ">
          <NumInput step="0.0001" value={g.lng ?? ""} onChange={set("lng")} />
        </Labeled>
        <Labeled label="Mức phóng to" hint="14 = cả khu, 17 = gần">
          <NumInput step="0.5" value={g.zoom} onChange={set("zoom")} />
        </Labeled>
        <Labeled label="Quy mô (ha)">
          <NumInput step="0.1" value={g.area_ha ?? ""} onChange={set("area_ha")} />
        </Labeled>
        <Labeled label="Số căn / mô tả ngắn">
          <input value={g.units_text || ""} onChange={(e) => set("units_text")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] min-w-0" />
        </Labeled>
        <label className="flex items-center gap-1.5 text-[10.5px] font-semibold text-gray-700 pt-4 cursor-pointer">
          <input type="checkbox" checked={!!g.verified} onChange={(e) => set("verified")(e.target.checked)} className="accent-[#948154]" /> Đã xác nhận
        </label>
      </div>
      <Labeled label="Điểm nổi bật (mỗi dòng một ý, hiện ở ngăn thông tin)">
        <textarea rows={3} value={g.highlightsText} onChange={(e) => set("highlightsText")(e.target.value)} className="px-2 py-1.5 rounded-md border border-gray-200 text-[11px]" />
      </Labeled>
      <Errors errors={errors} />
      <div className="flex justify-end">
        <PrimaryButton busy={busy} onClick={save}>
          Lưu vị trí
        </PrimaryButton>
      </div>
    </Section>
  );
}

function UploadForm({ projectId, zones, hasDefault, onDone }) {
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({ title: "", mode: "flycam", time_of_day: "day", zone_id: "", north_offset_deg: 0, projection: "equirect", hfov_deg: 120 });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setMeta((m) => ({ ...m, [k]: v }));

  const upload = async () => {
    if (!file) return toast.error("Chọn ảnh 360°");
    setBusy(true);
    try {
      await uploadPanorama(projectId, file, { ...meta, is_default: !hasDefault });
      toast.success("Đã tải ảnh 360° lên");
      setFile(null);
      onDone();
    } catch (e) {
      toast.error(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Tải ảnh 360°"
      hint="Hai loại ảnh: ảnh 360° toàn cảnh tỉ lệ 2:1 (chụp bằng máy 360° / drone, VD 8000×4000) hoặc ảnh phối cảnh / flycam thường (ảnh render tổng thể dự án). Ảnh lớn được thu nhỏ để chạy mượt trên điện thoại."
    >
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[11px]" />
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="Loại ảnh">
          <select value={meta.projection} onChange={(e) => set("projection")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] bg-white">
            {Object.entries(PROJECTION_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Labeled>
        {meta.projection === "flat" && (
          <Labeled label="Góc rộng của ảnh (độ)" hint="Ảnh flycam / phối cảnh thường 90–150°. Càng lớn, ảnh hiện càng xa.">
            <NumInput step="5" value={meta.hfov_deg} onChange={set("hfov_deg")} />
          </Labeled>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Labeled label="Góc nhìn">
          <select value={meta.mode} onChange={(e) => set("mode")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] bg-white">
            {Object.entries(MODE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Thời điểm">
          <select value={meta.time_of_day} onChange={(e) => set("time_of_day")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] bg-white">
            {Object.entries(TIME_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Phân khu">
          <select value={meta.zone_id} onChange={(e) => set("zone_id")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] bg-white">
            <option value="">Toàn dự án</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Hướng Bắc lệch (độ)" hint="Chỉnh sau cũng được">
          <NumInput step="1" value={meta.north_offset_deg} onChange={set("north_offset_deg")} />
        </Labeled>
      </div>
      <Labeled label="Tên ảnh (không bắt buộc)">
        <input value={meta.title} onChange={(e) => set("title")(e.target.value)} placeholder="VD: Toàn cảnh từ hồ trung tâm" className="px-2 py-1 rounded-md border border-gray-200 text-[11px]" />
      </Labeled>
      <div className="flex justify-end">
        <PrimaryButton busy={busy} onClick={upload} disabled={!file}>
          <span className="flex items-center gap-1">
            <Upload className="w-3 h-3" /> {busy ? "Đang xử lý..." : "Tải lên"}
          </span>
        </PrimaryButton>
      </div>
    </Section>
  );
}

function HotspotEditor({ pano, panos, zones, hotspots, onChanged }) {
  const [draft, setDraft] = useState(EMPTY_HS);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const own = hotspots.filter((h) => h.pano_id === pano.id);
  const preview = draft.yaw !== "" ? [...own.filter((h) => h.id !== draft.id), { ...draft, id: "draft", label: draft.label || "Điểm mới" }] : own;
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    const errs = validateHotspot(draft);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      await saveHotspot({ ...draft, pano_id: pano.id });
      toast.success("Đã lưu điểm");
      setDraft(EMPTY_HS);
      onChanged();
    } catch (e) {
      toast.error(`Không lưu được: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (h) => {
    if (!window.confirm(`Xoá điểm "${h.label}"?`)) return;
    try {
      await deleteHotspot(h.id);
      if (draft.id === h.id) setDraft(EMPTY_HS);
      onChanged();
    } catch (e) {
      toast.error(`Không xoá được: ${e.message || e}`);
    }
  };

  return (
    <Section title="Điểm tương tác trên ảnh" hint="Bấm vào ảnh để đặt vị trí, điền thông tin rồi Lưu. Bấm vào điểm có sẵn để sửa.">
      <Suspense fallback={<div className="h-[260px] rounded-xl bg-gray-900" />}>
        <PanoViewer
          pano={pano}
          hotspots={preview}
          onPick={({ yaw, pitch }) => setDraft((d) => ({ ...d, yaw, pitch }))}
          onHotspot={(h) => h.id !== "draft" && setDraft({ ...EMPTY_HS, ...h, zone_id: h.zone_id || "", target_pano_id: h.target_pano_id || "", description: h.description || "" })}
          className="h-[260px] rounded-xl bg-gray-900"
        />
      </Suspense>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="Loại điểm">
          <select value={draft.kind} onChange={(e) => set("kind")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] bg-white">
            {Object.entries(HOTSPOT_KINDS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Tên hiển thị">
          <input value={draft.label} onChange={(e) => set("label")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] min-w-0" />
        </Labeled>
        {draft.kind === "zone" && (
          <Labeled label="Phân khu (khách bấm → định giá phân khu này)">
            <select value={draft.zone_id} onChange={(e) => set("zone_id")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] bg-white">
              <option value="">Chọn phân khu</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </Labeled>
        )}
        {draft.kind === "amenity" && (
          <Labeled label="Biểu tượng">
            <select value={draft.icon} onChange={(e) => set("icon")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] bg-white">
              {Object.entries(AMENITY_ICONS).map(([k, i]) => (
                <option key={k} value={k}>
                  {i} {k}
                </option>
              ))}
            </select>
          </Labeled>
        )}
        {draft.kind === "link" && (
          <Labeled label="Chuyển tới ảnh">
            <select value={draft.target_pano_id} onChange={(e) => set("target_pano_id")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] bg-white">
              <option value="">Chọn ảnh</option>
              {panos
                .filter((p) => p.id !== pano.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title || `${MODE_LABELS[p.mode]} · ${TIME_LABELS[p.time_of_day]}`}
                  </option>
                ))}
            </select>
          </Labeled>
        )}
        <p className="text-[10px] text-gray-500 self-end pb-1">
          {draft.yaw === "" ? "Chưa chọn vị trí - bấm vào ảnh." : `Vị trí: ${(Number(draft.yaw) * 57.3).toFixed(0)}°, ${(Number(draft.pitch) * 57.3).toFixed(0)}°`}
        </p>
      </div>
      {draft.kind === "amenity" && (
        <Labeled label="Mô tả (hiện khi khách bấm)">
          <textarea rows={2} value={draft.description} onChange={(e) => set("description")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px]" />
        </Labeled>
      )}
      <Errors errors={errors} />
      <div className="flex justify-end gap-2">
        {(draft.id || draft.yaw !== "") && (
          <button onClick={() => { setDraft(EMPTY_HS); setErrors([]); }} className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-bold text-gray-600 cursor-pointer">
            Bỏ
          </button>
        )}
        <PrimaryButton busy={busy} onClick={save}>
          {draft.id ? "Lưu thay đổi" : "Thêm điểm"}
        </PrimaryButton>
      </div>
      {own.length > 0 && (
        <div className="space-y-1">
          {own.map((h) => (
            <div key={h.id} className="flex items-center gap-2 text-[10.5px] border-t border-gray-100 pt-1">
              <span className="px-1.5 rounded bg-gray-100 text-gray-600 shrink-0">{HOTSPOT_KINDS[h.kind]}</span>
              <span className="flex-1 truncate font-semibold">{h.label}</span>
              <button onClick={() => remove(h)} className="p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer" aria-label={`Xoá ${h.label}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/** Admin → Cấu hình định giá → tab "Bản đồ & 360°". */
export default function Map360Admin({ projectId }) {
  const [data, setData] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const reload = useCallback(
    () =>
      loadProject360(projectId)
        .then((d) => {
          setData(d);
          setActiveId((id) => (id && d.panos.some((p) => p.id === id) ? id : d.panos[0]?.id || null));
        })
        .catch((e) => toast.error(`Không tải được ảnh 360°: ${e.message || e}`)),
    [projectId]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const act = async (fn, ok) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      reload();
    } catch (e) {
      toast.error(e.message || String(e));
    }
  };

  const active = data?.panos.find((p) => p.id === activeId);

  return (
    <div className="space-y-3">
      <GeoForm projectId={projectId} />
      {!data ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : (
        <>
          <PlanEditor projectId={projectId} zones={data.zones} />
          <UploadForm projectId={projectId} zones={data.zones} hasDefault={data.panos.some((p) => p.is_default)} onDone={reload} />
          <Section title={`Ảnh 360° của dự án (${data.panos.length})`} hint="Ảnh có ★ là ảnh mở đầu tiên. Bấm vào ảnh để đặt điểm tương tác.">
            {data.panos.length === 0 ? (
              <p className="text-[10.5px] text-gray-500">Chưa có ảnh. Khách vẫn thấy dự án trên bản đồ và định giá được.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {data.panos.map((p) => (
                  <div key={p.id} className={`rounded-lg border overflow-hidden ${p.id === activeId ? "border-[#948154] ring-2 ring-[#948154]/30" : "border-gray-100"}`}>
                    <button onClick={() => setActiveId(p.id)} className="block w-full aspect-[2/1] bg-gray-100 bg-cover bg-center cursor-pointer" style={{ backgroundImage: `url("${p.preview_url || p.image_url}")` }} aria-label="Chọn ảnh" />
                    <div className="p-1.5 space-y-1 text-[10px]">
                      <p className="font-bold truncate">
                        {p.is_default && "★ "}
                        {p.title || "(Không tên)"}
                      </p>
                      <p className="text-gray-500">
                        {MODE_LABELS[p.mode]} · {TIME_LABELS[p.time_of_day]}
                        {p.projection === "flat" ? ` · Phối cảnh ${Number(p.hfov_deg)}°` : " · 360°"}
                      </p>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">Bắc</span>
                        <div className="w-14">
                          <NumInput
                            step="1"
                            value={p.north_offset_deg}
                            onChange={(v) => setData((d) => ({ ...d, panos: d.panos.map((x) => (x.id === p.id ? { ...x, north_offset_deg: v } : x)) }))}
                            onBlur={(e) => act(() => updatePanorama(p.id, { north_offset_deg: Number(e.target.value) || 0 }))}
                          />
                        </div>
                        <span className="text-gray-500">°</span>
                        {!p.is_default && (
                          <button onClick={() => act(() => setDefaultPanorama(projectId, p.id), "Đã đặt làm ảnh mở đầu")} className="ml-auto p-1 rounded text-amber-600 hover:bg-amber-50 cursor-pointer" aria-label="Đặt làm ảnh mở đầu">
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => window.confirm("Xoá ảnh 360° này cùng các điểm trên ảnh?") && act(() => deletePanorama(p), "Đã xoá ảnh")}
                          className={`${p.is_default ? "ml-auto" : ""} p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer`}
                          aria-label="Xoá ảnh"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
          {active && <HotspotEditor key={active.id} pano={active} panos={data.panos} zones={data.zones} hotspots={data.hotspots} onChanged={reload} />}
        </>
      )}
    </div>
  );
}
