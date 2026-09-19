import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import SupportHeader from "@/components/support/SupportHeader";
import MessageBubble from "@/components/support/MessageBubble";
import ChatInput from "@/components/support/ChatInput";
import { DEFAULT_SUPPORT_STATUS } from "@/constants/supportStatus";
import { fetchMessagesPage, fetchMessagesPageByUser } from "@/lib/supabaseDb";
import { markDelivered, markRead } from "@/lib/messageLifecycle";
import { subscribeToConnectionStatus } from "@/api/base44Client";
import { compressImageFile } from "@/lib/imageCompression";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useIdleSessionTimeout } from "@/hooks/useIdleSessionTimeout";
import { getActiveConversationId, recordLeftSupport } from "@/lib/cskhConversation";

// Sắp tin nhắn theo created_date, TIE-BREAK bằng id khi trùng giờ (xem ghi
// chú tại nơi dùng) - dùng chung cho mọi lượt sort trong file này để thứ tự
// hiển thị luôn nhất quán, không phụ thuộc thứ tự tin đến từ REST/poll/
// Realtime.
const byCreatedDateThenId = (a, b) => {
  const t = new Date(a.created_date || 0) - new Date(b.created_date || 0);
  if (t !== 0) return t;
  const ai = String(a.id ?? "");
  const bi = String(b.id ?? "");
  return ai < bi ? -1 : ai > bi ? 1 : 0;
};

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_WARNING_MS = 60 * 1000;

// Lời chào ĐỘNG theo thời gian vắng mặt - phân biệt khách LẦN ĐẦU (chưa từng
// có tin nhắn nào, dưới BẤT KỲ conversation_id cũ nào) với khách QUEN quay
// lại sau khi conversation_id đã rotate (xem cskhConversation.js, KHÔNG đụng
// file đó - hàm này chỉ ĐỌC dữ liệu tin nhắn cũ để chọn câu chào, không ảnh
// hưởng gì tới logic rotate). Trước đây cả 2 trường hợp đều nhận đúng 1 câu
// chào tổng quát giống nhau, không phân biệt được "khách mới" và "khách đã
// từng chat, giờ quay lại sau khi rời trang".
function buildGreetingContent(userFullName, lastPriorMessageDateIso) {
  if (!lastPriorMessageDateIso) {
    return `Kính chào Quý khách ${userFullName}! CSKH VinClub hân hạnh được đồng hành và hỗ trợ Quý khách 24/7. Quý khách cần hỗ trợ dịch vụ nào hôm nay ạ?`;
  }
  const hoursAway = (Date.now() - new Date(lastPriorMessageDateIso).getTime()) / (1000 * 60 * 60);
  if (hoursAway < 24) {
    return `Chào Quý khách ${userFullName} quay lại ạ! Em vẫn ở đây, Quý khách cần hỗ trợ tiếp không ạ?`;
  }
  if (hoursAway < 24 * 7) {
    return `Chào mừng Quý khách ${userFullName} quay lại! Đã một thời gian không gặp, Quý khách cần CSKH hỗ trợ gì hôm nay ạ?`;
  }
  return `Kính chào Quý khách ${userFullName}! Rất vui được đồng hành cùng Quý khách trở lại sau một thời gian. CSKH VinClub luôn sẵn sàng hỗ trợ Quý khách 24/7 ạ.`;
}
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
  // conversation_id ĐANG HOẠT ĐỘNG - khác user.id nếu khách vừa rời trang
  // CSKH >= 10 phút rồi quay lại (xem src/lib/cskhConversation.js). null cho
  // tới khi user.id sẵn sàng (đăng nhập xong).
  const [activeConversationId, setActiveConversationId] = useState(null);
  const scrollRef = useRef(null);
  const greetingCreatedRef = useRef(false);
  const prevLastMsgIdRef = useRef(null);
  const loadingOlderRef = useRef(false);
  const hasMoreOlderRef = useRef(true);
  const prependScrollAdjustRef = useRef(null);

  const { peerTyping, notifyTyping } = useTypingIndicator(activeConversationId, "user");

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

  // Chốt conversation_id ĐANG HOẠT ĐỘNG ngay khi user.id sẵn sàng (chỉ 1 lần
  // mỗi lượt mount trang, không tính lại giữa chừng - "rời trang >= 10 phút"
  // chỉ được xét lại ở LƯỢT MOUNT KẾ TIẾP, không phải liên tục trong lúc
  // đang xem). Đồng thời ghi lại thời điểm "rời trang" khi unmount (chuyển
  // trang khác trong app) HOẶC tab bị ẩn (chuyển app/đóng tab) - xem
  // src/lib/cskhConversation.js.
  useEffect(() => {
    if (!user?.id) return;
    setActiveConversationId(getActiveConversationId(user.id));

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") recordLeftSupport(user.id);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      recordLeftSupport(user.id);
    };
  }, [user?.id]);

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
  const applyMessageList = async (list, conversationId, currentUser, isGreetingCheckOwner) => {
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
        // "list" rỗng ở đây chỉ chứng minh conversation_id HIỆN TẠI (có thể
        // vừa rotate) chưa có tin nào - KHÔNG chứng minh khách chưa từng chat
        // trước đây. Tra thêm 1 tin gần nhất theo user_id (ổn định qua mọi
        // lần rotate) để biết có phải khách quen quay lại hay không, chọn
        // đúng câu chào tương ứng (buildGreetingContent ở trên).
        const priorMessages = await fetchMessagesPageByUser(u?.id, { limit: 1 }).catch(() => []);
        const greetingContent = buildGreetingContent(userFullName, priorMessages?.[0]?.created_date);

        try {
          const newMsg = await base44.entities.Message.create({
            sender: "support",
            conversation_id: conversationId,
            user_id: u?.id,
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
            conversation_id: conversationId,
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
        // So sánh created_date TRƯỚC, nếu TRÙNG GIỜ (cùng mili-giây - hoàn
        // toàn có thể xảy ra khi 2 tin gần như đồng thời, vd tin optimistic
        // của mình + tin admin trả lời gần như cùng lúc) thì lấy id làm tiêu
        // chí phụ CỐ ĐỊNH. Array.sort của JS ổn định (stable) nhưng chỉ giữ
        // đúng thứ tự sẵn có trong mảng ĐẦU VÀO khi 2 phần tử "bằng nhau" -
        // mảng đầu vào ở đây (Array.from(merged.values())) có thứ tự phụ
        // thuộc vào thứ tự chèn vào Map, mà thứ tự đó lại đổi qua từng lượt
        // gọi (REST/poll/Realtime trả tin theo thứ tự khác nhau, "prev" từ
        // state cũ chèn sau "incoming") - thiếu tiêu chí phụ cố định khiến 2
        // tin trùng giờ có thể ĐỔI CHỖ cho nhau giữa các lần render, nhìn
        // như tin nhắn "tự nhảy" vị trí dù nội dung không hề đổi.
        return Array.from(merged.values()).sort(byCreatedDateThenId);
      });
  };

  // Lượt tải qua REST (mount lần đầu, poll 8s dự phòng, sự kiện cross-tab) -
  // vẫn giữ nguyên hành vi cũ (fetch rồi hợp nhất qua applyMessageList()).
  const loadMessages = async (conversationId, currentUser) => {
    if (!conversationId) return;
    const isGreetingCheckOwner = claimGreetingOwnership();
    try {
      // Chỉ tải 10 tin gần nhất mỗi lượt (mount + poll 8s) thay vì 200 - nhẹ
      // hơn, tải nhanh hơn cho khách hàng. Muốn xem lịch sử cũ hơn thì cuộn
      // lên đầu khung chat, đã có loadOlderMessages()/fetchMessagesPage() lo
      // phần đó (cursor pagination thật, không phụ thuộc giới hạn này).
      const list = await base44.entities.Message.filter(
        { conversation_id: conversationId },
        "-created_date",
        10
      );
      await applyMessageList(list, conversationId, currentUser, isGreetingCheckOwner);
    } catch (e) {
      // quiet fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Đợi activeConversationId chốt xong (effect ở trên, chạy ngay khi
    // user.id sẵn sàng) trước khi tải/lắng nghe tin nhắn - tránh 1 lượt tải
    // "hụt" bằng user.id ngay lúc mount rồi phải tải lại lần 2 bằng đúng
    // conversation_id đang hoạt động.
    if (!user || !activeConversationId) return;

    // 1. Initial Load with Greeting Generation
    loadMessages(activeConversationId, user);

    // 2. Real-time Subscription via Supabase Realtime - base44Client.js giờ
    // phát thẳng dữ liệu Postgres vừa thay đổi (payload thật, không phải
    // debounce-rồi-refetch) cho entity Message, nên áp thẳng "freshItems"
    // nhận được ở đây vào state luôn, KHÔNG gọi loadMessages() (sẽ tự fetch
    // lại REST 1 lần nữa) - đây chính là 1 lượt round-trip thừa từng cộng
    // thêm độ trễ mỗi khi có tin nhắn mới/bị xóa từ phía admin lẫn người
    // dùng, dù dữ liệu mới nhất đã có sẵn ngay trong tay.
    const unsub = base44.entities.Message.subscribe((freshItems) => {
      if (!Array.isArray(freshItems)) {
        loadMessages(activeConversationId, user);
        return;
      }
      // .filter() tạo mảng MỚI, làm mất __deletedId (non-enumerable) đã gắn
      // trên freshItems - phải gắn lại vào kết quả cuối, không thì tin nhắn
      // vừa xóa sẽ lại bị grace-period giữ lại nếu vừa tạo dưới 5 giây (xem
      // ghi chú confirmedDeletedId trong applyMessageList()).
      const deletedId = freshItems.__deletedId;
      const list = freshItems.filter((m) => m.conversation_id === activeConversationId);
      if (deletedId !== undefined) {
        try {
          Object.defineProperty(list, '__deletedId', { value: deletedId, enumerable: false });
        } catch (e) {}
      }
      const isGreetingCheckOwner = claimGreetingOwnership();
      applyMessageList(list, activeConversationId, user, isGreetingCheckOwner).finally(() => setLoading(false));
    });

    // 3. Polling fallback - chỉ là lưới an toàn dự phòng (Message.subscribe()
    // đã xử lý real-time chính), nên giãn ra 8s thay vì 2s để tránh ép
    // re-render/cuộn liên tục gây giật khi vuốt.
    const pollInterval = setInterval(() => {
      loadMessages(activeConversationId, user);
    }, 8000);

    // 4. Cross-tab LocalStorage Sync
    const handleStorageChange = (e) => {
      if (e.key === "vinclub_msg_update") {
        loadMessages(activeConversationId, user);
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      if (typeof unsub === "function") unsub();
      clearInterval(pollInterval);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [user, activeConversationId]);

  // Trạng thái hội thoại (đang mở/chờ phản hồi/đã đóng) do Admin đặt bên
  // MessagesTab.jsx - chỉ để HIỂN THỊ badge ở đây, khách hàng không tự đổi
  // được (xem policy support_conversations_write_admin_only trong migration
  // add_support_conversations_status). Không có dòng nào cho user này nghĩa
  // là coi như mặc định "open" (chưa admin nào từng đổi trạng thái).
  useEffect(() => {
    if (!activeConversationId) return;
    let cancelled = false;

    const applyRow = (row) => {
      if (cancelled) return;
      setConvStatus(row?.status || DEFAULT_SUPPORT_STATUS);
    };

    base44.entities.SupportConversation.filter({ id: activeConversationId })
      .then((rows) => applyRow(rows?.[0]))
      .catch(() => {});

    const unsub = base44.entities.SupportConversation.subscribe((rows) => {
      const mine = Array.isArray(rows) ? rows.find((r) => r.id === activeConversationId) : null;
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
  }, [activeConversationId]);

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
    if (loadingOlderRef.current || !hasMoreOlderRef.current || !activeConversationId || messages.length === 0) return;
    const oldest = messages[0];
    if (!oldest?.created_date || !scrollRef.current) return;
    loadingOlderRef.current = true;
    prependScrollAdjustRef.current = scrollRef.current.scrollHeight;
    try {
      const older = await fetchMessagesPage(activeConversationId, { beforeCreatedAt: oldest.created_date, limit: 30 });
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
        return [...toAdd, ...prev].sort(byCreatedDateThenId);
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
      conversation_id: activeConversationId,
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
    if (!user || !activeConversationId) {
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

      // Thông báo cho Admin - KHÔNG await: Message.create() ở resendMessage()
      // trên đã tự đẩy bubble optimistic + Realtime lo phần Admin nhận tin,
      // đây chỉ là thông báo phụ (chuông/badge) - đợi thêm 1 round-trip
      // Postgres nữa ở đây chỉ cộng thêm độ trễ cảm nhận cho người gửi mà
      // không đổi gì về việc Admin nhận tin nhanh hay chậm.
      const uName = user?.full_name || user?.name || user?.display_name || user?.email;
      base44.entities.Notification.create({
        title: "Tin nhắn CSKH mới từ hội viên",
        content: `Hội viên ${uName} vừa gửi tin nhắn: "${text.trim() || 'Hình ảnh/Tệp đính kèm'}"`,
        type: "admin",
        user_id: "admin",
        is_read: false,
      }).catch(() => {});

      // KHÔNG reload lại danh sách ở đây: Message.create() (trong
      // resendMessage()) đã tự notifySubscribers() bản optimistic RỒI bản
      // thật ngay khi Postgres xác nhận - Message.subscribe() ở effect phía
      // trên đã áp thẳng cả 2 lượt vào state. Gọi loadMessages() thêm ở đây
      // là 1 round-trip REST thừa, chỉ làm nút gửi giữ trạng thái "đang gửi"
      // lâu hơn mà không đổi gì nội dung hiển thị.
    } catch (e) {
      toast.error("Không thể gửi tin nhắn. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
  };

  // Link liên hệ trực tiếp CSKH qua Viber (nút icon trong SupportHeader) -
  // kênh này CHỈ THÊM VÀO, không thay thế khung chat trong app hiện có.
  const viberContactUrl = "https://viber.me/84898072422";

  return (
    <div className="relative h-[100dvh] w-full bg-[#f0f2f5] overflow-hidden flex flex-col justify-between font-['Be_Vietnam_Pro',sans-serif]">
      {/* Fixed Header */}
      <SupportHeader status={convStatus} viberUrl={viberContactUrl} />

      {/* Banner "Đang kết nối lại..." - không chặn UI, chỉ báo trạng thái
          kênh Realtime đang tự nối lại (đã có sẵn từ PR #49) */}
      {connStatus && connStatus !== "SUBSCRIBED" && (
        <div className="w-full bg-amber-50 border-b border-amber-200 text-amber-700 text-[10px] font-semibold text-center py-1.5">
          Đang kết nối lại...
        </div>
      )}

      {/* Main Messages View - Full Height Scroll Area
          KHÔNG dùng class "scroll-smooth" (scroll-behavior: smooth ở CSS) -
          class này khiến MỌI thay đổi scrollTop đều tự động chạy hoạt ảnh
          trượt mượt, kể cả lượt gán scrollTop TRỰC TIẾP trong
          useLayoutEffect bên dưới (khôi phục đúng vị trí cuộn ngay lập tức
          sau khi chèn thêm tin CŨ vào đầu danh sách) - lượt gán đó BẮT BUỘC
          phải tức thời (chạy trước khi trình duyệt vẽ khung hình kế tiếp)
          để không lộ ra, nhưng bị CSS ép chạy hoạt ảnh trượt nên người dùng
          nhìn thấy khung chat "giật/nhảy" mỗi lần cuộn lên xem lịch sử cũ.
          Cuộn mượt khi có tin MỚI vẫn giữ nguyên - tự chỉ định qua
          scrollTo({behavior:"smooth"}) trong effect tương ứng bên dưới. */}
      <main
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 w-full max-w-4xl mx-auto overflow-y-auto px-3.5 py-4 space-y-3"
        style={{ overscrollBehavior: "contain" }}
      >
        {/* Loading Spinner */}
        {loading && (
          <div className="text-center py-6 text-xs text-gray-400">
            Đang tải tin nhắn hội thoại...
          </div>
        )}

        {/* Message Bubble List */}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
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
      <ChatInput
        onSend={handleSend}
        sending={sending}
        onTyping={notifyTyping}
        showQuickTopics={messages.length <= 1}
      />
    </div>
  );
}
