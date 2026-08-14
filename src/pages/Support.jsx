import React, { useState, useEffect, useRef } from "react";
import { Headphones } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import SupportHeader from "@/components/support/SupportHeader";
import MessageBubble from "@/components/support/MessageBubble";
import ChatInput from "@/components/support/ChatInput";

export default function Support() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const loadMessages = async (userId) => {
    if (!userId) return;
    try {
      const list = await base44.entities.Message.filter(
        { conversation_id: userId },
        "created_date",
        200
      );
      setMessages(list || []);
    } catch (e) {
      // quiet fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    // 1. Initial Load
    loadMessages(user.id);

    // 2. Real-time Subscription via Firebase Realtime Database
    let unsubRTDB;
    import('@/lib/rtdbSync').then(({ subscribeMessagesFromRTDB }) => {
      unsubRTDB = subscribeMessagesFromRTDB(() => {
        loadMessages(user.id);
      });
    }).catch(() => null);

    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.data?.conversation_id !== user.id && event.data?.user_id !== user.id) return;
      loadMessages(user.id);
    });

    // 3. Guaranteed Polling interval (Every 2s) for instant real-time sync
    const pollInterval = setInterval(() => {
      loadMessages(user.id);
    }, 2000);

    // 4. Cross-tab LocalStorage Sync
    const handleStorageChange = (e) => {
      if (e.key === "vinclub_msg_update") {
        loadMessages(user.id);
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      if (typeof unsubRTDB === "function") unsubRTDB();
      unsub();
      clearInterval(pollInterval);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const handleSend = async (text, files) => {
    if (!user) {
      toast.error("Vui lòng đăng nhập để gửi tin nhắn");
      return;
    }
    setSending(true);
    try {
      const attachments = [];
      for (const file of files) {
        try {
          const res = await base44.integrations.Core.UploadFile({ file });
          if (res?.file_url) attachments.push(res.file_url);
        } catch (err) {
          // Fallback if file upload returns data URL or blob
          const reader = new FileReader();
          const dataUrl = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
          });
          if (dataUrl) attachments.push(dataUrl);
        }
      }

      await base44.entities.Message.create({
        sender: "user",
        conversation_id: user.id,
        user_id: user.id,
        content: text.trim(),
        attachments,
      });

      // Send real-time notification to Admin flow
      try {
        await base44.entities.Notification.create({
          title: "Tin nhắn CSKH mới từ hội viên",
          content: `Hội viên ${user?.name || user?.full_name || user?.email} vừa gửi tin nhắn: "${text.trim() || 'Hình ảnh/Tệp đính kèm'}"`,
          type: "admin",
          user_id: "admin",
          is_read: false,
        });
      } catch (e) {}

      // Trigger cross-tab event
      localStorage.setItem("vinclub_msg_update", Date.now().toString());

      // Immediate reload
      await loadMessages(user.id);
    } catch (e) {
      toast.error("Không thể gửi tin nhắn. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="relative w-full max-w-[480px] mx-auto min-h-screen bg-[#f5f5f5] overflow-clip font-heading flex flex-col">
      <SupportHeader />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {loading ? (
          <div className="text-center py-10 text-[11px] text-gray-400">
            Đang tải tin nhắn CSKH...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 px-4 bg-white rounded-2xl border border-gray-100 shadow-2xs my-2 space-y-1.5">
            <div className="w-10 h-10 rounded-full bg-[#948154]/10 text-[#948154] flex items-center justify-center mx-auto">
              <Headphones className="w-5 h-5 text-[#948154]" />
            </div>
            <p className="text-[12px] font-bold text-black">
              Trung tâm Chăm sóc Khách hàng VinClub
            </p>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Gửi thắc mắc, đề xuất hoặc yêu cầu hỗ trợ tài chính & đặc quyền dịch vụ. Chuyên viên CSKH sẵn sàng phục vụ 24/7.
            </p>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id || Math.random()} message={m} />)
        )}
      </div>

      <ChatInput onSend={handleSend} sending={sending} />
    </main>
  );
}
