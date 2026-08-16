import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Wallet, Landmark, PenTool, ArrowRight, LogOut, Shield, Bell, HelpCircle, LayoutDashboard, CreditCard, Sparkles, FileText, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { getCardTierInfo } from "@/lib/membershipUtils";
import { toast } from "sonner";
import ProfileHeader from "@/components/profile/ProfileHeader";
import BottomNav from "@/components/BottomNav";
import WalletCard from "@/components/profile/WalletCard";
import QuickStats from "@/components/profile/QuickStats";
import BankAccountList from "@/components/profile/BankAccountList";
import BankAccountModal from "@/components/profile/BankAccountModal";
import DepositModal from "@/components/profile/DepositModal";
import WithdrawModal from "@/components/profile/WithdrawModal";
import SecurityModal from "@/components/profile/SecurityModal";
import NotificationModal from "@/components/profile/NotificationModal";
import AppRulesModal from "@/components/profile/AppRulesModal";
import TransactionList from "@/components/profile/TransactionList";
import WalletTransactionList from "@/components/profile/WalletTransactionList";
import SignatureList from "@/components/profile/SignatureList";
import ProfitChart from "@/components/profile/ProfitChart";
import AccountSwitcherModal from "@/components/profile/AccountSwitcherModal";

// Mọi loại WalletTransaction từng ghi nhận trong app: "deposit" luôn là tiền
// VÀO (nạp thật, thắng casino, thưởng vòng quay, lãi VIP, đáo hạn dự án).
// "withdraw" (rút ví), "investment" (đầu tư dự án/chứng khoán) và
// "withdrawal" (đặt cược casino) đều là tiền RA. Trạng thái đã chốt tiền là
// "completed" (luồng cần Admin duyệt) HOẶC "approved" (luồng tự động tức
// thì như casino/lãi suất) - "pending"/"rejected"/"failed" thì chưa/không
// tính. Dùng chung 1 hàm để 2 chỗ tính (auto-heal + hiển thị) không lệch nhau.
const SETTLED_WALLET_STATUSES = new Set(["completed", "approved"]);
const OUTGOING_WALLET_TYPES = new Set(["withdraw", "investment", "withdrawal"]);

function computeWalletNet(walletTxs) {
  const depSum = (walletTxs || [])
    .filter((tx) => tx.type === "deposit" && SETTLED_WALLET_STATUSES.has(tx.status))
    .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
  const outSum = (walletTxs || [])
    .filter((tx) => OUTGOING_WALLET_TYPES.has(tx.type) && SETTLED_WALLET_STATUSES.has(tx.status))
    .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
  return { depSum, outSum, netCalculated: Math.max(0, depSum - outSum) };
}

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [txs, setTxs] = useState([]);
  const [walletTxs, setWalletTxs] = useState([]);
  const [sigs, setSigs] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("wallet");

  const [showBankModal, setShowBankModal] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);

  const fetchData = async () => {
    const me = user || (await base44.auth.me().catch(() => null));
    if (!me) {
      setLoading(false);
      return;
    }
    const [t, wt, s, b] = await Promise.all([
      base44.entities.Transaction.filter({ user_id: me.id }, "-created_date", 50).catch(() => []),
      base44.entities.WalletTransaction.filter(
        { $or: [{ user_id: me.id }, { created_by_id: me.id }] },
        "-created_date",
        50
      ).catch(() => []),
      base44.entities.Signature.filter({ user_id: me.id }, "-created_date", 20).catch(() => []),
      base44.entities.BankAccount.filter({
        $or: [
          { user_id: me.id },
          { created_by_id: me.id },
          { user_email: me.email }
        ]
      }, "-created_date", 50).catch(() => []),
    ]);

    let finalBanks = b;
    // Fallback 1: check user.bank_accounts array on user object
    if ((!finalBanks || finalBanks.length === 0) && Array.isArray(me.bank_accounts) && me.bank_accounts.length > 0) {
      finalBanks = me.bank_accounts;
    }
    // Fallback 2: check direct bank_name / account_number fields
    if ((!finalBanks || finalBanks.length === 0) && me.bank_name && me.account_number) {
      finalBanks = [{
        id: 'user_bank_' + me.id,
        bank_name: me.bank_name,
        bank_code: me.bank_code || 'BK',
        account_number: me.account_number,
        account_holder: me.account_holder || me.full_name || me.name,
        is_default: true
      }];
    }
    // Fallback 3: check localStorage entity store for any bank accounts matching me.id or me.email
    if (!finalBanks || finalBanks.length === 0) {
      try {
        const rawStore = localStorage.getItem("base44_entity_BankAccount");
        if (rawStore) {
          const parsed = JSON.parse(rawStore);
          if (Array.isArray(parsed)) {
            const matched = parsed.filter(item => 
              item.user_id === me.id || 
              item.created_by_id === me.id || 
              item.user_email === me.email ||
              !item.user_id
            );
            if (matched.length > 0) finalBanks = matched;
          }
        }
      } catch (e) {}
    }

    setTxs(t);
    setWalletTxs(wt);
    setSigs(s);
    setBanks(finalBanks || []);
    setLoading(false);

    // Auto-heal balance if ground-truth wallet history exceeds current cached
    // balance. Must account for EVERY type that moves money, not just bank
    // deposit/withdraw - otherwise this "heals" the balance right back up
    // after a real deduction (casino bet, project/stock investment) that
    // used type "investment"/"withdrawal" instead of "withdraw", handing the
    // user free money. See computeWalletNet() below for the shared rule.
    const { depSum, netCalculated } = computeWalletNet(wt);

    if (netCalculated > Number(me.balance || 0)) {
      import("@/lib/balanceSync").then(({ updateUserBalance }) => {
        updateUserBalance(me.id, netCalculated, depSum);
      });
    }
  };

  const location = useLocation();

  useEffect(() => {
    fetchData();

    // Auto-open deposit modal if redirected with deposit=true or action=deposit
    const params = new URLSearchParams(location.search);
    if (params.get("deposit") === "true" || params.get("action") === "deposit") {
      setShowDeposit(true);
    }

    const handleDataUpdate = () => {
      fetchData();
      if (refreshUser) refreshUser();
    };
    window.addEventListener("vinclub:balance_updated", handleDataUpdate);
    window.addEventListener("vinclub:bank_updated", handleDataUpdate);

    // Đăng ký realtime cho lịch sử giao dịch: khi Admin duyệt/từ chối một
    // lệnh rút, Firestore đẩy cập nhật về và gọi notifySubscribers() ở đây
    const unsubWalletTx = base44.entities.WalletTransaction.subscribe(() => fetchData());

    return () => {
      window.removeEventListener("vinclub:balance_updated", handleDataUpdate);
      window.removeEventListener("vinclub:bank_updated", handleDataUpdate);
      unsubWalletTx();
    };
  }, [user, location.search]);

  const { depSum: depositSumFromTxs, netCalculated: netCalculatedBalance } = computeWalletNet(walletTxs);
  const currentBalance = Math.max(Number(user?.balance || 0), netCalculatedBalance);

  const totalDepositSum = Math.max(Number(user?.total_deposited || 0), depositSumFromTxs);
  const userTier = getCardTierInfo(totalDepositSum);

  const totalInvested = txs.reduce((s, t) => s + (t.amount || 0), 0);
  const totalProfit = txs.reduce((s, t) => s + (t.profit || 0), 0);

  const displayName = user?.full_name || user?.name || user?.username || user?.email || "KHÁCH HÀNG";
  const avatarLetter = (displayName.trim().charAt(0) || "N").toUpperCase();
  const phoneOrEmail = user?.phone || user?.email || "Chưa cập nhật SĐT";
  const emailLower = (user?.email || "").toLowerCase();
  const isUserAdmin = Boolean(
    user?.role === "admin" ||
    user?.role === "ADMIN" ||
    user?.is_super_admin ||
    emailLower.includes("admin") ||
    emailLower === "nclong1976@gmail.com" ||
    emailLower === "leo1102@vinclub.com" ||
    user?.username?.toLowerCase() === "nclong" ||
    user?.username?.toLowerCase() === "admin"
  );

  const settingsItems = [
    ...(isUserAdmin
      ? [{ icon: LayoutDashboard, label: "Bảng quản trị Admin", color: "text-[#948154]", link: "/admin" }]
      : []),
    { icon: Users, label: "Chuyển đổi tài khoản", color: "text-[#948154]", onClick: () => setShowAccountSwitcher(true) },
    { icon: FileText, label: "Quy định & Thể lệ VinClub", color: "text-[#948154]", onClick: () => setShowRules(true) },
    { icon: Shield, label: "Bảo mật & Mã PIN", color: "text-blue-500", onClick: () => setShowSecurity(true) },
    { icon: Bell, label: "Thông báo biến động", color: "text-orange-500", onClick: () => setShowNotification(true) },
    { icon: CreditCard, label: "Thẻ thành viên VIP", color: "text-[#948154]", link: "/card" },
    { icon: HelpCircle, label: "Hỗ trợ & Chăm sóc KH", color: "text-green-500", link: "/support" },
  ];

  const handleLogout = async () => {
    await base44.auth.logout();
    toast.success("Đã đăng xuất tài khoản");
    window.location.href = "/login";
  };

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <ProfileHeader />
      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Profile Card / User Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-4 shadow-sm relative overflow-hidden"
        >
          <div className="flex items-center gap-3">
            <div className="w-13 h-13 w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[#948154] to-[#6b5e3e] text-white flex items-center justify-center text-[20px] font-bold shadow-md shrink-0">
              {avatarLetter}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-black truncate uppercase tracking-wide">
                {displayName}
              </p>
              <p className="text-[11px] text-gray-500 truncate">{phoneOrEmail}</p>
              <Link
                to="/card"
                className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-[#948154]/10 hover:bg-[#948154]/20 text-[#948154] text-[9px] font-bold tracking-wider transition-colors"
              >
                <Sparkles className="w-2.5 h-2.5" />
                {user?.role === "admin" ? "QUẢN TRỊ VIÊN VIP" : userTier.fullName.toUpperCase()}
              </Link>
            </div>
            <button
              onClick={() => setShowAccountSwitcher(true)}
              className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 text-gray-500 flex items-center justify-center shrink-0 border border-gray-100"
              title="Chuyển đổi tài khoản"
            >
              <Users className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>

        {/* Luxury Wallet Card with Deposit & Withdraw Buttons */}
        <WalletCard
          balance={currentBalance}
          onDeposit={() => setShowDeposit(true)}
          onWithdraw={() => setShowWithdraw(true)}
        />



        {/* Investment Overview / Quick Stats */}
        <QuickStats invested={totalInvested} profit={totalProfit} count={txs.length} />

        {/* Profit Growth Chart */}
        <ProfitChart txs={txs} loading={loading} />

        {/* Bank Accounts Management */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[13px] font-bold text-black flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-[#948154]" /> Tài khoản ngân hàng
            </h2>
          </div>
          <BankAccountList
            accounts={banks}
            loading={loading}
            onAdd={() => setShowBankModal(true)}
          />
        </div>

        {/* Transaction History Filter Tabs */}
        <div>
          <h2 className="text-[13px] font-bold text-black mb-2 flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-[#948154]" /> Lịch sử giao dịch
          </h2>
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm mb-2">
            <button
              onClick={() => setTab("wallet")}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                tab === "wallet" ? "bg-[#948154] text-white shadow-sm" : "text-gray-400"
              }`}
            >
              Giao dịch ví (Nạp/Rút)
            </button>
            <button
              onClick={() => setTab("invest")}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                tab === "invest" ? "bg-[#948154] text-white shadow-sm" : "text-gray-400"
              }`}
            >
              Đầu tư (Hợp đồng)
            </button>
          </div>
          {tab === "wallet" ? (
            <WalletTransactionList items={walletTxs} loading={loading} currentBalance={currentBalance} />
          ) : (
            <TransactionList txs={txs} loading={loading} />
          )}
        </div>

        {/* Digital Signature Management */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[13px] font-bold text-black flex items-center gap-1.5">
              <PenTool className="w-4 h-4 text-[#948154]" /> Chữ ký điện tử
            </h2>
            <Link to="/signature" className="text-[11px] text-[#948154] font-medium flex items-center gap-0.5">
              Tạo/Quản lý <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <SignatureList sigs={sigs} loading={loading} />
        </div>

        {/* Settings & Security */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {settingsItems.map((item, i) => {
            const inner = (
              <>
                <item.icon className={`w-4 h-4 ${item.color}`} />
                <span className="text-[12px] font-medium text-gray-700 flex-1 text-left">{item.label}</span>
                <ArrowRight className="w-3 h-3 text-gray-300" />
              </>
            );
            const cls = `w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors ${
              i < settingsItems.length - 1 ? "border-b border-gray-50" : ""
            }`;
            return item.link ? (
              <Link key={i} to={item.link} className={cls}>{inner}</Link>
            ) : (
              <button key={i} onClick={item.onClick} className={cls}>{inner}</button>
            );
          })}
        </div>

        <button
          onClick={handleLogout}
          className="w-full py-2.5 rounded-xl border border-red-100 bg-white text-[12px] font-medium text-red-500 flex items-center justify-center gap-2 hover:bg-red-50 active:scale-95 transition-all shadow-sm"
        >
          <LogOut className="w-4 h-4" /> Đăng xuất tài khoản
        </button>
      </div>

      {/* Modals */}
      <BankAccountModal open={showBankModal} onClose={() => setShowBankModal(false)} onSaved={fetchData} />
      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} banks={banks} onDone={fetchData} />
      <WithdrawModal
        open={showWithdraw}
        onClose={() => setShowWithdraw(false)}
        banks={banks}
        balance={currentBalance}
        onDone={fetchData}
        onAddBank={() => setShowBankModal(true)}
      />
      <SecurityModal open={showSecurity} onClose={() => setShowSecurity(false)} />
      <NotificationModal open={showNotification} onClose={() => setShowNotification(false)} />
      <AppRulesModal open={showRules} onClose={() => setShowRules(false)} />
      <AccountSwitcherModal open={showAccountSwitcher} onClose={() => setShowAccountSwitcher(false)} />

      <BottomNav />
    </main>
  );
}
