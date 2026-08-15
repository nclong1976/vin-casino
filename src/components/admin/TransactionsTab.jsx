/**
 * TransactionsTab — Gộp Phê duyệt Nạp + Rút thành một tab duy nhất.
 * Switcher "Nạp tiền / Rút tiền" nằm ngay trên header, giữ nguyên toàn bộ
 * logic approve/reject của cả DepositsTab và WithdrawalsTab.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Copy,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  FileText,
  Loader2,
  Filter,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { listSupabaseUsers } from "@/lib/supabaseDb";
import { adjustUserBalance } from "@/lib/balanceSync";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

const DEPOSIT_REJECT_REASONS = [
  "Không xác minh được nguồn tiền hợp pháp",
  "Chưa nhận được xác nhận chuyển khoản từ ngân hàng đối tác",
  "Yêu cầu trùng lặp với 1 lệnh nạp khác đã xử lý",
  "Khác (Nhập tùy chỉnh bên dưới)",
];
const WITHDRAW_REJECT_REASONS = [
  "Số dư ví không đủ để thực hiện rút tiền",
  "Thông tin tài khoản ngân hàng không hợp lệ hoặc chưa xác minh",
  "Yêu cầu rút trùng lặp với lệnh khác đang xử lý",
  "Tài khoản đang trong thời gian kiểm tra bảo mật",
  "Khác (Nhập tùy chỉnh bên dưới)",
];

// ── Status badge ──────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (!status || status === "pending")
    return (
      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold flex items-center gap-1 border border-amber-200">
        <Clock className="w-3 h-3" /> Chờ duyệt
      </span>
    );
  if (status === "completed")
    return (
      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold flex items-center gap-1 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" /> Hoàn tất
      </span>
    );
  return (
    <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-extrabold flex items-center gap-1 border border-red-200">
      <XCircle className="w-3 h-3" /> Từ chối
    </span>
  );
}

// ── Shared transaction card ───────────────────────────────────────
function TxCard({ tx, userMap, isDeposit, onApprove, onReject, copyText }) {
  const userInfo = userMap[tx.user_id] || {};
  const txCode = tx.code || tx.id;
  const isPending = !tx.status || tx.status === "pending";
  const isCompleted = tx.status === "completed";
  const isRejected = tx.status === "rejected" || tx.status === "failed";

  const amountColor = isDeposit ? "text-emerald-600" : "text-red-600";
  const amountPrefix = isDeposit ? "+" : "-";

  return (
    <div
      className={`bg-white rounded-2xl p-4 border transition-colors shadow-xs ${
        isPending
          ? "border-amber-300 ring-2 ring-amber-500/10"
          : isCompleted
          ? "border-gray-200"
          : "border-red-200 bg-red-50/20"
      }`}
    >
      {/* Row 1: code + time + status */}
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-bold text-black flex items-center gap-1">
            {txCode}
            <button
              onClick={() => copyText(txCode)}
              className="text-gray-400 hover:text-[#948154] cursor-pointer"
              title="Sao chép mã"
            >
              <Copy className="w-3 h-3" />
            </button>
          </span>
          <span className="text-[9.5px] text-gray-400 font-medium hidden sm:block">
            • {tx.created_date ? new Date(tx.created_date).toLocaleString("vi-VN") : "Gần đây"}
          </span>
        </div>
        <StatusBadge status={tx.status} />
      </div>

      {/* Row 2: user info + amount + actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* User info */}
        <div className="bg-gray-50/80 rounded-xl p-2.5 border border-gray-100 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#948154] to-[#6b5e3e] text-white font-bold flex items-center justify-center text-[12px] shrink-0 shadow-xs">
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

        {/* Amount + actions */}
        <div className="flex flex-col justify-between items-end gap-2 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100">
          <div className="text-right">
            <p className="text-[9px] text-gray-400 font-medium">
              {isDeposit ? "Số tiền yêu cầu nạp" : "Số tiền yêu cầu rút"}
            </p>
            <p className={`text-[17px] font-black leading-tight ${amountColor}`}>
              {amountPrefix}{fmt(tx.amount)} VNĐ
            </p>
          </div>

          {isPending && (
            <div className="flex items-center gap-1.5 w-full pt-1">
              <button
                onClick={() => onReject(tx)}
                className="flex-1 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-bold border border-red-200 flex items-center justify-center gap-1 transition-colors active:scale-95 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Từ chối
              </button>
              <button
                onClick={() => onApprove(tx)}
                className="flex-1 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-[11px] font-bold shadow-xs flex items-center justify-center gap-1 transition-colors active:scale-95 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" /> Phê duyệt
              </button>
            </div>
          )}

          {/* Bank info for withdrawals */}
          {!isDeposit && tx.bank_name && (
            <div className="w-full text-left bg-blue-50 rounded-lg p-1.5 border border-blue-100">
              <p className="text-[9px] font-bold text-blue-800">Ngân hàng thụ hưởng:</p>
              <p className="text-[10px] text-blue-700 font-medium">
                {tx.bank_name} — {tx.account_number}
              </p>
              {tx.account_name && (
                <p className="text-[9.5px] text-blue-600">{tx.account_name}</p>
              )}
            </div>
          )}

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
}

// ── Main Component ────────────────────────────────────────────────
export default function TransactionsTab() {
  const { user: adminUser } = useAuth();

  // "deposit" | "withdraw"
  const [txType, setTxType] = useState("deposit");

  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);

  // Modal states
  const [approvingTx, setApprovingTx] = useState(null);
  const [rejectingTx, setRejectingTx] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const isProcessingRef = useRef(false);
  const processedIdsRef = useRef(new Set());

  const isDeposit = txType === "deposit";
  const rejectReasons = isDeposit ? DEPOSIT_REJECT_REASONS : WITHDRAW_REJECT_REASONS;

  // ── Fetchers ───────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    try {
      const [ul, sul] = await Promise.all([
        base44.entities.User.list().catch(() => []),
        listSupabaseUsers().catch(() => []),
      ]);
      const map = {};
      (ul || []).forEach((u) => { if (u?.id) map[u.id] = u; });
      (sul || []).forEach((su) => {
        if (su?.id) map[su.id] = { ...(map[su.id] || {}), ...su };
      });
      setUsers(Object.values(map));
    } catch {}
  }, []);

  const fetchTxs = useCallback(async (full = false) => {
    if (isProcessingRef.current && !full) return;
    try {
      const [deps, wdrs, logs] = await Promise.all([
        base44.entities.WalletTransaction.filter({ type: "deposit" }, "-created_date", 500).catch(() => []),
        base44.entities.WalletTransaction.filter({ type: "withdraw" }, "-created_date", 500).catch(() => []),
        base44.entities.AuditLog.list("-created_date", 200).catch(() => []),
      ]);

      if (full) {
        setDeposits(deps);
        setWithdrawals(wdrs);
        processedIdsRef.current.clear();
      } else {
        const newDeps = deps.filter((t) => !processedIdsRef.current.has(t.id));
        setDeposits((prev) => {
          const processed = prev.filter((t) => processedIdsRef.current.has(t.id));
          return [...processed, ...newDeps].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
        });
        const newWdrs = wdrs.filter((t) => !processedIdsRef.current.has(t.id));
        setWithdrawals((prev) => {
          const processed = prev.filter((t) => processedIdsRef.current.has(t.id));
          return [...processed, ...newWdrs].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
        });
      }

      setAuditLogs(
        logs.filter((l) =>
          ["APPROVE_DEPOSIT", "REJECT_DEPOSIT", "APPROVE_WITHDRAWAL", "REJECT_WITHDRAWAL"].includes(l.action)
        )
      );
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchTxs(true);
    const unsub = base44.entities.WalletTransaction.subscribe(() => {
      if (!isProcessingRef.current) fetchTxs(false);
    });
    return () => unsub();
  }, [fetchUsers, fetchTxs]);

  // ── Derived data ───────────────────────────────────────────────
  const userMap = useMemo(() => {
    const m = {};
    users.forEach((u) => { if (u?.id) m[u.id] = u; });
    return m;
  }, [users]);

  const activeTxs = isDeposit ? deposits : withdrawals;

  const pendingTxs = useMemo(() => activeTxs.filter((t) => !t.status || t.status === "pending"), [activeTxs]);
  const completedTxs = useMemo(() => activeTxs.filter((t) => t.status === "completed"), [activeTxs]);
  const rejectedTxs = useMemo(() => activeTxs.filter((t) => t.status === "rejected" || t.status === "failed"), [activeTxs]);

  const totalPendingAmt = useMemo(() => pendingTxs.reduce((s, t) => s + (t.amount || 0), 0), [pendingTxs]);
  const totalDoneAmt = useMemo(() => completedTxs.reduce((s, t) => s + (t.amount || 0), 0), [completedTxs]);

  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return activeTxs.filter((t) => {
      const match =
        filterStatus === "all" ? true
        : filterStatus === "pending" ? (!t.status || t.status === "pending")
        : filterStatus === "completed" ? t.status === "completed"
        : t.status === "rejected" || t.status === "failed";
      if (!match) return false;
      if (!q) return true;
      const u = userMap[t.user_id] || {};
      const name = (u.full_name || u.email || "").toLowerCase();
      const code = (t.code || t.id || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [activeTxs, filterStatus, searchQuery, userMap]);

  // ── Approve ────────────────────────────────────────────────────
  const handleApprove = useCallback(async () => {
    if (!approvingTx) return;
    const tx = approvingTx;
    setApprovingTx(null);
    setProcessing(true);
    isProcessingRef.current = true;
    processedIdsRef.current.add(tx.id);

    const setter = isDeposit ? setDeposits : setWithdrawals;
    setter((prev) => prev.filter((t) => t.id !== tx.id));

    try {
      const amount = tx.amount || 0;
      if (isDeposit) {
        await adjustUserBalance(tx.user_id, amount, amount);
        await base44.entities.WalletTransaction.update(tx.id, {
          status: "completed",
          approved_at: new Date().toISOString(),
          approved_by: adminUser?.email || "Admin",
        });
        await base44.entities.Notification.create({
          title: `Biến động số dư: +${fmt(amount)} VNĐ`,
          content: `Yêu cầu nạp tiền mã ${tx.code || tx.id} đã được phê duyệt. Số dư ví được cộng thêm ${fmt(amount)} VNĐ.`,
          type: "deposit", user_id: tx.user_id, is_read: false,
        });
        await base44.entities.AuditLog.create({
          action: "APPROVE_DEPOSIT", tx_code: tx.code || tx.id, amount,
          user_id: tx.user_id, user_name: userMap[tx.user_id]?.full_name || "N/A",
          admin_email: adminUser?.email || "Admin",
          created_date: new Date().toISOString(),
          notes: `Phê duyệt cộng ${fmt(amount)} VNĐ vào ví`,
        });
        toast.success(`✅ Đã duyệt lệnh nạp ${tx.code || tx.id}`);
      } else {
        await adjustUserBalance(tx.user_id, -amount, 0);
        await base44.entities.WalletTransaction.update(tx.id, {
          status: "completed",
          approved_at: new Date().toISOString(),
          approved_by: adminUser?.email || "Admin",
        });
        await base44.entities.Notification.create({
          title: `Biến động số dư: -${fmt(amount)} VNĐ`,
          content: `Yêu cầu rút tiền mã ${tx.code || tx.id} đã được phê duyệt. Số dư ví bị trừ ${fmt(amount)} VNĐ.`,
          type: "withdraw", user_id: tx.user_id, is_read: false,
        });
        await base44.entities.AuditLog.create({
          action: "APPROVE_WITHDRAWAL", tx_code: tx.code || tx.id, amount,
          user_id: tx.user_id, user_name: userMap[tx.user_id]?.full_name || "N/A",
          admin_email: adminUser?.email || "Admin",
          created_date: new Date().toISOString(),
          notes: `Phê duyệt rút ${fmt(amount)} VNĐ ra khỏi ví`,
        });
        toast.success(`✅ Đã duyệt lệnh rút ${tx.code || tx.id}`);
      }

      setTimeout(() => {
        isProcessingRef.current = false;
        processedIdsRef.current.delete(tx.id);
        fetchTxs(true);
      }, 1500);
    } catch {
      processedIdsRef.current.delete(tx.id);
      isProcessingRef.current = false;
      fetchTxs(true);
      toast.error("Không thể hoàn tất phê duyệt. Vui lòng thử lại.");
    } finally {
      setProcessing(false);
    }
  }, [approvingTx, isDeposit, userMap, adminUser, fetchTxs]);

  // ── Reject ─────────────────────────────────────────────────────
  const handleReject = useCallback(async () => {
    if (!rejectingTx) return;
    const tx = rejectingTx;
    const finalReason =
      rejectReason === "Khác (Nhập tùy chỉnh bên dưới)"
        ? customReason || "Không đạt điều kiện phê duyệt"
        : rejectReason;

    setRejectingTx(null);
    setCustomReason("");
    setProcessing(true);
    isProcessingRef.current = true;
    processedIdsRef.current.add(tx.id);

    const setter = isDeposit ? setDeposits : setWithdrawals;
    setter((prev) => prev.filter((t) => t.id !== tx.id));

    try {
      const amount = tx.amount || 0;
      if (!isDeposit) {
        // Hoàn tiền lại vào ví khi từ chối lệnh rút
        await adjustUserBalance(tx.user_id, amount, 0);
      }
      await base44.entities.WalletTransaction.update(tx.id, {
        status: "rejected",
        rejection_reason: finalReason,
        rejected_at: new Date().toISOString(),
        rejected_by: adminUser?.email || "Admin",
      });
      await base44.entities.Notification.create({
        title: isDeposit ? "Yêu cầu nạp tiền bị từ chối" : "Yêu cầu rút tiền bị từ chối",
        content: `Lệnh ${isDeposit ? "nạp" : "rút"} ${fmt(amount)} VNĐ (Mã ${tx.code || tx.id}) bị từ chối. Lý do: ${finalReason}.`,
        type: isDeposit ? "deposit" : "withdraw",
        user_id: tx.user_id, is_read: false,
      });
      await base44.entities.AuditLog.create({
        action: isDeposit ? "REJECT_DEPOSIT" : "REJECT_WITHDRAWAL",
        tx_code: tx.code || tx.id, amount,
        user_id: tx.user_id, user_name: userMap[tx.user_id]?.full_name || "N/A",
        admin_email: adminUser?.email || "Admin",
        created_date: new Date().toISOString(),
        notes: `Từ chối lệnh ${isDeposit ? "nạp" : "rút"} ${fmt(amount)} VNĐ. Lý do: ${finalReason}.`,
      });
      toast.success(`✅ Đã từ chối lệnh ${isDeposit ? "nạp" : "rút"} ${tx.code || tx.id}`);

      setTimeout(() => {
        isProcessingRef.current = false;
        processedIdsRef.current.delete(tx.id);
        fetchTxs(true);
      }, 1500);
    } catch {
      processedIdsRef.current.delete(tx.id);
      isProcessingRef.current = false;
      fetchTxs(true);
      toast.error("Không thể xử lý từ chối.");
    } finally {
      setProcessing(false);
    }
  }, [rejectingTx, rejectReason, customReason, isDeposit, userMap, adminUser, fetchTxs]);

  const copyText = useCallback((text) => {
    navigator.clipboard.writeText(text);
    toast.success("Đã sao chép!");
  }, []);

  const openReject = useCallback((tx) => {
    setRejectReason(isDeposit ? DEPOSIT_REJECT_REASONS[0] : WITHDRAW_REJECT_REASONS[0]);
    setCustomReason("");
    setRejectingTx(tx);
  }, [isDeposit]);

  // ── Render ─────────────────────────────────────────────────────
  if (loading)
    return (
      <div className="text-center py-12 text-[13px] text-gray-400 flex flex-col items-center gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-[#948154]" />
        Đang tải danh sách phê duyệt giao dịch...
      </div>
    );

  return (
    <div className="space-y-4">
      {/* ── Type switcher ── */}
      <div className="bg-white rounded-2xl p-1.5 border border-gray-200 shadow-xs flex gap-1.5">
        <button
          onClick={() => { setTxType("deposit"); setFilterStatus("pending"); setSearchQuery(""); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12.5px] font-bold transition-colors cursor-pointer ${
            isDeposit
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          <ArrowDownToLine className="w-4 h-4" />
          Phê duyệt Nạp tiền
          {deposits.filter((t) => !t.status || t.status === "pending").length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${isDeposit ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"}`}>
              {deposits.filter((t) => !t.status || t.status === "pending").length}
            </span>
          )}
        </button>
        <button
          onClick={() => { setTxType("withdraw"); setFilterStatus("pending"); setSearchQuery(""); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12.5px] font-bold transition-colors cursor-pointer ${
            !isDeposit
              ? "bg-red-600 text-white shadow-xs"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          <ArrowUpFromLine className="w-4 h-4" />
          Phê duyệt Rút tiền
          {withdrawals.filter((t) => !t.status || t.status === "pending").length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${!isDeposit ? "bg-white/20 text-white" : "bg-red-100 text-red-700"}`}>
              {withdrawals.filter((t) => !t.status || t.status === "pending").length}
            </span>
          )}
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="bg-white rounded-2xl p-3 border border-amber-200/80 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-[10px] font-bold">Chờ duyệt</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-[18px] font-black text-amber-700">{pendingTxs.length}</p>
          <p className="text-[9.5px] text-gray-400 font-medium">{fmt(totalPendingAmt)} VNĐ</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-emerald-200/80 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-[10px] font-bold">Đã hoàn tất</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-[18px] font-black text-emerald-700">{completedTxs.length}</p>
          <p className="text-[9.5px] text-gray-400 font-medium">{fmt(totalDoneAmt)} VNĐ</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-red-200/80 shadow-xs">
          <div className="flex items-center justify-between text-red-600 mb-1">
            <span className="text-[10px] font-bold">Đã từ chối</span>
            <XCircle className="w-4 h-4" />
          </div>
          <p className="text-[18px] font-black text-red-700">{rejectedTxs.length}</p>
          <p className="text-[9.5px] text-gray-400 font-medium">
            {isDeposit ? "Không cộng ví" : "Đã hoàn ví"}
          </p>
        </div>

        <div className="bg-gradient-to-br from-[#17130e] to-[#2e261a] rounded-2xl p-3 text-white shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#e8c87a]">
            <span className="text-[10px] font-bold">Kiểm soát dòng tiền</span>
            <History className="w-4 h-4" />
          </div>
          <button
            onClick={() => setShowAuditLogs(!showAuditLogs)}
            className="mt-2 py-1 px-2 rounded-xl bg-[#948154]/30 border border-[#948154]/50 hover:bg-[#948154]/50 text-[10px] font-bold text-[#e8c87a] flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <FileText className="w-3 h-3" /> {showAuditLogs ? "Ẩn Audit Log" : "Xem Audit Log"}
          </button>
        </div>
      </div>

      {/* ── Audit log panel ── */}
      <AnimatePresence>
        {showAuditLogs && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm overflow-hidden space-y-3"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="text-[13px] font-bold text-black flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#948154]" /> Nhật ký Audit — Nạp &amp; Rút
              </h3>
              <button onClick={() => setShowAuditLogs(false)} className="text-gray-400 hover:text-black text-[11px] font-bold cursor-pointer">
                Đóng
              </button>
            </div>
            {auditLogs.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-4">Chưa có ghi nhận thao tác nào.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {auditLogs.map((log) => {
                  const isApprove = log.action?.includes("APPROVE");
                  return (
                    <div key={log.id} className="p-2.5 rounded-xl bg-gray-50 text-[11px] border border-gray-100 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`font-bold px-1.5 py-0.2 rounded-md text-[9px] ${isApprove ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                          {isApprove ? "PHÊ DUYỆT" : "TỪ CHỐI"} • {log.action?.includes("DEPOSIT") ? "NẠP" : "RÚT"}
                        </span>
                        <span className="text-[9.5px] text-gray-400 font-mono">
                          {log.created_date ? new Date(log.created_date).toLocaleString("vi-VN") : "—"}
                        </span>
                      </div>
                      <p className="font-semibold text-gray-800">
                        Mã GD: <span className="font-mono">{log.tx_code}</span> — {log.user_name}
                      </p>
                      <p className="text-gray-500 text-[10px]">{log.notes}</p>
                      <p className="text-[9px] text-amber-700 font-medium">Bởi Admin: {log.admin_email}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
            {[
              { id: "pending", label: "Chờ duyệt", count: pendingTxs.length, color: "bg-amber-500 text-white" },
              { id: "completed", label: "Đã duyệt", count: completedTxs.length, color: "bg-emerald-600 text-white" },
              { id: "rejected", label: "Đã từ chối", count: rejectedTxs.length, color: "bg-red-500 text-white" },
              { id: "all", label: "Tất cả", count: activeTxs.length, color: "bg-gray-800 text-white" },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setFilterStatus(btn.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  filterStatus === btn.id ? btn.color + " shadow-xs" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {btn.label}
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${filterStatus === btn.id ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"}`}>
                  {btn.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo Mã GD, Tên thành viên..."
              className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black text-[10px] cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── List ── */}
      {filteredList.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-gray-100 space-y-2">
          <Filter className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="text-[13px] font-bold text-gray-600">Không tìm thấy giao dịch nào</p>
          <p className="text-[10.5px] text-gray-400">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((tx) => (
            <TxCard
              key={tx.id}
              tx={tx}
              userMap={userMap}
              isDeposit={isDeposit}
              onApprove={setApprovingTx}
              onReject={openReject}
              copyText={copyText}
            />
          ))}
        </div>
      )}

      {/* ── Approve modal ── */}
      <AnimatePresence>
        {approvingTx && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={() => !processing && setApprovingTx(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[380px] bg-white rounded-2xl shadow-2xl p-5 space-y-4"
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-[15px] font-extrabold text-black">
                  Xác nhận Phê duyệt {isDeposit ? "Nạp tiền" : "Rút tiền"}
                </h3>
                <p className="text-[11px] text-gray-500">
                  Bạn đang {isDeposit ? "cộng" : "trừ"}{" "}
                  <strong className={`text-[13px] ${isDeposit ? "text-emerald-700" : "text-red-600"}`}>
                    {fmt(approvingTx.amount)} VNĐ
                  </strong>{" "}
                  {isDeposit ? "vào" : "ra khỏi"} ví thành viên.
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-[11px] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Mã giao dịch:</span>
                  <span className="font-mono font-bold">{approvingTx.code || approvingTx.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Thành viên:</span>
                  <span className="font-bold">{(userMap[approvingTx.user_id] || {}).full_name || "N/A"}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setApprovingTx(null)}
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-[11.5px] font-bold hover:bg-gray-200 cursor-pointer transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={handleApprove}
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11.5px] font-bold shadow-sm flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Xác nhận duyệt"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reject modal ── */}
      <AnimatePresence>
        {rejectingTx && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={() => !processing && setRejectingTx(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[400px] bg-white rounded-2xl shadow-2xl p-5 space-y-3.5"
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                <h3 className="text-[14px] font-extrabold text-black flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Từ chối lệnh {isDeposit ? "nạp" : "rút"} {rejectingTx.code || rejectingTx.id}
                </h3>
                <button onClick={() => setRejectingTx(null)} className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-red-50 p-2.5 rounded-xl border border-red-200 text-[10.5px] text-red-800 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  {isDeposit ? "Không cộng tiền vào ví" : "Hoàn tiền lại vào ví"}
                </p>
                <p>
                  {isDeposit
                    ? `${fmt(rejectingTx.amount)} VNĐ sẽ không được cộng vào ví thành viên.`
                    : `${fmt(rejectingTx.amount)} VNĐ sẽ được hoàn lại vào ví thành viên.`}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-gray-700 block">Chọn lý do từ chối:</label>
                <div className="space-y-1.5">
                  {rejectReasons.map((r) => (
                    <label
                      key={r}
                      onClick={() => setRejectReason(r)}
                      className={`flex items-start gap-2 p-2 rounded-xl border text-[11px] cursor-pointer transition-colors ${
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
                        className="mt-0.5 text-red-600 focus:ring-red-500 cursor-pointer"
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
                    className="w-full p-2.5 rounded-xl border border-gray-300 text-[11px] focus:outline-none focus:border-red-500 mt-2 resize-none"
                  />
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setRejectingTx(null)}
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-[11.5px] font-bold hover:bg-gray-200 cursor-pointer transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing || !rejectReason}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11.5px] font-bold shadow-sm flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Xác nhận từ chối"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
