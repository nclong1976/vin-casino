import React, { Suspense, lazy, useEffect, useState } from "react";
import { Trash2, Upload, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { PLAN_KINDS, AMENITY_ICONS, normalizePlanMarkers, validatePlanMarker, saveMasterplan, uploadMasterplanImage } from "@/lib/vinhomesMap";
import { NumInput, Labeled, Section, Errors, PrimaryButton } from "./ui";

const MasterplanStage = lazy(() => import("@/components/projects/map360/MasterplanStage"));
const EMPTY = { kind: "zone", label: "", zone_id: "", icon: "pin", r: 12, x: "", y: "" };
const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Sa bàn của dự án: sơ đồ minh hoạ vẽ từ các điểm (phân khu, hồ, công viên,
 * tiện ích, hướng đường) hoặc ảnh mặt bằng thật + điểm phân khu / tiện ích.
 * Bấm lên sa bàn để đặt vị trí, điền thông tin, "Thêm vào sa bàn", rồi "Lưu sa bàn".
 */
export default function PlanEditor({ projectId, zones }) {
  const [plan, setPlan] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase
      .from("vh_project_geo")
      .select("masterplan")
      .eq("project_id", projectId)
      .maybeSingle()
      .then(({ data }) => setPlan(data?.masterplan || { image_url: null, illustrative: true, markers: [] }));
  }, [projectId]);

  if (!plan) return null;
  const markers = normalizePlanMarkers(plan.markers);
  const preview = draft.x !== "" ? [...markers.filter((m) => m.id !== draft.id), { ...draft, id: draft.id || "draft", label: draft.label || "Điểm mới" }] : markers;
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  const addMarker = () => {
    const errs = validatePlanMarker(draft);
    setErrors(errs);
    if (errs.length) return;
    const m = { ...draft, id: draft.id || newId(), x: Number(draft.x), y: Number(draft.y), r: Number(draft.r) || 10 };
    if (m.kind !== "zone") delete m.zone_id;
    if (m.kind !== "amenity") delete m.icon;
    setPlan((p) => ({ ...p, markers: [...normalizePlanMarkers(p.markers).filter((x) => x.id !== m.id), m] }));
    setDraft(EMPTY);
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveMasterplan(projectId, { ...plan, illustrative: !plan.image_url });
      toast.success("Đã lưu sa bàn");
    } catch (e) {
      toast.error(`Không lưu được: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadMasterplanImage(projectId, file);
      setPlan((p) => ({ ...p, image_url: url, illustrative: false }));
      toast.success("Đã tải ảnh mặt bằng - đặt lại vị trí phân khu cho khớp ảnh rồi Lưu sa bàn");
    } catch (e) {
      toast.error(e.message || String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section
      title="Sa bàn dự án"
      hint="Không có ảnh mặt bằng thì app tự vẽ sơ đồ minh hoạ từ các điểm. Có ảnh mặt bằng (được phép sử dụng) thì app hiện ảnh và các điểm phân khu / tiện ích lên trên."
    >
      <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
        <label className="px-2.5 py-1 rounded-lg bg-gray-100 font-bold text-gray-700 flex items-center gap-1 cursor-pointer">
          <Upload className="w-3 h-3" /> {uploading ? "Đang tải..." : plan.image_url ? "Đổi ảnh mặt bằng" : "Tải ảnh mặt bằng"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {plan.image_url && (
          <button onClick={() => setPlan((p) => ({ ...p, image_url: null, illustrative: true }))} className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 font-bold text-gray-600 cursor-pointer">
            Dùng sơ đồ minh hoạ
          </button>
        )}
        <span className="text-gray-500">{markers.length} điểm</span>
      </div>

      <Suspense fallback={<div className="aspect-square rounded-xl bg-gray-100" />}>
        <MasterplanStage
          plan={{ ...plan, markers: preview }}
          zones={zones}
          selectedId={draft.id || (draft.x !== "" ? "draft" : null)}
          onPick={({ x, y }) => setDraft((d) => ({ ...d, x, y }))}
          className="aspect-square w-full max-w-[520px] mx-auto rounded-xl bg-[#1a2433] cursor-crosshair"
        />
      </Suspense>

      <div className="grid grid-cols-2 gap-2">
        <Labeled label="Loại điểm">
          <select value={draft.kind} onChange={(e) => set("kind")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] bg-white">
            {Object.entries(PLAN_KINDS).map(([k, l]) => (
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
          <Labeled label="Phân khu (khách chạm → định giá)">
            <select
              value={draft.zone_id}
              onChange={(e) => {
                const z = zones.find((x) => x.id === e.target.value);
                setDraft((d) => ({ ...d, zone_id: e.target.value, label: d.label || z?.name || "" }));
              }}
              className="px-2 py-1 rounded-md border border-gray-200 text-[11px] bg-white"
            >
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
        {["zone", "lake", "park"].includes(draft.kind) && (
          <Labeled label="Độ lớn (3–30)">
            <NumInput step="1" value={draft.r} onChange={set("r")} />
          </Labeled>
        )}
        <p className="text-[10px] text-gray-500 self-end pb-1">{draft.x === "" ? "Bấm lên sa bàn để chọn vị trí." : `Vị trí: ${draft.x}%, ${draft.y}%`}</p>
      </div>
      <Errors errors={errors} />
      <div className="flex justify-end gap-2">
        {(draft.id || draft.x !== "") && (
          <button onClick={() => { setDraft(EMPTY); setErrors([]); }} className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-bold text-gray-600 cursor-pointer">
            Bỏ
          </button>
        )}
        <button onClick={addMarker} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-bold cursor-pointer">
          {draft.id ? "Cập nhật điểm" : "Thêm vào sa bàn"}
        </button>
      </div>

      {markers.length > 0 && (
        <div className="space-y-1">
          {markers.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-[10.5px] border-t border-gray-100 pt-1">
              <span className="px-1.5 rounded bg-gray-100 text-gray-600 shrink-0">{PLAN_KINDS[m.kind]}</span>
              <span className="flex-1 truncate font-semibold">{m.label}</span>
              <button onClick={() => setDraft({ ...EMPTY, ...m })} className="p-1 rounded text-gray-500 hover:bg-gray-100 cursor-pointer" aria-label={`Sửa ${m.label}`}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPlan((p) => ({ ...p, markers: normalizePlanMarkers(p.markers).filter((x) => x.id !== m.id) }))}
                className="p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer"
                aria-label={`Xoá ${m.label}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <PrimaryButton busy={busy} onClick={save}>
          Lưu sa bàn
        </PrimaryButton>
      </div>
    </Section>
  );
}
