/**
 * Nguồn logic DUY NHẤT cho mô hình "Lãi suất toàn kỳ" - thay thế 3 bản sao
 * trùng lặp trước đây trong DepositModal.jsx/ProjectCard.jsx/ContractDocument.jsx
 * (mỗi nơi tự định nghĩa lại isMinute/isHourly/isDaily bằng heuristic riêng).
 *
 * project.total_term_interest_rate / project.term_duration_minutes là 2 cột
 * số thật trong bảng investment_projects (xem
 * supabase_total_term_interest_migration.sql) - lãi suất áp 1 LẦN cho toàn
 * bộ kỳ hạn, thanh toán gốc + lãi một lần khi đáo hạn. project.rate/
 * project.duration (chuỗi cũ) chỉ còn giữ lại để hiển thị đơn vị kỳ hạn
 * (phút/giờ/ngày) cho đẹp UI, KHÔNG dùng để tính tiền nữa.
 */

export const TERM_RATE_LABEL = "Lãi suất toàn kỳ";
export const TERM_PAYOUT_COPY = "Thanh toán gốc và lãi một lần khi đáo hạn dự án";

// 2 hạng mục trả lãi HÀNG NGÀY thay vì gộp 1 lần khi đáo hạn - khớp đúng
// điều kiện category trong trigger compute_transaction_interest() (Postgres,
// xem migration 20260904010000_daily_accrual_payout_for_vinhomes_resort.sql).
// Dùng CHUNG hằng số này ở mọi nơi hiển thị (trước đây LandInvestment.jsx/
// DepositModal.jsx mỗi nơi tự khai lại danh sách 2 category này riêng).
export const DAILY_ACCRUAL_CATEGORIES = ["VinHomes", "Đầu tư nghỉ dưỡng"];

export function isDailyAccrualCategory(category) {
  return DAILY_ACCRUAL_CATEGORIES.includes(category);
}

/** Số ngày kỳ hạn (làm tròn xuống, tối thiểu 1) - PHẢI khớp đúng công thức
 * v_cycle_days trong disburse_daily_investment_payouts() (SQL) để %/ngày
 * hiển thị ở đây luôn đúng bằng lãi suất thật admin/người dùng sẽ nhận mỗi
 * ngày, không phải một cách quy đổi khác đi. */
export function getCycleDays(project) {
  const minutes = Number(project?.term_duration_minutes) || 0;
  return Math.max(1, Math.floor(minutes / 1440));
}

/**
 * Quy đổi lãi suất TOÀN KỲ thành lãi suất bình quân MỖI NGÀY (chia đều cho số
 * ngày kỳ hạn) - chỉ mang tính tham khảo cho người xem dễ hình dung, KHÔNG
 * dùng để tính tiền (tiền luôn tính theo total_term_interest_rate nguyên bản
 * - xem calculateExpectedInterest() ở trên và disburse_daily_investment_payouts()
 * phía Postgres). Nhận trực tiếp rate/cycleDays để dùng được cho cả object
 * project (total_term_interest_rate/term_duration_minutes) lẫn 1 giao dịch
 * đã chốt (rate/duration_days snapshot lúc đầu tư).
 */
export function computeDailyRatePercent(totalTermRate, cycleDays) {
  const rate = Number(totalTermRate) || 0;
  const days = Math.max(1, Math.round(Number(cycleDays) || 0));
  return rate / days;
}

export function getProjectDailyRatePercent(project) {
  return computeDailyRatePercent(project?.total_term_interest_rate, getCycleDays(project));
}

/** "1.25%/ngày" - bỏ số 0 thừa cuối (0.500 -> 0.5) cho gọn. */
export function formatDailyRatePercent(totalTermRate, cycleDays) {
  const daily = computeDailyRatePercent(totalTermRate, cycleDays);
  return `${parseFloat(daily.toFixed(3))}%/ngày`;
}

export function getProjectTermUnit(project) {
  const category = project?.category || "";
  const rateLabel = String(project?.rate || "");
  const title = String(project?.title || "");
  const durationLabel = String(project?.duration || "");

  if (category === "Dự Án" || rateLabel.includes("phút") || durationLabel.includes("phút")) return "phút";
  if (
    category === "Đầu tư nghỉ dưỡng" ||
    category === "Nghỉ dưỡng" ||
    rateLabel.includes("giờ") ||
    title.includes("Vinpearl")
  ) {
    return "giờ";
  }
  return "ngày";
}

/** Số đơn vị kỳ hạn (chỉ để HIỂN THỊ "Kỳ hạn: X giờ/ngày/phút"), không dùng để tính lãi. */
export function getProjectTermDurationDisplayValue(project) {
  const unit = getProjectTermUnit(project);
  const minutes = Number(project?.term_duration_minutes) || 0;
  if (minutes <= 0) return unit === "phút" ? 60 : unit === "giờ" ? 24 : 30;

  if (unit === "phút") return Math.round(minutes);
  if (unit === "giờ") return Math.round(minutes / 60);
  return Math.round(minutes / 1440);
}

/**
 * Lãi dự kiến TOÀN KỲ = Số tiền đầu tư * total_term_interest_rate (%).
 * KHÔNG nhân thêm với số đơn vị kỳ hạn nữa - total_term_interest_rate đã
 * là lãi suất cho TRỌN kỳ hạn, không phải lãi suất theo giờ/ngày/phút.
 */
export function calculateExpectedInterest(amount, totalTermInterestRate) {
  const amt = Number(amount) || 0;
  const rate = Number(totalTermInterestRate) || 0;
  return Math.round(amt * (rate / 100));
}

/**
 * Lãi ĐÃ THỰC SỰ NHẬN tính tới hiện tại cho 1 giao dịch - KHÁC với tx.profit
 * (luôn là lãi dự kiến cho TRỌN kỳ hạn, tính sẵn lúc tạo giao dịch, không
 * đổi cho tới khi đáo hạn). LUMP_SUM (Dự Án/Chứng khoán) chỉ nhận lãi đúng 1
 * lần khi đáo hạn nên trước đó luôn là 0. DAILY_ACCRUAL (VinHomes/Nghỉ
 * dưỡng) nhận dần mỗi ngày - công thức dailyBase = floor(profit/cycleDays)
 * PHẢI khớp đúng disburse_daily_investment_payouts() (SQL, xem migration
 * 20260904010000) để số hiển thị đúng bằng số tiền thật đã cộng vào ví,
 * không phải một ước lượng riêng có thể lệch.
 */
export function computeInterestReceivedSoFar(tx) {
  if (!tx) return 0;
  const profit = Number(tx.profit) || 0;
  const isPaid = tx.payout_status === "paid" || tx.status === "completed_payout";
  if (isPaid) return profit;
  if (tx.payout_model !== "DAILY_ACCRUAL") return 0;
  const cycleDays = Number(tx.duration_days) || 0;
  const daysPaid = Math.max(0, Number(tx.daily_payout_days_paid) || 0);
  if (cycleDays <= 0 || daysPaid <= 0) return 0;
  const dailyBase = Math.floor(profit / cycleDays);
  return Math.min(profit, dailyBase * daysPaid);
}

export function getMaturityDate(startDate, termDurationMinutes) {
  const start = startDate instanceof Date ? startDate : new Date(startDate || Date.now());
  const minutes = Number(termDurationMinutes) || 0;
  return new Date(start.getTime() + minutes * 60 * 1000);
}

/**
 * Dựng sẵn {title, content} cho thông báo "dự án mới mở" từ dữ liệu THẬT của
 * 1 dự án (đầu tư/casino admin chọn trong NotificationsTab.jsx) - tránh admin
 * phải tự gõ tay số liệu (dễ gõ sai lãi suất/kỳ hạn/số tiền tối thiểu so với
 * dữ liệu thật). Chỉ liệt kê field nào THỰC SỰ có giá trị - không phải
 * category nào cũng có đủ total_term_interest_rate/term_duration_minutes/
 * minAmount (vd cổ phiếu dùng annual_yield, không dùng lãi suất toàn kỳ).
 */
/** Định dạng ngắn gọn ngày giờ hẹn Mở/Tắt (scheduled_open_at/scheduled_close_at/
 * opened_at) - cùng kiểu hiển thị với fmtSchedule() trong ProjectsTab.jsx. */
function formatScheduleDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

/** Chỉ giờ:phút (không kèm ngày) - dùng cho thẻ thông báo gọn (NotificationBell.jsx),
 * nơi ngày gửi đã hiển thị riêng ("X phút trước") nên không cần lặp lại ngày. */
export function formatScheduleTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Mọi dự án đều tự động khóa đầu tư sau đúng 30 phút kể từ khi mở (xem
 * migration 20260903230000_auto_lock_investment_30min_after_open.sql) - hầu
 * hết dự án sẽ không có scheduled_close_at (admin không cần tự đặt giờ đóng
 * nữa), nên nếu thiếu, suy ra giờ đóng = giờ mở + 30 phút để nội dung thông
 * báo vẫn hiển thị đúng khung giờ đầu tư thực tế. */
export const AUTO_LOCK_MINUTES = 30;

/**
 * Suy ra khung giờ mở/đóng đầu tư thực tế của 1 dự án (ISO string), dùng
 * chung cho cả nội dung soạn thông báo (buildProjectAnnouncementDraft) lẫn
 * snapshot lưu vào Notification.extra khi gửi (NotificationsTab.jsx) - để
 * NotificationBell.jsx có đúng giờ hiển thị thay vì phải tính lại.
 */
export function resolveProjectOpenClose(project) {
  const openIso = project?.scheduled_open_at || project?.opened_at || null;
  let closeIso = project?.scheduled_close_at || null;
  let closeIsAutoLock = false;
  if (!closeIso && openIso) {
    closeIso = new Date(new Date(openIso).getTime() + AUTO_LOCK_MINUTES * 60 * 1000).toISOString();
    closeIsAutoLock = true;
  }
  return { openIso, closeIso, closeIsAutoLock };
}

export function buildProjectAnnouncementDraft(project) {
  if (!project) return { title: "", content: "" };
  const title = `🎉 Dự án mới mở: ${project.title || project.name || ""}`;

  const lines = [];
  if (project.category) lines.push(`Danh mục: ${project.category}`);
  if (project.location) lines.push(`Vị trí: ${project.location}`);
  const { openIso, closeIso, closeIsAutoLock } = resolveProjectOpenClose(project);
  const openAt = formatScheduleDate(openIso);
  const closeAt = formatScheduleDate(closeIso);
  if (openAt && closeAt) {
    lines.push(`Thời gian mở đầu tư: ${openAt} - ${closeAt}${closeIsAutoLock ? ` (tự động khóa sau ${AUTO_LOCK_MINUTES} phút)` : ""}`);
  } else if (openAt) {
    lines.push(`Mở đầu tư lúc: ${openAt}`);
  } else if (closeAt) {
    lines.push(`Đóng đầu tư lúc: ${closeAt}`);
  }
  if (project.total_term_interest_rate) {
    const dailySuffix = isDailyAccrualCategory(project.category)
      ? ` (~${formatDailyRatePercent(project.total_term_interest_rate, getCycleDays(project))})`
      : "";
    lines.push(`${TERM_RATE_LABEL}: ${project.total_term_interest_rate}%${dailySuffix}`);
  }
  if (Number(project.term_duration_minutes) > 0) {
    const unit = getProjectTermUnit(project);
    lines.push(`Kỳ hạn: ${getProjectTermDurationDisplayValue(project)} ${unit}`);
  }
  const minAmount = Number(project.minAmount || project.min_amount) || 0;
  if (minAmount > 0) {
    lines.push(`Đầu tư tối thiểu: ${minAmount.toLocaleString("vi-VN")}đ`);
  }
  if (project.scale) lines.push(`Quy mô: ${project.scale}`);
  if (project.description) {
    const desc = String(project.description).trim();
    lines.push(desc.length > 150 ? `${desc.slice(0, 150)}…` : desc);
  }

  return { title, content: lines.join("\n") };
}
