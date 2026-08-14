import React, { useState, useEffect, useRef } from "react";
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
  ExternalLink
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { listSupabaseUsers } from "@/lib/supabaseDb";
import AdminWalletModal from "@/components/admin/AdminWalletModal";
import UserDetailModal from "@/components/admin/UserDetailModal";
import { toast } from "sonner";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

const TIER_BADGES = {
  Member: "bg-gray-100 text-gray-700 border-gray-200",
  Gold: "bg-amber-100 text-amber-800 border-amber-300 font-bold",
  Platinum: "bg-slate-200 text-slate-800 border-slate-300 font-bold",
  Diamond: "bg-blue-100 text-blue-900 border-blue-300 font-black",
};

export default function UsersTab() {
  const [users, setUsers] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Selected User Modals
  const [adjustWalletUser, setAdjustWalletUser] = useState(null);
  const [detailUser, setDetailUser] = useState(null);

  const rtdbUsersRef = useRef([]);

  const fetchUsers = () => {
    setLoading(true);
    Promise.all([
      base44.entities.User.list().catch(() => []),
      listSupabaseUsers().catch(() => []),
      base44.entities.WalletTransaction.list("-created_date", 1000).catch(() => []),
    ]).then(([localUserList, supaUserList, wts]) => {
      const mergedMap = {};
      (localUserList || []).forEach(u => { if (u && (u.id || u.email)) mergedMap[u.id || u.email] = u; });
      (supaUserList || []).forEach(su => {
        if (su && (su.id || su.email)) {
          mergedMap[su.id || su.email] = { ...(mergedMap[su.id || su.email] || {}), ...su };
        }
      });
      (rtdbUsersRef.current || []).forEach(ru => {
        if (ru && (ru.id || ru.email)) {
          mergedMap[ru.id || ru.email] = { ...(mergedMap[ru.id || ru.email] || {}), ...ru };
        }
      });

      setUsers(Object.values(mergedMap));

      const balMap = {};
      wts.forEach((t) => {
        const uid = t.user_id || t.created_by_id;
        if (!uid) return;
        balMap[uid] = (balMap[uid] || 0) + (t.type === "deposit" ? t.amount : -t.amount);
      });
      setBalances(balMap);
      setLoading(false);
    });
  };

  const [onlineUsers, setOnlineUsers] = useState({});

  useEffect(() => {
    fetchUsers();

    // Subscribe to Firebase Realtime Database for instant user registration & presence sync across all devices
    let unsubRTDB;
    import('@/lib/rtdbSync').then(({ subscribeAllUsersFromRTDB }) => {
      unsubRTDB = subscribeAllUsersFromRTDB((rtdbUsers, onlineMap) => {
        if (Array.isArray(rtdbUsers)) {
          rtdbUsersRef.current = rtdbUsers;
        }
        setOnlineUsers(onlineMap || {});
        if (Array.isArray(rtdbUsers) && rtdbUsers.length > 0) {
          setUsers((prev) => {
            const mergedMap = {};
            (prev || []).forEach(u => { if (u && (u.id || u.email)) mergedMap[u.id || u.email] = u; });
            rtdbUsers.forEach(ru => {
              if (ru && (ru.id || ru.email)) {
                mergedMap[ru.id || ru.email] = { ...(mergedMap[ru.id || ru.email] || {}), ...ru };
              }
            });
            return Object.values(mergedMap);
          });
        }
      });
    }).catch(() => null);

    const handleBalUpdate = () => {
      fetchUsers();
    };
    window.addEventListener("vinclub:balance_updated", handleBalUpdate);
    return () => {
      if (typeof unsubRTDB === "function") unsubRTDB();
      window.removeEventListener("vinclub:balance_updated", handleBalUpdate);
    };
  }, []);

  const handleToggleLock = async (u) => {
    const nextLocked = !u.is_locked;
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
      fetchUsers();
    } catch (e) {
      toast.error("Không thể thay đổi trạng thái tài khoản.");
    }
  };

  // Filter logic
  const filteredUsers = users.filter((u) => {
    const query = searchQuery.toLowerCase().trim();
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

  // Header stats
  const totalUsers = users.length;
  const lockedUsersCount = users.filter((u) => u.is_locked).length;
  const totalSystemBalance = Object.values(balances).reduce((a, b) => a + b, 0);

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
          <p className="text-[16px] font-black text-[#948154] truncate">{fmt(totalSystemBalance)} VNĐ</p>
          <p className="text-[9.5px] text-gray-400 font-medium">Đang tích lũy trên ví</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-emerald-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-[10px] font-bold">Thành viên Hoạt động</span>
            <Shield className="w-4 h-4" />
          </div>
          <p className="text-[18px] font-black text-emerald-700">{totalUsers - lockedUsersCount}</p>
          <p className="text-[9.5px] text-gray-400 font-medium">Đang giao dịch bình thường</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-red-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-red-600 mb-1">
            <span className="text-[10px] font-bold">Tài khoản Tạm khóa</span>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <p className="text-[18px] font-black text-red-700">{lockedUsersCount}</p>
          <p className="text-[9.5px] text-gray-400 font-medium">Đang bị giới hạn nạp/rút</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên, email, SĐT, ID..."
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[11.5px] focus:outline-none focus:border-[#948154]"
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

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
            {/* Tier Filter Dropdown */}
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[11px] font-bold text-gray-700 focus:outline-none"
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
              className="px-2.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[11px] font-bold text-gray-700 focus:outline-none"
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
            const userBal = u.balance !== undefined ? Number(u.balance) : (balances[u.id] || 0);
            const tier = u.membership_tier || "Member";
            const isAdmin = u.role === "admin";

            return (
              <div
                key={u.id}
                className={`bg-white rounded-2xl p-3.5 border transition-all shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
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
                      {(() => {
                        const isOnline = !!onlineUsers[u.id] || Object.values(onlineUsers).some(o => o.email && o.email === u.email);
                        return isOnline ? (
                          <span className="text-[8px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.2 rounded-md border border-emerald-300 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> ONLINE
                          </span>
                        ) : null;
                      })()}
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
                  <div className="text-left sm:text-right">
                    <p className="text-[8.5px] text-gray-400 font-medium">Số dư khả dụng</p>
                    <p className="text-[13px] font-black text-[#948154]">{fmt(userBal)} VNĐ</p>
                  </div>

                  {/* Actions Buttons */}
                  <div className="flex items-center gap-1.5">
                    {/* View Detail & RBAC */}
                    <button
                      onClick={() => setDetailUser(u)}
                      className="px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-[#948154] hover:text-white text-gray-700 text-[11px] font-bold transition-all flex items-center gap-1 shadow-2xs"
                      title="Xem chi tiết & Phân quyền"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Chi tiết
                    </button>

                    {/* Adjust Wallet */}
                    <button
                      onClick={() => setAdjustWalletUser(u)}
                      className="w-8 h-8 rounded-xl bg-[#948154]/10 hover:bg-[#948154]/20 text-[#948154] flex items-center justify-center transition-all shadow-2xs"
                      title="Điều chỉnh Ví"
                    >
                      <Wallet className="w-4 h-4" />
                    </button>

                    {/* Quick Lock / Unlock */}
                    <button
                      onClick={() => handleToggleLock(u)}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-2xs ${
                        u.is_locked
                          ? "bg-red-100 hover:bg-red-200 text-red-700"
                          : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                      }`}
                      title={u.is_locked ? "Mở khóa tài khoản" : "Tạm khóa tài khoản"}
                    >
                      {u.is_locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </button>
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
        onDone={fetchUsers}
      />

      {/* USER DETAIL & RBAC MODAL */}
      <UserDetailModal
        user={detailUser}
        open={!!detailUser}
        onClose={() => setDetailUser(null)}
        onRefresh={fetchUsers}
      />
    </div>
  );
}
