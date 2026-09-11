import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Headphones, Sparkles, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import SupportHeader from "@/components/support/SupportHeader";
import MessageBubble from "@/components/support/MessageBubble";
import ChatInput from "@/components/support/ChatInput";
import { DEFAULT_SUPPORT_STATUS } from "@/constants/supportStatus";
import { fetchMessagesPage } from "@/lib/supabaseDb";
import { markDelivered, markRead } from "@/lib/messageLifecycle";
import { subscribeToConnectionStatus } from "@/api/base44Client";
import { compressImageFile } from "@/lib/imageCompression";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useIdleSessionTimeout } from "@/hooks/useIdleSessionTimeout";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_WARNING_MS = 60 * 1000;
// "Video quá lớn" chỉ là cảnh báo mềm (không nén được video client-side, xem
// src/lib/imageCompression.js) - báo trước để người dùng biết base64 sẽ nặng,
// không chặn gửi.
const LARGE_VIDEO_WARN_BYTES = 15 * 1024 * 1024;

export default function Support() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [convStatus, setConvStatus] = useState(DEFAULT_SUPPORT_STATUS);
  const [connStatus, setConnStatus] = useState(null);
  const [idleExpired, setIdleExpired] = useState(false);
  const scrollRef = useRef(null);
  const greetingCreatedRef = useRef(false);
  const prevLastMsgIdRef = useRef(null);
  const loadingOlderRef = useRef(false);
  const hasMoreOlderRef = useRef(true);
  const prependScrollAdjustRef = useRef(null);

  const { peerTyping, notifyTyping } = useTypingIndicator(user?.id, "user");

  const { resume: resumeIdleSession } = useIdleSessionTimeout({
    timeoutMs: IDLE_TIMEOUT_MS,
    warningMs: IDLE_WARNING_MS,
    onWarning: () => toast("Phiên chat sẽ tạm nghỉ sau 1 phút do không hoạt động"),
    onTimeout: () => setIdleExpired(true),
  });

  // Banner "Đang kết nối lại..." - subscribeChannelWithAutoReconnect
  // (supabaseDb.js, PR #49) đã tự kết nối lại ngầm, đây chỉ là phát trạng
  // thái kênh cho UI biết, không đổi hành vi reconnect đã có.
  useEffect(() => {
    const unsub = subscribeToConnectionStatus("Message", setConnStatus);
    return unsub;
  }, []);

  // Khóa "quyền kiểm tra/tạo tin chào" ngay lập tức, TRƯỚC bất kỳ await nào.
  // loadMessages()/applyMessageList() được gọi từ nhiều nơi gần như đồng thời
  // lúc mount (gọi trực tiếp, Message.subscribe(), polling...) - nếu chỉ đặt
  // cờ SAU khi await xong (như code cũ), nhiều lời gọi có thể cùng thấy "chưa
  // có ai tạo tin chào" tại thời điểm check và tạo trùng nhiều tin chào. Đặt
  // cờ đồng bộ (synchronous) ở đây đảm bảo chỉ lời gọi ĐẦU TIÊN được quyền
  // xét tạo tin chào.
  const claimGreetingOwnership = () => {
    const owner = !greetingCreatedRef.current;
    if (owner) greetingCreatedRef.current = true;
    return owner;
  };

  // Hợp nhất 1 danh sách tin nhắn (list) đã có sẵn - tới từ 1 lượt fetch REST
  // (loadMessages) HOẶC trực tiếp từ dữ liệu Supabase Realtime vừa đẩy tới
  // qua Message.subscribe() (không cần fetch lại) - vào state hiện tại. Tách
  // riêng khỏi loadMessages() để nhánh Realtime có thể áp dữ liệu tức thời,
  // không phải đợi thêm 1 lượt REST round-trip nữa mới cập nhật màn hình -
  // đây chính là phần gây "độ trễ" khi nhắn tin 2 chiều admin<->người dùng.
  const applyMessageList = async (list, userId, currentUser, isGreetingCheckOwner) => {
      const u = currentUser || user;
      const userFullName = u?.full_name || u?.name || u?.display_name || (u?.email ? u.email.split("@")[0] : "Quý khách");

      // list.__fetchDegraded = true nghĩa là lượt tải này KHÔNG thành công
      // thật sự (rớt mạng/lỗi Postgres), base44Client.js đã phải lùi về cache
      // cục bộ (có thể rỗng trên 1 thiết bị mới) - "rỗng" trong trường hợp
      // này không hề chứng minh "khách này chưa từng chat", nên TUYỆT ĐỐI
      // không được coi là "chưa có lịch sử" rồi tự tạo tin chào mới đè lên.
      const isDegraded = !!list?.__fetchDegraded;

      // Báo "Delivered" cho tin admin vừa nhận được (không phải mình gửi,
      // chưa có delivered_at) - chỉ khi lượt tải này đáng tin (không degraded),
      // xem src/lib/messageLifecycle.js. Không áp dụng cho lượt applyMessageList
      // gọi từ nhánh "tạo tin chào" bên dưới (list rỗng, không có gì để đánh dấu).
      if (!isDegraded && Array.isArray(list) && list.length > 0) {
        const undelivered = list.filter((m) => m.sender !== "user" && !m.delivered_at).map((m) => m.id);
        if (undelivered.length > 0) markDelivered(undelivered);
      }

      if (isDegraded && isGreetingCheckOwner) {
        // Nhường lại quyền xét "có cần tạo tin chào không" cho lượt gọi kế
        // tiếp (poll 8s hoặc Realtime) - lượt này không đủ tin cậy để kết
        // luận bất cứ điều gì về việc hội thoại có từng tồn tại hay chưa.
        greetingCreatedRef.current = false;
      }

      // Check if welcome greeting message exists; if not, create it
      if (!isDegraded && (!list || list.length === 0) && isGreetingCheckOwner) {
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
      // thẳng có thể xoá mất một tin nhắn mà kênh Supabase Realtime vừa phát
      // tới state trước đó (race condition giữa 2 nguồn cập nhật state).
      // NHƯNG vẫn phải tôn trọng việc XÓA: nếu Super Admin xóa 1 tin nhắn ở
      // phía quản trị, tin đó biến mất khỏi "incoming" - chỉ giữ lại tin cũ
      // không còn trong incoming khi nó vừa được tạo trong vài giây gần đây
      // (khả năng cache REST chưa kịp đồng bộ), còn lại coi là đã bị xóa
      // thật và loại bỏ khỏi màn hình để khớp đúng với phía Admin.
      // Không còn "return prev" sớm khi incoming rỗng nữa: nếu Admin xóa
      // TOÀN BỘ hội thoại, incoming sẽ luôn rỗng - phải để logic grace-period
      // bên dưới xử lý (tin cũ hơn 5s sẽ bị loại bỏ đúng như xóa từng tin).
      //
      // NHƯNG: quy tắc "thiếu trong incoming + cũ hơn 5s = đã bị xóa thật"
      // chỉ đúng khi incoming đến từ 1 lượt tải THÀNH CÔNG. Nếu isDegraded
      // (lượt tải này bị lỗi/rớt mạng, incoming chỉ là cache cục bộ có thể
      // cũ/thiếu), thì "thiếu trong incoming" không chứng minh được gì cả -
      // giữ nguyên TOÀN BỘ tin đang hiển thị, không áp hạn 5 giây, để tránh
      // đúng lỗi "lịch sử biến mất" khi mạng chập chờn.
      // confirmedDeletedId: id tin nhắn Realtime vừa BÁO XÁC NHẬN đã bị xóa
      // thật trên Postgres (xem __deletedId trong applyRealtimePayloadPatch()
      // ở base44Client.js) - KHÁC với "thiếu trong incoming vì fetch có thể
      // trễ". Tin nhắn này phải biến mất NGAY LẬP TỨC dù mới tạo dưới 5 giây
      // (vd. Admin xóa nhầm 1 tin vừa gửi xong) - không được áp grace period.
      const confirmedDeletedId = list?.__deletedId;
      const GRACE_MS = 5000;
      setMessages((prev) => {
        const incoming = list || [];
        const incomingIds = new Set(incoming.map((m) => m.id));
        const now = Date.now();
        // Tin cũ hơn TIN CŨ NHẤT trong "incoming" nằm NGOÀI cửa sổ mà lượt
        // fetch này quan sát được (vd tin đã tải thêm qua loadOlderMessages()
        // - fetchMessagesPage() theo trang, nằm ngoài 200 tin gần nhất mà
        // loadMessages() thấy) - "thiếu trong incoming" ở trường hợp này
        // KHÔNG chứng minh được gì, phải luôn giữ lại, không áp reconciliation
        // xóa như tin nằm TRONG cửa sổ quan sát.
        const incomingOldestTime = incoming.length > 0
          ? Math.min(...incoming.map((m) => new Date(m.created_date || 0).getTime()))
          : null;
        const merged = new Map(incoming.map((m) => [m.id, m]));
        prev.forEach((m) => {
          if (m.id === confirmedDeletedId) return;
          if (incomingIds.has(m.id)) return;
          const mTime = new Date(m.created_date || 0).getTime();
          const outsideObservedWindow = incomingOldestTime != null && mTime < incomingOldestTime;
          if (outsideObservedWindow || isDegraded || now - mTime < GRACE_MS) {
            merged.set(m.id, m);
          }
        });
        return Array.from(merged.values()).sort(
          (a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0)
        );
      });
  };

  // Lượt tải qua REST (mount lần đầu, poll 8s dự phòng, sự kiện cross-tab) -
  // vẫn giữ nguyên hành vi cũ (fetch rồi hợp nhất qua applyMessageList()).
  const loadMessages = async (userId, currentUser) => {
    if (!userId) return;
    const isGreetingCheckOwner = claimGreetingOwnership();
    try {
      // Chỉ tải 10 tin gần nhất mỗi lượt (mount + poll 8s) thay vì 200 - nhẹ
      // hơn, tải nhanh hơn cho khách hàng. Muốn xem lịch sử cũ hơn thì cuộn
      // lên đầu khung chat, đã có loadOlderMessages()/fetchMessagesPage() lo
      // phần đó (cursor pagination thật, không phụ thuộc giới hạn này).
      const list = await base44.entities.Message.filter(
        { conversation_id: userId },
        "-created_date",
        10
      );
      await applyMessageList(list, userId, currentUser, isGreetingCheckOwner);
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

    // 2. Real-time Subscription via Supabase Realtime - base44Client.js giờ
    // phát thẳng dữ liệu Postgres vừa thay đổi (payload thật, không phải
    // debounce-rồi-refetch) cho entity Message, nên áp thẳng "freshItems"
    // nhận được ở đây vào state luôn, KHÔNG gọi loadMessages() (sẽ tự fetch
    // lại REST 1 lần nữa) - đây chính là 1 lượt round-trip thừa từng cộng
    // thêm độ trễ mỗi khi có tin nhắn mới/bị xóa từ phía admin lẫn người
    // dùng, dù dữ liệu mới nhất đã có sẵn ngay trong tay.
    const unsub = base44.entities.Message.subscribe((freshItems) => {
      if (!Array.isArray(freshItems)) {
        loadMessages(user.id, user);
        return;
      }
      // .filter() tạo mảng MỚI, làm mất __deletedId (non-enumerable) đã gắn
      // trên freshItems - phải gắn lại vào kết quả cuối, không thì tin nhắn
      // vừa xóa sẽ lại bị grace-period giữ lại nếu vừa tạo dưới 5 giây (xem
      // ghi chú confirmedDeletedId trong applyMessageList()).
      const deletedId = freshItems.__deletedId;
      const list = freshItems.filter((m) => m.conversation_id === user.id);
      if (deletedId !== undefined) {
        try {
          Object.defineProperty(list, '__deletedId', { value: deletedId, enumerable: false });
        } catch (e) {}
      }
      const isGreetingCheckOwner = claimGreetingOwnership();
      applyMessageList(list, user.id, user, isGreetingCheckOwner).finally(() => setLoading(false));
    });

    // 3. Polling fallback - chỉ là lưới an toàn dự phòng (Message.subscribe()
    // đã xử lý real-time chính), nên giãn ra 8s thay vì 2s để tránh ép
    // re-render/cuộn liên tục gây giật khi vuốt.
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
      if (typeof unsub === "function") unsub();
      clearInterval(pollInterval);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [user]);

  // Trạng thái hội thoại (đang mở/chờ phản hồi/đã đóng) do Admin đặt bên
  // MessagesTab.jsx - chỉ để HIỂN THỊ badge ở đây, khách hàng không tự đổi
  // được (xem policy support_conversations_write_admin_only trong migration
  // add_support_conversations_status). Không có dòng nào cho user này nghĩa
  // là coi như mặc định "open" (chưa admin nào từng đổi trạng thái).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const applyRow = (row) => {
      if (cancelled) return;
      setConvStatus(row?.status || DEFAULT_SUPPORT_STATUS);
    };

    base44.entities.SupportConversation.filter({ id: user.id })
      .then((rows) => applyRow(rows?.[0]))
      .catch(() => {});

    const unsub = base44.entities.SupportConversation.subscribe((rows) => {
      const mine = Array.isArray(rows) ? rows.find((r) => r.id === user.id) : null;
      // Không tìm thấy dòng của mình trong payload Realtime không có nghĩa
      // là đã bị xóa (Realtime ở đây phát TOÀN BỘ bảng, không phải riêng
      // user này) - chỉ áp dụng khi thật sự tìm thấy, giữ nguyên state hiện
      // tại nếu không thấy.
      if (mine) applyRow(mine);
    });

    return () => {
      cancelled = true;
      if (typeof unsub === "function") unsub();
    };
  }, [user?.id]);

  // Đánh dấu "Read" cho tin admin gửi mà khách CHƯA xem, mỗi khi danh sách
  // tin nhắn đổi VÀ tab đang thật sự mở (document visible) - đối xứng với
  // đúng pattern đánh dấu đã đọc đã có ở MessagesTab.jsx (openConversation(),
  // phía admin), phía khách trước giờ chưa có gì tương đương.
  useEffect(() => {
    if (!user?.id) return;
    const markVisibleAsRead = () => {
      if (document.visibilityState !== "visible") return;
      const unreadIds = messages.filter((m) => m.sender !== "user" && !m.read_at).map((m) => m.id);
      if (unreadIds.length > 0) markRead(unreadIds);
    };
    markVisibleAsRead();
    document.addEventListener("visibilitychange", markVisibleAsRead);
    return () => document.removeEventListener("visibilitychange", markVisibleAsRead);
  }, [messages, user?.id]);

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

  // Khôi phục đúng vị trí cuộn sau khi thêm tin CŨ vào ĐẦU danh sách (cuộn
  // lên xem lịch sử) - nếu không, trình duyệt tự giữ nguyên scrollTop (tính
  // bằng px từ đỉnh), khiến khung nhìn bị "nhảy" xuống đúng bằng chiều cao
  // đám tin vừa chèn thêm phía trên. useLayoutEffect (không phải useEffect)
  // vì cần chỉnh TRƯỚC khi trình duyệt vẽ khung hình tiếp theo.
  useLayoutEffect(() => {
    if (prependScrollAdjustRef.current != null && scrollRef.current) {
      const prevHeight = prependScrollAdjustRef.current;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
      prependScrollAdjustRef.current = null;
    }
  }, [messages]);

  // Cursor-based pagination thật (fetchMessagesPage - src/lib/supabaseDb.js)
  // khi cuộn lên đầu khung chat, ĐỘC LẬP với loadMessages()/applyMessageList()
  // ở trên (không đụng vào cơ chế cache/grace-period đang chạy cho tin mới) -
  // chỉ thêm tin CŨ HƠN tin cũ nhất đang có vào đầu danh sách.
  const loadOlderMessages = async () => {
    if (loadingOlderRef.current || !hasMoreOlderRef.current || !user?.id || messages.length === 0) return;
    const oldest = messages[0];
    if (!oldest?.created_date || !scrollRef.current) return;
    loadingOlderRef.current = true;
    prependScrollAdjustRef.current = scrollRef.current.scrollHeight;
    try {
      const older = await fetchMessagesPage(user.id, { beforeCreatedAt: oldest.created_date, limit: 30 });
      if (!older || older.length === 0) {
        hasMoreOlderRef.current = false;
        prependScrollAdjustRef.current = null;
        return;
      }
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const toAdd = older.filter((m) => !existingIds.has(m.id));
        if (toAdd.length === 0) {
          prependScrollAdjustRef.current = null;
          return prev;
        }
        return [...toAdd, ...prev].sort(
          (a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0)
        );
      });
    } catch (e) {
      prependScrollAdjustRef.current = null;
    } finally {
      loadingOlderRef.current = false;
    }
  };

  const handleScroll = (e) => {
    if (e.target.scrollTop < 60) loadOlderMessages();
  };

  // Gửi thật (tạo Message trên Postgres) - tách riêng khỏi handleSend() để
  // retryFailedMessage() (bấm "Gửi lại" trên tin lỗi) tái dùng được mà
  // không phải upload lại file đính kèm đã upload thành công trước đó
  // (attachments lúc này đã là URL, không phải File object nữa).
  const resendMessage = async (content, attachments, topic) => {
    await base44.entities.Message.create({
      sender: "user",
      conversation_id: user.id,
      user_id: user.id,
      content,
      attachments: attachments || [],
      ...(topic ? { topic } : {}),
    });
    localStorage.setItem("vinclub_msg_update", Date.now().toString());
  };

  // Tin lỗi (message.__status === "failed", gắn bởi LocalEntityClient.create()
  // khi ghi Postgres thất bại - xem base44Client.js) được GIỮ LẠI trên màn
  // hình (không xoá như trước) kèm nút "Gửi lại" - bấm vào xoá tin lỗi cũ,
  // gửi lại đúng nội dung/đính kèm đó dưới 1 id mới.
  const retryFailedMessage = (failedMsg) => {
    setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
    resendMessage(failedMsg.content, failedMsg.attachments, failedMsg.topic).catch(() => {
      toast.error("Không thể gửi lại tin nhắn. Vui lòng thử lại.");
    });
  };

  const handleSend = async (text, files, topic) => {
    if (!user) {
      toast.error("Vui lòng đăng nhập để gửi tin nhắn");
      return;
    }
    // Gửi tin nhắn mới luôn tự mở lại hội thoại đã đóng (trigger Postgres
    // reopen_support_conversation_on_customer_message xử lý phần ghi thật -
    // khách hàng không có quyền tự sửa support_conversations). Cập nhật
    // lạc quan ở đây chỉ để badge đổi ngay, không cần đợi Realtime.
    if (convStatus === "closed") setConvStatus("open");
    setSending(true);
    try {
      const attachments = [];
      for (const file of files) {
        try {
          if (file.type?.startsWith("video/") && file.size > LARGE_VIDEO_WARN_BYTES) {
            toast("Video khá nặng, có thể mất thêm thời gian để gửi");
          }
          const toUpload = file.type?.startsWith("image/") ? await compressImageFile(file) : file;
          const res = await base44.integrations.Core.UploadFile({ file: toUpload });
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

      await resendMessage(text.trim(), attachments, topic);

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

      // Immediate reload (resendMessage() ở trên đã tự bắn "vinclub_msg_update")
      await loadMessages(user.id, user);
    } catch (e) {
      toast.error("Không thể gửi tin nhắn. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
  };

  const userFullName = user?.full_name || user?.name || user?.display_name || (user?.email ? user.email.split("@")[0] : "Quý khách");

  // Link liên kết Telegram Business (xem handleBusinessLinkStart() server.ts)
  // - mã hoá user.id thật làm start_param, Telegram chỉ chấp nhận [A-Za-z0-9_-]
  // nên đổi "-" (có trong UUID) thành "_", server sẽ đổi ngược lại khi nhận
  // /start. Kênh này CHỈ THÊM VÀO, không thay thế khung chat trong app hiện có
  // (đã xác nhận giữ song song cả 2 kênh).
  const telegramBotUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
  const telegramLinkUrl =
    telegramBotUsername && user?.id
      ? `https://t.me/${telegramBotUsername}?start=${user.id.replace(/-/g, "_")}`
      : null;

  return (
    <div className="relative h-[100dvh] w-full bg-[#f0f2f5] overflow-hidden flex flex-col justify-between font-['Be_Vietnam_Pro',sans-serif]">
      {/* Fixed Header */}
      <SupportHeader status={convStatus} />

      {/* Banner "Đang kết nối lại..." - không chặn UI, chỉ báo trạng thái
          kênh Realtime đang tự nối lại (đã có sẵn từ PR #49) */}
      {connStatus && connStatus !== "SUBSCRIBED" && (
        <div className="w-full bg-amber-50 border-b border-amber-200 text-amber-700 text-[10px] font-semibold text-center py-1.5">
          Đang kết nối lại...
        </div>
      )}

      {/* Main Messages View - Full Height Scroll Area */}
      <main
        ref={scrollRef}
        onScroll={handleScroll}
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
          {telegramLinkUrl && (
            <a
              href={telegramLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-1 text-[10.5px] font-semibold text-[#229ED9] hover:underline"
            >
              <Send className="w-3 h-3" />
              Liên hệ CSKH qua Telegram
            </a>
          )}
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="text-center py-6 text-xs text-gray-400">
            Đang tải tin nhắn hội thoại...
          </div>
        )}

        {/* Message Bubble List */}
        {messages.map((m) => (
          <MessageBubble
            key={m.id || Math.random()}
            message={m}
            onRetry={m.sender === "user" && m.__status === "failed" ? () => retryFailedMessage(m) : undefined}
          />
        ))}

        {/* Typing indicator - "CSKH đang nhập..." */}
        {peerTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-xs px-3 py-2 text-[11px] text-gray-400 shadow-xs italic">
              CSKH đang nhập...
            </div>
          </div>
        )}
      </main>

      {/* Overlay tự đóng phiên khi rảnh - thuần UI, không đổi trạng thái vé */}
      {idleExpired && (
        <div
          className="absolute inset-0 z-30 bg-black/40 backdrop-blur-xs flex items-center justify-center p-6 cursor-pointer"
          onClick={() => {
            setIdleExpired(false);
            resumeIdleSession();
          }}
        >
          <div className="bg-white rounded-2xl p-5 max-w-xs text-center space-y-2 shadow-xl">
            <p className="text-sm font-bold text-gray-900">Phiên chat đã tạm nghỉ</p>
            <p className="text-[11px] text-gray-500">Do không có hoạt động trong 1 thời gian. Chạm vào đây để tiếp tục trò chuyện.</p>
            <button
              type="button"
              className="mt-1 px-4 py-2 rounded-xl bg-[#948154] text-white text-[11px] font-bold cursor-pointer"
            >
              Tiếp tục trò chuyện
            </button>
          </div>
        </div>
      )}

      {/* Fixed Fullscreen Chat Input */}
      <ChatInput onSend={handleSend} sending={sending} onTyping={notifyTyping} />
    </div>
  );
}
