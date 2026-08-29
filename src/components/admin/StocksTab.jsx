import React, { useState, useEffect } from "react";
import { TrendingUp, Plus, Search, Check, X, RefreshCw, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
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
  const [processingOrderId, setProcessingOrderId] = useState(null);

  // Modal
  const [showCreateOrder, setShowCreateOrder] = useState(false);

  // Form for Manual Stock Order Assignment
  const [orderForm, setOrderForm] = useState({
    userId: "",
    symbol: "VIC",
    amount: "10000000",
    shares: "220",
    status: "completed",
    note: "Admin cấp lệnh giao dịch chứng khoán",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [allProjects, allTxs, allUsers] = await Promise.all([
        base44.entities.Project.list().catch(() => []),
        base44.entities.Transaction.list("-created_date", 200).catch(() => []),
        base44.entities.User.list().catch(() => []),
      ]);

      // Lọc CHỈ theo category (trước đây có thêm t.includes("cp") - dò theo
      // tiêu đề chứa 2 ký tự "cp" bất kỳ đâu, dễ khớp nhầm dự án không phải
      // cổ phiếu).
      const stockProjs = allProjects.filter((p) => (p.category || "").trim() === "Đầu tư chứng khoán");

      setProjects(stockProjs.length > 0 ? stockProjs : DEFAULT_STOCKS);
      setUsers(allUsers);

      // Filter stock orders/transactions
      const sOrders = allTxs.filter((t) => {
        const cat = (t.category || t.type || "").toLowerCase();
        const pname = (t.project_name || t.title || "").toLowerCase();
        return cat.includes("chứng khoán") || cat.includes("stock") || pname.includes("cổ phiếu") || pname.includes("vic") || pname.includes("vhm");
      });

      setStockOrders(sOrders);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalStockVolume = stockOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const totalCompletedOrders = stockOrders.filter((o) => (o.status || o.contract_status) === "approved" || o.status === "completed").length;

  const handleCreateOrderSubmit = async () => {
    if (!orderForm.userId) {
      toast.error("Vui lòng chọn người dùng");
      return;
    }
    const selectedUser = users.find((u) => u.id === orderForm.userId);
    const amountNum = Number(orderForm.amount) || 0;

    try {
      const result = await base44.entities.Transaction.create({
        user_id: orderForm.userId,
        user_email: selectedUser?.email || "User",
        user_name: selectedUser?.name || "Khách hàng",
        project_id: `stock_${orderForm.symbol}`,
        project_name: `Giao dịch Cổ phiếu ${orderForm.symbol}`,
        category: "Đầu tư chứng khoán",
        amount: amountNum,
        shares: Number(orderForm.shares) || 100,
        status: orderForm.status,
        contract_status: orderForm.status === "completed" ? "approved" : "pending",
        note: orderForm.note,
        created_date: new Date().toISOString(),
      });
      if (result?.__supabaseSynced === false) {
        toast.error("Ghi lên máy chủ thất bại, vui lòng thử lại.");
        return;
      }

      toast.success("Đã cấp lệnh giao dịch chứng khoán thành công!");
      setShowCreateOrder(false);
      fetchData();
    } catch (e) {
      toast.error("Lỗi khi tạo lệnh chứng khoán");
    }
  };

  const handleUpdateOrderStatus = async (order, newStatus) => {
    // Idempotency: chặn double-click / 2 tab admin duyệt trùng cùng 1 lệnh.
    if (processingOrderId) return;
    const currentStatus = order.status === "completed" || order.contract_status === "approved"
      ? "completed"
      : order.status === "rejected" || order.contract_status === "rejected"
      ? "rejected"
      : "pending";
    if (currentStatus !== "pending") return;

    setProcessingOrderId(order.id);
    try {
      const result = await base44.entities.Transaction.update(order.id, {
        status: newStatus,
        contract_status: newStatus === "completed" ? "approved" : newStatus === "rejected" ? "rejected" : "pending",
      });
      if (result?.__supabaseSynced === false) {
        toast.error("Ghi lên máy chủ thất bại, vui lòng thử lại.");
        return;
      }
      toast.success(`Đã chuyển trạng thái lệnh sang: ${newStatus}`);
      fetchData();
    } catch (e) {
      toast.error("Lỗi khi duyệt lệnh");
    } finally {
      setProcessingOrderId(null);
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
            Theo dõi danh mục cổ phiếu Vingroup, duyệt lệnh mua/bán & quản lý tài khoản đầu tư của người dùng
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
          <span className="text-[10px] text-gray-400 uppercase font-bold block">Tổng lệnh đã duyệt</span>
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
            {users.length} Khách hàng
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
          Sửa giá, tỉ giá, mô tả, trạng thái của <b>{projects.length} mã cổ phiếu</b> đã niêm yết trong tab <b>"Dự án"</b> (mục Đầu tư chứng khoán) để tránh 2 nơi cùng sửa 1 dữ liệu.
        </p>
        <button
          onClick={onNavigateToProjects}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
        >
          Đi tới Dự án <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

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
                    (o.project_name || "").toLowerCase().includes(q)
                  );
                })
                .map((order) => {
                  const isApproved = order.status === "completed" || order.contract_status === "approved";
                  const isRejected = order.status === "rejected" || order.contract_status === "rejected";

                  return (
                    <div
                      key={order.id}
                      className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                            {order.project_name || "Cổ phiếu VIC"}
                          </span>
                          <span className="text-xs font-bold text-black">{order.user_name || order.user_email || "Khách hàng"}</span>
                        </div>
                        <p className="text-[11px] text-gray-500">Email: {order.user_email || "N/A"}</p>
                        <p className="text-[10px] text-gray-400">
                          Thời gian: {order.created_date ? new Date(order.created_date).toLocaleString("vi-VN") : "Gần đây"}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 pt-2 sm:pt-0 border-gray-100">
                        <div className="text-right">
                          <span className="text-xs font-bold text-emerald-600 font-mono block">
                            +{new Intl.NumberFormat("vi-VN").format(order.amount || 0)} ₫
                          </span>
                          <span className="text-[10px] text-gray-400">
                            Khối lượng: {order.shares || "1.000"} CP
                          </span>
                        </div>

                        {/* Status badge & Action buttons */}
                        <div className="flex items-center gap-1.5">
                          {isApproved ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" /> Đã duyệt
                            </span>
                          ) : isRejected ? (
                            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold flex items-center gap-1">
                              <X className="w-3 h-3" /> Đã hủy
                            </span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleUpdateOrderStatus(order, "completed")}
                                disabled={processingOrderId === order.id}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-xs cursor-pointer disabled:opacity-50"
                              >
                                Duyệt lệnh
                              </button>
                              <button
                                onClick={() => handleUpdateOrderStatus(order, "rejected")}
                                disabled={processingOrderId === order.id}
                                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold shadow-xs cursor-pointer disabled:opacity-50"
                              >
                                Hủy
                              </button>
                            </div>
                          )}
                        </div>
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
                  value={orderForm.symbol}
                  onChange={(e) => setOrderForm({ ...orderForm, symbol: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white font-mono font-bold"
                >
                  <option value="VIC">VIC - Tập đoàn Vingroup</option>
                  <option value="VHM">VHM - Vinhomes</option>
                  <option value="VRE">VRE - Vincom Retail</option>
                  <option value="VPL">VPL - Vinpearl</option>
                  <option value="VFS">VFS - VinFast Auto</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Giá trị giao dịch (₫):</label>
                  <input
                    type="number"
                    value={orderForm.amount}
                    onChange={(e) => setOrderForm({ ...orderForm, amount: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Số lượng CP:</label>
                  <input
                    type="number"
                    value={orderForm.shares}
                    onChange={(e) => setOrderForm({ ...orderForm, shares: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Trạng thái lệnh:</label>
                <select
                  value={orderForm.status}
                  onChange={(e) => setOrderForm({ ...orderForm, status: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white"
                >
                  <option value="completed">Đã duyệt (Khớp lệnh ngay)</option>
                  <option value="pending">Chờ duyệt</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleCreateOrderSubmit}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all mt-2"
            >
              Xác Nhận Tạo Lệnh Giao Dịch
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
