import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const TYPE_LABELS = {
  deposit: { label: "Nạp tiền", color: "text-green-500", bg: "bg-green-50" },
  contract: { label: "Hợp đồng", color: "text-[#948154]", bg: "bg-[#948154]/10" },
  wallet: { label: "Ví", color: "text-blue-500", bg: "bg-blue-50" },
  admin: { label: "Thông báo", color: "text-orange-500", bg: "bg-orange-50" },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

// Mọi thông báo hiển thị ở chuông này (broadcast toàn hệ thống hoặc broadcast
// admin) đều là 1 dòng DUY NHẤT được CHIA SẺ giữa tất cả người xem - không có
// user_id riêng. Nếu dùng field is_read trên chính dòng đó, một người bấm
// đọc sẽ tắt luôn dấu "mới" cho MỌI người khác (Postgres UPDATE 1 dòng, phát
// qua Realtime tới mọi client). Nên trạng thái "đã đọc" của TỪNG người phải
// theo dõi CỤC BỘ (localStorage riêng theo user.id), không ghi lên dòng DB.
const readKey = (userId) => `vinclub_read_broadcast_notifs_${userId}`;

function getReadSet(userId) {
  try {
    const raw = localStorage.getItem(readKey(userId));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (e) {
    return new Set();
  }
}

function saveReadSet(userId, set) {
  try {
    localStorage.setItem(readKey(userId), JSON.stringify([...set]));
  } catch (e) {}
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const fetchNotifs = () => {
    if (!user) return;
    base44.entities.Notification
      .list("-created_date", 50)
      .then((list) => {
        // Chuông thông báo CHỈ hiển thị tin CHUNG toàn hệ thống (không gắn
        // user_id) hoặc broadcast tới admin ("admin" là giá trị đặc biệt,
        // không phải id thật) - mọi thông tin gắn với 1 tài khoản cụ thể giờ
        // đã được gửi thẳng vào khung chat CSKH riêng (xem lib/notifyUser.js)
        // thay vì tạo Notification theo user_id như trước, nên các bản ghi
        // user_id === user.id cũ (nếu còn sót) cũng không hiển thị ở đây nữa.
        const readSet = getReadSet(user.id);
        const userNotifs = (list || [])
          .filter(n => !n.user_id || (n.user_id === "admin" && user.role === "admin"))
          .map(n => ({ ...n, is_read: readSet.has(n.id) }));
        setNotifs(userNotifs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user) {
      fetchNotifs();
      const unsub = base44.entities.Notification.subscribe(() => fetchNotifs());

      const handleBalanceUpdate = () => fetchNotifs();
      window.addEventListener("vinclub:balance_updated", handleBalanceUpdate);

      return () => {
        unsub();
        window.removeEventListener("vinclub:balance_updated", handleBalanceUpdate);
      };
    }
  }, [user]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = notifs.filter((n) => !n.is_read).length;

  const markAllRead = () => {
    const unreadList = notifs.filter((n) => !n.is_read);
    if (unreadList.length === 0) return;
    const readSet = getReadSet(user.id);
    unreadList.forEach((n) => readSet.add(n.id));
    saveReadSet(user.id, readSet);
    fetchNotifs();
  };

  const markRead = (n) => {
    if (n.is_read) return;
    const readSet = getReadSet(user.id);
    readSet.add(n.id);
    saveReadSet(user.id, readSet);
    fetchNotifs();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1 -m-1 transition-opacity hover:opacity-80 active:scale-95 relative"
      >
        <img
          className="w-3.5 h-4 object-contain"
          src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/dfe1d99ce_63395f89e_94bc0a06ce8c2d0050dd667426523002cd25fb3c.png"
          alt="Notifications"
        />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-[13px] px-0.5 rounded-full bg-red-500 text-white text-[7px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute right-0 top-full mt-2 w-[280px] bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-[#948154]" />
                <span className="text-[12px] font-bold text-black">Thông báo</span>
                {unread > 0 && (
                  <span className="text-[9px] text-gray-400">({unread} mới)</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[9px] text-[#948154] font-medium hover:underline"
                  >
                    Đọc tất cả
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                  <X className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="max-h-[320px] overflow-y-auto">
              {loading ? (
                <div className="text-center py-6 text-[11px] text-gray-400">Đang tải...</div>
              ) : notifs.length === 0 ? (
                <div className="text-center py-6">
                  <Bell className="w-6 h-6 text-gray-200 mx-auto mb-1.5" />
                  <p className="text-[11px] text-gray-400">Chưa có thông báo</p>
                </div>
              ) : (
                notifs.map((n) => {
                  const tc = TYPE_LABELS[n.type] || TYPE_LABELS.admin;
                  return (
                    <button
                      key={n.id}
                      onClick={() => markRead(n)}
                      className={`w-full text-left flex gap-2.5 px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition ${
                        !n.is_read ? "bg-[#948154]/5" : ""
                      }`}
                    >
                      {n.image ? (
                        <img
                          src={n.image}
                          alt=""
                          className="w-9 h-9 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <span className={`w-9 h-9 rounded-lg ${tc.bg} flex items-center justify-center shrink-0`}>
                          <Bell className={`w-4 h-4 ${tc.color}`} />
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[8px] font-semibold ${tc.color}`}>{tc.label}</span>
                          <span className="text-[8px] text-gray-300">·</span>
                          <span className="text-[8px] text-gray-400">{timeAgo(n.created_date)}</span>
                          {!n.is_read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-auto shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] font-semibold text-black leading-tight truncate">
                          {n.title}
                        </p>
                        <p className="text-[10px] text-gray-400 leading-snug line-clamp-2">
                          {n.content}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}