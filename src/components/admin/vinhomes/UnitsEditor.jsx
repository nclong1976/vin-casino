import React, { useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { TYPE_LABELS, DIRECTION_LABELS, VIEW_LABELS } from "@/lib/vinhomesValuation";
import { parseUnitsText, saveUnits, deleteUnit } from "@/lib/vinhomesValuationAdmin";
import { Section, Errors, PrimaryButton } from "./ui";

const STATUS = { available: "Còn", reserved: "Đã giữ chỗ", sold: "Đã bán" };

/**
 * Mã căn: khách chọn mã căn thì loại hình / diện tích / hướng / tầng tự điền.
 * Thêm hàng loạt bằng cách dán danh sách (mỗi dòng một căn); trùng mã thì cập nhật.
 */
export default function UnitsEditor({ projectId, units, zones, config, onChanged }) {
  const [text, setText] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const importUnits = async () => {
    const { units: parsed, errors: errs } = parseUnitsText(text);
    const notSold = parsed.filter((u) => config?.k_type?.[u.type] === undefined);
    const allErrs = [...errs, ...notSold.map((u) => `Mã ${u.code}: dự án không bán loại hình ${TYPE_LABELS[u.type]}.`)];
    setErrors(allErrs);
    if (allErrs.length || parsed.length === 0) return;
    setBusy(true);
    try {
      await saveUnits(projectId, parsed.map((u) => ({ ...u, zone_id: zoneId || null })));
      toast.success(`Đã lưu ${parsed.length} mã căn`);
      setText("");
      onChanged();
    } catch (e) {
      toast.error(`Không lưu được: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (u, status) => {
    try {
      await saveUnits(projectId, [{ code: u.code, type: u.type, area: u.area, direction: u.direction, floor: u.floor, is_corner: u.is_corner, view: u.view, zone_id: u.zone_id, status }]);
      onChanged();
    } catch (e) {
      toast.error(`Không cập nhật được: ${e.message || e}`);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Xoá mã căn ${u.code}?`)) return;
    try {
      await deleteUnit(projectId, u.code);
      onChanged();
    } catch (e) {
      toast.error(`Không xoá được: ${e.message || e}`);
    }
  };

  const zoneName = (id) => zones.find((z) => z.id === id)?.name || "—";
  const shown = units.filter((u) => !q || u.code.includes(q.trim().toUpperCase()));

  return (
    <div className="space-y-3">
      <Section
        title="Thêm / cập nhật mã căn"
        hint="Mỗi dòng một căn: mã, loại hình, diện tích, hướng, tầng, góc, hướng nhìn. Có thể dán từ Excel. Hướng: D, T, N, B, DN, DB, TN, TB. Hướng nhìn: none, park, lake, sea."
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={"A1-1203, căn hộ, 76, DN, 12, không, park\nSH-05, shophouse, 100, N, , có\nBT-12, biệt thự, 220, DB, , có, lake"}
          className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[11px] font-mono"
        />
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10.5px] text-gray-600 flex items-center gap-1.5">
            Thuộc phân khu
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px] bg-white">
              <option value="">(Không)</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <PrimaryButton busy={busy} onClick={importUnits} disabled={!text.trim()}>
            <span className="flex items-center gap-1">
              <Upload className="w-3 h-3" /> Lưu danh sách
            </span>
          </PrimaryButton>
        </div>
        <Errors errors={errors} />
      </Section>

      <Section
        title={`Danh sách mã căn (${units.length})`}
        hint="Căn đã bán không hiện cho khách."
        right={
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã" className="w-28 px-2 py-1 rounded-md border border-gray-200 text-[11px]" />
        }
      >
        {units.length === 0 ? (
          <p className="text-[10.5px] text-gray-500">Chưa có mã căn. Khách vẫn định giá được bằng cách tự chọn thông số.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[10.5px] min-w-[560px]">
              <thead className="text-gray-400 text-left">
                <tr>
                  <th className="px-1 py-1">Mã</th>
                  <th className="px-1 py-1">Loại</th>
                  <th className="px-1 py-1 text-right">m²</th>
                  <th className="px-1 py-1">Hướng</th>
                  <th className="px-1 py-1 text-right">Tầng</th>
                  <th className="px-1 py-1">Nhìn</th>
                  <th className="px-1 py-1">Phân khu</th>
                  <th className="px-1 py-1">Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.code} className="border-t border-gray-100">
                    <td className="px-1 py-1 font-bold">{u.code}</td>
                    <td className="px-1 py-1">
                      {TYPE_LABELS[u.type]}
                      {u.is_corner ? " · góc" : ""}
                    </td>
                    <td className="px-1 py-1 text-right font-mono">{Number(u.area)}</td>
                    <td className="px-1 py-1">{DIRECTION_LABELS[u.direction]}</td>
                    <td className="px-1 py-1 text-right">{u.floor ?? "—"}</td>
                    <td className="px-1 py-1">{VIEW_LABELS[u.view] || u.view}</td>
                    <td className="px-1 py-1">{zoneName(u.zone_id)}</td>
                    <td className="px-1 py-1">
                      <select value={u.status} onChange={(e) => setStatus(u, e.target.value)} className="px-1 py-0.5 rounded border border-gray-200 bg-white">
                        {Object.entries(STATUS).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <button onClick={() => remove(u)} className="p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer" aria-label={`Xoá ${u.code}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
