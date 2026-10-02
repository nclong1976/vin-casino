import React, { useEffect, useState } from "react";
import { Activity, Save, RotateCcw, ChevronDown, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useStockMarket } from "@/hooks/useStockMarket";
import { changePct, isValidTick, priceColor, sessionHint } from "@/lib/stockMarket";
import { adminSetStockPrice, adminResetStockReference, adminSetStockConfig, stockErrorMessage } from "@/lib/stockOrders";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n) || 0).toLocaleString("vi-VN"));

/**
 * Giá cổ phiếu cho Admin: nhập giá mới cho từng mã (trong Sàn–Trần, đúng bước
 * giá; lệnh chờ ở mức giá đó tự khớp). Cài đặt phí / thuế / biên độ và niêm
 * yết lại giá là thao tác hiếm - để trong phần thu gọn.
 */
export default function StockQuotesBoard({ onNavigateToProjects }) {
  const { quotes, config, session, calendar } = useStockMarket();
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null);
  const [showCfg, setShowCfg] = useState(false);
  const [cfg, setCfg] = useState({ fee: "", tax: "", band: "" });

  useEffect(() => {
    setCfg({
      fee: String(+(Number(config.fee_rate) * 100).toFixed(4)),
      tax: String(+(Number(config.sell_tax_rate ?? 0.001) * 100).toFixed(4)),
      band: String(Number(config.price_band_pct)),
    });
  }, [config.fee_rate, config.sell_tax_rate, config.price_band_pct]);

  const rows = Object.values(quotes).sort((a, b) => a.symbol.localeCompare(b.symbol));

  const run = async (key, fn, ok) => {
    if (busy) return false;
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(stockErrorMessage(e, "Không thực hiện được"));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const setPrice = async (q) => {
    const p = Number(drafts[q.symbol]);
    if (!isValidTick(p)) return toast.error("Giá không đúng bước giá: dưới 10.000 đ bước 10; 10.000–49.950 bước 50; từ 50.000 bước 100.");
    if (p < Number(q.floor_price) || p > Number(q.ceiling_price)) {
      return toast.error(`Giá phải từ ${fmt(q.floor_price)} đến ${fmt(q.ceiling_price)} đ. Muốn đổi hẳn mặt bằng giá, dùng nút ↺ (niêm yết lại).`);
    }
    if (await run(`p-${q.symbol}`, () => adminSetStockPrice(q.symbol, p), `Đã đặt giá ${q.symbol} = ${fmt(p)} đ`)) {
      setDrafts((d) => ({ ...d, [q.symbol]: "" }));
    }
  };

  const resetRef = async (q) => {
    const p = Number(drafts[q.symbol]) || Number(q.last_price);
    if (!window.confirm(`Niêm yết lại ${q.symbol} ở giá ${fmt(p)} đ?\nGiá tham chiếu và Trần/Sàn hôm nay sẽ tính lại theo giá này.`)) return;
    if (await run(`r-${q.symbol}`, () => adminResetStockReference(q.symbol, p), `Đã niêm yết lại ${q.symbol} = ${fmt(p)} đ`)) {
      setDrafts((d) => ({ ...d, [q.symbol]: "" }));
    }
  };

  const saveConfig = () => {
    const fee = Number(cfg.fee);
    const tax = Number(cfg.tax);
    const band = Number(cfg.band);
    if (!(fee >= 0 && fee < 5)) return toast.error("Phí phải từ 0% đến dưới 5%");
    if (!(tax >= 0 && tax < 5)) return toast.error("Thuế bán phải từ 0% đến dưới 5%");
    if (!(band > 0 && band <= 50)) return toast.error("Biên độ phải từ 0% đến 50%");
    run("cfg", () => adminSetStockConfig({ feeRate: fee / 100, sellTaxRate: tax / 100, priceBandPct: band }), "Đã lưu cài đặt");
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-emerald-600" /> Giá cổ phiếu
        </h3>
        {onNavigateToProjects && (
          <button
            onClick={onNavigateToProjects}
            className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            Thêm / khoá / mở mã <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">{sessionHint(session, new Date(), calendar)}</p>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11.5px] min-w-[520px]">
          <thead>
            <tr className="text-gray-400 text-left text-[10.5px]">
              <th className="px-1 py-1">Mã</th>
              <th className="px-1 py-1 text-right">Giá hiện tại</th>
              <th className="px-1 py-1 text-right">Được đặt trong khoảng</th>
              <th className="px-1 py-1 text-right">KL hôm nay</th>
              <th className="px-1 py-1">Giá mới</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => {
              const pct = changePct(q);
              const c = priceColor(q.last_price, q);
              return (
                <tr key={q.symbol} className="border-t border-gray-100">
                  <td className="px-1 py-2 font-bold text-gray-900">{q.symbol}</td>
                  <td className="px-1 py-2 text-right font-mono font-bold" style={{ color: c === "#e5e7eb" ? undefined : c }}>
                    {fmt(q.last_price)}
                    <span className="block text-[10px] font-normal">
                      {pct >= 0 ? "+" : ""}
                      {pct}% so với TC {fmt(q.reference_price)}
                    </span>
                  </td>
                  <td className="px-1 py-2 text-right font-mono text-gray-600">
                    {fmt(q.floor_price)} – {fmt(q.ceiling_price)}
                  </td>
                  <td className="px-1 py-2 text-right font-mono text-gray-700">{fmt(q.volume)}</td>
                  <td className="px-1 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        placeholder={String(q.last_price)}
                        value={drafts[q.symbol] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [q.symbol]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && drafts[q.symbol] && setPrice(q)}
                        className="w-24 px-1.5 py-1 rounded-md border border-gray-200 font-mono"
                      />
                      <button
                        onClick={() => setPrice(q)}
                        disabled={!drafts[q.symbol] || !!busy}
                        className="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold cursor-pointer disabled:opacity-40"
                      >
                        Đặt
                      </button>
                      <button
                        onClick={() => resetRef(q)}
                        disabled={!!busy}
                        title="Niêm yết lại (đổi giá tham chiếu, dùng khi cần giá ngoài Sàn–Trần)"
                        className="p-1 rounded-md bg-gray-100 text-gray-500 cursor-pointer disabled:opacity-40"
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
      <p className="text-[10.5px] text-gray-500 leading-relaxed">
        Nhập giá mới → bấm <b>Đặt</b> (hoặc Enter). Lệnh của khách đang chờ ở mức giá này sẽ tự khớp. Mỗi sáng hệ thống tự lấy giá đóng cửa
        hôm trước làm giá tham chiếu và tính lại khoảng được đặt (±{Number(config.price_band_pct)}%).
      </p>

      <div className="border-t border-gray-100 pt-2">
        <button onClick={() => setShowCfg((v) => !v)} className="w-full flex items-center justify-between text-[11.5px] text-gray-600 cursor-pointer">
          <span>
            Cài đặt phí, thuế, biên độ <span className="text-gray-400">(ít khi cần đổi)</span>
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showCfg ? "rotate-180" : ""}`} />
        </button>
        {showCfg && (
          <div className="mt-2 flex flex-wrap items-end gap-2 text-[11px]">
            {[
              ["fee", "Phí mua/bán (%)", "0,15"],
              ["tax", "Thuế khi bán (%)", "0,1"],
              ["band", "Biên độ ± (%)", "7"],
            ].map(([k, label, ph]) => (
              <label key={k} className="flex flex-col gap-1 text-gray-600">
                {label}
                <input
                  value={cfg[k]}
                  placeholder={ph}
                  onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })}
                  className="w-24 px-2 py-1 rounded-md border border-gray-200 font-mono text-right"
                />
              </label>
            ))}
            <button
              onClick={saveConfig}
              disabled={busy === "cfg"}
              className="px-3 py-1.5 rounded-md bg-gray-900 text-white font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3 h-3" /> Lưu
            </button>
            <p className="w-full text-[10px] text-gray-400">Chỉ áp dụng cho lệnh đặt sau khi lưu. Đổi biên độ sẽ tính lại khoảng giá của hôm nay.</p>
          </div>
        )}
      </div>
    </div>
  );
}
