import React, { useState, useEffect } from "react";
import { TrendingUp, Plus, Search, Check, X, RefreshCw, BookOpen } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { adminCreateStockOrder, cancelStockOrder, stockErrorMessage } from "@/lib/stockOrders";
import { STATUS_LABELS } from "@/lib/stockMarket";
import StockQuotesBoard from "@/components/admin/stocks/StockQuotesBoard";
import DividendManager from "@/components/admin/stocks/DividendManager";
import StockReport from "@/components/admin/stocks/StockReport";
import AdminStockGuide from "@/components/admin/stocks/AdminStockGuide";
import { toast } from "sonner";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
const GUIDE_KEY = "vinclub.adminStockGuideHidden";

const SUB_TABS = [
  ["overview", "Tổng quan"],
  ["prices", "Giá cổ phiếu"],
  ["orders", "Lệnh"],
  ["dividends", "Cổ tức"],
];

const SOURCE_LABELS = { user: "Khách đặt", admin: "Admin cấp", backfill: "Ghi nhận lại", drip: "Tái đầu tư cổ tức" };

/**
 * Admin › Chứng khoán - 4 mục:
 *   Tổng quan (báo cáo + xuất CSV) · Giá cổ phiếu (đặt giá, cài đặt phí)
 *   · Lệnh (lệnh chờ / đã xử lý, huỷ, cấp cổ phiếu) · Cổ tức.
 * Thêm / khoá / mở mã vẫn làm ở tab Dự án (một nơi sửa dữ liệu mã).
 */
export default function StocksTab({ onNavigateToProjects }) {
  const [sub, setSub] = useState("overview");
  const [showGuide, setShowGuide] = useState(() => {
    try {
      return localStorage.getItem(GUIDE_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [projects, setProjects] = useState([]);
  const [stockOrders, setStockOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [orderForm, setOrderForm] = useState({ userId: "", projectId: "", shares: "100", chargeWallet: false, note: "" });

  const toggleGuide = (v) => {
    setShowGuide(v);
    try {
      localStorage.setItem(GUIDE_KEY, v ? "0" : "1");
    } catch {
      /* bỏ qua */
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [allProjects, ordersRes, allUsers] = await Promise.all([
        base44.entities.Project.list().catch(() => []),
        supabase.from("stock_orders").select("*").order("created_at", { ascending: false }).limit(300),
        base44.entities.User.list().catch(() => []),
      ]);
      setProjects(allProjects.filter((p) => (p.category || "").trim() === "Đầu tư chứng khoán"));
      setUsers(allUsers);
      const byId = new Map(allUsers.map((u) => [u.id, u]));
      setStockOrders(
        (ordersRes?.data || []).map((o) => {
          const u = byId.get(o.user_id);
          return { ...o, user_name: u?.full_name || u?.name || "", user_email: u?.email || "", user_identifier: u?.identifier || "" };
        })
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const unsubProject = base44.entities.Project.subscribe(() => fetchData());
    const channel = supabase
      .channel("admin_stock_orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_orders" }, () => fetchData())
      .subscribe();
    return () => {
      if (typeof unsubProject === "function") unsubProject();
      supabase.removeChannel(channel);
    };
  }, []);

  const pendingCount = stockOrders.filter((o) => o.status === "pending").length;
  const tradableProjects = projects.filter((p) => p.id);
  const formProject = tradableProjects.find((p) => p.id === orderForm.projectId) || tradableProjects[0];
  const formQty = Math.floor(Number(orderForm.shares) || 0);
  const formAmount = Math.round(Number(formProject?.price_per_m2) || 0) * formQty;

  const handleCancelOrder = async (order) => {
    if (cancellingId) return;
    const what =
      order.side === "SELL"
        ? `Huỷ lệnh bán ${order.qty} CP ${order.symbol} và trả cổ phiếu cho khách?`
        : `Huỷ lệnh mua ${order.qty} CP ${order.symbol} và hoàn ${fmt(order.hold_amount)} ₫ cho khách?`;
    if (!window.confirm(what)) return;
    setCancellingId(order.id);
    try {
      await cancelStockOrder(order.id);
      toast.success("Đã huỷ lệnh, tiền / cổ phiếu đã trả lại cho khách");
      fetchData();
    } catch (e) {
      toast.error(stockErrorMessage(e, "Không huỷ được lệnh"));
    } finally {
      setCancellingId(null);
    }
  };

  const handleCreateOrderSubmit = async () => {
    if (submitting) return;
    if (!orderForm.userId) return toast.error("Vui lòng chọn khách hàng");
    if (!formProject?.id) return toast.error("Vui lòng chọn mã cổ phiếu");
    if (formQty <= 0) return toast.error("Số cổ phiếu không hợp lệ");
    setSubmitting(true);
    try {
      const res = await adminCreateStockOrder({
        userId: orderForm.userId,
        projectId: formProject.id,
        qty: formQty,
        chargeWallet: orderForm.chargeWallet,
        note: orderForm.note || "Admin cấp cổ phiếu",
      });
      toast.success(`Đã cấp ${fmt(formQty)} CP ${res?.order?.symbol || ""} cho khách hàng`);
      setShowCreateOrder(false);
      fetchData();
    } catch (e) {
      toast.error(stockErrorMessage(e, "Không cấp được cổ phiếu"));
    } finally {
      setSubmitting(false);
    }
  };

  const shownOrders = stockOrders.filter((o) => {
    if (statusFilter === "pending" && o.status !== "pending") return false;
    if (statusFilter === "done" && o.status === "pending") return false;
    const q = search.toLowerCase();
    return (
      !q ||
      (o.user_name || "").toLowerCase().includes(q) ||
      (o.user_email || "").toLowerCase().includes(q) ||
      (o.user_identifier || "").toLowerCase().includes(q) ||
      (o.symbol || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3 font-heading">
      <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-3.5 rounded-2xl border border-indigo-500/30 text-white shadow-lg">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2 text-indigo-200">
            <TrendingUp className="w-5 h-5 text-emerald-400" /> Đầu tư chứng khoán
          </h2>
          <p className="text-[11px] text-gray-300 mt-0.5">Giá, lệnh của khách, cổ tức và báo cáo</p>
        </div>
        <div className="flex gap-1.5">
          {!showGuide && (
            <button
              onClick={() => toggleGuide(true)}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" /> Hướng dẫn
            </button>
          )}
          <button onClick={fetchData} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer" title="Làm mới dữ liệu">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {showGuide && <AdminStockGuide onClose={() => toggleGuide(false)} />}

      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-gray-100">
        {SUB_TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={`py-2 rounded-lg text-[12px] font-bold cursor-pointer relative ${sub === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
          >
            {label}
            {k === "orders" && pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px]">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {sub === "overview" && <StockReport />}

      {sub === "prices" && <StockQuotesBoard onNavigateToProjects={onNavigateToProjects} />}

      {sub === "dividends" && <DividendManager projects={projects} />}

      {sub === "orders" && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-xl border border-gray-200">
            <div className="flex gap-1 p-0.5 rounded-lg bg-gray-100">
              {[
                ["pending", `Chờ khớp (${pendingCount})`],
                ["done", "Đã xử lý"],
                ["all", "Tất cả"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setStatusFilter(k)}
                  className={`px-2.5 py-1 rounded-md text-[11px] cursor-pointer ${statusFilter === k ? "bg-white font-bold shadow-sm" : "text-gray-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo khách hàng, mã..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={() => setShowCreateOrder(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Cấp cổ phiếu
            </button>
          </div>
          <p className="text-[10.5px] text-gray-500 px-1">
            Lệnh không cần duyệt — hệ thống tự khớp theo giá. Chỉ huỷ khi khách yêu cầu; tiền / cổ phiếu tự trả lại cho khách.
          </p>

          {loading && stockOrders.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400">Đang tải lệnh...</div>
          ) : shownOrders.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-2xl border border-dashed border-gray-200 text-xs text-gray-500">
              {statusFilter === "pending" ? "Không có lệnh nào đang chờ khớp." : "Không có lệnh phù hợp."}
            </div>
          ) : (
            <div className="space-y-2">
              {shownOrders.map((order) => {
                const sell = order.side === "SELL";
                const value =
                  order.status === "filled"
                    ? sell
                      ? Number(order.amount || 0) - Number(order.fee || 0) - Number(order.tax || 0)
                      : Number(order.amount || 0) + Number(order.fee || 0)
                    : Number(order.hold_amount || 0);
                const price = order.status === "filled" ? order.price : order.limit_price;
                return (
                  <div key={order.id} className="bg-white p-3 rounded-xl border border-gray-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${sell ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {sell ? "BÁN" : "MUA"} {order.symbol}
                        </span>
                        <span className="text-xs font-bold text-gray-900 truncate">
                          {order.user_identifier || order.user_name || order.user_email || order.user_id}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 mt-0.5">
                        {fmt(order.qty)} CP{price ? ` × ${fmt(price)} ₫` : ` · ${order.order_type}`} ·{" "}
                        <b className="font-mono">{fmt(value)} ₫</b>
                        {order.status === "pending" ? (sell ? " (giữ cổ phiếu)" : " (đang tạm giữ)") : sell ? " (khách nhận)" : " (khách trả)"}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {order.created_at ? new Date(order.created_at).toLocaleString("vi-VN") : ""} · {SOURCE_LABELS[order.source] || order.source}
                        {order.charged ? "" : " · không trừ ví"}
                        {order.cancel_reason ? ` · ${order.cancel_reason}` : ""}
                      </p>
                    </div>
                    {order.status === "filled" ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center gap-1">
                        <Check className="w-3 h-3" /> Đã khớp
                      </span>
                    ) : order.status === "pending" ? (
                      <div className="flex items-center gap-1">
                        <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">Chờ khớp</span>
                        <button
                          onClick={() => handleCancelOrder(order)}
                          disabled={cancellingId === order.id}
                          className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50"
                        >
                          Huỷ
                        </button>
                      </div>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold flex items-center gap-1">
                        <X className="w-3 h-3" /> {STATUS_LABELS[order.status] || order.status}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showCreateOrder && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 space-y-3 border border-gray-200 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="text-sm font-bold text-indigo-900">Cấp cổ phiếu cho khách hàng</h3>
              <button onClick={() => setShowCreateOrder(false)} className="p-1 rounded-full hover:bg-gray-100 cursor-pointer" aria-label="Đóng">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <label className="block">
                <span className="font-bold text-gray-700 block mb-1">Khách hàng</span>
                <select
                  value={orderForm.userId}
                  onChange={(e) => setOrderForm({ ...orderForm, userId: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white"
                >
                  <option value="">-- Chọn khách hàng --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.identifier || u.name || u.email} {u.email ? `(${u.email})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-bold text-gray-700 block mb-1">Mã cổ phiếu</span>
                <select
                  value={formProject?.id || ""}
                  onChange={(e) => setOrderForm({ ...orderForm, projectId: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white font-mono font-bold"
                >
                  {tradableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.stock_symbol || p.title} - {fmt(p.price_per_m2)} ₫{p.is_active === false ? " · đang khoá" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-bold text-gray-700 block mb-1">Số cổ phiếu</span>
                <input
                  type="number"
                  min="1"
                  value={orderForm.shares}
                  onChange={(e) => setOrderForm({ ...orderForm, shares: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 font-mono"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">
                  Giá trị theo giá hiện tại: <b className="font-mono">{fmt(formAmount)} ₫</b> · cổ phiếu về tài khoản ngay
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={orderForm.chargeWallet}
                  onChange={(e) => setOrderForm({ ...orderForm, chargeWallet: e.target.checked })}
                  className="mt-0.5"
                />
                <span className="text-gray-700">
                  Trừ tiền ví khách ({fmt(formAmount)} ₫)
                  <span className="block text-[10px] text-gray-500">Bỏ chọn nếu là tặng / bù cổ phiếu (không trừ tiền).</span>
                </span>
              </label>

              <label className="block">
                <span className="font-bold text-gray-700 block mb-1">Ghi chú (tuỳ chọn)</span>
                <input
                  value={orderForm.note}
                  onChange={(e) => setOrderForm({ ...orderForm, note: e.target.value })}
                  placeholder="VD: Bù lệnh lỗi ngày 05/10"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200"
                />
              </label>
            </div>

            <button
              onClick={handleCreateOrderSubmit}
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Đang cấp..." : "Xác nhận cấp cổ phiếu"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
