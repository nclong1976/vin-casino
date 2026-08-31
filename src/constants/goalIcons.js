import { Target, Home, Car, Plane, GraduationCap, Umbrella, Gift, Smartphone, PiggyBank, Heart } from "lucide-react";

/** Danh mục icon cho mục tiêu tiết kiệm - chọn 1 trong lúc tạo/sửa mục tiêu. */
export const GOAL_ICONS = [
  { key: "target", label: "Khác", Icon: Target },
  { key: "piggy-bank", label: "Tiết kiệm", Icon: PiggyBank },
  { key: "home", label: "Nhà", Icon: Home },
  { key: "car", label: "Xe", Icon: Car },
  { key: "plane", label: "Du lịch", Icon: Plane },
  { key: "graduation-cap", label: "Giáo dục", Icon: GraduationCap },
  { key: "umbrella", label: "Khẩn cấp", Icon: Umbrella },
  { key: "gift", label: "Cưới hỏi", Icon: Gift },
  { key: "smartphone", label: "Thiết bị", Icon: Smartphone },
  { key: "heart", label: "Gia đình", Icon: Heart },
];

export const GOAL_ICON_MAP = Object.fromEntries(GOAL_ICONS.map((g) => [g.key, g.Icon]));

export function getGoalIcon(key) {
  return GOAL_ICON_MAP[key] || Target;
}

export const GOAL_COLORS = [
  "#948154", // gold - màu chủ đạo VinClub
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
];
