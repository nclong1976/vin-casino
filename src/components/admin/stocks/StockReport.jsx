import React, { useEffect, useState } from "react";
import { BarChart3, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { adminStockReport, stockErrorMessage } from "@/lib/stockOrders";
import { toCsv, downloadCsv } from "@/lib/exportCsv";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
const vnTime = (t) => (t ? new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "");

/** Bộ xuất CSV: mỗi mục đọc bảng (Admin đọc được mọi dòng qua RLS) + tên người dùng. */
const EXPORTS = [
  {
    key: "orders",
    label: "Lệnh",
    table: "stock_orders",
    order: "created_at",
    columns: [
      { label: "Thời gian", get: (r) => vnTime(r.created_at) },
      { label: "Nhà đầu tư", get: (r) => r.__user },
      { label: "Mã", key: "symbol" },
      { label: "Chiều", key: "side" },
      { label: "Loại", key: "order_type" },
      { label: "KL", key: "qty" },
      { label: "Giá đặt", key: "limit_price" },
      { label: "Giá khớp", key: "price" },
      { label: "Giá trị", key: "amount" },
      { label: "Phí", key: "fee" },
      { label: "Thuế", key: "tax" },
      { label: "Phong toả", key: "hold_amount" },
      { label: "Trạng thái", key: "status" },
      { label: "Nguồn", key: "source" },
      { label: "Phiên", key: "trade_date" },
      { label: "Lý do huỷ", key: "cancel_reason" },
    ],
  },
  {
    key: "trades",
    label: "Khớp lệnh",
    table: "stock_trades",
    order: "matched_at",
    columns: [
      { label: "Thời gian khớp", get: (r) => vnTime(r.matched_at) },
      { label: "Nhà đầu tư", get: (r) => r.__user },
      { label: "Mã", key: "symbol" },
      { label: "Chiều", key: "side" },
      { label: "KL", key: "qty" },
      { label: "Giá", key: "price" },
      { label: "Giá trị", key: "amount" },
      { label: "Phí", key: "fee" },
      { label: "Thuế", key: "tax" },
      { label: "Tiền ròng", key: "net_amount" },
      { label: "Giá vốn", key: "cost_basis" },
      { label: "Lãi/lỗ đã chốt", key: "realized_pnl" },
      { label: "Ngày GD", key: "trade_date" },
      { label: "Ngày thanh toán", key: "settle_date" },
      { label: "Đã thanh toán", get: (r) => vnTime(r.settled_at) },
      { label: "Nguồn", key: "source" },
    ],
  },
  {
    key: "positions",
    label: "Danh mục",
    table: "stock_positions",
    order: "updated_at",
    columns: [
      { label: "Nhà đầu tư", get: (r) => r.__user },
      { label: "Mã", key: "symbol" },
      { label: "Tổng CP", key: "qty" },
      { label: "Chờ về T+2", key: "qty_pending" },
      { label: "Đang chờ bán", key: "qty_hold" },
      { label: "Tổng giá vốn", key: "total_cost" },
      { label: "Giá vốn bình quân", get: (r) => (Number(r.qty) > 0 ? Math.round(Number(r.total_cost) / Number(r.qty)) : "") },
      { label: "Cập nhật", get: (r) => vnTime(r.updated_at) },
    ],
  },
  {
    key: "dividends",
    label: "Cổ tức",
    table: "stock_dividend_entitlements",
    order: "created_at",
    columns: [
      { label: "Nhà đầu tư", get: (r) => r.__user },
      { label: "Mã", key: "symbol" },
      { label: "CP hưởng quyền", key: "qty_eligible" },
      { label: "Cổ tức gộp", key: "gross" },
      { label: "Thuế", key: "tax" },
      { label: "Thực nhận", key: "net" },
      { label: "CP nhận", key: "shares" },
      { label: "Trạng thái", key: "status" },
      { label: "Ngày trả", get: (r) => vnTime(r.paid_at) },
      { label: "DRIP", get: (r) => (r.drip_note === "off" ? "" : r.drip_note) },
    ],
  },
];

/** Báo cáo tổng hợp chứng khoán cho Admin + xuất CSV. */
export default function StockReport() {
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setRep(await adminStockReport());
    } catch (e) {
      toast.error(stockErrorMessage(e, "Không tải được báo cáo"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const exportCsv = async (ex) => {
    if (exporting) return;
    setExporting(ex.key);
    try {
      const [{ data, error }, { data: users }] = await Promise.all([
        supabase.from(ex.table).select("*").order(ex.order, { ascending: false }).limit(10000),
        supabase.from("users").select("id, identifier, full_name, name, email").limit(10000),
      ]);
      if (error) throw error;
      const names = new Map((users || []).map((u) => [u.id, u.identifier || u.full_name || u.name || u.email || u.id]));
      const rows = (data || []).map((r) => ({ ...r, __user: names.get(r.user_id) || r.user_id }));
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`chung-khoan-${ex.key}-${stamp}.csv`, toCsv(rows, ex.columns));
      toast.success(`Đã xuất ${rows.length} dòng ${ex.label.toLowerCase()}`);
    } catch (e) {
      toast.error(stockErrorMessage(e, "Không xuất được CSV"));
    } finally {
      setExporting(null);
    }
  };

  const unrealized = rep ? Number(rep.market_value) - Number(rep.total_cost) : 0;
  const kpis = rep
    ? [
        ["Khách đang nắm giữ", `${fmt(rep.investors)} người`],
        ["Giá trị cổ phiếu khách giữ", `${fmt(rep.market_value)} ₫`],
        ["Lãi/lỗ chưa chốt của khách", `${unrealized >= 0 ? "+" : ""}${fmt(unrealized)} ₫`, unrealized >= 0 ? "text-emerald-600" : "text-red-600"],
        ["Lãi/lỗ khách đã chốt", `${Number(rep.realized_pnl) >= 0 ? "+" : ""}${fmt(rep.realized_pnl)} ₫`, Number(rep.realized_pnl) >= 0 ? "text-emerald-600" : "text-red-600"],
        ["Tiền đang tạm giữ (lệnh chờ)", `${fmt(rep.held_cash)} ₫ · ${fmt(rep.pending_orders)} lệnh`],
        ["Tiền bán chờ về ví khách", `${fmt(rep.pending_sale_cash)} ₫`],
        ["Phí + thuế đã thu", `${fmt(Number(rep.fees) + Number(rep.sell_tax) + Number(rep.dividend_tax))} ₫`],
        ["Cổ tức đã trả", `${fmt(rep.dividends_paid)} ₫${Number(rep.dividend_shares) ? ` · ${fmt(rep.dividend_shares)} CP` : ""}`],
      ]
    : [];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-indigo-600" /> Tổng quan
        </h3>
        <button onClick={load} disabled={loading} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer disabled:opacity-50" title="Làm mới">
          <RefreshCw className={`w-3.5 h-3.5 text-gray-600 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {rep && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {kpis.map(([label, value, tone]) => (
              <div key={label} className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5">
                <p className="text-[10px] text-gray-500">{label}</p>
                <p className={`text-[12.5px] font-bold font-mono ${tone || "text-gray-900"}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11px] min-w-[520px]">
              <thead>
                <tr className="text-gray-400 text-left">
                  <th className="px-1 py-1">Mã</th>
                  <th className="px-1 py-1 text-right">Giá</th>
                  <th className="px-1 py-1 text-right">Cổ đông</th>
                  <th className="px-1 py-1 text-right">CP nắm giữ</th>
                  <th className="px-1 py-1 text-right">Giá vốn</th>
                  <th className="px-1 py-1 text-right">Theo dõi</th>
                </tr>
              </thead>
              <tbody>
                {(rep.by_symbol || []).map((r) => (
                  <tr key={r.symbol} className="border-t border-gray-100">
                    <td className="px-1 py-1.5 font-bold">{r.symbol}</td>
                    <td className="px-1 py-1.5 text-right font-mono">{fmt(r.last_price)}</td>
                    <td className="px-1 py-1.5 text-right font-mono">{fmt(r.holders)}</td>
                    <td className="px-1 py-1.5 text-right font-mono">{fmt(r.shares)}</td>
                    <td className="px-1 py-1.5 text-right font-mono">{fmt(r.cost)}</td>
                    <td className="px-1 py-1.5 text-right font-mono">{fmt(r.watchers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-100">
        <span className="text-[11px] text-gray-500 mr-1">Xuất CSV:</span>
        {EXPORTS.map((ex) => (
          <button
            key={ex.key}
            onClick={() => exportCsv(ex)}
            disabled={!!exporting}
            className="px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3 h-3" /> {exporting === ex.key ? "Đang xuất..." : ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}
