import { base44 } from "@/api/base44Client";

/**
 * Rà soát các dự án có hẹn giờ tự động Mở/Tắt (scheduled_open_at /
 * scheduled_close_at) và áp dụng is_active đúng thời điểm đã hẹn. Chạy định
 * kỳ từ AuthContext.jsx (cùng chu kỳ với dailyYieldEngine) vì ứng dụng không
 * có backend cron - bất kỳ phiên đăng nhập nào đang mở (admin hay user) đều
 * có thể là nơi thực thi việc rà soát này.
 */
export async function checkScheduledProjects() {
  try {
    const projects = await base44.entities.Project.list("-created_date", 200).catch(() => []);
    const now = Date.now();

    for (const p of projects) {
      if (p.scheduled_open_at) {
        const openAt = new Date(p.scheduled_open_at).getTime();
        if (!isNaN(openAt) && openAt <= now && !p.is_active) {
          await base44.entities.Project.update(p.id, { is_active: true, scheduled_open_at: "" }).catch(() => null);
        }
      }
      if (p.scheduled_close_at) {
        const closeAt = new Date(p.scheduled_close_at).getTime();
        if (!isNaN(closeAt) && closeAt <= now && p.is_active) {
          await base44.entities.Project.update(p.id, { is_active: false, scheduled_close_at: "" }).catch(() => null);
        }
      }
    }
  } catch (e) {
    console.warn("[projectScheduler] checkScheduledProjects error:", e);
  }
}
