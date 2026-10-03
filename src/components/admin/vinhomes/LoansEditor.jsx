import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { loadLoans, saveLoan, deleteLoan, validateLoan } from "@/lib/vinhomesValuationAdmin";
import { NumInput, Labeled, Section, Errors } from "./ui";

const EMPTY = { name: "", max_ltv: 0.7, years: 20, promo_rate: 7.5, promo_months: 12, float_rate: 10.5, source_note: "", is_active: true, sort_order: 0 };

/** Gói vay dùng chung cho mọi dự án Vinhomes. Khách thấy các gói đang bật, xếp theo tổng tiền lãi. */
export default function LoansEditor() {
  const [loans, setLoans] = useState([]);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => loadLoans().then((d) => setLoans(d || [])).catch((e) => toast.error(`Không tải được gói vay: ${e.message || e}`));
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const errs = validateLoan(editing);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      await saveLoan(editing);
      toast.success("Đã lưu gói vay");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(`Không lưu được: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (l) => {
    try {
      await saveLoan({ ...l, is_active: !l.is_active });
      load();
    } catch (e) {
      toast.error(`Không cập nhật được: ${e.message || e}`);
    }
  };

  const remove = async (l) => {
    if (!window.confirm(`Xoá gói vay "${l.name}"?`)) return;
    try {
      await deleteLoan(l.id);
      load();
    } catch (e) {
      toast.error(`Không xoá được: ${e.message || e}`);
    }
  };

  const set = (k) => (v) => setEditing((e) => ({ ...e, [k]: v }));

  return (
    <Section
      title="Gói vay (dùng chung mọi dự án)"
      hint="Ghi rõ nguồn lãi suất ở ô Ghi chú - khách thấy dòng này dưới mỗi gói."
      right={
        !editing && (
          <button onClick={() => { setEditing({ ...EMPTY, sort_order: loans.length + 1 }); setErrors([]); }} className="text-[10.5px] font-bold text-[#948154] flex items-center gap-1 cursor-pointer shrink-0">
            <Plus className="w-3 h-3" /> Thêm gói
          </button>
        )
      }
    >
      {editing && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/40 p-2.5 space-y-2">
          <Labeled label="Tên gói">
            <input value={editing.name} onChange={(e) => set("name")(e.target.value)} className="px-2 py-1 rounded-md border border-gray-200 text-[11px]" />
          </Labeled>
          <div className="grid grid-cols-3 gap-2">
            <Labeled label="Cho vay tối đa (%)">
              <NumInput step="1" value={Math.round(Number(editing.max_ltv) * 100)} onChange={(v) => set("max_ltv")(v === "" ? "" : Number(v) / 100)} />
            </Labeled>
            <Labeled label="Thời hạn (năm)">
              <NumInput step="1" value={editing.years} onChange={set("years")} />
            </Labeled>
            <Labeled label="Thứ tự">
              <NumInput step="1" value={editing.sort_order} onChange={set("sort_order")} />
            </Labeled>
            <Labeled label="Lãi ưu đãi %/năm">
              <NumInput step="0.1" value={editing.promo_rate} onChange={set("promo_rate")} />
            </Labeled>
            <Labeled label="Số tháng ưu đãi">
              <NumInput step="1" value={editing.promo_months} onChange={set("promo_months")} />
            </Labeled>
            <Labeled label="Lãi thả nổi %/năm">
              <NumInput step="0.1" value={editing.float_rate} onChange={set("float_rate")} />
            </Labeled>
          </div>
          <Labeled label="Ghi chú nguồn lãi suất">
            <input
              value={editing.source_note}
              onChange={(e) => set("source_note")(e.target.value)}
              placeholder="Lãi suất minh hoạ do VinClub cấu hình"
              className="px-2 py-1 rounded-md border border-gray-200 text-[11px]"
            />
          </Labeled>
          <Errors errors={errors} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-1 rounded-md bg-white border border-gray-200 text-[11px] font-bold text-gray-600 cursor-pointer">
              Huỷ
            </button>
            <button onClick={save} disabled={busy} className="px-3 py-1 rounded-md bg-[#948154] text-white text-[11px] font-bold cursor-pointer disabled:opacity-50">
              {busy ? "Đang lưu..." : "Lưu gói"}
            </button>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        {loans.map((l) => (
          <div key={l.id} className={`flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5 ${l.is_active ? "" : "opacity-50"}`}>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-gray-900 truncate">{l.name}</p>
              <p className="text-[10px] text-gray-500">
                Vay {Math.round(l.max_ltv * 100)}% · {l.years} năm · {l.promo_rate}% trong {l.promo_months} tháng, sau đó {l.float_rate}%
              </p>
            </div>
            <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer">
              <input type="checkbox" checked={l.is_active} onChange={() => toggle(l)} className="accent-[#948154]" /> Bật
            </label>
            <button onClick={() => { setEditing({ ...l, source_note: l.source_note || "" }); setErrors([]); }} className="px-2 py-0.5 rounded-md bg-gray-100 text-[10.5px] font-bold text-gray-700 cursor-pointer">
              Sửa
            </button>
            <button onClick={() => remove(l)} className="p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer" aria-label={`Xoá ${l.name}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {loans.length === 0 && <p className="text-[10.5px] text-gray-500">Chưa có gói vay. Khách sẽ không thấy phần gợi ý vay.</p>}
      </div>
    </Section>
  );
}
