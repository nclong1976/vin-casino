import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * Header dùng chung cho mọi trang KHÔNG PHẢI 1 trong 4 điểm đến chính của
 * BottomNav (Trang chủ/Thẻ/CSKH/Cá nhân) - 4 trang đó ngang hàng nhau
 * (giống Trang chủ), không "quay lại" đâu cả, nên tự vẽ header riêng
 * (Home.jsx, ProfileHeader.jsx, SupportHeader.jsx) - không dùng component
 * này. Mọi trang CÒN LẠI (Dự án, Đầu tư CK, Casino, Nghỉ dưỡng, VinHomes,
 * Tin tức, Ưu đãi, Mục tiêu, Hợp đồng, Chữ ký, Vòng quay may mắn, Tham
 * vấn...) đều là trang "con", đi vào từ Trang chủ - PHẢI có đường quay lại.
 *
 * Trước đây mỗi trang này tự có 1 bản header GẦN NHƯ Y HỆT nhau
 * (ProjectsHeader/SignatureHeader/StockHeader/CasinoHeader + 1 bản viết
 * tay trong Contract.jsx, rải rác 6 nơi, chỉ khác màu nền/chữ) và KHÔNG
 * trang nào có nút quay lại - trên PWA cài ra màn hình chính (đặc biệt
 * iPhone, không có cử chỉ vuốt lùi hệ thống trong chế độ standalone),
 * người chơi bị "kẹt" ở các trang này, chỉ thoát được bằng cách bấm hẳn về
 * Trang chủ qua BottomNav (mất ngữ cảnh đang xem). Gộp lại thành 1 component
 * duy nhất, luôn có nút quay lại (navigate(-1) - cùng cách BaiCao.jsx/
 * XiToBaLa.jsx/TigerBaccarat.jsx/SupportHeader.jsx đã làm), giữ đúng màu
 * sắc riêng của từng trang qua headerClassName/titleClassName/
 * backButtonClassName thay vì ép mọi trang về chung 1 màu.
 */
export default function PageHeader({
  title,
  showBack = true,
  headerClassName = "bg-white/75 backdrop-blur-md border-b border-white/40 shadow-xs",
  titleClassName = "text-black drop-shadow-2xs",
  backButtonClassName = "text-black/70 hover:bg-black/5",
}) {
  const navigate = useNavigate();

  return (
    <header className={`sticky top-0 z-40 w-full transition-all pt-[env(safe-area-inset-top)] ${headerClassName}`}>
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-1">
        {showBack ? (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-full transition-colors cursor-pointer ${backButtonClassName}`}
            title="Quay lại"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        ) : (
          // Giữ chỗ đúng bằng kích thước nút quay lại để tiêu đề vẫn căn
          // giữa thật (đối xứng với spacer bên phải) khi showBack=false.
          <div className="w-8 h-8 shrink-0" aria-hidden="true" />
        )}
        <h1 className={`flex-1 text-[14px] sm:text-base font-bold text-center truncate px-1 ${titleClassName}`}>
          {title}
        </h1>
        {/* Spacer bên phải để tiêu đề căn giữa thật, đối xứng với nút quay lại/placeholder bên trái. */}
        <div className="w-8 h-8 shrink-0" aria-hidden="true" />
      </div>
    </header>
  );
}
