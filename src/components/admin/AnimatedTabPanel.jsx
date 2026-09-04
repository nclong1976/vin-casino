import React, { useLayoutEffect } from "react";
import { motion, useAnimation } from "framer-motion";

/**
 * Bọc quanh nội dung 1 tab luôn được mount sẵn (Admin.jsx/MemberHubTab.jsx
 * chỉ ẩn/hiện bằng class "hidden" thay vì unmount/remount, để tránh tải lại
 * dữ liệu mỗi lần quay lại tab) nhưng vẫn cần lại đúng hiệu ứng fade + trượt
 * nhẹ khi chuyển sang tab đó như thiết kế gốc (trước đây dựa vào
 * AnimatePresence mount/unmount, không dùng được nữa vì nội dung không còn
 * unmount). useAnimation() cho phép tự chạy lại animation mỗi lần "active"
 * bật lên mà KHÔNG cần unmount phần tử - set() reset về trạng thái ẩn trong
 * useLayoutEffect (chạy trước khi trình duyệt vẽ khung hình) để tránh chớp
 * hình trạng thái cũ trước khi animation bắt đầu.
 */
export default function AnimatedTabPanel({ active, children }) {
  const controls = useAnimation();

  useLayoutEffect(() => {
    if (active) {
      controls.set({ opacity: 0, y: 6 });
      controls.start({ opacity: 1, y: 0, transition: { duration: 0.16, ease: "easeOut" } });
    }
  }, [active, controls]);

  return (
    <motion.div animate={controls} className={active ? "" : "hidden"}>
      {children}
    </motion.div>
  );
}
