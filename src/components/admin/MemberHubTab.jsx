import React, { useState, useEffect } from "react";
import { Users, MessageSquare, ArrowRightLeft, FileSignature } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import UsersTab from "@/components/admin/UsersTab";
import MessagesTab from "@/components/admin/MessagesTab";
import TransactionsTab from "@/components/admin/TransactionsTab";
import ContractsTab from "@/components/admin/ContractsTab";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import { base44 } from "@/api/base44Client";

export default function MemberHubTab({ initialSubTab = "users" }) {
  const [subTab, setSubTab] = useState(initialSubTab); // 'users' | 'messages' | 'transactions' | 'contracts'

  // Cross-navigation states
  const [chatTargetUserId, setChatTargetUserId] = useState(null);
  const [txSearchQuery, setTxSearchQuery] = useState("");

  // Live badge counts
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [pendingTxCount, setPendingTxCount] = useState(0);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [pendingContractsCount, setPendingContractsCount] = useState(0);

  const fetchHubStats = () => {
    Promise.all([
      base44.entities.Message.list("-created_date", 200).catch(() => []),
      base44.entities.WalletTransaction.filter({ status: "pending" }, "-created_date", 200).catch(() => []),
      base44.entities.User.list().catch(() => []),
      // "Hợp đồng" trước đây là tab riêng ở Admin.jsx (đọc Transaction có
      // chữ ký) - giờ gộp làm subtab thứ 4 tại đây, cần đếm số hợp đồng
      // đang chờ duyệt để hiện badge y hệt cách 3 subtab kia đang làm.
      base44.entities.Transaction.filter({ signature_content: { $exists: true } }, "-created_date", 100).catch(() => []),
    ]).then(([msgs, pendingTxs, users, signedTxs]) => {
      const unread = (msgs || []).filter((m) => m.sender === "user" && !m.is_read).length;
      setUnreadMsgCount(unread);
      setPendingTxCount((pendingTxs || []).length);
      setTotalUsersCount((users || []).length);
      setPendingContractsCount((signedTxs || []).filter((t) => (t.contract_status || "pending") === "pending").length);
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
    // "vinclub_msg_update" KHÔNG PHẢI custom event - đó là tên key trong
    // localStorage (xem MessagesTab.jsx/Support.jsx), chỉ phát hiện được
    // qua sự kiện "storage" gốc (đã đăng ký bên dưới), và sự kiện "storage"
    // chỉ bắn ở TAB KHÁC chứ không bao giờ bắn trong chính tab vừa ghi -
    // nghĩa là listener này chưa từng nhận được sự kiện nào khi admin tự
    // đánh dấu tin đã đọc trong cùng tab, khiến badge tổng ở đây lệch so
    // với số "chưa đọc" thật hiển thị trong MessagesTab (đúng lỗi quan sát
    // được: badge hiện 6 trong khi tổng số chưa đọc thực tế là 7). Lắng
    // nghe đúng custom event "vinclub:msg_update" mà MessagesTab.jsx giờ
    // dispatch thêm mỗi khi tin nhắn được tạo/đánh dấu đã đọc.
    window.addEventListener("vinclub:msg_update", handleMsgUpdate);
    window.addEventListener("vinclub:balance_updated", handleBalUpdate);
    window.addEventListener("storage", handleMsgUpdate);

    return () => {
      if (typeof unsubRTDBMsg === "function") unsubRTDBMsg();
      if (typeof unsubRTDBTx === "function") unsubRTDBTx();
      window.removeEventListener("vinclub:msg_update", handleMsgUpdate);
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
        <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
          {/* SubTab 1: Hội viên */}
          <button
            onClick={() => { setSubTab("users"); }}
            className={`relative flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
              subTab === "users" ? "text-white" : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            {subTab === "users" && (
              <motion.span
                layoutId="member-hub-subtab-active-bg"
                className="absolute inset-0 bg-[#948154] rounded-xl shadow-xs"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            )}
            {/* Bọc riêng nội dung trong span "relative z-10" thay vì ép pill
                z-index âm - pill với transform animation (layoutId) + z-index
                âm từng khiến chữ/icon bị che khuất phía sau pill lúc chuyển
                tab (xem ghi chú tương tự ở Admin.jsx). */}
            <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2">
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
            </span>
          </button>

          {/* SubTab 2: Tin nhắn CSKH */}
          <button
            onClick={() => { setSubTab("messages"); }}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer relative ${
              subTab === "messages" ? "text-white" : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            {subTab === "messages" && (
              <motion.span
                layoutId="member-hub-subtab-active-bg"
                className="absolute inset-0 bg-[#948154] rounded-xl shadow-xs"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2">
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate">Tin nhắn CSKH</span>
              {unreadMsgCount > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center shrink-0 animate-pulse">
                  {unreadMsgCount > 9 ? "9+" : unreadMsgCount}
                </span>
              )}
            </span>
          </button>

          {/* SubTab 3: Phê duyệt Giao dịch */}
          <button
            onClick={() => { setSubTab("transactions"); }}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer relative ${
              subTab === "transactions" ? "text-white" : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            {subTab === "transactions" && (
              <motion.span
                layoutId="member-hub-subtab-active-bg"
                className="absolute inset-0 bg-[#948154] rounded-xl shadow-xs"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2">
              <ArrowRightLeft className="w-4 h-4 shrink-0" />
              <span className="truncate">Phê duyệt Giao dịch</span>
              {pendingTxCount > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[8px] font-black flex items-center justify-center shrink-0">
                  {pendingTxCount}
                </span>
              )}
            </span>
          </button>

          {/* SubTab 4: Hợp đồng - gộp từ tab "Hợp đồng" cấp cao nhất cũ vì
              cùng bản chất "hàng chờ duyệt" như Phê duyệt Giao dịch, chỉ
              khác đối tượng (Transaction có chữ ký, không phải WalletTransaction). */}
          <button
            onClick={() => { setSubTab("contracts"); }}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all cursor-pointer relative ${
              subTab === "contracts" ? "text-white" : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            {subTab === "contracts" && (
              <motion.span
                layoutId="member-hub-subtab-active-bg"
                className="absolute inset-0 bg-[#948154] rounded-xl shadow-xs"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2">
              <FileSignature className="w-4 h-4 shrink-0" />
              <span className="truncate">Hợp đồng</span>
              {pendingContractsCount > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[8px] font-black flex items-center justify-center shrink-0">
                  {pendingContractsCount}
                </span>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* ── SubTab Content Rendering ── */}
      <div className="overflow-hidden">
        <AdminErrorBoundary resetKey={subTab}>
          <AnimatePresence mode="wait">
            <motion.div
              key={subTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
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

              {subTab === "contracts" && <ContractsTab />}
            </motion.div>
          </AnimatePresence>
        </AdminErrorBoundary>
      </div>
    </div>
  );
}
