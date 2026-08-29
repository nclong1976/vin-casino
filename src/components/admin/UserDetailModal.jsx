import React, { useState, useEffect } from "react";
import {
  X,
  User,
  Shield,
  ShieldAlert,
  Wallet,
  Building2,
  FileCheck,
  Crown,
  Lock,
  Unlock,
  Check,
  Trash2,
  Calendar,
  Phone,
  Mail,
  KeyRound,
  Tag,
  Smartphone,
  CreditCard,
  Edit3,
  Percent
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { setAbsoluteUserBalanceAndDeposit } from "@/lib/balanceSync";
import { normalizeWalletTransaction } from "@/lib/transactionHistory";
import { deleteSupabaseUser, upsertSupabaseUser } from "@/lib/supabaseDb";
import { deleteUserFromRTDB, pushUserToRTDB } from "@/lib/rtdbSync";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdminUser } from "@/lib/isAdminUser";
import { getCardTierInfo } from "@/lib/membershipUtils";
import { toast } from "sonner";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

const TIER_COLORS = {
  Member: "bg-gray-100 text-gray-700 border-gray-200",
  Gold: "bg-amber-100 text-amber-800 border-amber-300",
  Platinum: "bg-slate-200 text-slate-800 border-slate-300",
  Diamond: "bg-blue-100 text-blue-900 border-blue-300",
};

export default function UserDetailModal({ user, open, onClose, onRefresh }) {
  const { user: currentAdmin } = useAuth();
  const isSuperAdmin = isSuperAdminUser(currentAdmin);

  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "registration" | "banks" | "wallet" | "contracts"
  const [bankAccounts, setBankAccounts] = useState([]);
  const [walletTxs, setWalletTxs] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Editable user fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [idCardNumber, setIdCardNumber] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [role, setRole] = useState("user");
  const [tier, setTier] = useState("Member");
  const [vipLevel, setVipLevel] = useState("VIP 0");
  const [balance, setBalance] = useState(0);
  const [totalDeposited, setTotalDeposited] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [dailyInterestEnabled, setDailyInterestEnabled] = useState(false);

  // Editable Bank Info
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      setFullName(user.full_name || user.name || "");
      setPhone(user.phone || "");
      setIdCardNumber(user.id_card_number || "");
      setIdentifier(user.identifier || user.username || user.phone || user.email || "");
      setReferralCode(user.referral_code || "");
      setRole(user.role || "user");
      setTier(user.membership_tier || "Member");
      setVipLevel(user.vip_level || "VIP 0");
      setBalance(Number(user.balance || 0));
      setTotalDeposited(Number(user.total_deposited || 0));
      setIsLocked(!!user.is_locked);
      setDailyInterestEnabled(!!user.daily_interest_enabled);
      setBankName(user.bank_name || "");
      setAccountNumber(user.account_number || "");
      setAccountHolder(user.account_holder || user.full_name || user.name || "");
      setActiveTab("overview");

      setLoading(true);
      const fetchModalData = () => {
        Promise.all([
          base44.entities.BankAccount.filter({
            $or: [
              { user_id: user.id },
              { created_by_id: user.id },
              { user_email: user.email },
            ],
          }).catch(() => []),
          base44.entities.WalletTransaction.filter({ user_id: user.id }, "-created_date", 100).catch(() => []),
          base44.entities.Transaction.filter({ user_id: user.id }, "-created_date", 100).catch(() => []),
        ])
          .then(([banks, txs, ctrs]) => {
            let finalBanks = banks;
            if (finalBanks.length === 0 && Array.isArray(user.bank_accounts) && user.bank_accounts.length > 0) {
              finalBanks = user.bank_accounts;
            } else if (finalBanks.length === 0 && user.bank_name && user.account_number) {
              finalBanks = [
                {
                  id: "user_bank_" + user.id,
                  bank_name: user.bank_name,
                  bank_code: user.bank_code || "BK",
                  account_number: user.account_number,
                  account_holder: user.account_holder || user.full_name || user.name,
                  is_default: true,
                },
              ];
            }
            setBankAccounts(finalBanks);
            setWalletTxs(txs);
            setContracts(ctrs);

            // Ground truth check for balance from transactions
            const depSum = (txs || [])
              .filter((t) => t.type === "deposit" && t.status === "completed")
              .reduce((s, t) => s + (Number(t.amount) || 0), 0);
            const withSum = (txs || [])
              .filter((t) => t.type === "withdraw" && t.status === "completed")
              .reduce((s, t) => s + (Number(t.amount) || 0), 0);
            const netTx = Math.max(0, depSum - withSum);
            if (netTx > Number(user.balance || 0)) {
              setBalance(netTx);
            }
            if (depSum > Number(user.total_deposited || 0)) {
              setTotalDeposited(depSum);
            }
          })
          .finally(() => setLoading(false));
      };

      fetchModalData();

      const handleBankSync = () => fetchModalData();
      window.addEventListener("vinclub:bank_updated", handleBankSync);
      const unsub = base44.entities.BankAccount.subscribe(fetchModalData);

      return () => {
        window.removeEventListener("vinclub:bank_updated", handleBankSync);
        if (typeof unsub === "function") unsub();
      };
    }
  }, [open, user]);

  if (!open || !user) return null;

  const totalInvested = contracts.reduce((acc, c) => acc + (c.amount || 0), 0);

  const handleSaveUser = async () => {
    setSaving(true);
    try {
      // BẢO MẬT ĐỒNG BỘ SỐ DƯ: trước đây có TỚI 3 đường ghi balance/
      // total_deposited chạy gần như song song, không theo thứ tự cố định
      // (User.update() ghi upsert thường, setAbsoluteUserBalanceAndDeposit()
      // ghi qua RPC có version nhưng KHÔNG được await, rồi upsertSupabaseUser()
      // ghi đè thêm 1 lần nữa) - 3 đường ghi cùng 1 cột theo thứ tự không xác
      // định khiến giá trị cuối cùng trên Postgres có thể KHÔNG khớp với số
      // admin vừa nhập, và không đẩy đúng balance_version để các thiết bị
      // khác của người dùng nhận diện đây là bản cập nhật mới hơn - đúng lớp
      // lỗi đã gây ra sự cố số dư không đồng bộ đúng vừa xử lý.
      //
      // Giờ CHỈ 1 đường ghi số dư DUY NHẤT: setAbsoluteUserBalanceAndDeposit()
      // qua RPC nguyên tử (tăng đúng balance_version) - chạy XONG hẳn trước,
      // rồi mới cập nhật các field hồ sơ KHÁC (không đụng lại balance/
      // total_deposited) qua User.update() để tránh ghi đè chồng chéo.
      await setAbsoluteUserBalanceAndDeposit(user.id, Number(balance || 0), Number(totalDeposited || 0));

      const profilePayload = {
        full_name: fullName,
        name: fullName,
        phone: phone,
        id_card_number: idCardNumber,
        identifier: identifier,
        referral_code: referralCode,
        role: role,
        membership_tier: tier,
        vip_level: vipLevel,
        is_locked: isLocked,
        bank_name: bankName,
        account_number: accountNumber,
        account_holder: accountHolder,
      };
      await base44.entities.User.update(user.id, profilePayload).catch(() => {});

      // Create Audit Log
      await base44.entities.AuditLog.create({
        action: "UPDATE_USER_FULL_PROFILE",
        user_id: user.id,
        user_name: fullName || user.email,
        notes: `Admin cập nhật: Vai trò: ${role.toUpperCase()}, Số dư: ${fmt(balance)} VNĐ, Hạng: ${tier}, SĐT: ${phone}`,
        created_date: new Date().toISOString(),
      }).catch(() => {});

      toast.success("Đã lưu và đồng bộ toàn bộ thông tin hội viên lên hệ thống!");
      if (onRefresh) onRefresh();
      onClose();
    } catch (e) {
      toast.error("Không thể lưu thông tin hội viên.");
    } finally {
      setSaving(false);
    }
  };

  const toggleLockUser = async () => {
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);
    try {
      const updated = { ...user, is_locked: nextLocked };
      await Promise.allSettled([
        base44.entities.User.update(user.id, { is_locked: nextLocked }),
        upsertSupabaseUser(updated),
        pushUserToRTDB(updated),
      ]);

      await base44.entities.AuditLog.create({
        action: nextLocked ? "LOCK_USER" : "UNLOCK_USER",
        user_id: user.id,
        user_name: user.full_name || user.email,
        notes: nextLocked ? "Tạm khóa tài khoản do phát hiện nghi vấn" : "Mở khóa tài khoản hoạt động bình thường",
        created_date: new Date().toISOString(),
      });

      toast.success(nextLocked ? "Đã tạm khóa tài khoản!" : "Đã mở khóa tài khoản thành công!");
      if (onRefresh) onRefresh();
    } catch (e) {
      toast.error("Không thể thay đổi trạng thái khóa tài khoản.");
    }
  };

  const toggleDailyInterest = async () => {
    const next = !dailyInterestEnabled;
    setDailyInterestEnabled(next);
    try {
      const updated = { ...user, daily_interest_enabled: next };
      await Promise.allSettled([
        base44.entities.User.update(user.id, { daily_interest_enabled: next }),
        upsertSupabaseUser(updated),
        pushUserToRTDB(updated),
      ]);

      await base44.entities.AuditLog.create({
        action: next ? "ENABLE_DAILY_INTEREST" : "DISABLE_DAILY_INTEREST",
        user_id: user.id,
        user_name: user.full_name || user.email,
        notes: next
          ? `Bật cộng lãi hàng ngày theo cấp VIP (${tier} - ${getCardTierInfo(tier).dailyRateLabel})`
          : "Tắt cộng lãi hàng ngày theo cấp VIP",
        created_date: new Date().toISOString(),
      });

      toast.success(next ? "Đã bật cộng lãi hàng ngày theo cấp VIP!" : "Đã tắt cộng lãi hàng ngày!");
      if (onRefresh) onRefresh();
    } catch (e) {
      setDailyInterestEnabled(!next);
      toast.error("Không thể thay đổi trạng thái cộng lãi hàng ngày.");
    }
  };

  const handleDeleteThisUser = async () => {
    if (!isSuperAdmin) {
      toast.error("Chỉ tài khoản Super Admin mới có quyền xóa người dùng!");
      return;
    }
    const confirmName = fullName || user.email || user.id;
    const ok = window.confirm(
      `⚠️ CẢNH BÁO QUẢN TRỊ VIÊN:\n\nBạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản "${confirmName}" khỏi hệ thống không?\n\n- Tất cả dữ liệu đăng nhập, số dư, tài khoản ngân hàng sẽ bị xóa hoàn toàn.\n- Thao tác này không thể hoàn tác!`
    );
    if (!ok) return;

    setSaving(true);
    try {
      await Promise.allSettled([
        deleteSupabaseUser(user.id),
        deleteUserFromRTDB(user.id),
        base44.entities.User.delete(user.id),
      ]);

      const rawReg = localStorage.getItem("base44_registered_users");
      if (rawReg) {
        try {
          const regUsers = JSON.parse(rawReg).filter((x) => x.id !== user.id && x.email !== user.email);
          localStorage.setItem("base44_registered_users", JSON.stringify(regUsers));
        } catch (e) {}
      }

      await base44.entities.AuditLog.create({
        action: "DELETE_USER",
        user_id: user.id,
        user_name: confirmName,
        notes: `Super Admin đã xóa vĩnh viễn tài khoản ${confirmName} khỏi hệ thống`,
        created_date: new Date().toISOString(),
      });

      toast.success(`Đã xóa vĩnh viễn tài khoản ${confirmName}!`);
      if (onRefresh) onRefresh();
      onClose();
    } catch (e) {
      toast.error("Không thể xóa tài khoản. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs"
      >
        <motion.div
          initial={{ scale: 0.95, y: 15 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 15 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[520px] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#17130e] via-[#2a2216] to-[#17130e] text-white p-4 flex items-center justify-between border-b border-[#948154]/30 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#948154] to-[#6b5e3e] border border-[#948154]/50 text-white font-black text-[16px] flex items-center justify-center shadow-md">
                {(fullName || user.email || "U").charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-[14px] font-bold text-[#e8c87a] truncate max-w-[200px]">
                    {fullName || "Hội viên VinClub"}
                  </h2>
                  <span className={`text-[8.5px] font-black px-2 py-0.2 rounded-full border ${TIER_COLORS[tier] || TIER_COLORS.Member}`}>
                    {tier}
                  </span>
                </div>
                <p className="text-[10px] text-gray-300 font-mono">ID: {user.id?.slice(-12) || "N/A"}</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-100 bg-gray-50/50 p-1.5 gap-1 shrink-0 overflow-x-auto">
            {[
              { id: "overview", label: "Tổng quan & Sửa", icon: User },
              { id: "registration", label: "Hồ sơ Đăng ký", icon: KeyRound },
              { id: "banks", label: `Ngân hàng (${bankAccounts.length})`, icon: Building2 },
              { id: "wallet", label: `Lịch sử Ví (${walletTxs.length})`, icon: Wallet },
              { id: "contracts", label: `Hợp đồng (${contracts.length})`, icon: FileCheck },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`py-2 px-2.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === t.id
                    ? "bg-[#948154] text-white shadow-xs"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Modal Content */}
          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            {/* TAB 1: OVERVIEW & EDIT */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* Balance & Investment Summary Cards */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-amber-500/10 rounded-2xl p-3 border border-amber-500/20">
                    <p className="text-[9.5px] text-amber-800 font-bold">Số dư ví khả dụng</p>
                    <p className="text-[17px] font-black text-[#948154]">{fmt(balance)} VNĐ</p>
                  </div>
                  <div className="bg-blue-500/10 rounded-2xl p-3 border border-blue-500/20">
                    <p className="text-[9.5px] text-blue-800 font-bold">Tổng tài sản đầu tư</p>
                    <p className="text-[17px] font-black text-blue-900">{fmt(totalInvested)} VNĐ</p>
                  </div>
                </div>

                {/* Account Status Lock Banner */}
                <div
                  className={`p-3 rounded-2xl border flex items-center justify-between ${
                    isLocked ? "bg-red-50 border-red-200 text-red-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isLocked ? (
                      <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
                    ) : (
                      <Shield className="w-5 h-5 text-emerald-600 shrink-0" />
                    )}
                    <div>
                      <p className="text-[11px] font-bold">
                        {isLocked ? "Tài khoản đang bị TẠM KHÓA" : "Tài khoản đang HOẠT ĐỘNG"}
                      </p>
                      <p className="text-[9.5px] text-gray-500">
                        {isLocked ? "Người dùng không thể nạp/rút tiền hoặc đầu tư" : "Cho phép truy cập đầy đủ tính năng tiêu chuẩn"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleLockUser}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold shadow-2xs flex items-center gap-1 cursor-pointer ${
                      isLocked ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"
                    }`}
                  >
                    {isLocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {isLocked ? "Mở khóa" : "Tạm khóa"}
                  </button>
                </div>

                {/* Daily Interest by VIP Tier Toggle - admin tự tay bật/tắt từng tài khoản */}
                <div
                  className={`p-3 rounded-2xl border flex items-center justify-between ${
                    dailyInterestEnabled ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-gray-50 border-gray-200 text-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Percent className={`w-5 h-5 shrink-0 ${dailyInterestEnabled ? "text-emerald-600" : "text-gray-400"}`} />
                    <div>
                      <p className="text-[11px] font-bold">
                        Cộng lãi hàng ngày theo cấp VIP: {dailyInterestEnabled ? "ĐANG BẬT" : "ĐANG TẮT"}
                      </p>
                      <p className="text-[9.5px] text-gray-500">
                        Tỷ lệ theo hạng {tier}: {getCardTierInfo(tier).dailyRateLabel}
                        {user.last_interest_credited_date && (
                          <> · Lần cộng gần nhất: {new Date(user.last_interest_credited_date).toLocaleDateString("vi-VN")}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleDailyInterest}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold shadow-2xs flex items-center gap-1 cursor-pointer shrink-0 ${
                      dailyInterestEnabled ? "bg-gray-600 hover:bg-gray-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    }`}
                  >
                    {dailyInterestEnabled ? "Tắt" : "Bật"}
                  </button>
                </div>

                {/* Form Fields: Quick Edit */}
                <div className="space-y-3 bg-gray-50 rounded-2xl p-3.5 border border-gray-200/80">
                  <h3 className="text-[12px] font-extrabold text-black flex items-center gap-1">
                    <Edit3 className="w-3.5 h-3.5 text-[#948154]" /> Hiệu chỉnh Thông tin, Số dư & Quyền
                  </h3>

                  <div>
                    <label className="text-[10px] font-bold text-gray-600 block mb-1">Họ và tên hội viên</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-[12px] font-semibold focus:outline-none focus:border-[#948154]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-600 block mb-1">Số điện thoại</label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0901234567"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-[12px] font-semibold focus:outline-none focus:border-[#948154]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-600 block mb-1">Email đăng ký</label>
                      <input
                        type="text"
                        value={user.email}
                        disabled
                        className="w-full px-3 py-2 rounded-xl bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-500 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-600 block mb-1">Số CCCD/Hộ chiếu (đầy đủ - chỉ Admin xem được)</label>
                    <input
                      type="text"
                      value={idCardNumber}
                      onChange={(e) => setIdCardNumber(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                      placeholder="Chưa cập nhật"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-[12px] font-mono font-semibold focus:outline-none focus:border-[#948154]"
                    />
                  </div>

                  {/* Financial Balance Modification */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-[#948154] block mb-1">Số dư khả dụng (VNĐ)</label>
                      <input
                        type="number"
                        value={balance}
                        onChange={(e) => setBalance(Number(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#948154]/40 text-[12px] font-bold text-[#948154] focus:outline-none focus:border-[#948154]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-600 block mb-1">Tổng tiền đã nạp (VNĐ)</label>
                      <input
                        type="number"
                        value={totalDeposited}
                        onChange={(e) => setTotalDeposited(Number(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-[12px] font-bold text-gray-800 focus:outline-none focus:border-[#948154]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {/* Role Access */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-600 block mb-1">Vai trò hệ thống</label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-[11.5px] font-bold focus:outline-none focus:border-[#948154]"
                      >
                        <option value="user">User (Thành viên)</option>
                        <option value="admin">Admin (Quản trị viên)</option>
                      </select>
                    </div>

                    {/* Tier Level */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-600 block mb-1 flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-500" /> Hạng thành viên
                      </label>
                      <select
                        value={tier}
                        onChange={(e) => setTier(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-[11.5px] font-bold focus:outline-none focus:border-[#948154]"
                      >
                        <option value="Member">Member (VIP 0)</option>
                        <option value="Gold">Gold (VIP 1)</option>
                        <option value="Platinum">Platinum (VIP 2)</option>
                        <option value="Diamond">Diamond (VIP 3)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveUser}
                  disabled={saving}
                  className="w-full py-3 rounded-2xl bg-[#948154] text-white text-[12px] font-bold shadow-md hover:bg-[#837045] active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" /> Lưu & Đồng bộ Toàn diện
                </button>

                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={handleDeleteThisUser}
                    disabled={saving}
                    className="w-full py-2.5 rounded-2xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa vĩnh viễn tài khoản hội viên này (Super Admin)
                  </button>
                )}
              </div>
            )}

            {/* TAB 2: FULL REGISTRATION DOSSIER */}
            {activeTab === "registration" && (
              <div className="space-y-3">
                <h3 className="text-[12px] font-bold text-black flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[#948154]" /> Toàn bộ Thông tin Đăng ký & Định danh
                </h3>

                <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-200 space-y-3 text-[11.5px]">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <span className="text-gray-500 flex items-center gap-1"><User className="w-3.5 h-3.5" /> Họ và tên</span>
                    <span className="font-bold text-black">{fullName || user.full_name || user.name || "—"}</span>
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <span className="text-gray-500 flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Email đăng nhập</span>
                    <span className="font-mono font-semibold text-black">{user.email || "—"}</span>
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <span className="text-gray-500 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Số điện thoại</span>
                    <span className="font-mono font-semibold text-black">{user.phone || phone || "Chưa cập nhật"}</span>
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <span className="text-gray-500 flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> Số CCCD/Hộ chiếu</span>
                    <span className="font-mono font-semibold text-black">{user.id_card_number || idCardNumber || "Chưa cập nhật"}</span>
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <span className="text-gray-500 flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Tên định danh (Identifier)</span>
                    <span className="font-mono font-semibold text-black">{user.identifier || identifier || user.email}</span>
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <span className="text-gray-500 flex items-center gap-1"><Crown className="w-3.5 h-3.5 text-amber-500" /> Mã giới thiệu</span>
                    <span className="font-mono font-bold text-[#948154]">{user.referral_code || referralCode || "Không có"}</span>
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <span className="text-gray-500 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Ngày đăng ký</span>
                    <span className="font-semibold text-gray-700">
                      {user.created_at || user.created_date ? new Date(user.created_at || user.created_date).toLocaleString("vi-VN") : "Hệ thống ban đầu"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <span className="text-gray-500 flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" /> Hoạt động / Đồng bộ gần nhất</span>
                    <span className="font-semibold text-emerald-700">
                      {user.last_active || user.last_synced_device_at ? new Date(user.last_active || user.last_synced_device_at).toLocaleString("vi-VN") : "Vừa xong"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> Mã định danh Database (ID)</span>
                    <span className="font-mono text-[10px] text-gray-600">{user.id}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: LINKED BANK ACCOUNTS */}
            {activeTab === "banks" && (
              <div className="space-y-3">
                <h3 className="text-[12px] font-bold text-black flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#948154]" /> Tài khoản Ngân hàng Đã liên kết ({bankAccounts.length})
                </h3>

                {loading ? (
                  <p className="text-[11px] text-gray-400 text-center py-4">Đang tải ngân hàng...</p>
                ) : bankAccounts.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-[11px]">
                    Người dùng chưa liên kết tài khoản ngân hàng nào.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bankAccounts.map((b) => (
                      <div key={b.id} className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs space-y-1 text-[11px]">
                        <div className="flex items-center justify-between font-bold text-[#948154]">
                          <span>{b.bank_name}</span>
                          {b.is_default && (
                            <span className="text-[8.5px] bg-amber-100 text-amber-800 px-2 py-0.2 rounded-full font-extrabold">
                              Mặc định
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-gray-700">
                          <span className="font-mono font-bold text-[12px]">{b.account_number}</span>
                          <span className="font-semibold uppercase">{b.account_holder}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: WALLET TRANSACTIONS */}
            {activeTab === "wallet" && (
              <div className="space-y-3">
                <h3 className="text-[12px] font-bold text-black flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-[#948154]" /> Lịch sử Nạp & Rút Tiền ({walletTxs.length})
                </h3>

                {loading ? (
                  <p className="text-[11px] text-gray-400 text-center py-4">Đang tải lịch sử ví...</p>
                ) : walletTxs.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-[11px]">
                    Chưa có giao dịch nạp hoặc rút tiền nào.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {walletTxs.map((tx) => {
                      const n = normalizeWalletTransaction(tx);
                      const isIncoming = n.kind === "deposit" || n.kind === "bonus";
                      return (
                        <div key={tx.id} className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs space-y-1 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] text-gray-400">{n.code?.slice?.(-8) || n.code}</span>
                            <span
                              className={`px-2 py-0.2 rounded-full text-[8.5px] font-bold ${
                                n.status === "success"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : n.status === "failed"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {n.statusLabel}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-800">{n.kindLabel}</span>
                            <span
                              className={`font-black text-[13px] ${
                                n.status !== "success" ? "text-gray-400" : isIncoming ? "text-emerald-600" : "text-red-600"
                              }`}
                            >
                              {n.status === "success" ? (isIncoming ? "+" : "-") : ""}
                              {fmt(n.amount)} VNĐ
                            </span>
                          </div>
                          {n.description && (
                            <p className="text-[9.5px] text-gray-500 truncate">{n.description}</p>
                          )}
                          <p className="text-[9.5px] text-gray-400">
                            {n.isoTime ? new Date(n.isoTime).toLocaleString("vi-VN") : "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: CONTRACTS */}
            {activeTab === "contracts" && (
              <div className="space-y-3">
                <h3 className="text-[12px] font-bold text-black flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-[#948154]" /> Hợp đồng Đầu tư ({contracts.length})
                </h3>

                {loading ? (
                  <p className="text-[11px] text-gray-400 text-center py-4">Đang tải hợp đồng...</p>
                ) : contracts.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-[11px]">
                    Chưa có hợp đồng đầu tư nào.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {contracts.map((c) => (
                      <div key={c.id} className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs space-y-1 text-[11px]">
                        <div className="flex items-center justify-between font-bold text-black">
                          <span>{c.project_title || "Dự án đầu tư"}</span>
                          <span className="text-[#948154] font-black">{fmt(c.amount)} VNĐ</span>
                        </div>
                        <div className="flex items-center justify-between text-[9.5px] text-gray-500">
                          <span>Lợi nhuận: +{fmt(c.profit || 0)} VNĐ</span>
                          <span>{c.created_date ? new Date(c.created_date).toLocaleString("vi-VN") : "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
