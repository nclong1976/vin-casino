import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TYPE_LABELS, fmtVnd } from "@/lib/vinhomesValuation";
import { TYPE_ORDER, savePricePoint, deletePricePoint } from "@/lib/vinhomesValuationAdmin";
import { NumInput, Section, PrimaryButton } from "./ui";

const thisMonth = () => new Date().toISOString().slice(0, 7);

/**
 * Đơn giá theo tháng cho từng loại hình. Từ 2 tháng trở lên, định giá tính
 * tốc độ tăng giá bình quân từ đây thay cho mức tăng giá mặc định.
 */
export default function PriceHistoryEditor({ projectId, history, config, onChanged }) {
  const types = TYPE_ORDER.filter((t) => config?.k_type?.[t] !== undefined);
  const [type, setType] = useState(types[0] || "apartment");
  const [month, setMonth] = useState(thisMonth());
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = history.filter((h) => h.type === type);

  const add = async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) return toast.error("Chọn tháng");
    if (!(Number(price) >= 100000)) return toast.error("Đơn giá phải từ 100.000 đ/m²");
    setBusy(true);
    try {
      await savePricePoint(projectId, type, month, price);
      toast.success(`Đã lưu đơn giá ${TYPE_LABELS[type]} tháng ${month}`);
      setPrice("");
      onChanged();
    } catch (e) {
      toast.error(`Không lưu được: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (h) => {
    if (!window.confirm(`Xoá đơn giá tháng ${h.month.slice(0, 7)}?`)) return;
    try {
      await deletePricePoint(projectId, h.type, h.month);
      onChanged();
    } catch (e) {
      toast.error(`Không xoá được: ${e.message || e}`);
    }
  };

  return (
    <Section title="Lịch sử đơn giá" hint="Nhập đơn giá trung bình (đ/m²) mỗi tháng. Trùng tháng thì ghi đè. Khách thấy biểu đồ khi có từ 2 tháng.">
      <div className="flex gap-1.5">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold cursor-pointer ${type === t ? "bg-[#948154] text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-0.5 text-[10px] text-gray-600 font-semibold">
          Tháng
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px]" />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-gray-600 font-semibold flex-1">
          Đơn giá (đ/m²)
          <NumInput step="1000" value={price} onChange={setPrice} placeholder="55000000" />
        </label>
        <PrimaryButton busy={busy} onClick={add}>
          Lưu
        </PrimaryButton>
      </div>
      {rows.length === 0 ? (
        <p className="text-[10.5px] text-gray-500">Chưa có dữ liệu cho loại hình này.</p>
      ) : (
        <table className="w-full text-[10.5px]">
          <tbody>
            {rows.map((h) => (
              <tr key={h.month} className="border-t border-gray-100">
                <td className="py-1">{h.month.slice(0, 7)}</td>
                <td className="py-1 text-right font-mono">{fmtVnd(h.price_per_m2)}/m²</td>
                <td className="py-1 w-8 text-right">
                  <button onClick={() => remove(h)} className="p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer" aria-label="Xoá">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
