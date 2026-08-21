import { base44 } from "@/api/base44Client";
import { getCardTierInfo } from "@/lib/membershipUtils";
import { adjustUserBalance } from "@/lib/balanceSync";

/**
 * Tự động kiểm tra và trả lãi cho hội viên VinClub:
 * 1. Tự động tính lãi & hoàn vốn dự án khi kết thúc kỳ hạn thời gian thực.
 * 2. Tự động rà soát vào 9:00 AM hằng ngày và cộng lợi nhuận tiền lãi theo từng cấp bậc thẻ VIP.
 */
export async function runDailyYieldAndMaturityCheck(user) {
  if (!user || !user.id) return;
  // Tài khoản đã bị Admin khóa - không tự động cộng lãi/đáo hạn cho tới khi
  // được mở khóa lại và xác minh dữ liệu đầu tư là chính xác. Đây là lớp
  // chặn đầu tiên, độc lập với các kiểm tra "đã xử lý chưa" bên dưới - hữu
  // ích khi cần dừng khẩn cấp 1 tài khoản đang bị lặp cộng tiền sai mà chưa
  // rõ nguyên nhân gốc.
  if (user.is_locked) return;

  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentHour = now.getHours();

    // ==========================================
    // 1. RÀ SOÁT LÃI TÍCH LŨY HẰNG NGÀY (9:00 AM)
    // ==========================================
    // Thực hiện cộng lãi 9h sáng nếu thời gian hiện tại >= 9h sáng và chưa nhận lãi ngày hôm nay.
    //
    // QUAN TRỌNG: "đã cộng lãi hôm nay chưa" PHẢI kiểm tra bằng chính lịch
    // sử ví trên server (ground truth), KHÔNG được chỉ dựa vào localStorage
    // như trước đây. localStorage bị xoá (người dùng xoá cache trình duyệt,
    // đổi thiết bị, hoặc dùng chế độ ẩn danh) khiến app tưởng lầm "chưa cộng
    // lãi hôm nay" và cộng lại lần nữa - lần cộng sau lại tính trên số dư ĐÃ
    // BAO GỒM lãi của chính hôm đó, khiến lãi tăng theo cấp số nhân không
    // kiểm soát mỗi lần bị kích hoạt lại (đã tái hiện thực tế: 1 tài khoản
    // test bị cộng nhầm tới hàng chục nghìn tỷ VNĐ chỉ sau vài lần xoá cache
    // trong lúc QA). Quét thẳng walletTxs vừa tải để xác định chính xác.
    const walletTxs = await base44.entities.WalletTransaction.filter(
      { $or: [{ user_id: user.id }, { created_by_id: user.id }] },
      "-created_date",
      1000
    ).catch(() => []);

    const alreadyPaidToday = walletTxs.some(
      (t) => t.category === "Lãi VIP Hằng Ngày" && String(t.created_date || "").slice(0, 10) === todayStr
    );

    if (currentHour >= 9 && !alreadyPaidToday) {
      const depositSum = walletTxs
        .filter((t) => t.type === "deposit")
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0) + (user.total_deposited || (user.role === "admin" ? (user.balance ?? 0) : 0));

      // Hạng VIP không còn tự suy ra từ tổng nạp - lãi suất áp dụng theo đúng
      // hạng Admin đã gán cho tài khoản (user.membership_tier), mặc định
      // Member 0,2%/ngày nếu chưa được gán hạng nào.
      const tierInfo = getCardTierInfo(user.membership_tier);
      const dailyRate = tierInfo.dailyRate || 0.2; // 0.2%, 0.4%, 0.8%, 1.2%

      // Lãi suất được tính dựa trên tổng nạp tích lũy (hoặc tối thiểu 100K nếu nạp tích lũy chưa có)
      const baseForInterest = Math.max(depositSum, Number(user.balance) || 0);

      if (baseForInterest > 0) {
        const dailyProfit = Math.round(baseForInterest * (dailyRate / 100));

        if (dailyProfit > 0) {
          // Tạo giao dịch cộng lãi vào ví
          await base44.entities.WalletTransaction.create({
            user_id: user.id,
            type: "deposit",
            amount: dailyProfit,
            note: `Lợi nhuận tích lũy 9h sáng (${tierInfo.name} - ${tierInfo.dailyRateLabel})`,
            category: "Lãi VIP Hằng Ngày",
            status: "approved"
          }).catch(() => null);

          // Áp dụng thật vào số dư qua RPC nguyên tử - trước đây bước này
          // KHÔNG tồn tại, chỉ tạo bản ghi giao dịch rồi trông chờ auto-heal
          // ở Profile.jsx tự tính lại và ghi đè, khiến lãi chỉ thực sự "vào
          // ví" khi user tình cờ mở trang Cá nhân, và mỗi lần auto-heal chạy
          // lại cộng dồn total_deposited sai (xem Profile.jsx). Không cộng
          // vào total_deposited ở đây vì đã được tính trong depositSum phía
          // trên từ chính lịch sử ví - cộng thêm sẽ đếm trùng.
          await adjustUserBalance(user.id, dailyProfit, 0).catch(() => null);

          // Gửi thông báo hệ thống
          await base44.entities.Message.create({
            sender: "admin",
            conversation_id: user.id,
            content: `[Cộng Lãi Hằng Ngày 9h Sáng]\n\nHệ thống đã tự động rà soát tài khoản và cộng +${dailyProfit.toLocaleString("vi-VN")} VNĐ lãi suất tích lũy theo cấp hạng ${tierInfo.name} (${tierInfo.dailyRateLabel}) vào ví của bạn.\n\nCảm ơn bạn đã đồng hành cùng VinClub!`,
            attachments: []
          }).catch(() => null);

          // Bắn sự kiện cập nhật số dư thời gian thực
          window.dispatchEvent(new CustomEvent("vinclub:balance_updated"));
        }
      }
    }

    // ==========================================
    // 2. RÀ SOÁT KẾT THÚC DỰ ÁN ĐẦU TƯ THỜI GIAN THỰC
    // ==========================================
    const userTxs = await base44.entities.Transaction.filter(
      { user_id: user.id },
      "-created_date",
      200
    ).catch(() => []);

    // BẢO VỆ KÉP chống lặp trả đáo hạn (đã tái hiện thực tế: 1 tài khoản bị
    // cộng lặp đúng 1 khoản cố định mỗi ~30 giây, cộng dồn tới hàng chục tỷ
    // chỉ trong vài phút). Chỉ dựa vào tx.payout_status === "paid" là KHÔNG
    // ĐỦ AN TOÀN: nếu Transaction.update() phía dưới ghi thất bại (mất mạng,
    // lỗi tạm thời phía Supabase) hoặc phiên đang chạy mã cũ trước khi ghi
    // Supabase được await đúng cách, trạng thái "đã trả" sẽ không bao giờ
    // được ghi nhận và vòng lặp rà soát mỗi 30 giây sẽ trả tiếp mãi mãi. Vì
    // vậy kiểm tra thêm 1 dấu vết ĐỘC LẬP: đã từng tạo WalletTransaction
    // tham chiếu đúng tx.id này chưa (walletTxs đã tải sẵn ở mục 1 phía
    // trên) - đây là lớp chặn thứ 2, không phụ thuộc việc update() có ghi
    // Supabase thành công hay không.
    const paidTxIds = new Set(
      walletTxs
        .filter((w) => w.category === "Đáo Hạn Dự Án" && typeof w.note === "string")
        .map((w) => {
          const m = w.note.match(/\[ref:([^\]]+)\]/);
          return m ? m[1] : null;
        })
        .filter(Boolean)
    );

    for (const tx of userTxs) {
      if (tx.payout_status === "paid" || tx.status === "completed_payout") continue;
      if (paidTxIds.has(tx.id)) continue;

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

      // Nếu đã đủ thời gian đáo hạn
      if (elapsedMs >= durationMs) {
        const payoutAmount = Number(tx.total) || (Number(tx.amount) + Number(tx.profit));

        // Đánh dấu "đã trả" (cả 2 lớp bảo vệ) TRƯỚC KHI thực sự cộng tiền -
        // nếu cộng tiền trước rồi mới đánh dấu, một lỗi giữa chừng có thể
        // khiến vòng lặp kế tiếp (30 giây sau) cộng lại lần nữa trước khi
        // kịp thấy dấu "đã trả". [ref:tx.id] nhúng trong note để lớp bảo vệ
        // thứ 2 ở trên nhận diện được, dù bảng WalletTransaction thật trên
        // Postgres không có cột lưu category/note.
        await base44.entities.Transaction.update(tx.id, {
          status: "completed_payout",
          payout_status: "paid"
        }).catch(() => null);

        // 2. Cộng vốn + lãi vào ví người dùng
        await base44.entities.WalletTransaction.create({
          user_id: user.id,
          type: "deposit",
          amount: payoutAmount,
          note: `Đáo hạn dự án "${tx.project_title}" - Hoàn vốn & trả lãi [ref:${tx.id}]`,
          category: "Đáo Hạn Dự Án",
          status: "approved"
        }).catch(() => null);

        // Áp dụng thật vào số dư qua RPC nguyên tử (xem giải thích tương tự
        // ở nhánh lãi VIP hằng ngày phía trên)
        await adjustUserBalance(user.id, payoutAmount, 0).catch(() => null);

        // 3. Thông báo cho người dùng
        await base44.entities.Message.create({
          sender: "admin",
          conversation_id: user.id,
          content: `[DỰ ÁN ĐÃ ĐÁO HẠN KẾT THÚC THỜI GIAN THỰC]\n\nDự án: ${tx.project_title}\nTổng nhận: ${payoutAmount.toLocaleString("vi-VN")} VNĐ (Gồm vốn + lãi)\n\nSố tiền đã được tự động cộng vào Ví tài khoản VinClub của bạn.`,
          attachments: []
        }).catch(() => null);

        // Bắn sự kiện cập nhật số dư
        window.dispatchEvent(new CustomEvent("vinclub:balance_updated"));
      }
    }
  } catch (err) {
    console.error("Lỗi trong quá trình rà soát tự động lãi suất:", err);
  }
}
