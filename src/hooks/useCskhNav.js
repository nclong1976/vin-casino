import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

// Mục "CSKH" chính (BottomNav, Home, menu Profile) - CHỈ áp dụng cho các
// lối vào CHUNG (bấm để bắt đầu/tiếp tục trò chuyện CSKH), KHÔNG áp dụng
// cho các link /support mang theo ngữ cảnh riêng (vd DepositModal.jsx điều
// hướng sau khi vừa tạo sẵn 1 tin nhắn yêu cầu nạp tiền trong chính
// Message/support_conversations của vin-casino - đổi những chỗ đó sang app
// cskh tách biệt sẽ làm tin nhắn vừa tạo biến mất khỏi màn hình).
//
// Khi VITE_CSKH_URL được cấu hình: mở app cskh (tab mới) tại "/id",
// kèm sẵn username của hội viên (?id=) để khách không phải gõ lại ID.
// Chưa cấu hình: giữ nguyên hành vi cũ, điều hướng nội bộ tới /support.
export function useCskhNav() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return function openCskh() {
    const base = import.meta.env.VITE_CSKH_URL;
    if (!base) {
      navigate("/support");
      return;
    }
    const id = user?.username || user?.id || "";
    const url = new URL("/id", base);
    if (id) url.searchParams.set("id", id);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };
}
