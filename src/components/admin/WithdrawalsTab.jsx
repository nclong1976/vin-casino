import React, { useState, useEffect } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Copy,
  AlertTriangle,
  Building2,
  ShieldCheck,
  History,
  FileText,
  Loader2,
  Filter,
  Check,
  X,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { updateUserBalance } from "@/lib/balanceSync";
import { toast } from "sonner";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

const REJECT_REASONS = [
  "Sai thông tin số tài khoản hoặc tên ngân hàng thụ hưởng",
  "Tên chủ tài khoản không trùng khớp với thông tin hội viên KYC",
  "Tài khoản chưa hoàn tất đủ điều kiện doanh số vòng quay giao dịch",
  "Tài khoản đang trong quá trình rà soát an toàn thông tin",
  "Khác (Nhập tùy chỉnh bên dưới)",
];

export default function WithdrawalsTab() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending"); // "pending" | "completed" | "rejected" | "all"
  const [searchQuery, setSearchQuery] = useState("");
  const [adminUser, setAdminUser] = useState(null);

  // Modal States
  const [rejectingTx, setRejectingTx] = useState(null);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [approvingTx, setApprovingTx] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);

  // Load Admin User
  useEffect(() => {
    base44.auth.me().then(setAdminUser).catch(() => {});
  }, []);

  // Fetch Data
  const fetchData = async () => {
    try {
      const [txs, userList, logs] = await Promise.all([
        base44.entities.WalletTransaction.filter({ type: "withdraw" }, "-created_date", 500).catch(() => []),
        base44.entities.User.list().catch(() => []),
        base44.entities.AuditLog.list("-created_date", 100).catch(() => []),
      ]);

      setWithdrawals(txs);
      setUsers(userList);
      setAuditLogs(logs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Subscribe real-time
    const unsub = base44.entities.WalletTransaction.subscribe(() => {
      fetchData();
    });
    return () => unsub();
  }, []);

  // User lookup map
  const userMap = users.reduce((acc, u) => {
    acc[u.id] = u;
    return acc;
  }, {});

  // Stats calculation
  const pendingTxs = withdrawals.filter((t) => (t.status || "pending") === "pending");
  const completedTxs = withdrawals.filter((t) => t.status === "completed");
  const rejectedTxs = withdrawals.filter((t) => t.status === "rejected" || t.status === "failed");

  const totalPendingAmount = pendingTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
  const totalCompletedAmount = completedTxs.reduce((sum, t) => sum + (t.amount || 0), 0);

  // Filter & Search
  const filteredList = withdrawals.filter((t) => {
    const statusMatch =
      filterStatus === "all"
        ? true
        : filterStatus === "pending"
        ? (t.status || "pending") === "pending"
        : filterStatus === "completed"
        ? t.status === "completed"
        : t.status === "rejected" || t.status === "failed";

    const userInfo = userMap[t.user_id] || {};
    const codeStr = (t.code || t.id || "").toLowerCase();
    const userName = (userInfo.full_name || userInfo.email || "").toLowerCase();
    const bankAcc = (t.account_number || "").toLowerCase();
    const query = searchQuery.toLowerCase().trim();

    const queryMatch =
      !query ||
      codeStr.includes(query) ||
      userName.includes(query) ||
      bankAcc.includes(query);

    return statusMatch && queryMatch;
  });

  // Handle Approve Withdrawal
  const handleApprove = async () => {
    if (!approvingTx) return;
    setProcessing(true);

    // ✅ Optimistic update: xóa khỏi danh sách CHỜ ngay lập tức
    const txId = approvingTx.id;
    setWithdrawals((prev) =>
      prev.map((t) =>
        t.id === txId ? { ...t, status: "completed", approved_at: new Date().toISOString() } : t
      )
    );
    setApprovingTx(null);

    try {
      const txCode = approvingTx.code || approvingTx.id;
      const amount = approvingTx.amount || 0;
      const userId = approvingTx.user_id;
      const userInfo = userMap[userId];

      // 1. Update WalletTransaction status
      await base44.entities.WalletTransaction.update(txId, {
        status: "completed",
        approved_at: new Date().toISOString(),
        approved_by: adminUser?.email || "Admin",
      });

      // 2. Create User Notification
      await base44.entities.Notification.create({
        title: `Biến động số dư: -${fmt(amount)} VNĐ`,
        content: `Yêu cầu rút tiền mã ${txCode} đã được Quản trị viên phê duyệt thành công. Tiền đã chuyển về ngân hàng ${approvingTx.bank_name || "đối tác"} (${approvingTx.account_number || ""}).`,
        type: "withdraw",
        user_id: userId,
        is_read: false,
      });

      // 3. Create AuditLog Entry
      await base44.entities.AuditLog.create({
        action: "APPROVE_WITHDRAWAL",
        tx_code: txCode,
        amount: amount,
        user_id: userId,
        user_name: userInfo?.full_name || userInfo?.email || "N/A",
        admin_email: adminUser?.email || "Admin",
        created_date: new Date().toISOString(),
        notes: `Phê duyệt chuyển ${fmt(amount)} VNĐ về ${approvingTx.bank_name} - STK ${approvingTx.account_number}`,
      });

      toast.success(`✅ Đã phê duyệt lệnh rút ${txCode} thành công!`);
      fetchData(); // sync lại với server
    } catch (err) {
      // Rollback optimistic update nếu lỗi
      setWithdrawals((prev) =>
        prev.map((t) => (t.id === txId ? { ...t, status: "pending" } : t))
      );
      toast.error("Không thể hoàn tất phê duyệt. Vui lòng thử lại.");
    } finally {
      setProcessing(false);
    }
  };

  // Handle Reject Withdrawal
  const handleReject = async () => {
    if (!rejectingTx) return;
    setProcessing(true);

    const finalReason =
      rejectReason === "Khác (Nhập tùy chỉnh bên dưới)"
        ? customReason || "Không đạt điều kiện phê duyệt"
        : rejectReason;

    // ✅ Optimistic update: đánh dấu rejected ngay lập tức
    const txId = rejectingTx.id;
    setWithdrawals((prev) =>
      prev.map((t) =>
        t.id === txId
          ? { ...t, status: "rejected", rejection_reason: finalReason, rejected_at: new Date().toISOString() }
          : t
      )
    );
    setRejectingTx(null);
    setCustomReason("");

    try {
      const txCode = rejectingTx.code || rejectingTx.id;
      const amount = rejectingTx.amount || 0;
      const userId = rejectingTx.user_id;
      const userInfo = userMap[userId];

      // 1. Update WalletTransaction status
      await base44.entities.WalletTransaction.update(txId, {
        status: "rejected",
        rejection_reason: finalReason,
        rejected_at: new Date().toISOString(),
        rejected_by: adminUser?.email || "Admin",
      });

      // 2. Automatically Refund money back to user wallet
      const currentBal = Number(userInfo?.balance || 0);
      updateUserBalance(userId, currentBal + amount);

      await base44.entities.WalletTransaction.create({
        user_id: userId,
        type: "deposit",
        amount: amount,
        status: "completed",
        description: `Hoàn tiền do lệnh rút ${txCode} bị từ chối: ${finalReason}`,
        code: "REF" + Date.now().toString().slice(-8),
      });

      // 3. Create Notification for User
      await base44.entities.Notification.create({
        title: "Lệnh rút tiền bị từ chối",
        content: `Lệnh rút ${fmt(amount)} VNĐ (Mã ${txCode}) bị từ chối. Lý do: ${finalReason}. Số tiền đã được hoàn trả nguyên vẹn vào ví VinClub.`,
        type: "withdraw",
        user_id: userId,
        is_read: false,
      });

      // 4. Create AuditLog Entry
      await base44.entities.AuditLog.create({
        action: "REJECT_WITHDRAWAL",
        tx_code: txCode,
        amount: amount,
        user_id: userId,
        user_name: userInfo?.full_name || userInfo?.email || "N/A",
        admin_email: adminUser?.email || "Admin",
        created_date: new Date().toISOString(),
        notes: `Từ chối lệnh rút ${fmt(amount)} VNĐ. Lý do: ${finalReason}. Đã hoàn trả lại ví.`,
      });

      toast.success(`✅ Đã từ chối lệnh rút ${txCode} & hoàn tiền lại ví người dùng!`);
      fetchData(); // sync lại với server
    } catch (err) {
      // Rollback nếu lỗi
      setWithdrawals((prev) =>
        prev.map((t) => (t.id === txId ? { ...t, status: "pending" } : t))
      );
      toast.error("Không thể xử lý từ chối. Vui lòng thử lại.");
    } finally {
      setProcessing(false);
    }
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Đã sao chép vào bộ nhớ tạm!");
  };

  if (loading) {
    return <div className="text-center py-12 text-[13px] text-gray-400">Đang tải danh sách phê duyệt rút tiền...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="bg-white rounded-2xl p-3 border border-amber-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-[10px] font-bold">Lệnh chờ duyệt</span>
            <Clock className="w-4 h-4 animate-spin" />
          </div>
          <p className="text-[18px] font-black text-amber-700">{pendingTxs.length}</p>
          <p className="text-[9.5px] text-gray-400 font-medium">{fmt(totalPendingAmount)} VNĐ</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-emerald-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-[10px] font-bold">Đã hoàn tất</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-[18px] font-black text-emerald-700">{completedTxs.length}</p>
          <p className="text-[9.5px] text-gray-400 font-medium">{fmt(totalCompletedAmount)} VNĐ</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-red-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-red-600 mb-1">
            <span className="text-[10px] font-bold">Đã từ chối</span>
            <XCircle className="w-4 h-4" />
          </div>
          <p className="text-[18px] font-black text-red-700">{rejectedTxs.length}</p>
          <p className="text-[9.5px] text-gray-400 font-medium">Đã tự động hoàn tiền</p>
        </div>

        <div className="bg-gradient-to-br from-[#17130e] to-[#2e261a] rounded-2xl p-3 text-white shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#e8c87a]">
            <span className="text-[10px] font-bold">Kiểm soát dòng tiền</span>
            <ShieldCheck className="w-4 h-4" />
          </div>
          <button
            onClick={() => setShowAuditLogs(!showAuditLogs)}
            className="mt-2 py-1 px-2 rounded-xl bg-[#948154]/30 border border-[#948154]/50 hover:bg-[#948154]/50 text-[10px] font-bold text-[#e8c87a] flex items-center justify-center gap-1 transition-all"
          >
            <History className="w-3 h-3" /> {showAuditLogs ? "Ẩn Nhật ký Audit" : "Xem Nhật ký Audit"}
          </button>
        </div>
      </div>

      {/* Audit Log Modal / Expansion */}
      <AnimatePresence>
        {showAuditLogs && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white rounded-2xl p-4 border border-gray-200 shadow-md overflow-hidden space-y-3"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="text-[13px] font-bold text-black flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#948154]" /> Nhật ký Lịch sử Kiểm soát Dòng tiền (Audit Log)
              </h3>
              <button
                onClick={() => setShowAuditLogs(false)}
                className="text-gray-400 hover:text-black text-[11px] font-bold"
              >
                Đóng
              </button>
            </div>

            {auditLogs.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-4">Chưa có ghi nhận thao tác quản trị nào.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-2.5 rounded-xl bg-gray-50 text-[11px] border border-gray-100 space-y-1">
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-bold px-1.5 py-0.2 rounded-md text-[9px] ${
                          log.action === "APPROVE_WITHDRAWAL"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {log.action === "APPROVE_WITHDRAWAL" ? "PHÊ DUYỆT" : "TỪ CHỐI"}
                      </span>
                      <span className="text-[9.5px] text-gray-400 font-mono">
                        {log.created_date ? new Date(log.created_date).toLocaleString("vi-VN") : "—"}
                      </span>
                    </div>
                    <p className="font-semibold text-gray-800">
                      Mã GD: <span className="font-mono">{log.tx_code}</span> — Thành viên: {log.user_name}
                    </p>
                    <p className="text-gray-500 text-[10px]">{log.notes}</p>
                    <p className="text-[9px] text-amber-700 font-medium">Bởi Admin: {log.admin_email}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          {/* Status Pills */}
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
            {[
              { id: "pending", label: "Chờ duyệt", count: pendingTxs.length, color: "bg-amber-500 text-white" },
              { id: "completed", label: "Đã duyệt", count: completedTxs.length, color: "bg-emerald-600 text-white" },
              { id: "rejected", label: "Đã từ chối", count: rejectedTxs.length, color: "bg-red-500 text-white" },
              { id: "all", label: "Tất cả", count: withdrawals.length, color: "bg-gray-800 text-white" },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setFilterStatus(btn.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                  filterStatus === btn.id
                    ? btn.color + " shadow-xs"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {btn.label}
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${
                  filterStatus === btn.id ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
                }`}>
                  {btn.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo Mã GD, Tên, STK..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black text-[10px]"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Withdrawals List */}
      {filteredList.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 space-y-2">
          <Filter className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="text-[13px] font-bold text-gray-600">Không tìm thấy lệnh rút tiền nào</p>
          <p className="text-[10.5px] text-gray-400">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((tx) => {
            const userInfo = userMap[tx.user_id] || {};
            const txCode = tx.code || tx.id;
            const isPending = (tx.status || "pending") === "pending";
            const isCompleted = tx.status === "completed";
            const isRejected = tx.status === "rejected" || tx.status === "failed";

            return (
              <div
                key={tx.id}
                className={`bg-white rounded-2xl p-4 border transition-all shadow-2xs relative overflow-hidden ${
                  isPending
                    ? "border-amber-300 ring-2 ring-amber-500/10"
                    : isCompleted
                    ? "border-gray-200 opacity-90"
                    : "border-red-200 bg-red-50/20"
                }`}
              >
                {/* Top Bar: Code & Status */}
                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-bold text-black flex items-center gap-1">
                      {txCode}
                      <button
                        onClick={() => copyText(txCode)}
                        className="text-gray-400 hover:text-[#948154]"
                        title="Sao chép mã"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </span>
                    <span className="text-[9.5px] text-gray-400 font-medium">
                      • {tx.created_date ? new Date(tx.created_date).toLocaleString("vi-VN") : "Gần đây"}
                    </span>
                  </div>

                  {/* Status Badge */}
                  {isPending && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold flex items-center gap-1 border border-amber-200">
                      <Clock className="w-3 h-3 animate-spin" /> Đang chờ duyệt
                    </span>
                  )}
                  {isCompleted && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold flex items-center gap-1 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> Đã hoàn tất
                    </span>
                  )}
                  {isRejected && (
                    <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-extrabold flex items-center gap-1 border border-red-200">
                      <XCircle className="w-3 h-3" /> Từ chối & Đã hoàn tiền
                    </span>
                  )}
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Member Info */}
                  <div className="bg-gray-50/80 rounded-xl p-2.5 border border-gray-100 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#948154] to-[#6b5e3e] text-white font-bold flex items-center justify-center text-[12px] shrink-0 shadow-2xs">
                      {(userInfo.full_name || userInfo.email || "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-black truncate">
                        {userInfo.full_name || "Thành viên VinClub"}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate">{userInfo.email || userInfo.phone || "—"}</p>
                      <span className="text-[8.5px] text-[#948154] font-semibold bg-[#948154]/10 px-1.5 py-0.2 rounded-md">
                        ID: {tx.user_id?.slice(-8) || "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* Bank Details */}
                  <div className="bg-amber-500/5 rounded-xl p-2.5 border border-amber-500/20 space-y-1 text-[10.5px]">
                    <div className="flex items-center justify-between font-bold text-amber-900">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-[#948154]" /> {tx.bank_name || "Ngân hàng"}
                      </span>
                      <button
                        onClick={() => copyText(`${tx.bank_name} ${tx.account_number} ${tx.account_holder}`)}
                        className="text-[9px] text-[#948154] hover:underline flex items-center gap-0.5"
                      >
                        Copy tất cả
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Số tài khoản:</span>
                      <span className="font-mono font-bold text-black text-[11.5px] flex items-center gap-1">
                        {tx.account_number}
                        <button onClick={() => copyText(tx.account_number)} className="text-gray-400 hover:text-black">
                          <Copy className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Chủ tài khoản:</span>
                      <span className="font-bold text-gray-800 uppercase text-[10px]">
                        {tx.account_holder || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Amount & Actions */}
                  <div className="flex flex-col justify-between items-end gap-2 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100">
                    <div className="text-right">
                      <p className="text-[9px] text-gray-400 font-medium">Số tiền yêu cầu rút</p>
                      <p className="text-[17px] font-black text-orange-600 leading-tight">
                        -{fmt(tx.amount)} VNĐ
                      </p>
                    </div>

                    {/* Action buttons if Pending */}
                    {isPending && (
                      <div className="flex items-center gap-1.5 w-full pt-1">
                        <button
                          type="button"
                          onClick={() => setRejectingTx(tx)}
                          className="flex-1 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-bold border border-red-200 flex items-center justify-center gap-1 transition-all active:scale-95"
                        >
                          <X className="w-3.5 h-3.5" /> Từ chối
                        </button>
                        <button
                          type="button"
                          onClick={() => setApprovingTx(tx)}
                          className="flex-1 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-[11px] font-bold shadow-xs flex items-center justify-center gap-1 transition-all active:scale-95"
                        >
                          <Check className="w-3.5 h-3.5" /> Phê duyệt
                        </button>
                      </div>
                    )}

                    {/* Rejection Note */}
                    {isRejected && tx.rejection_reason && (
                      <div className="w-full text-left bg-red-100/60 rounded-lg p-1.5 border border-red-200">
                        <p className="text-[9px] font-bold text-red-800">Lý do từ chối:</p>
                        <p className="text-[9.5px] text-red-700 font-medium">{tx.rejection_reason}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* APPROVE CONFIRMATION MODAL */}
      <AnimatePresence>
        {approvingTx && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={() => !processing && setApprovingTx(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[380px] bg-white rounded-2xl overflow-hidden shadow-2xl p-4 space-y-4"
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-[15px] font-extrabold text-black">Xác nhận Phê duyệt Rút tiền</h3>
                <p className="text-[11px] text-gray-500">
                  Bạn đang phê duyệt chuyển số tiền <strong className="text-emerald-700 text-[13px]">{fmt(approvingTx.amount)} VNĐ</strong> cho thành viên.
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-[11px] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Mã giao dịch:</span>
                  <span className="font-mono font-bold text-black">{approvingTx.code || approvingTx.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Ngân hàng:</span>
                  <span className="font-bold text-black">{approvingTx.bank_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Số tài khoản:</span>
                  <span className="font-mono font-bold text-black">{approvingTx.account_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Chủ tài khoản:</span>
                  <span className="font-bold text-black uppercase">{approvingTx.account_holder}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-800 space-y-0.5">
                <p className="font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" /> Tự động kích hoạt thông báo Push iOS
                </p>
                <p>Hệ thống sẽ gửi Push notification thời gian thực kèm âm thanh biến động ví trực tiếp tới máy người dùng.</p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setApprovingTx(null)}
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-[11.5px] font-bold hover:bg-gray-200"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11.5px] font-bold shadow-md flex items-center justify-center gap-1"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Xác nhận duyệt ngay"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* REJECT MODAL WITH REASONS */}
      <AnimatePresence>
        {rejectingTx && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={() => !processing && setRejectingTx(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[400px] bg-white rounded-2xl overflow-hidden shadow-2xl p-4 space-y-3.5"
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h3 className="text-[14px] font-extrabold text-black flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-500" /> Từ chối lệnh rút {rejectingTx.code || rejectingTx.id}
                </h3>
                <button
                  onClick={() => setRejectingTx(null)}
                  className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-red-50 p-2.5 rounded-xl border border-red-200 text-[10.5px] text-red-800 space-y-1">
                <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" /> Tự động hoàn tiền vào ví người dùng</p>
                <p>Số tiền <strong className="text-black">{fmt(rejectingTx.amount)} VNĐ</strong> sẽ được hoàn trả nguyên vẹn lại ví VinClub của thành viên lập tức.</p>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-gray-700 block">
                  Chọn lý do từ chối mẫu:
                </label>
                <div className="space-y-1.5">
                  {REJECT_REASONS.map((r) => (
                    <label
                      key={r}
                      onClick={() => setRejectReason(r)}
                      className={`flex items-start gap-2 p-2 rounded-xl border text-[11px] cursor-pointer transition-all ${
                        rejectReason === r
                          ? "border-red-500 bg-red-50/50 font-bold text-red-900"
                          : "border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="rejectReason"
                        checked={rejectReason === r}
                        onChange={() => setRejectReason(r)}
                        className="mt-0.5 text-red-600 focus:ring-red-500"
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </div>

                {rejectReason === "Khác (Nhập tùy chỉnh bên dưới)" && (
                  <textarea
                    rows={2}
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Nhập chi tiết lý do từ chối để gửi thông báo cho thành viên..."
                    className="w-full p-2.5 rounded-xl border border-gray-300 text-[11px] focus:outline-none focus:border-red-500 mt-2"
                  />
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingTx(null)}
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-[11.5px] font-bold hover:bg-gray-200"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11.5px] font-bold shadow-md flex items-center justify-center gap-1"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Xác nhận từ chối & Hoàn tiền"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
