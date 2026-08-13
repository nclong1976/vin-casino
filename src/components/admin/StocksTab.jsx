import React, { useState, useEffect } from "react";
import { TrendingUp, Plus, Search, Pencil, Check, X, RefreshCw, Building2 } from "lucide-react";
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

export default function StocksTab() {
  const [subTab, setSubTab] = useState("holdings"); // 'holdings' | 'tickers'
  const [projects, setProjects] = useState([]);
  const [stockOrders, setStockOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modals
  const [editingStock, setEditingStock] = useState(null);
  const [showAddStock, setShowAddStock] = useState(false);
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

      // Filter stock projects
      const stockProjs = allProjects.filter((p) => {
        const c = (p.category || "").toLowerCase();
        const t = (p.title || p.name || "").toLowerCase();
        return c.includes("chứng khoán") || c.includes("cổ phiếu") || t.includes("cổ phiếu") || t.includes("cp");
      });

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

  const handleToggleStockStatus = async (proj) => {
    try {
      const nextStatus = !proj.is_active;
      if (proj.id) {
        await base44.entities.Project.update(proj.id, { is_active: nextStatus });
      }
      toast.success(`Đã ${nextStatus ? "MỞ" : "KHÓA"} giao dịch cổ phiếu "${proj.title || proj.symbol}"`);
      fetchData();
    } catch (e) {
      toast.error("Lỗi khi thay đổi trạng thái cổ phiếu");
    }
  };

  const handleSaveStockTicker = async (stockData) => {
    try {
      const payload = {
        title: `Quỹ Cổ Phiếu ${stockData.name} (${stockData.symbol})`,
        name: stockData.name,
        category: "Đầu tư chứng khoán",
        price_per_m2: Number(stockData.price) || 45000,
        priceStr: `${new Intl.NumberFormat("vi-VN").format(stockData.price)} ₫/CP`,
        rate: stockData.yieldRate || "15%/năm",
        minAmount: String(stockData.minAmount || "10000000"),
        is_active: stockData.is_active ?? true,
        description: stockData.description || "",
      };

      if (editingStock?.id) {
        await base44.entities.Project.update(editingStock.id, payload);
        toast.success(`Đã cập nhật cổ phiếu ${stockData.symbol}`);
      } else {
        await base44.entities.Project.create({ ...payload, id: `p_stock_${stockData.symbol.toLowerCase()}` });
        toast.success(`Đã niêm yết cổ phiếu ${stockData.symbol} mới`);
      }
      setEditingStock(null);
      setShowAddStock(false);
      fetchData();
    } catch (e) {
      toast.error("Không thể lưu mã cổ phiếu");
    }
  };

  const handleCreateOrderSubmit = async () => {
    if (!orderForm.userId) {
      toast.error("Vui lòng chọn người dùng");
      return;
    }
    const selectedUser = users.find((u) => u.id === orderForm.userId);
    const amountNum = Number(orderForm.amount) || 0;

    try {
      await base44.entities.Transaction.create({
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

      toast.success("Đã cấp lệnh giao dịch chứng khoán thành công!");
      setShowCreateOrder(false);
      fetchData();
    } catch (e) {
      toast.error("Lỗi khi tạo lệnh chứng khoán");
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await base44.entities.Transaction.update(orderId, {
        status: newStatus,
        contract_status: newStatus === "completed" ? "approved" : newStatus === "rejected" ? "rejected" : "pending",
      });
      toast.success(`Đã chuyển trạng thái lệnh sang: ${newStatus}`);
      fetchData();
    } catch (e) {
      toast.error("Lỗi khi duyệt lệnh");
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

      {/* Switcher Tab Header */}
      <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
        <button
          onClick={() => setSubTab("holdings")}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            subTab === "holdings" ? "bg-white text-indigo-900 shadow-xs" : "text-gray-500 hover:text-black"
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>Danh mục & Lệnh giao dịch của Người dùng ({stockOrders.length})</span>
        </button>
        <button
          onClick={() => setSubTab("tickers")}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            subTab === "tickers" ? "bg-white text-indigo-900 shadow-xs" : "text-gray-500 hover:text-black"
          }`}
        >
          <Building2 className="w-4 h-4 text-amber-600" />
          <span>Quản lý Mã Cổ Phiếu & Tỉ Giá ({projects.length})</span>
        </button>
      </div>

      {/* Sub-tab 1: User Stock Holdings & Transactions */}
      {subTab === "holdings" && (
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
                                onClick={() => handleUpdateOrderStatus(order.id, "completed")}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-xs cursor-pointer"
                              >
                                Duyệt lệnh
                              </button>
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, "rejected")}
                                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold shadow-xs cursor-pointer"
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
      )}

      {/* Sub-tab 2: Stock Ticker Management */}
      {subTab === "tickers" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-800">Danh Sách Mã Cổ Phiếu Niêm Yết</h3>
            <button
              onClick={() => {
                setEditingStock(null);
                setShowAddStock(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm Mã Cổ Phiếu
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {projects.map((p, idx) => {
              const symbol = p.symbol || (p.title || p.name || "").match(/\(([^)]+)\)/)?.[1] || "VIC";
              const price = p.price_per_m2 || p.price || 45200;
              const isActive = p.is_active ?? true;

              return (
                <div
                  key={p.id || idx}
                  className={`bg-white rounded-2xl p-4 border transition-all shadow-xs ${
                    isActive ? "border-gray-200" : "border-amber-200 bg-amber-50/20"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-indigo-900 font-mono">{symbol}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {isActive ? "Đang giao dịch" : "Khóa giao dịch"}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-gray-700 mt-0.5">{p.name || p.title}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-emerald-600 font-mono block">
                        {new Intl.NumberFormat("vi-VN").format(price)} ₫
                      </span>
                      <span className="text-[10px] font-bold text-indigo-600">{p.rate || "15.5%/năm"}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-500 mt-2 line-clamp-2">{p.description || "Tích sản cổ phiếu sinh lời"}</p>

                  <div className="flex items-center justify-between border-t border-gray-100 mt-3 pt-2.5">
                    <button
                      onClick={() => setEditingStock(p)}
                      className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3 text-indigo-600" /> Điều chỉnh giá & thông số
                    </button>

                    <button
                      onClick={() => handleToggleStockStatus(p)}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        isActive ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                      }`}
                    >
                      {isActive ? "Tạm khóa" : "Mở lại"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Modal: Add/Edit Stock Ticker */}
      {(editingStock || showAddStock) && (
        <StockTickerModal
          stock={editingStock}
          onClose={() => {
            setEditingStock(null);
            setShowAddStock(false);
          }}
          onSave={handleSaveStockTicker}
        />
      )}
    </div>
  );
}

function StockTickerModal({ stock, onClose, onSave }) {
  const [form, setForm] = useState({
    symbol: stock?.symbol || (stock?.title || "").match(/\(([^)]+)\)/)?.[1] || "VIC",
    name: stock?.name || stock?.title || "Tập đoàn Vingroup",
    price: stock?.price_per_m2 || stock?.price || 45200,
    yieldRate: stock?.rate || "15.5%/năm",
    minAmount: stock?.minAmount || 10000000,
    is_active: stock?.is_active ?? true,
    description: stock?.description || "",
  });

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl p-4 space-y-3 border border-gray-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <h3 className="text-sm font-bold text-indigo-900">
            {stock?.id ? "Điều Chỉnh Mã Cổ Phiếu" : "Niêm Yết Cổ Phiếu Mới"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-gray-700 block mb-1">Mã CP (Symbol):</label>
              <input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                placeholder="VIC"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 uppercase font-mono font-bold"
              />
            </div>
            <div>
              <label className="font-bold text-gray-700 block mb-1">Giá Khớp Lệnh (₫/CP):</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 font-mono font-bold"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-gray-700 block mb-1">Tên Doanh Nghiệp / Tên Cổ Phiếu:</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Tập đoàn Vingroup"
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-gray-700 block mb-1">Mức Lợi Nhuận Kỳ Vọng:</label>
              <input
                value={form.yieldRate}
                onChange={(e) => setForm({ ...form, yieldRate: e.target.value })}
                placeholder="15.5%/năm"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200"
              />
            </div>
            <div>
              <label className="font-bold text-gray-700 block mb-1">Mức Đặt Tối Thiểu (₫):</label>
              <input
                type="number"
                value={form.minAmount}
                onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-gray-700 block mb-1">Mô Tả Mã Cổ Phiếu:</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 resize-none"
            />
          </div>

          <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 border border-gray-200">
            <span className="font-bold text-gray-800">Trạng Thái Giao Dịch:</span>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 accent-indigo-600 cursor-pointer"
            />
          </div>
        </div>

        <button
          onClick={() => onSave(form)}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all mt-2 cursor-pointer"
        >
          Lưu Mã Cổ Phiếu
        </button>
      </div>
    </div>
  );
}
