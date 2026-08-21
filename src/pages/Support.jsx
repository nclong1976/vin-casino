import React, { useState, useEffect, useRef } from "react";
import { Headphones, Sparkles, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import SupportHeader from "@/components/support/SupportHeader";
import MessageBubble from "@/components/support/MessageBubble";
import ChatInput from "@/components/support/ChatInput";

export default function Support() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const greetingCreatedRef = useRef(false);
  const prevLastMsgIdRef = useRef(null);

  const loadMessages = async (userId, currentUser) => {
    if (!userId) return;
    // Khóa "quyền kiểm tra/tạo tin chào" ngay lập tức, TRƯỚC bất kỳ await nào.
    // loadMessages() được gọi từ nhiều nơi gần như đồng thời lúc mount (gọi
    // trực tiếp, fallback RTDB rỗng, Message.subscribe()...) - nếu chỉ đặt
    // cờ SAU khi await base44.entities.Message.filter() xong (như code cũ),
    // nhiều lời gọi có thể cùng thấy "chưa có ai tạo tin chào" tại thời điểm
    // check và tạo trùng nhiều tin chào. Đặt cờ đồng bộ (synchronous) ở đây
    // đảm bảo chỉ lời gọi ĐẦU TIÊN được quyền xét tạo tin chào.
    const isGreetingCheckOwner = !greetingCreatedRef.current;
    if (isGreetingCheckOwner) greetingCreatedRef.current = true;
    try {
      const list = await base44.entities.Message.filter(
        { conversation_id: userId },
        "created_date",
        200
      );

      const u = currentUser || user;
      const userFullName = u?.full_name || u?.name || u?.display_name || (u?.email ? u.email.split("@")[0] : "Quý khách");

      // Check if welcome greeting message exists; if not, create it
      if ((!list || list.length === 0) && isGreetingCheckOwner) {
        const greetingContent = `Kính chào Quý khách ${userFullName}! CSKH VinClub hân hạnh được đồng hành và hỗ trợ Quý khách 24/7. Quý khách cần hỗ trợ dịch vụ nào hôm nay ạ?`;
        
        try {
          const newMsg = await base44.entities.Message.create({
            sender: "support",
            conversation_id: userId,
            user_id: userId,
            content: greetingContent,
            attachments: [],
          });
          setMessages([newMsg]);
          return;
        } catch (e) {
          // If creation fails, show in local state
          setMessages([{
            id: "greeting-default",
            sender: "support",
            conversation_id: userId,
            content: greetingContent,
            created_date: new Date().toISOString(),
            attachments: [],
          }]);
          return;
        }
      }

      // Hợp nhất với state hiện tại thay vì ghi đè toàn bộ mù quáng: loadMessages()
      // đọc từ cache cục bộ (có thể tạm thời chưa cập nhật kịp), nên ghi đè
      // thẳng có thể xoá mất một tin nhắn mà kênh RTDB real-time vừa phát
      // tới state trước đó (race condition giữa 2 nguồn cập nhật state).
      // NHƯNG vẫn phải tôn trọng việc XÓA: nếu Super Admin xóa 1 tin nhắn ở
      // phía quản trị, tin đó biến mất khỏi "incoming" - chỉ giữ lại tin cũ
      // không còn trong incoming khi nó vừa được tạo trong vài giây gần đây
      // (khả năng cache REST chưa kịp đồng bộ), còn lại coi là đã bị xóa
      // thật và loại bỏ khỏi màn hình để khớp đúng với phía Admin.
      // Không còn "return prev" sớm khi incoming rỗng nữa: nếu Admin xóa
      // TOÀN BỘ hội thoại, incoming sẽ luôn rỗng - phải để logic grace-period
      // bên dưới xử lý (tin cũ hơn 5s sẽ bị loại bỏ đúng như xóa từng tin).
      const GRACE_MS = 5000;
      setMessages((prev) => {
        const incoming = list || [];
        const incomingIds = new Set(incoming.map((m) => m.id));
        const now = Date.now();
        const merged = new Map(incoming.map((m) => [m.id, m]));
        prev.forEach((m) => {
          if (!incomingIds.has(m.id) && now - new Date(m.created_date || 0).getTime() < GRACE_MS) {
            merged.set(m.id, m);
          }
        });
        return Array.from(merged.values()).sort(
          (a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0)
        );
      });
    } catch (e) {
      // quiet fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    // 1. Initial Load with Greeting Generation
    loadMessages(user.id, user);

    // 2. Real-time Subscription via Firebase Realtime Database
    let unsubRTDB;
    import("@/lib/rtdbSync").then(({ subscribeConversationFromRTDB }) => {
      unsubRTDB = subscribeConversationFromRTDB(user.id, (rtdbMsgs) => {
        if (Array.isArray(rtdbMsgs) && rtdbMsgs.length > 0) {
          const sorted = [...rtdbMsgs].sort(
            (a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0)
          );
          setMessages(sorted);
          setLoading(false);
        } else {
          loadMessages(user.id, user);
        }
      });
    }).catch(() => null);

    const unsub = base44.entities.Message.subscribe(() => {
      loadMessages(user.id, user);
    });

    // 3. Polling fallback for non-RTDB environments - chỉ là lưới an toàn dự
    // phòng (RTDB + Message.subscribe() đã xử lý real-time chính), nên giãn
    // ra 8s thay vì 2s để tránh ép re-render/cuộn liên tục gây giật khi vuốt.
    const pollInterval = setInterval(() => {
      loadMessages(user.id, user);
    }, 8000);

    // 4. Cross-tab LocalStorage Sync
    const handleStorageChange = (e) => {
      if (e.key === "vinclub_msg_update") {
        loadMessages(user.id, user);
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      if (typeof unsubRTDB === "function") unsubRTDB();
      if (typeof unsub === "function") unsub();
      clearInterval(pollInterval);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [user]);

  // Chỉ tự cuộn xuống đáy khi thật sự có tin nhắn mới (so sánh id tin nhắn
  // cuối cùng) - trước đây cuộn lại mỗi khi "messages" đổi tham chiếu (kể cả
  // do poll 2 giây không có gì thay đổi thật), khiến màn hình bị giật/kéo
  // ngược xuống liên tục mỗi khi người dùng đang vuốt lên xem lịch sử.
  useEffect(() => {
    const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;
    if (lastId && lastId !== prevLastMsgIdRef.current && scrollRef.current) {
      prevLastMsgIdRef.current = lastId;
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
        const uName = user?.full_name || user?.name || user?.display_name || user?.email;
        await base44.entities.Notification.create({
          title: "Tin nhắn CSKH mới từ hội viên",
          content: `Hội viên ${uName} vừa gửi tin nhắn: "${text.trim() || 'Hình ảnh/Tệp đính kèm'}"`,
          type: "admin",
          user_id: "admin",
          is_read: false,
        });
      } catch (e) {}

      // Trigger cross-tab event
      localStorage.setItem("vinclub_msg_update", Date.now().toString());

      // Immediate reload
      await loadMessages(user.id, user);
    } catch (e) {
      toast.error("Không thể gửi tin nhắn. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
  };

  const userFullName = user?.full_name || user?.name || user?.display_name || (user?.email ? user.email.split("@")[0] : "Quý khách");

  return (
    <div className="h-[100dvh] w-full bg-[#f0f2f5] overflow-hidden flex flex-col justify-between font-['Be_Vietnam_Pro',sans-serif]">
      {/* Fixed Header */}
      <SupportHeader />

      {/* Main Messages View - Full Height Scroll Area */}
      <main
        ref={scrollRef}
        className="flex-1 w-full max-w-4xl mx-auto overflow-y-auto scroll-smooth px-3.5 py-4 space-y-3"
        style={{ overscrollBehavior: "contain" }}
      >
        {/* Welcome VIP Greeting Card */}
        <div className="w-full bg-gradient-to-br from-white via-amber-50/40 to-white rounded-2xl p-4 border border-[#948154]/20 shadow-xs text-center space-y-1.5 mb-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#948154] to-[#6b5e3e] text-white flex items-center justify-center mx-auto shadow-sm">
            <Headphones className="w-5 h-5" />
          </div>
          <h2 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center justify-center gap-1.5">
            <span>Trung tâm Trợ giúp Khách hàng VinClub</span>
            <Sparkles className="w-3.5 h-3.5 text-[#948154]" />
          </h2>
          <p className="text-[11px] text-gray-600 leading-relaxed max-w-md mx-auto">
            Xin chào <strong className="text-[#948154] font-bold">{userFullName}</strong>! Kênh hỗ trợ trực tuyến bảo mật đa tầng, kết nối trực tiếp chuyên viên CSKH cấp cao 24/7.
          </p>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="text-center py-6 text-xs text-gray-400">
            Đang tải tin nhắn hội thoại...
          </div>
        )}

        {/* Message Bubble List */}
        {messages.map((m) => (
          <MessageBubble key={m.id || Math.random()} message={m} />
        ))}
      </main>

      {/* Fixed Fullscreen Chat Input */}
      <ChatInput onSend={handleSend} sending={sending} />
    </div>
  );
}
