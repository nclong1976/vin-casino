import React, { useEffect, useState } from "react";
import { CalendarDays, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { adminCreateCorporateAction, adminCancelCorporateAction, stockErrorMessage } from "@/lib/stockOrders";
import { ACTION_STATUS_LABELS, actionLabel, fmtDate } from "@/lib/dividends";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
const STATUS_STYLE = {
  announced: "bg-indigo-50 text-indigo-700",
  recorded: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const EMPTY = { projectId: "", actionType: "CASH", cash: "1000", ratioFrom: "10", ratioTo: "1", exDate: "", recordDate: "", paymentDate: "", tax: "5", note: "" };

/**
 * Admin công bố quyền cổ tức (tiền mặt / cổ phiếu) và theo dõi trạng thái:
 * Đã công bố → (GDKHQ: điều chỉnh giá TC) → Đã chốt quyền (ĐKCC) → Đã thực hiện.
 * Hệ thống tự chạy theo lịch; chỉ huỷ được trước ngày GDKHQ.
 */
export default function DividendManager({ projects }) {
  const [actions, setActions] = useState([]);
  const [stats, setStats] = useState({});
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: acts }, { data: ents }] = await Promise.all([
      supabase.from("stock_corporate_actions").select("*").order("ex_date", { ascending: false }).limit(100),
      supabase.from("stock_dividend_entitlements").select("action_id, net, tax, shares, status").limit(5000),
    ]);
    setActions(acts || []);
    const agg = {};
    (ents || []).forEach((e) => {
      const s = (agg[e.action_id] ||= { holders: 0, net: 0, tax: 0, shares: 0, paid: 0 });
      s.holders += 1;
      s.net += Number(e.net) || 0;
      s.tax += Number(e.tax) || 0;
      s.shares += Number(e.shares) || 0;
      if (e.status === "paid") s.paid += 1;
    });
    setStats(agg);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin_stock_dividends")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_corporate_actions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_dividend_entitlements" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const tradable = (projects || []).filter((p) => p.id && !String(p.id).startsWith("stock_"));

  const submit = async () => {
    if (busy) return;
    const projectId = form.projectId || tradable[0]?.id;
    if (!projectId) return toast.error("Chọn mã cổ phiếu");
    if (!form.exDate) return toast.error("Nhập ngày GDKHQ");
    setBusy(true);
    try {
      const a = await adminCreateCorporateAction({
        projectId,
        actionType: form.actionType,
        cashPerShare: Number(form.cash),
        ratioFrom: Number(form.ratioFrom),
        ratioTo: Number(form.ratioTo),
        exDate: form.exDate,
        recordDate: form.recordDate,
        paymentDate: form.paymentDate,
        taxRate: Number(form.tax) / 100,
        note: form.note,
      });
      toast.success(`Đã công bố ${actionLabel(a)} cho ${a.symbol} và báo cho người đang nắm giữ`);
      setForm(EMPTY);
      setOpen(false);
      load();
    } catch (e) {
      toast.error(stockErrorMessage(e, "Không tạo được đợt cổ tức"));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (a) => {
    if (!window.confirm(`Huỷ đợt ${actionLabel(a)} của ${a.symbol}?`)) return;
    try {
      await adminCancelCorporateAction(a.id);
      toast.success("Đã huỷ đợt cổ tức");
      load();
    } catch (e) {
      toast.error(stockErrorMessage(e, "Không huỷ được"));
    }
  };

  const input = "w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4 text-amber-600" /> Cổ tức
        </h3>
        <button
          onClick={() => setOpen((v) => !v)}
          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
        >
          {open ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {open ? "Đóng" : "Công bố cổ tức"}
        </button>
      </div>

      {open && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 grid grid-cols-2 gap-2 text-xs">
          <label className="col-span-2 sm:col-span-1">
            <span className="font-bold text-gray-700 block mb-1">Mã cổ phiếu</span>
            <select value={form.projectId || tradable[0]?.id || ""} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className={`${input} bg-white font-mono font-bold`}>
              {tradable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.stock_symbol || p.symbol} - {p.name || p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="font-bold text-gray-700 block mb-1">Loại</span>
            <select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })} className={`${input} bg-white`}>
              <option value="CASH">Cổ tức tiền mặt</option>
              <option value="STOCK">Cổ tức bằng cổ phiếu / CP thưởng</option>
            </select>
          </label>
          {form.actionType === "CASH" ? (
            <>
              <label>
                <span className="font-bold text-gray-700 block mb-1">Số tiền / CP (đ)</span>
                <input type="number" value={form.cash} onChange={(e) => setForm({ ...form, cash: e.target.value })} className={`${input} font-mono`} />
                <span className="text-[10px] text-gray-500">VD 15% mệnh giá = 1.500 đ</span>
              </label>
              <label>
                <span className="font-bold text-gray-700 block mb-1">Thuế TNCN (%)</span>
                <input type="number" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} className={`${input} font-mono`} />
              </label>
            </>
          ) : (
            <label className="col-span-2">
              <span className="font-bold text-gray-700 block mb-1">Tỉ lệ (sở hữu b CP được nhận a CP)</span>
              <div className="flex items-center gap-1.5">
                <input type="number" value={form.ratioFrom} onChange={(e) => setForm({ ...form, ratioFrom: e.target.value })} className={`${input} font-mono w-20`} />
                <span className="font-bold">:</span>
                <input type="number" value={form.ratioTo} onChange={(e) => setForm({ ...form, ratioTo: e.target.value })} className={`${input} font-mono w-20`} />
                <span className="text-[10px] text-gray-500">VD 10:1 → 1.000 CP nhận 100 CP; phần lẻ làm tròn xuống</span>
              </div>
            </label>
          )}
          <label>
            <span className="font-bold text-gray-700 block mb-1">Ngày GDKHQ (*)</span>
            <input type="date" value={form.exDate} onChange={(e) => setForm({ ...form, exDate: e.target.value })} className={input} />
          </label>
          <label>
            <span className="font-bold text-gray-700 block mb-1">Ngày ĐKCC</span>
            <input type="date" value={form.recordDate} onChange={(e) => setForm({ ...form, recordDate: e.target.value })} className={input} />
            <span className="text-[10px] text-gray-500">Bỏ trống = GDKHQ + 1 ngày GD</span>
          </label>
          <label>
            <span className="font-bold text-gray-700 block mb-1">Ngày thực hiện</span>
            <input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} className={input} />
            <span className="text-[10px] text-gray-500">Bỏ trống = ngày ĐKCC</span>
          </label>
          <label>
            <span className="font-bold text-gray-700 block mb-1">Ghi chú</span>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} />
          </label>
          <p className="col-span-2 text-[10px] text-gray-500 leading-relaxed">
            Người mua khớp trước ngày GDKHQ được hưởng quyền (bán từ ngày GDKHQ vẫn được hưởng). Ngày GDKHQ giá tham chiếu tự điều chỉnh;
            ĐKCC hệ thống tự chốt danh sách; ngày thực hiện (từ 09:00) tự trả tiền / cổ phiếu và gửi thông báo.
          </p>
          <button
            onClick={submit}
            disabled={busy}
            className="col-span-2 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer disabled:opacity-50"
          >
            {busy ? "Đang công bố..." : "Công bố & thông báo cho cổ đông"}
          </button>
        </div>
      )}

      {actions.length === 0 ? (
        <p className="text-[11px] text-gray-400 text-center py-4">Chưa có đợt cổ tức nào.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {actions.map((a) => {
            const st = stats[a.id];
            return (
              <div key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div>
                  <p className="font-bold text-gray-900">
                    {a.symbol} · {actionLabel(a)}
                    {a.action_type === "CASH" ? <span className="font-normal text-gray-500"> · thuế {Math.round(Number(a.tax_rate) * 100)}%</span> : null}
                  </p>
                  <p className="text-gray-500">
                    GDKHQ {fmtDate(a.ex_date)} · ĐKCC {fmtDate(a.record_date)} · Thực hiện {fmtDate(a.payment_date)}
                  </p>
                  {st && (
                    <p className="text-gray-500">
                      {st.holders} cổ đông ·{" "}
                      {a.action_type === "CASH" ? `chi ${fmt(st.net)} đ (thuế ${fmt(st.tax)} đ)` : `phát hành ${fmt(st.shares)} CP`} · đã trả {st.paid}/{st.holders}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[a.status]}`}>{ACTION_STATUS_LABELS[a.status]}</span>
                  {a.status === "announced" && !a.ex_adjusted_at && (
                    <button onClick={() => cancel(a)} className="px-2 py-0.5 rounded-md bg-red-50 text-red-600 font-bold cursor-pointer">
                      Huỷ
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
