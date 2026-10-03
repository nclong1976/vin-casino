import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TYPE_LABELS } from "@/lib/vinhomesValuation";
import { TYPE_ORDER, saveZone, deleteZone } from "@/lib/vinhomesValuationAdmin";
import { NumInput, Section } from "./ui";

/** Phân khu: tên, loại hình có bán, hệ số giá phân khu. */
export default function ZonesEditor({ projectId, zones, units, onChanged }) {
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null);
  const rows = [...zones, ...(drafts.new ? [drafts.new] : [])];
  const draftOf = (z) => drafts[z.id || "new"] || z;
  const edit = (z, patch) => setDrafts((d) => ({ ...d, [z.id || "new"]: { ...draftOf(z), ...patch } }));

  const save = async (z) => {
    const row = draftOf(z);
    if (!row.name?.trim()) return toast.error("Thiếu tên phân khu");
    if (!row.types?.length) return toast.error("Phân khu phải có ít nhất một loại hình");
    if (!(Number(row.k_zone) > 0 && Number(row.k_zone) < 5)) return toast.error("Hệ số phân khu phải lớn hơn 0 và nhỏ hơn 5");
    setBusy(z.id || "new");
    try {
      await saveZone({ ...row, project_id: projectId });
      setDrafts((d) => {
        const n = { ...d };
        delete n[z.id || "new"];
        return n;
      });
      toast.success(`Đã lưu phân khu ${row.name}`);
      onChanged();
    } catch (e) {
      toast.error(`Không lưu được: ${e.message || e}`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (z) => {
    if (!z.id) return setDrafts((d) => ({ ...d, new: undefined }));
    if (zones.length <= 1) return toast.error("Dự án phải còn ít nhất một phân khu");
    const n = units.filter((u) => u.zone_id === z.id).length;
    if (!window.confirm(`Xoá phân khu "${z.name}"?${n ? `\n${n} mã căn đang thuộc phân khu này sẽ không còn phân khu.` : ""}`)) return;
    setBusy(z.id);
    try {
      await deleteZone(z.id);
      toast.success("Đã xoá phân khu");
      onChanged();
    } catch (e) {
      toast.error(`Không xoá được: ${e.message || e}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      title="Phân khu"
      hint="Hệ số phân khu nhân vào đơn giá (VD 1,1 = đắt hơn 10%). Chỉ khi có từ 2 phân khu trở lên, khách mới thấy ô chọn phân khu."
      right={
        !drafts.new && (
          <button
            onClick={() => setDrafts((d) => ({ ...d, new: { name: "", types: [...TYPE_ORDER], k_zone: 1, sort_order: zones.length } }))}
            className="text-[10.5px] font-bold text-[#948154] flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Plus className="w-3 h-3" /> Thêm phân khu
          </button>
        )
      }
    >
      <div className="space-y-2">
        {rows.map((z) => {
          const d = draftOf(z);
          const dirty = !!drafts[z.id || "new"];
          return (
            <div key={z.id || "new"} className={`rounded-lg border p-2 space-y-1.5 ${dirty ? "border-amber-300 bg-amber-50/40" : "border-gray-100"}`}>
              <div className="flex items-center gap-1.5">
                <input
                  value={d.name}
                  onChange={(e) => edit(z, { name: e.target.value })}
                  placeholder="Tên phân khu"
                  className="flex-1 min-w-0 px-2 py-1 rounded-md border border-gray-200 text-[11px] font-bold"
                />
                <span className="text-[10px] text-gray-500 shrink-0">Hệ số</span>
                <div className="w-16 shrink-0">
                  <NumInput value={d.k_zone} onChange={(v) => edit(z, { k_zone: v })} />
                </div>
                <button onClick={() => remove(z)} disabled={busy === z.id} className="p-1 shrink-0 rounded-md text-red-500 hover:bg-red-50 cursor-pointer" aria-label="Xoá phân khu">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  {TYPE_ORDER.map((t) => (
                    <label key={t} className="flex items-center gap-1 text-[10.5px] text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-[#948154]"
                        checked={d.types?.includes(t)}
                        onChange={() => edit(z, { types: d.types?.includes(t) ? d.types.filter((x) => x !== t) : [...(d.types || []), t] })}
                      />
                      {TYPE_LABELS[t]}
                    </label>
                  ))}
                </div>
                {dirty && (
                  <button onClick={() => save(z)} disabled={!!busy} className="px-2.5 py-1 rounded-md bg-[#948154] text-white text-[10.5px] font-bold cursor-pointer disabled:opacity-50">
                    {busy === (z.id || "new") ? "..." : "Lưu"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
