import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Users as UsersIcon,
  Mail,
  Phone,
  Wallet,
  Lock,
  Unlock,
  Shield,
  ShieldAlert,
  Search,
  ExternalLink,
  Loader2,
  Trash2,
  AlertTriangle,
  X,
  MessageSquare,
  ArrowRightLeft
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { listSupabaseUsers, deleteSupabaseUser, subscribeSupabaseUsersTable } from "@/lib/supabaseDb";
import { deleteUserFromRTDB } from "@/lib/rtdbSync";
import { useAuth } from "@/lib/AuthContext";
import AdminWalletModal from "@/components/admin/AdminWalletModal";
import UserDetailModal from "@/components/admin/UserDetailModal";
import BalanceAmount from "@/components/admin/BalanceAmount";
import { toast } from "sonner";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

const TIER_BADGES = {
  Member: "bg-gray-100 text-gray-700 border-gray-200",
  Gold: "bg-amber-100 text-amber-800 border-amber-300 font-bold",
  Platinum: "bg-slate-200 text-slate-800 border-slate-300 font-bold",
  Diamond: "bg-blue-100 text-blue-900 border-blue-300 font-black",
};

export default function UsersTab({ onNavigateToChat = null, onNavigateToTransactions = null }) {
  const { user: currentAdmin } = useAuth();
  const isSuperAdmin = !!currentAdmin?.is_super_admin || currentAdmin?.role === "admin" || currentAdmin?.email === "nclong1976@gmail.com" || currentAdmin?.username === "nclong";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Selected User Modals
  const [adjustWalletUser, setAdjustWalletUser] = useState(null);
  const [detailUser, setDetailUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingLockId, setTogglingLockId] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState({});

  const isFetchingRef = useRef(false);

  // Supabase Postgres là nguồn sự thật DUY NHẤT cho danh sách hội viên &
  // số dư (xem whimsical-napping-floyd.md Bước 6) - không còn merge qua
  // localStorage/RTDB/tổng lịch sử WalletTransaction bằng Math.max như
  // trước (4 lớp khác nhau, dễ "kẹt" số dư sai ở mức cao nhất từng thấy dù
  // giá trị đó đã lỗi thời). Đọc thẳng 1 nguồn, cập nhật realtime qua
  // subscribeSupabaseUsersTable bên dưới.
  const fetchUsers = useCallback((isInitial = false) => {
    if (isFetchingRef.current && !isInitial) return;
    isFetchingRef.current = true;
    if (isInitial) setLoading(true);

    listSupabaseUsers().then((supaUserList) => {
      setUsers(supaUserList || []);
    }).finally(() => {
      isFetchingRef.current = false;
      if (isInitial) setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchUsers(true);

    // Cập nhật tức thời khi bất kỳ hàng nào trong bảng users đổi (không lọc
    // theo id vì Admin cần thấy TẤT CẢ hội viên) - thay cho việc lắng nghe
    // RTDB + poll định kỳ tính lại từ 500 giao dịch gần nhất.
    const unsubSupabase = subscribeSupabaseUsersTable((payload) => {
      const { eventType, new: newRow, old: oldRow } = payload || {};
      setUsers((prev) => {
        if (eventType === "DELETE") {
          const deletedId = oldRow?.id;
          return deletedId ? prev.filter((u) => u.id !== deletedId) : prev;
        }
        if (!newRow || !newRow.id) return prev;
        const idx = prev.findIndex((u) => u.id === newRow.id);
        if (idx === -1) return [newRow, ...prev];
        const next = [...prev];
        next[idx] = { ...next[idx], ...newRow };
        return next;
      });
    });

    // Vẫn giữ RTDB CHỈ để hiển thị trạng thái Online (presence theo thời
    // gian thực) - is_locked/balance/... không còn tin từ đây nữa.
    let unsubRTDB;
    import('@/lib/rtdbSync').then(({ subscribeAllUsersFromRTDB }) => {
      unsubRTDB = subscribeAllUsersFromRTDB((_rtdbUsers, onlineMap) => {
        if (onlineMap) setOnlineUsers(onlineMap);
      });
    }).catch(() => null);

    // Refetch định kỳ nhẹ làm lưới an toàn phòng khi kênh realtime bị rớt
    // (mất mạng, tab chuyển nền lâu) - không còn phải tính lại từ hàng trăm
    // giao dịch mỗi lần như trước nên có thể giãn chu kỳ ra nhiều.
    const pollInterval = setInterval(() => {
      fetchUsers(false);
    }, 30000);

    return () => {
      if (typeof unsubSupabase === "function") unsubSupabase();
      if (typeof unsubRTDB === "function") unsubRTDB();
      clearInterval(pollInterval);
    };
  }, [fetchUsers]);

  const handleToggleLock = async (u) => {
    const nextLocked = !u.is_locked;
    setTogglingLockId(u.id);
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_locked: nextLocked } : x)));
    try {
      await base44.entities.User.update(u.id, { is_locked: nextLocked });

      await base44.entities.AuditLog.create({
        action: nextLocked ? "LOCK_USER" : "UNLOCK_USER",
        user_id: u.id,
        user_name: u.full_name || u.email,
        notes: nextLocked ? "Khóa tài khoản nhanh từ danh sách" : "Mở khóa tài khoản từ danh sách",
        created_date: new Date().toISOString(),
      });

      toast.success(nextLocked ? `Đã tạm khóa tài khoản ${u.full_name || u.email}` : `Đã mở khóa tài khoản ${u.full_name || u.email}`);
      fetchUsers(false);
    } catch (e) {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_locked: u.is_locked } : x)));
      toast.error("Không thể thay đổi trạng thái tài khoản.");
    } finally {
      setTogglingLockId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser || !isSuperAdmin) return;
    const u = deletingUser;
    const confirmName = u.full_name || u.email || u.id;
    setIsDeleting(true);
    try {
      await Promise.allSettled([
        deleteSupabaseUser(u.id),
        deleteUserFromRTDB(u.id),
        base44.entities.User.delete(u.id),
      ]);

      const rawReg = localStorage.getItem('base44_registered_users');
      if (rawReg) {
        try {
          const regUsers = JSON.parse(rawReg).filter((x) => x.id !== u.id && x.email !== u.email);
          localStorage.setItem('base44_registered_users', JSON.stringify(regUsers));
        } catch (e) {}
      }

      await base44.entities.AuditLog.create({
        action: "DELETE_USER",
        user_id: u.id,
        user_name: confirmName,
        notes: `Super Admin đã xóa vĩnh viễn tài khoản ${confirmName} khỏi hệ thống`,
        created_date: new Date().toISOString(),
      });

      setUsers((prev) => prev.filter((x) => x.id !== u.id && x.email !== u.email));
      toast.success(`Đã xóa vĩnh viễn tài khoản ${confirmName}!`);
      setDeletingUser(null);
      fetchUsers(false);
    } catch (e) {
      toast.error("Không thể xóa tài khoản. Vui lòng thử lại.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Pre-calculate online email set for O(1) lookups
  const onlineEmailSet = useMemo(() => {
    return new Set(
      Object.values(onlineUsers)
        .map((o) => o?.email)
        .filter(Boolean)
    );
  }, [onlineUsers]);

  // Memoize filtered users to avoid laggy recalculations on unrelated renders
  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return users.filter((u) => {
      const nameStr = (u.full_name || u.name || "").toLowerCase();
      const emailStr = (u.email || "").toLowerCase();
      const phoneStr = (u.phone || "").toLowerCase();
      const idStr = (u.id || "").toLowerCase();

      const matchesSearch =
        !query ||
        nameStr.includes(query) ||
        emailStr.includes(query) ||
        phoneStr.includes(query) ||
        idStr.includes(query);

      const userTier = u.membership_tier || "Member";
      const matchesTier = filterTier === "all" || userTier === filterTier;

      const matchesStatus =
        filterStatus === "all"
          ? true
          : filterStatus === "active"
          ? !u.is_locked
          : u.is_locked;

      return matchesSearch && matchesTier && matchesStatus;
    });
  }, [users, searchQuery, filterTier, filterStatus]);

  // Header stats
  const totalUsers = users.length;
  const lockedUsersCount = useMemo(() => users.filter((u) => u.is_locked).length, [users]);
  const totalSystemBalance = useMemo(() => {
    return users.reduce((acc, u) => acc + (Number(u.balance) || 0), 0);
  }, [users]);

  if (loading) return <div className="text-center py-10 text-[13px] text-gray-400">Đang tải danh sách thành viên...</div>;

  return (
    <div className="space-y-4">
      {/* Header Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="bg-white rounded-2xl p-3 border border-gray-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[10px] font-bold">Tổng hội viên</span>
            <UsersIcon className="w-4 h-4 text-[#948154]" />
          </div>
          <p className="text-[18px] font-black text-black">{totalUsers}</p>
          <p className="text-[9.5px] text-gray-400 font-medium">Đã đăng ký tài khoản</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-amber-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-[10px] font-bold">Tổng số dư Ví</span>
            <Wallet className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-[15px] sm:text-[16px] font-black text-[#948154] break-words leading-tight">{fmt(totalSystemBalance)} VNĐ</p>
          <p className="text-[9.5px] text-amber-700/60 font-medium">Toàn hệ thống</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-emerald-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-[10px] font-bold">Đang Online</span>
            <Shield className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-[18px] font-black text-emerald-600">
            {Object.keys(onlineUsers).length}
          </p>
          <p className="text-[9.5px] text-emerald-700/60 font-medium">Thời gian thực</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-red-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-red-600 mb-1">
            <span className="text-[10px] font-bold">Tài khoản khóa</span>
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-[18px] font-black text-red-600">{lockedUsersCount}</p>
          <p className="text-[9.5px] text-red-700/60 font-medium">Tạm ngừng truy cập</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo Tên, Email, SĐT hoặc ID..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-medium placeholder:text-gray-400 focus:outline-none focus:border-[#948154] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            {/* Tier Filter */}
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[11px] font-bold text-gray-700 focus:outline-none transition-colors"
            >
              <option value="all">Tất cả Hạng thẻ</option>
              <option value="Member">Member (VIP 0)</option>
              <option value="Gold">Gold (VIP 1)</option>
              <option value="Platinum">Platinum (VIP 2)</option>
              <option value="Diamond">Diamond (VIP 3)</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[11px] font-bold text-gray-700 focus:outline-none transition-colors"
            >
              <option value="all">Tất cả Trạng thái</option>
              <option value="active">Hoạt động</option>
              <option value="locked">Tạm khóa</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users List Table / Card View */}
      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-400 border border-gray-100 shadow-sm">
          <UsersIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-[13px] font-bold text-gray-600">Không tìm thấy hội viên phù hợp</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredUsers.map((u) => {
            const userBal = Number(u.balance || 0);
            const tier = u.membership_tier || "Member";
            const isAdmin = u.role === "admin";
            const isOnline = Boolean(onlineUsers[u.id] || (u.email && onlineEmailSet.has(u.email)));

            return (
              <div
                key={u.id || u.email}
                className={`bg-white rounded-2xl p-3.5 border transition-colors shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  u.is_locked ? "border-red-200 bg-red-50/20" : "border-gray-200/80 hover:border-[#948154]/50"
                }`}
              >
                {/* Left Section: User Avatar & Identifier */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#948154] to-[#6b5e3e] text-white font-bold flex items-center justify-center text-[13px] shrink-0 shadow-sm relative">
                    {(u.full_name || u.email || "U").charAt(0).toUpperCase()}
                    {isAdmin && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[7.5px] font-black px-1 rounded-full border border-white">
                        ADM
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[13px] font-bold text-black truncate">
                        {u.full_name || "Chưa cập nhật tên"}
                      </p>
                      <span className={`text-[8.5px] px-1.5 py-0.2 rounded-md border ${TIER_BADGES[tier] || TIER_BADGES.Member}`}>
                        {tier}
                      </span>
                      {isOnline && (
                        <span className="text-[8px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-md border border-emerald-300 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> ONLINE
                        </span>
                      )}
                      {u.is_locked && (
                        <span className="text-[8px] bg-red-100 text-red-800 font-bold px-1.5 py-0.2 rounded-md border border-red-200">
                          ĐÃ KHÓA
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[10.5px] text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3 text-gray-400" /> {u.email || "—"}
                      </span>
                      {u.phone && (
                        <span className="flex items-center gap-1 font-mono text-[10px]">
                          <Phone className="w-3 h-3 text-gray-400" /> {u.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Section: Balance & Quick Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100 shrink-0">
                  <div className="text-left sm:text-right min-w-0 max-w-[140px] sm:max-w-[180px]">
                    <p className="text-[8.5px] text-gray-400 font-medium">Số dư khả dụng</p>
                    <BalanceAmount
                      value={userBal}
                      loading={loading}
                      className="text-[13px] font-black text-[#948154] text-left sm:text-right"
                    />
                  </div>

                  {/* Actions Buttons */}
                  <div className="flex items-center gap-1.5">
                    {/* Quick Chat with Member */}
                    {onNavigateToChat && (
                      <button
                        onClick={() => onNavigateToChat(u.id)}
                        className="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 border border-blue-200 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                        title="Mở hội thoại CSKH với hội viên này"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    )}

                    {/* Quick View Transactions */}
                    {onNavigateToTransactions && (
                      <button
                        onClick={() => onNavigateToTransactions(u.full_name || u.email || u.id)}
                        className="w-8 h-8 rounded-xl bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-700 border border-amber-200 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                        title="Xem lịch sử Nạp/Rút của hội viên này"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* View Detail & RBAC */}
                    <button
                      onClick={() => setDetailUser({ ...u, balance: userBal })}
                      className="px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-[#948154] hover:text-white text-gray-700 text-[11px] font-bold transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                      title="Xem chi tiết & Phân quyền"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Chi tiết
                    </button>

                    {/* Adjust Wallet */}
                    <button
                      onClick={() => setAdjustWalletUser({ ...u, balance: userBal })}
                      className="w-8 h-8 rounded-xl bg-[#948154]/10 hover:bg-[#948154]/20 text-[#948154] flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                      title="Điều chỉnh Ví"
                    >
                      <Wallet className="w-4 h-4" />
                    </button>

                    {/* Quick Lock / Unlock */}
                    <button
                      onClick={() => handleToggleLock(u)}
                      disabled={togglingLockId === u.id}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shadow-2xs disabled:opacity-60 disabled:cursor-wait cursor-pointer ${
                        u.is_locked
                          ? "bg-red-100 hover:bg-red-200 text-red-700"
                          : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                      }`}
                      title={u.is_locked ? "Mở khóa tài khoản" : "Tạm khóa tài khoản"}
                    >
                      {togglingLockId === u.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : u.is_locked ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Unlock className="w-4 h-4" />
                      )}
                    </button>

                    {/* Super Admin: Delete User */}
                    {isSuperAdmin && (
                      <button
                        onClick={() => setDeletingUser(u)}
                        className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-600 hover:text-white text-red-500 border border-red-200 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                        title="Xóa vĩnh viễn người dùng (Super Admin)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADJUST WALLET MODAL */}
      <AdminWalletModal
        user={adjustWalletUser}
        open={!!adjustWalletUser}
        onClose={() => setAdjustWalletUser(null)}
        onDone={() => fetchUsers(false)}
      />

      {/* USER DETAIL & RBAC MODAL */}
      <UserDetailModal
        user={detailUser}
        open={!!detailUser}
        onClose={() => setDetailUser(null)}
        onRefresh={() => fetchUsers(false)}
      />

      {/* SUPER ADMIN DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deletingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isDeleting && setDeletingUser(null)}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[400px] bg-white rounded-3xl overflow-hidden shadow-2xl p-5 space-y-4 border border-red-100"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <button
                  onClick={() => !isDeleting && setDeletingUser(null)}
                  className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <h3 className="text-[14px] font-bold text-black">Xác nhận xóa tài khoản người dùng</h3>
                <p className="text-[12px] text-gray-500 mt-1">
                  Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản{" "}
                  <strong className="text-black font-bold">
                    {deletingUser.full_name || deletingUser.email || deletingUser.id}
                  </strong>{" "}
                  khỏi toàn bộ hệ thống?
                </p>
              </div>

              <div className="p-3 bg-red-50 rounded-2xl border border-red-100 text-[11px] text-red-700 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Thao tác này không thể hoàn tác:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[10.5px] text-red-600">
                  <li>Xóa hồ sơ hội viên trên Supabase Database</li>
                  <li>Xóa tài khoản khỏi Firebase Realtime Database</li>
                  <li>Xóa tài khoản ngân hàng và số dư liên quan</li>
                </ul>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setDeletingUser(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[12px] font-bold transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Đang xóa...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" /> Xóa vĩnh viễn
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
