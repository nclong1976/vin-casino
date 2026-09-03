import React from "react";

/**
 * Hiển thị số dư VNĐ an toàn cho các khu vực chật hẹp (danh sách, hàng bảng):
 * - `loading`: hiện Skeleton thay vì chớp nháy "0 VNĐ" trong lúc dữ liệu
 *   thật từ Supabase chưa tải xong.
 * - Số lớn không làm vỡ layout: cắt gọn 1 dòng (`truncate`) thay vì tràn ra
 *   ngoài, kèm `title` để xem đầy đủ khi hover/chạm giữ.
 */
export default function BalanceAmount({
  value,
  loading = false,
  className = "",
  skeletonWidthClass = "w-20",
}) {
  if (loading) {
    return (
      <span
        aria-busy="true"
        className={`inline-block h-[1em] ${skeletonWidthClass} max-w-full animate-pulse rounded bg-gray-200 align-middle ${className}`}
      />
    );
  }

  const formatted = `${(Number(value) || 0).toLocaleString("vi-VN")} VNĐ`;

  return (
    <span
      title={formatted}
      className={`block max-w-full truncate whitespace-nowrap tabular-nums ${className}`}
    >
      {formatted}
    </span>
  );
}
