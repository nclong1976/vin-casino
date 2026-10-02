import React, { useEffect, useState } from "react";
import { Activity, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useStockMarket } from "@/hooks/useStockMarket";
import { SESSION_LABELS, changePct, isValidTick, priceColor } from "@/lib/stockMarket";
import { adminSetStockPrice, adminResetStockReference, adminSetStockConfig, stockErrorMessage } from "@/lib/stockOrders";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n) || 0).toLocaleString("vi-VN"));

/**
 * Bảng giá cho Admin: đặt giá hiện tại (trong Trần/Sàn, đúng bước giá - lệnh
 * LO chờ được khớp ngay nếu đang phiên liên tục), đặt lại giá tham chiếu, và
 * cấu hình phí giao dịch / biên độ dao động.
 */
export default function StockQuotesBoard() {
  const { quotes, config, session } = useStockMarket();
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null);
  const [cfg, setCfg] = useState({ fee: "", band: "" });

  useEffect(() => {
    setCfg({ fee: String(+(Number(config.fee_rate) * 100).toFixed(4)), band: String(Number(config.price_band_pct)) });
  }, [config.fee_rate, config.price_band_pct]);

  const rows = Object.values(quotes).sort((a, b) => a.symbol.localeCompare(b.symbol));

  const run = async (key, fn, ok) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(stockErrorMessage(e, "Không thực hiện được"));
    } finally {
      setBusy(null);
    }
  };

  const setPrice = (q) => {
    const p = Number(drafts[q.symbol]);
    if (!isValidTick(p)) return toast.error("Giá không đúng bước giá (10 / 50 / 100 đ)");
    run(`p-${q.symbol}`, () => adminSetStockPrice(q.symbol, p), `Đã đặt giá ${q.symbol} = ${fmt(p)} đ`).then(() =>
      setDrafts((d) => ({ ...d, [q.symbol]: "" }))
    );
  };

  const resetRef = (q) => {
    const p = Number(drafts[q.symbol]) || Number(q.last_price);
    if (!window.confirm(`Đặt lại giá tham chiếu ${q.symbol} = ${fmt(p)} đ? Trần/Sàn sẽ tính lại theo giá này.`)) return;
    run(`r-${q.symbol}`, () => adminResetStockReference(q.symbol, p), `Đã đặt lại TC ${q.symbol}`).then(() =>
      setDrafts((d) => ({ ...d, [q.symbol]: "" }))
    );
  };

  const saveConfig = () => {
    const fee = Number(cfg.fee);
    const band = Number(cfg.band);
    if (!(fee >= 0 && fee < 5)) return toast.error("Phí phải từ 0% đến dưới 5%");
    if (!(band > 0 && band <= 50)) return toast.error("Biên độ phải từ 0% đến 50%");
    run("cfg", () => adminSetStockConfig({ feeRate: fee / 100, priceBandPct: band }), "Đã lưu cấu hình giao dịch");
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-emerald-600" /> Bảng giá
          <span className="ml-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold">
            {SESSION_LABELS[session] || session}
          </span>
        </h3>
        <div className="flex items-center gap-1.5 text-[11px]">
          <label className="flex items-center gap-1 text-gray-600">
            Phí
            <input
              value={cfg.fee}
              onChange={(e) => setCfg({ ...cfg, fee: e.target.value })}
              className="w-16 px-1.5 py-1 rounded-md border border-gray-200 font-mono text-right"
            />
            %
          </label>
          <label className="flex items-center gap-1 text-gray-600">
            Biên độ ±
            <input
              value={cfg.band}
              onChange={(e) => setCfg({ ...cfg, band: e.target.value })}
              className="w-12 px-1.5 py-1 rounded-md border border-gray-200 font-mono text-right"
            />
            %
          </label>
          <button
            onClick={saveConfig}
            disabled={busy === "cfg"}
            className="px-2.5 py-1 rounded-md bg-gray-900 text-white font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3 h-3" /> Lưu
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11px] min-w-[640px]">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="px-1 py-1">Mã</th>
              <th className="px-1 py-1 text-right">Trần</th>
              <th className="px-1 py-1 text-right">TC</th>
              <th className="px-1 py-1 text-right">Sàn</th>
              <th className="px-1 py-1 text-right">Giá hiện tại</th>
              <th className="px-1 py-1 text-right">Mở / Đóng</th>
              <th className="px-1 py-1 text-right">KL</th>
              <th className="px-1 py-1">Đặt giá mới</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => {
              const pct = changePct(q);
              return (
                <tr key={q.symbol} className="border-t border-gray-100">
                  <td className="px-1 py-1.5 font-bold text-gray-900">{q.symbol}</td>
                  <td className="px-1 py-1.5 text-right font-mono text-purple-600">{fmt(q.ceiling_price)}</td>
                  <td className="px-1 py-1.5 text-right font-mono text-amber-600">{fmt(q.reference_price)}</td>
                  <td className="px-1 py-1.5 text-right font-mono text-cyan-600">{fmt(q.floor_price)}</td>
                  <td className="px-1 py-1.5 text-right font-mono font-bold" style={{ color: priceColor(q.last_price, q) === "#e5e7eb" ? undefined : priceColor(q.last_price, q) }}>
                    {fmt(q.last_price)} <span className="font-normal">({pct >= 0 ? "+" : ""}{pct}%)</span>
                  </td>
                  <td className="px-1 py-1.5 text-right font-mono text-gray-500">
                    {fmt(q.open_price)} / {fmt(q.close_price)}
                  </td>
                  <td className="px-1 py-1.5 text-right font-mono text-gray-700">{fmt(q.volume)}</td>
                  <td className="px-1 py-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        placeholder={String(q.last_price)}
                        value={drafts[q.symbol] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [q.symbol]: e.target.value }))}
                        className="w-20 px-1.5 py-1 rounded-md border border-gray-200 font-mono"
                      />
                      <button
                        onClick={() => setPrice(q)}
                        disabled={!drafts[q.symbol] || !!busy}
                        className="px-2 py-1 rounded-md bg-emerald-600 text-white font-bold cursor-pointer disabled:opacity-40"
                      >
                        Đặt
                      </button>
                      <button
                        onClick={() => resetRef(q)}
                        disabled={!!busy}
                        title="Đặt lại giá tham chiếu"
                        className="p-1 rounded-md bg-gray-100 text-gray-600 cursor-pointer disabled:opacity-40"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400">
        Giá mới phải nằm trong Trần/Sàn và đúng bước giá; lệnh LO chờ có giá đặt ≥ giá mới sẽ khớp ngay trong phiên liên tục. Mỗi ngày giao dịch mới, giá tham chiếu = giá đóng cửa hôm trước. Sửa giá ở tab Dự án cũng được tự động kẹp trong Trần/Sàn.
      </p>
    </div>
  );
}
