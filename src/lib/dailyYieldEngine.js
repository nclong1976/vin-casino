import { base44 } from "@/api/base44Client";
import { resolveProjectMaturityPayout } from "@/lib/supabaseDb";

/**
 * Tự động kiểm tra và trả lãi cho hội viên VinClub:
 * - Tự động tính lãi & hoàn vốn dự án khi kết thúc kỳ hạn thời gian thực.
 *
 * ĐÃ GỠ BỎ HOÀN TOÀN: cơ chế "cộng lãi tích lũy hằng ngày lúc 9h sáng" theo
 * % hạng VIP. Đây là nguồn gốc gây sự cố tài chính nghiêm trọng (lãi chồng
 * lãi tăng theo cấp số nhân không kiểm soát khi bị kích hoạt lặp lại từ
 * nhiều thiết bị/phiên) đã xảy ra thực tế nhiều lần. Chỉ còn lại cơ chế trả
 * gốc + lãi khi MỘT khoản đầu tư cụ thể (Transaction) đáo hạn thật sự.
 *
 * Việc XÁC THỰC đáo hạn + TÍNH tiền + CỘNG tiền giờ chạy hoàn toàn trên
 * server qua RPC resolve_project_maturity_payout (xem migration
 * create_resolve_project_maturity_payout_rpc) - trước đây hàm này tự đọc
 * tx.total/tx.amount/tx.profit rồi tự cộng thẳng vào ví, trong khi RLS cho
 * phép người dùng tự sửa các field đó trên chính giao dịch của mình (đã bị
 * khoá lại bởi trigger protect_transaction_financial_fields), và việc ghi
 * (đổi status + tạo WalletTransaction + cộng số dư) là 3 lệnh RIÊNG RẼ
 * không nguyên tử - nay gộp thành đúng 1 RPC transaction. Hàm dưới đây giờ
 * chỉ còn vai trò LỌC CỤC BỘ (tránh gọi RPC vô ích cho khoản còn lâu mới
 * đáo hạn) rồi gọi RPC để lấy kết quả THẬT.
 */
export async function runDailyYieldAndMaturityCheck(user) {
  if (!user || !user.id) return;
  // Tài khoản đã bị Admin khóa - không tự động trả đáo hạn cho tới khi
  // được mở khóa lại và xác minh dữ liệu đầu tư là chính xác. Đây là lớp
  // chặn đầu tiên, độc lập với các kiểm tra "đã xử lý chưa" bên dưới - hữu
  // ích khi cần dừng khẩn cấp 1 tài khoản đang bị lặp cộng tiền sai mà chưa
  // rõ nguyên nhân gốc.
  if (user.is_locked) return;

  try {
    const now = new Date();

    // ==========================================
    // RÀ SOÁT KẾT THÚC DỰ ÁN ĐẦU TƯ THỜI GIAN THỰC
    // ==========================================
    const userTxs = await base44.entities.Transaction.filter(
      { user_id: user.id },
      "-created_date",
      200
    ).catch(() => []);

    for (const tx of userTxs) {
      if (tx.payout_status === "paid" || tx.status === "completed_payout") continue;

      const createdTime = new Date(tx.created_date || tx.created_at || now).getTime();
      const elapsedMs = now.getTime() - createdTime;

      // Xử lý thời gian đáo hạn (duration_days)
      const durationVal = Number(tx.duration_days) || 30;
      let durationMs = durationVal * 24 * 60 * 60 * 1000; // Mặc định ngày

      // Nếu tên dự án chứa Phút hoặc Giờ
      if (String(tx.project_title || "").includes("phút") || String(tx.project_title || "").includes("Phút")) {
        durationMs = durationVal * 60 * 1000;
      } else if (String(tx.project_title || "").includes("giờ") || String(tx.project_title || "").includes("Giờ")) {
        durationMs = durationVal * 60 * 60 * 1000;
      }

      // Chỉ là bộ lọc cục bộ để tránh gọi RPC vô ích cho các khoản còn lâu
      // mới đáo hạn - quyết định THẬT (đã đủ giờ chưa theo đồng hồ server,
      // đã trả chưa, trả đúng bao nhiêu) đều do RPC tự xác thực lại, không
      // tin phép tính bằng đồng hồ máy người dùng ở đây.
      if (elapsedMs < durationMs) continue;

      const result = await resolveProjectMaturityPayout(tx.id).catch(() => null);
      if (!result?.paid) continue;

      // Thông báo cho người dùng
      await base44.entities.Message.create({
        sender: "admin",
        conversation_id: user.id,
        user_id: user.id,
        content: `[DỰ ÁN ĐÃ ĐÁO HẠN KẾT THÚC THỜI GIAN THỰC]\n\nDự án: ${result.project_title || tx.project_title}\nTổng nhận: ${Number(result.payout_amount || 0).toLocaleString("vi-VN")} VNĐ (Gồm vốn + lãi)\n\nSố tiền đã được tự động cộng vào Ví tài khoản VinClub của bạn.`,
        attachments: []
      }).catch(() => null);

      // Bắn sự kiện cập nhật số dư
      window.dispatchEvent(new CustomEvent("vinclub:balance_updated"));
    }
  } catch (err) {
    console.error("Lỗi trong quá trình rà soát tự động lãi suất:", err);
  }
}
