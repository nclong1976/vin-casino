import React, { useState, useEffect } from "react";
import { Users, MessageSquare, ArrowRightLeft, Sparkles, UserCheck, Clock, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import UsersTab from "@/components/admin/UsersTab";
import MessagesTab from "@/components/admin/MessagesTab";
import TransactionsTab from "@/components/admin/TransactionsTab";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import { base44 } from "@/api/base44Client";

export default function MemberHubTab({ initialSubTab = "users" }) {
  const [subTab, setSubTab] = useState(initialSubTab); // 'users' | 'messages' | 'transactions'

  // Cross-navigation states
  const [chatTargetUserId, setChatTargetUserId] = useState(null);
  const [txSearchQuery, setTxSearchQuery] = useState("");

  // Live badge counts
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [pendingTxCount, setPendingTxCount] = useState(0);
  const [totalUsersCount, setTotalUsersCount] = useState(0);

  const fetchHubStats = () => {
    Promise.all([
      base44.entities.Message.list("-created_date", 200).catch(() => []),
      base44.entities.WalletTransaction.filter({ status: "pending" }, "-created_date", 200).catch(() => []),
      base44.entities.User.list().catch(() => []),
    ]).then(([msgs, pendingTxs, users]) => {
      const unread = (msgs || []).filter((m) => m.sender === "user" && !m.is_read).length;
      setUnreadMsgCount(unread);
      setPendingTxCount((pendingTxs || []).length);
      setTotalUsersCount((users || []).length);
    });
  };

  useEffect(() => {
    fetchHubStats();

    // Listen to real-time sync events
    let unsubRTDBMsg, unsubRTDBTx;
    import("@/lib/rtdbSync").then((rtdb) => {
      if (rtdb.subscribeMessagesFromRTDB) unsubRTDBMsg = rtdb.subscribeMessagesFromRTDB(() => fetchHubStats());
      if (rtdb.subscribeWalletTransactionsFromRTDB) unsubRTDBTx = rtdb.subscribeWalletTransactionsFromRTDB(() => fetchHubStats());
    }).catch(() => null);

    const handleMsgUpdate = () => fetchHubStats();
    const handleBalUpdate = () => fetchHubStats();
    window.addEventListener("vinclub_msg_update", handleMsgUpdate);
    window.addEventListener("vinclub:balance_updated", handleBalUpdate);
    window.addEventListener("storage", handleMsgUpdate);

    return () => {
      if (typeof unsubRTDBMsg === "function") unsubRTDBMsg();
      if (typeof unsubRTDBTx === "function") unsubRTDBTx();
      window.removeEventListener("vinclub_msg_update", handleMsgUpdate);
      window.removeEventListener("vinclub:balance_updated", handleBalUpdate);
      window.removeEventListener("storage", handleMsgUpdate);
    };
  }, []);

  // Handlers for smart cross-linking
  const handleNavigateToChat = (userId) => {
    setChatTargetUserId(userId);
    setSubTab("messages");
  };

  const handleNavigateToTransactions = (query) => {
    setTxSearchQuery(query || "");
    setSubTab("transactions");
  };

  return (
    <div className="space-y-3.5">
      {/* ── Sub-Navigation Master Hub Switcher ── */}
      <div className="bg-white rounded-2xl p-1.5 border border-gray-200/90 shadow-xs">
        <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
          {/* SubTab 1: Hội viên */}
          <button
            onClick={() => { setSubTab("users"); }}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
              subTab === "users"
                ? "bg-[#948154] text-white shadow-xs"
                : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">Hội viên</span>
            {totalUsersCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[8.5px] font-black shrink-0 ${
                  subTab === "users" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                {totalUsersCount}
              </span>
            )}
          </button>

          {/* SubTab 2: Tin nhắn CSKH */}
          <button
            onClick={() => { setSubTab("messages"); }}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer relative ${
              subTab === "messages"
                ? "bg-[#948154] text-white shadow-xs"
                : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="truncate">Tin nhắn CSKH</span>
            {unreadMsgCount > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center shrink-0 animate-pulse">
                {unreadMsgCount > 9 ? "9+" : unreadMsgCount}
              </span>
            )}
          </button>

          {/* SubTab 3: Phê duyệt Giao dịch */}
          <button
            onClick={() => { setSubTab("transactions"); }}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer relative ${
              subTab === "transactions"
                ? "bg-[#948154] text-white shadow-xs"
                : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            <ArrowRightLeft className="w-4 h-4 shrink-0" />
            <span className="truncate">Phê duyệt Giao dịch</span>
            {pendingTxCount > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[8px] font-black flex items-center justify-center shrink-0">
                {pendingTxCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── SubTab Content Rendering ── */}
      <div>
        <AdminErrorBoundary resetKey={subTab}>
          {subTab === "users" && (
            <UsersTab
              onNavigateToChat={handleNavigateToChat}
              onNavigateToTransactions={handleNavigateToTransactions}
            />
          )}

          {subTab === "messages" && (
            <MessagesTab
              initialSelectedUserId={chatTargetUserId}
            />
          )}

          {subTab === "transactions" && (
            <TransactionsTab
              initialSearchQuery={txSearchQuery}
              onNavigateToChat={handleNavigateToChat}
            />
          )}
        </AdminErrorBoundary>
      </div>
    </div>
  );
}
