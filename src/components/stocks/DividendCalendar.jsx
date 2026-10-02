import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Banknote, Gift, Repeat } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { ACTION_STATUS_LABELS, actionLabel, estimateEntitlement, fmtDate, groupByMonth } from "@/lib/dividends";
import { vnClock } from "@/lib/stockMarket";
import { setStockDrip, stockErrorMessage } from "@/lib/stockOrders";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("vi-VN");

/**
 * Lịch cổ tức (spec §3.1): các đợt sắp tới (GDKHQ · ĐKCC · thực hiện) kèm số
 * dự kiến của người dùng, và các khoản đã nhận. Realtime theo
 * stock_corporate_actions / stock_dividend_entitlements.
 */
export default function DividendCalendar({ positions }) {
  const { user } = useAuth();
  const [actions, setActions] = useState([]);
  const [ents, setEnts] = useState([]);
  const [view, setView] = useState("upcoming");
  const [drip, setDrip] = useState({});
  const [dripBusy, setDripBusy] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      supabase
        .from("stock_corporate_actions")
        .select("*")
        .neq("status", "cancelled")
        .order("payment_date", { ascending: true })
        .limit(200)
        .then(({ data }) => alive && setActions(data || []));
      if (user?.id) {
        supabase
          .from("stock_dividend_entitlements")
          .select("*")
          .eq("user_id", user.id)
          .then(({ data }) => alive && setEnts(data || []));
        supabase
          .from("stock_drip_settings")
          .select("symbol, enabled")
          .eq("user_id", user.id)
          .then(({ data }) => alive && setDrip(Object.fromEntries((data || []).map((d) => [d.symbol, d.enabled]))));
      }
    };
    load();
    const channel = supabase
      .channel(`stock_dividends_${user?.id || "anon"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_corporate_actions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_dividend_entitlements" }, load)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const today = vnClock().date;
  const entByAction = useMemo(() => Object.fromEntries(ents.map((e) => [e.action_id, e])), [ents]);

  const upcoming = actions.filter((a) => a.status === "announced" || a.status === "recorded");
  const received = ents
    .filter((e) => e.status === "paid")
    .map((e) => ({ ...e, action: actions.find((a) => a.id === e.action_id) }))
    .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));

  const totalReceived = received.reduce((s, e) => s + (Number(e.net) || 0), 0);
  const heldSymbols = Object.values(positions || {})
    .filter((p) => Number(p.qty) > 0)
    .map((p) => p.symbol)
    .sort();

  const toggleDrip = async (symbol) => {
    if (dripBusy) return;
    const next = !drip[symbol];
    setDripBusy(symbol);
    try {
      await setStockDrip(symbol, next);
      setDrip((d) => ({ ...d, [symbol]: next }));
      toast.success(next ? `Đã bật tái đầu tư cổ tức ${symbol}` : `Đã tắt tái đầu tư cổ tức ${symbol}`);
    } catch (e) {
      toast.error(stockErrorMessage(e, "Không lưu được cài đặt"));
    } finally {
      setDripBusy(null);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-white flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4 text-[#d4af37]" /> Lịch cổ tức
        </h2>
        <div className="flex gap-1 p-0.5 rounded-lg bg-[#151b24]">
          {[
            ["upcoming", `Sắp tới (${upcoming.length})`],
            ["received", "Đã nhận"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={`px-2.5 py-1 rounded-md text-[10.5px] cursor-pointer ${view === k ? "bg-[#d4af37] text-black font-bold" : "text-gray-400"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {user?.id && heldSymbols.length > 0 && (
        <div className="rounded-2xl p-3 bg-[#151b24] border border-[#d4af37]/30">
          <p className="text-[12px] font-semibold text-white flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5 text-[#d4af37]" /> Tái đầu tư cổ tức tự động (DRIP)
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5 mb-2 leading-relaxed">
            Khi cổ tức tiền mặt về ví, hệ thống tự đặt lệnh LO mua lại đúng mã đó theo giá hiện tại (KL = tiền cổ tức ÷ giá, tính cả phí;
            không đủ 1 CP thì tiền ở lại ví).
          </p>
          <div className="flex flex-wrap gap-1.5">
            {heldSymbols.map((sym) => (
              <button
                key={sym}
                disabled={dripBusy === sym}
                onClick={() => toggleDrip(sym)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50 ${
                  drip[sym] ? "bg-[#d4af37] text-black" : "bg-[#0d1117] text-gray-400 border border-[#222c38]"
                }`}
              >
                {sym} · {drip[sym] ? "Bật" : "Tắt"}
              </button>
            ))}
          </div>
        </div>
      )}

      {view === "upcoming" &&
        (upcoming.length === 0 ? (
          <p className="text-center text-[12px] text-gray-500 py-10 rounded-2xl bg-[#151b24]">Chưa có lịch cổ tức nào.</p>
        ) : (
          groupByMonth(upcoming).map((g) => (
            <div key={g.key} className="space-y-2">
              <p className="text-[10.5px] text-gray-500 font-semibold">Tháng {g.key}</p>
              {g.items.map((a) => {
                const mine = entByAction[a.id];
                const held = Number(positions?.[a.symbol]?.qty) || 0;
                const beforeEx = today < a.ex_date;
                const est = mine
                  ? { qty: mine.qty_eligible, net: mine.net, shares: mine.shares, gross: mine.gross, tax: mine.tax }
                  : beforeEx
                    ? estimateEntitlement(a, held)
                    : null;
                return (
                  <div key={a.id} className="rounded-2xl p-3 bg-[#151b24] border border-[#222c38]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-white">{a.symbol}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                            a.action_type === "CASH" ? "bg-emerald-500/15 text-emerald-300" : "bg-purple-500/15 text-purple-300"
                          }`}
                        >
                          {a.action_type === "CASH" ? <Banknote className="w-3 h-3" /> : <Gift className="w-3 h-3" />}
                          {actionLabel(a)}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400">{ACTION_STATUS_LABELS[a.status]}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mt-2 text-center text-[10px]">
                      {[
                        ["GDKHQ", a.ex_date],
                        ["ĐKCC", a.record_date],
                        ["Thực hiện", a.payment_date],
                      ].map(([label, d]) => (
                        <div key={label} className="rounded-lg bg-[#0d1117] py-1.5">
                          <p className="text-gray-500">{label}</p>
                          <p className="text-[11px] font-bold text-white font-mono">{fmtDate(d)}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10.5px] mt-2 leading-relaxed">
                      {est && est.qty > 0 ? (
                        <span className="text-amber-300">
                          {mine ? "Bạn được hưởng" : "Với"} {fmt(est.qty)} CP{mine ? "" : " đang nắm giữ"} →{" "}
                          {a.action_type === "CASH"
                            ? `${mine ? "" : "dự kiến "}${fmt(est.net)} đ (sau thuế ${Math.round(Number(a.tax_rate) * 100)}%)`
                            : `${mine ? "" : "dự kiến "}${fmt(est.shares)} CP`}
                        </span>
                      ) : beforeEx ? (
                        <span className="text-gray-500">
                          Mua và khớp trước ngày {fmtDate(a.ex_date)} để được hưởng quyền.
                        </span>
                      ) : (
                        <span className="text-gray-500">Bạn không có quyền ở đợt này.</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          ))
        ))}

      {view === "received" &&
        (received.length === 0 ? (
          <p className="text-center text-[12px] text-gray-500 py-10 rounded-2xl bg-[#151b24]">Bạn chưa nhận cổ tức nào.</p>
        ) : (
          <>
            <div className="rounded-xl bg-[#151b24] p-3 flex justify-between text-[11.5px]">
              <span className="text-gray-400">Tổng cổ tức tiền mặt đã nhận</span>
              <span className="font-mono font-bold text-emerald-300">{fmt(totalReceived)} đ</span>
            </div>
            {received.map((e) => (
              <div key={e.id} className="rounded-2xl p-3 bg-[#151b24] border border-[#222c38] flex items-center justify-between">
                <div>
                  <p className="text-[12.5px] font-bold text-white">
                    {e.symbol} <span className="text-[10.5px] font-normal text-gray-400">{actionLabel(e.action)}</span>
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {fmt(e.qty_eligible)} CP hưởng quyền · {e.paid_at ? new Date(e.paid_at).toLocaleDateString("vi-VN") : ""}
                  </p>
                  {e.drip_note && e.drip_note !== "off" && <p className="text-[10px] text-amber-300 mt-0.5">DRIP: {e.drip_note}</p>}
                </div>
                <p className="text-[13px] font-bold font-mono text-emerald-300">
                  {Number(e.shares) > 0 ? `+${fmt(e.shares)} CP` : `+${fmt(e.net)} đ`}
                </p>
              </div>
            ))}
          </>
        ))}
    </section>
  );
}
