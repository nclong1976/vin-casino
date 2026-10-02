import React from "react";
import { BookOpen, X } from "lucide-react";

/** Việc của quản trị viên - theo tần suất, lời thường. */
const SECTIONS = [
  {
    title: "Hằng ngày (trong giờ giao dịch 9:00–14:45)",
    items: [
      [
        "Cập nhật giá",
        "Tab “Giá cổ phiếu” → nhập giá mới vào ô của mã → bấm Đặt. Giá phải nằm trong khoảng Sàn–Trần của ngày (hệ thống báo lỗi nếu sai). Lệnh của khách đang chờ ở mức giá đó sẽ tự khớp ngay.",
      ],
      [
        "Xem lệnh đang chờ",
        "Tab “Lệnh” → mặc định hiện “Chờ khớp”. Không cần duyệt — hệ thống tự khớp theo giá. Chỉ bấm Huỷ khi khách nhờ hoặc lệnh sai; tiền / cổ phiếu tự trả lại cho khách.",
      ],
    ],
  },
  {
    title: "Hệ thống tự làm (không cần thao tác)",
    items: [
      ["9:15 và 14:45", "Khớp lệnh mở cửa (ATO) và đóng cửa (ATC); sau 14:45 lệnh chưa khớp tự huỷ và trả tiền."],
      ["Đầu mỗi ngày giao dịch", "Giá tham chiếu = giá đóng cửa hôm trước; Trần/Sàn tự tính lại (±7%)."],
      ["13:00 ngày T+2", "Cổ phiếu mua về tài khoản khách; tiền bán về ví khách (kèm thông báo)."],
      ["Ngày cổ tức", "Tự điều chỉnh giá, chốt danh sách, trả tiền / cổ phiếu và tái đầu tư (DRIP) cho khách bật."],
    ],
  },
  {
    title: "Khi cần",
    items: [
      [
        "Thêm mã mới / tạm khoá / mở lại mã",
        "Vào tab Dự án → mục Đầu tư chứng khoán. Mã bị tắt (khoá) thì khách không mua / bán được. Mã mới tự có trên bảng giá.",
      ],
      [
        "Công bố cổ tức",
        "Tab “Cổ tức” → Công bố cổ tức → chọn mã, loại (tiền / cổ phiếu), số tiền mỗi cổ phiếu hoặc tỉ lệ, ngày GDKHQ (phải là ngày giao dịch sau hôm nay). Hai ngày còn lại để trống là được. Khách đang giữ mã nhận thông báo ngay. Chỉ huỷ được trước ngày GDKHQ.",
      ],
      [
        "Cấp cổ phiếu cho khách",
        "Tab “Lệnh” → Cấp cổ phiếu → chọn khách, mã, số cổ phiếu. Đánh dấu “Trừ tiền ví” nếu khách trả tiền; bỏ chọn nếu là tặng / bù. Cổ phiếu về tài khoản ngay.",
      ],
      [
        "Niêm yết lại giá (hiếm)",
        "Khi cần đặt giá ngoài khoảng Sàn–Trần (VD đổi hẳn mặt bằng giá): tab “Giá cổ phiếu” → nút ↺ cạnh mã. Giá tham chiếu và Trần/Sàn tính lại theo giá mới.",
      ],
      ["Đổi phí / thuế / biên độ (hiếm)", "Tab “Giá cổ phiếu” → mở “Cài đặt phí, thuế, biên độ”. Mặc định phí 0,15%, thuế bán 0,1%, biên độ ±7%."],
      ["Báo cáo, đối soát", "Tab “Tổng quan”: số liệu toàn hệ thống và nút Xuất CSV (lệnh, khớp lệnh, danh mục, cổ tức) mở được bằng Excel."],
    ],
  },
];

export default function AdminStockGuide({ onClose }) {
  return (
    <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-3.5 space-y-3 text-[11.5px]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-amber-600" /> Hướng dẫn quản trị chứng khoán
        </h3>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded-full hover:bg-amber-100 cursor-pointer" aria-label="Đóng hướng dẫn">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        )}
      </div>
      {SECTIONS.map((sec) => (
        <div key={sec.title}>
          <p className="font-bold text-gray-800 mb-1">{sec.title}</p>
          <ul className="space-y-1">
            {sec.items.map(([k, v]) => (
              <li key={k} className="text-gray-700 leading-relaxed">
                <b>{k}:</b> {v}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
