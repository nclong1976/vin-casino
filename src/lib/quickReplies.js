// Mẫu tin nhắn gửi nhanh (quick reply) cho CSKH - admin tự chỉnh theo ý mình.
// Lưu theo THIẾT BỊ (localStorage) để mỗi admin có bộ mẫu riêng, không đụng
// dữ liệu chung. Nếu chưa chỉnh gì thì dùng bộ mặc định bên dưới.
//
// Mỗi mẫu: { label, text }. Chọn 1 mẫu chỉ ĐIỀN vào ô soạn tin (không tự gửi),
// để admin xem/sửa trước khi gửi.

export const DEFAULT_QUICK_REPLIES = [
  { label: "Lời chào mở đầu", text: "Xin chào Quý khách! Em là CSKH VinClub. Em có thể hỗ trợ gì cho Quý khách ạ?" },
  { label: "Đã tiếp nhận, đang xử lý", text: "Dạ em đã tiếp nhận yêu cầu của Quý khách và đang chuyển bộ phận liên quan xử lý. Quý khách vui lòng chờ trong ít phút ạ." },
  { label: "Duyệt nạp tiền thành công", text: "Yêu cầu nạp tiền của Quý khách đã được duyệt thành công, số dư ví đã được cộng đầy đủ. Cảm ơn Quý khách đã tin tưởng đồng hành cùng VinClub!" },
  { label: "Duyệt rút tiền thành công", text: "Lệnh rút tiền của Quý khách đã được duyệt và chuyển khoản thành công. Quý khách vui lòng kiểm tra tài khoản ngân hàng, tiền sẽ về trong ít phút ạ." },
  { label: "Từ chối yêu cầu", text: "Rất tiếc, yêu cầu của Quý khách chưa thể xử lý do: [lý do]. Quý khách vui lòng kiểm tra lại và gửi lại yêu cầu ạ." },
  { label: "Yêu cầu bổ sung giấy tờ", text: "Để xác minh giao dịch, Quý khách vui lòng gửi thêm [ảnh CCCD/sao kê chuyển khoản] giúp em ạ. Em cảm ơn Quý khách!" },
  { label: "Thông báo tài khoản tạm khóa", text: "Tài khoản của Quý khách hiện đang tạm khóa để xác minh bảo mật. Quý khách vui lòng liên hệ CSKH để được hỗ trợ mở khóa sớm nhất ạ." },
  { label: "Xin lỗi vì phản hồi chậm", text: "Em xin lỗi vì đã để Quý khách chờ lâu. Hiện hệ thống đang xử lý nhiều yêu cầu cùng lúc, em sẽ hỗ trợ Quý khách ngay ạ." },
  { label: "Cảm ơn & kết thúc hỗ trợ", text: "Cảm ơn Quý khách đã liên hệ VinClub. Nếu cần hỗ trợ thêm, Quý khách cứ nhắn lại đây ạ. Chúc Quý khách một ngày tốt lành!" },
];

const STORAGE_KEY = "vinclub_admin_quick_replies";

function sanitize(list) {
  if (!Array.isArray(list)) return null;
  const cleaned = list
    .map((t) => ({
      label: String(t?.label ?? "").trim(),
      text: String(t?.text ?? "").trim(),
    }))
    .filter((t) => t.label || t.text);
  return cleaned;
}

/** Đọc bộ mẫu của thiết bị này; chưa chỉnh thì trả về bộ mặc định. */
export function loadQuickReplies() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_QUICK_REPLIES];
    const parsed = sanitize(JSON.parse(raw));
    // Mảng rỗng hợp lệ (admin cố ý xóa hết) vẫn tôn trọng; chỉ rơi về mặc
    // định khi dữ liệu hỏng (parsed === null).
    return parsed === null ? [...DEFAULT_QUICK_REPLIES] : parsed;
  } catch {
    return [...DEFAULT_QUICK_REPLIES];
  }
}

/** Lưu bộ mẫu cho thiết bị này. Trả về danh sách đã làm sạch. */
export function saveQuickReplies(list) {
  const cleaned = sanitize(list) || [];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  } catch {
    // Hết dung lượng/chặn storage: bỏ qua, phiên hiện tại vẫn dùng được.
  }
  return cleaned;
}

/** Khôi phục bộ mẫu mặc định (xóa tùy chỉnh của thiết bị). */
export function resetQuickReplies() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return [...DEFAULT_QUICK_REPLIES];
}
