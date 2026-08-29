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

export function getMaturityDate(startDate, termDurationMinutes) {
  const start = startDate instanceof Date ? startDate : new Date(startDate || Date.now());
  const minutes = Number(termDurationMinutes) || 0;
  return new Date(start.getTime() + minutes * 60 * 1000);
}
