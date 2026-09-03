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

/**
 * Dựng sẵn {title, content} cho thông báo "dự án mới mở" từ dữ liệu THẬT của
 * 1 dự án (đầu tư/casino admin chọn trong NotificationsTab.jsx) - tránh admin
 * phải tự gõ tay số liệu (dễ gõ sai lãi suất/kỳ hạn/số tiền tối thiểu so với
 * dữ liệu thật). Chỉ liệt kê field nào THỰC SỰ có giá trị - không phải
 * category nào cũng có đủ total_term_interest_rate/term_duration_minutes/
 * minAmount (vd cổ phiếu dùng annual_yield, không dùng lãi suất toàn kỳ).
 */
export function buildProjectAnnouncementDraft(project) {
  if (!project) return { title: "", content: "" };
  const title = `🎉 Dự án mới mở: ${project.title || project.name || ""}`;

  const lines = [];
  if (project.category) lines.push(`Danh mục: ${project.category}`);
  if (project.location) lines.push(`Vị trí: ${project.location}`);
  if (project.total_term_interest_rate) {
    lines.push(`${TERM_RATE_LABEL}: ${project.total_term_interest_rate}%`);
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
