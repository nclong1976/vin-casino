import React, { useState, useEffect } from "react";
import { TrendingUp, Plus, Search, Check, X, RefreshCw, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { adminCreateStockOrder, cancelStockOrder, stockErrorMessage } from "@/lib/stockOrders";
import { STATUS_LABELS } from "@/lib/stockMarket";
import StockQuotesBoard from "@/components/admin/stocks/StockQuotesBoard";
import DividendManager from "@/components/admin/stocks/DividendManager";
import { toast } from "sonner";

const DEFAULT_STOCKS = [
  {
    symbol: "VIC",
    name: "Tập đoàn Vingroup",
    price: 45200,
    change: 3.1,
    category: "Đầu tư chứng khoán",
    minAmount: 10000000,
    yieldRate: "15.5%/năm",
    is_active: true,
    description: "Đầu tư chứng khoán tích sản cổ phiếu VIC - Tập đoàn Vingroup sinh lời bền vững.",
  },
  {
    symbol: "VHM",
    name: "Vinhomes",
    price: 42800,
    change: 2.4,
    category: "Đầu tư chứng khoán",
    minAmount: 10000000,
    yieldRate: "14.2%/năm",
    is_active: true,
    description: "Cổ phiếu VHM dẫn đầu ngành bất động sản với quỹ đất vàng khổng lồ.",
  },
  {
    symbol: "VRE",
    name: "Vincom Retail",
    price: 18350,
    change: 1.6,
    category: "Đầu tư chứng khoán",
    minAmount: 5000000,
    yieldRate: "12.8%/năm",
    is_active: true,
    description: "Chuỗi trung tâm thương mại cao cấp Vincom trải dài toàn quốc.",
  },
  {
    symbol: "VPL",
    name: "Vinpearl",
    price: 71500,
    change: 4.2,
    category: "Đầu tư chứng khoán",
    minAmount: 20000000,
    yieldRate: "18.0%/năm",
    is_active: true,
    description: "Cổ phiếu hệ sinh thái du lịch nghỉ dưỡng Vinpearl cao cấp.",
  },
  {
    symbol: "VFS",
    name: "VinFast Auto (Nasdaq)",
    price: 88500, // Normalized VNĐ equivalent
    change: -1.8,
    category: "Đầu tư chứng khoán",
    minAmount: 50000000,
    yieldRate: "22.5%/năm",
    is_active: true,
    description: "Hãng xe điện VinFast niêm yết trên sàn chứng khoán quốc tế Nasdaq.",
  },
];

export default function StocksTab({ onNavigateToProjects }) {
  const [projects, setProjects] = useState([]);
  const [stockOrders, setStockOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  // Modal
  const [showCreateOrder, setShowCreateOrder] = useState(false);

  // Form for Manual Stock Order Assignment
  const [orderForm, setOrderForm] = useState({
    userId: "",
    projectId: "",
    shares: "100",
    chargeWallet: false,
    note: "Admin cấp lệnh giao dịch chứng khoán",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [allProjects, ordersRes, allUsers] = await Promise.all([
        base44.entities.Project.list().catch(() => []),
        supabase.from("stock_orders").select("*").order("created_at", { ascending: false }).limit(300),
        base44.entities.User.list().catch(() => []),
      ]);

      // Lọc CHỈ theo category (trước đây có thêm t.includes("cp") - dò theo
      // tiêu đề chứa 2 ký tự "cp" bất kỳ đâu, dễ khớp nhầm dự án không phải
      // cổ phiếu).
      const stockProjs = allProjects.filter((p) => (p.category || "").trim() === "Đầu tư chứng khoán");

      setProjects(stockProjs.length > 0 ? stockProjs : DEFAULT_STOCKS);
      setUsers(allUsers);

      // Lệnh cổ phiếu nằm ở bảng stock_orders (Giai đoạn 0) - không còn
      // dùng bảng transactions của Dự án.
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

    // Realtime: lệnh mới / đổi mã / đổi người dùng từ thiết bị khác hiện ngay.
    const unsubProject = base44.entities.Project.subscribe(() => fetchData());
    const unsubUser = base44.entities.User.subscribe(() => fetchData());
    const channel = supabase
      .channel("admin_stock_orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_orders" }, () => fetchData())
      .subscribe();

    return () => {
      if (typeof unsubProject === "function") unsubProject();
      if (typeof unsubUser === "function") unsubUser();
      supabase.removeChannel(channel);
    };
  }, []);

  const totalStockVolume = stockOrders.filter((o) => o.status === "filled" && o.side !== "SELL").reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const totalCompletedOrders = stockOrders.filter((o) => o.status === "filled").length;
  const investorCount = new Set(stockOrders.map((o) => o.user_id)).size;
  const tradableProjects = projects.filter((p) => p.id && !String(p.id).startsWith("stock_"));
  const formProject = tradableProjects.find((p) => p.id === orderForm.projectId) || tradableProjects[0];
  const formQty = Math.floor(Number(orderForm.shares) || 0);
  const formAmount = Math.round(Number(formProject?.price_per_m2) || 0) * formQty;

  const handleCancelOrder = async (order) => {
    if (cancellingId) return;
    const what =
      order.side === "SELL"
        ? `Huỷ lệnh ${order.order_type} bán ${order.qty} CP ${order.symbol} và trả cổ phiếu cho khách?`
        : `Huỷ lệnh ${order.order_type} mua ${order.qty} CP ${order.symbol} và hoàn ${Number(order.hold_amount || 0).toLocaleString("vi-VN")} ₫ cho khách?`;
    if (!window.confirm(what)) return;
    setCancellingId(order.id);
    try {
      await cancelStockOrder(order.id);
      toast.success("Đã huỷ lệnh và hoàn tiền phong toả");
      fetchData();
    } catch (e) {
      toast.error(stockErrorMessage(e, "Không huỷ được lệnh"));
    } finally {
      setCancellingId(null);
    }
  };

  const handleCreateOrderSubmit = async () => {
    if (submitting) return;
    if (!orderForm.userId) {
      toast.error("Vui lòng chọn người dùng");
      return;
    }
    if (!formProject?.id) {
      toast.error("Vui lòng chọn mã cổ phiếu");
      return;
    }
    if (formQty <= 0) {
      toast.error("Số lượng cổ phiếu không hợp lệ");
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminCreateStockOrder({
        userId: orderForm.userId,
        projectId: formProject.id,
        qty: formQty,
        chargeWallet: orderForm.chargeWallet,
        note: orderForm.note,
      });
      toast.success(`Đã ghi nhận ${formQty.toLocaleString("vi-VN")} CP ${res?.order?.symbol || ""} cho khách hàng`);
      setShowCreateOrder(false);
      fetchData();
    } catch (e) {
      toast.error(stockErrorMessage(e, "Lỗi khi tạo lệnh chứng khoán"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 font-heading">
      {/* Header & Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 rounded-2xl border border-indigo-500/30 text-white shadow-lg">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2 text-indigo-300">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Quản Lý Danh Mục & Đầu Tư Chứng Khoán
          </h2>
          <p className="text-[11px] text-gray-300 mt-0.5">
            Theo dõi lệnh mua cổ phiếu của người dùng & cấp cổ phần cho khách hàng
          </p>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowCreateOrder(true)}
            className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1 shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Tạo lệnh chứng khoán
          </button>
          <button
            onClick={fetchData}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-[10px] text-gray-400 uppercase font-bold block">Tổng vốn chứng khoán</span>
          <span className="text-sm font-black text-emerald-600 font-mono">
            {new Intl.NumberFormat("vi-VN").format(totalStockVolume)} ₫
          </span>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-[10px] text-gray-400 uppercase font-bold block">Tổng lệnh đã khớp</span>
          <span className="text-sm font-black text-indigo-600 font-mono">
            {totalCompletedOrders} / {stockOrders.length} lệnh
          </span>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-[10px] text-gray-400 uppercase font-bold block">Số mã CP niêm yết</span>
          <span className="text-sm font-black text-amber-600 font-mono">
            {projects.length} Mã (VIC, VHM, VRE...)
          </span>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-[10px] text-gray-400 uppercase font-bold block">Nhà đầu tư chứng khoán</span>
          <span className="text-sm font-black text-gray-800 font-mono">
            {investorCount} Khách hàng
          </span>
        </div>
      </div>

      {/* Sửa giá/tỉ giá/mô tả/trạng thái mã cổ phiếu giờ CHỈ làm ở tab "Dự
          án" (mục Đầu tư chứng khoán) - trước đây tab này có 1 form CRUD
          riêng (StockTickerModal) sửa CHUNG 1 bảng investment_projects với
          form của ProjectsTab, 2 form có bộ field khác nhau (form ở đây
          thiếu lịch tự mở/tắt) nên sửa ở tab này có thể vô tình làm mất dữ
          liệu mà tab kia coi trọng. Giữ lại tab này chỉ để duyệt lệnh giao
          dịch của người dùng - không còn 2 nơi cùng sửa 1 dữ liệu. */}
      <div className="flex items-center justify-between gap-3 bg-white rounded-2xl p-3.5 border border-indigo-100">
        <p className="text-[11px] text-gray-500">
          Sửa tên, mô tả, trạng thái mở/khoá của <b>{projects.length} mã cổ phiếu</b> trong tab <b>"Dự án"</b> (mục Đầu tư chứng khoán). Giá giao dịch đặt ở Bảng giá bên dưới (sửa giá ở tab Dự án cũng đồng bộ vào bảng giá).
        </p>
        <button
          onClick={onNavigateToProjects}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
        >
          Đi tới Dự án <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <StockQuotesBoard />

      <DividendManager projects={projects} />

      {/* Danh mục & Lệnh giao dịch chứng khoán của Người dùng */}
      <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-gray-200">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm lệnh theo tên nhà đầu tư, mã cổ phiếu..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-xs text-gray-400">Đang tải danh sách lệnh chứng khoán...</div>
          ) : stockOrders.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 space-y-2">
              <p className="text-xs text-gray-500 font-semibold">Chưa có lệnh giao dịch chứng khoán nào từ người dùng</p>
              <button
                onClick={() => setShowCreateOrder(true)}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all"
              >
                + Cấp lệnh mua cổ phiếu cho khách hàng
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {stockOrders
                .filter((o) => {
                  const q = search.toLowerCase();
                  return (
                    (o.user_name || "").toLowerCase().includes(q) ||
                    (o.user_email || "").toLowerCase().includes(q) ||
                    (o.user_identifier || "").toLowerCase().includes(q) ||
                    (o.symbol || "").toLowerCase().includes(q)
                  );
                })
                .map((order) => {
                  const sourceLabel =
                    order.source === "backfill" ? "Ghi nhận lại" : order.source === "admin" ? "Admin cấp" : "Khách đặt";

                  return (
                    <div
                      key={order.id}
                      className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold font-mono">
                            {order.side === "SELL" ? "BÁN" : "MUA"} {order.symbol}
                          </span>
                          <span className="text-xs font-bold text-black">{order.user_name || order.user_email || order.user_id}</span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          {order.user_identifier ? `TK ${order.user_identifier} · ` : ""}
                          {order.user_email || "N/A"}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {order.created_at ? new Date(order.created_at).toLocaleString("vi-VN") : ""} · {sourceLabel}
                          {order.charged ? "" : " · không trừ ví"}
                        </p>
                        {order.note && <p className="text-[10px] text-gray-400 italic">{order.note}</p>}
                      </div>

                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 pt-2 sm:pt-0 border-gray-100">
                        <div className="text-right">
                          <span className="text-xs font-bold text-emerald-600 font-mono block">
                            {new Intl.NumberFormat("vi-VN").format(
                              order.status === "filled"
                                ? order.side === "SELL"
                                  ? Number(order.amount || 0) - Number(order.fee || 0) - Number(order.tax || 0)
                                  : Number(order.amount || 0) + Number(order.fee || 0)
                                : order.hold_amount || 0
                            )}{" "}
                            ₫
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {order.order_type} · {Number(order.qty || 0).toLocaleString("vi-VN")} CP
                            {(order.status === "filled" ? order.price : order.limit_price)
                              ? ` × ${Number(order.status === "filled" ? order.price : order.limit_price).toLocaleString("vi-VN")} ₫`
                              : ""}
                            {order.status === "filled" && Number(order.fee) > 0 ? ` · phí ${Number(order.fee).toLocaleString("vi-VN")}` : ""}
                            {order.status === "filled" && Number(order.tax) > 0 ? ` · thuế ${Number(order.tax).toLocaleString("vi-VN")}` : ""}
                            {order.status === "pending" ? (order.side === "SELL" ? " · giữ CP" : " · phong toả") : ""}
                          </span>
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
                            {order.cancel_reason ? ` · ${order.cancel_reason}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

      {/* Modal: Create Manual Stock Order */}
      {showCreateOrder && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 space-y-3 border border-gray-200 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="text-sm font-bold text-indigo-900">Tạo Lệnh Mua Cổ Phiếu Cho Khách hàng</h3>
              <button onClick={() => setShowCreateOrder(false)} className="p-1 rounded-full hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Chọn nhà đầu tư (*):</label>
                <select
                  value={orderForm.userId}
                  onChange={(e) => setOrderForm({ ...orderForm, userId: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white"
                >
                  <option value="">-- Chọn tài khoản khách hàng --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Mã Cổ Phiếu:</label>
                <select
                  value={formProject?.id || ""}
                  onChange={(e) => setOrderForm({ ...orderForm, projectId: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white font-mono font-bold"
                >
                  {tradableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.stock_symbol || p.symbol} - {p.name || p.title} ({Math.round(Number(p.price_per_m2) || 0).toLocaleString("vi-VN")} ₫)
                      {p.is_active === false ? " · đang khoá" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Số lượng CP:</label>
                <input
                  type="number"
                  min="1"
                  value={orderForm.shares}
                  onChange={(e) => setOrderForm({ ...orderForm, shares: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 font-mono"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Giá trị theo giá hiện tại: <b className="font-mono">{formAmount.toLocaleString("vi-VN")} ₫</b>
                </p>
              </div>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={orderForm.chargeWallet}
                  onChange={(e) => setOrderForm({ ...orderForm, chargeWallet: e.target.checked })}
                  className="mt-0.5"
                />
                <span className="text-gray-700">
                  Trừ tiền ví khách hàng
                  <span className="block text-[10px] text-gray-500">Bỏ chọn: chỉ ghi nhận cổ phần, không trừ ví.</span>
                </span>
              </label>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Ghi chú:</label>
                <input
                  value={orderForm.note}
                  onChange={(e) => setOrderForm({ ...orderForm, note: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200"
                />
              </div>
            </div>

            <button
              onClick={handleCreateOrderSubmit}
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all mt-2"
            >
              {submitting ? "Đang ghi nhận..." : "Xác Nhận Tạo Lệnh Giao Dịch"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
