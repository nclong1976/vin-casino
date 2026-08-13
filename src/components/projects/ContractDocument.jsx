import React from "react";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

export default function ContractDocument({
  project,
  amount,
  method,
  rate,
  days,
  hours,
  isMinute,
  isHourly,
  durationVal,
  profit,
  total,
  user,
  signature
}) {
  const today = new Date().toLocaleDateString("vi-VN");
  const [dd, mm, yyyy] = today.split("/");

  const rateLabel = isMinute ? "Lãi suất theo phút" : isHourly ? "Lãi suất theo giờ" : "Lãi suất theo ngày";
  const rateValStr = project?.rate || (isMinute ? `${rate}%/phút` : isHourly ? `${rate}%/giờ` : `${rate}%/ngày`);
  const durationLabel = isMinute ? `${durationVal || 60} phút` : isHourly ? `${durationVal || hours || 24} giờ` : `${durationVal || days || 30} ngày`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-3">
        <p className="text-[9px] font-semibold tracking-widest text-[#948154]">
          CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
        </p>
        <p className="text-[8px] text-gray-400">Độc lập - Tự do - Hạnh phúc</p>
        <h2 className="text-[14px] font-bold text-black mt-2">HỢP ĐỒNG ĐẦU TƯ</h2>
        <p className="text-[9px] text-gray-400">
          Số: VC/{Date.now().toString().slice(-6)}
        </p>
      </div>

      {/* Parties */}
      <div className="space-y-1 text-[10px] text-gray-700 mb-3">
        <p>
          <b>Bên A (Bên nhận đầu tư):</b> VinClub — đại diện bởi Ông Nguyễn Việt Quang.
        </p>
        <p>
          <b>Bên B (Nhà đầu tư):</b> {user?.full_name || "…"}
          {user?.email ? ` — ${user.email}` : ""}
        </p>
      </div>

      {/* Investment details */}
      <p className="text-[10px] font-semibold text-black mb-1">Điều 1. Nội dung đầu tư</p>
      <div className="rounded-lg bg-gray-50 p-2 space-y-1 text-[10px] mb-3">
        {[
          ["Dự án", project.title],
          ["Số tiền đầu tư", `${fmt(amount)} VNĐ`],
          ["Phương thức", method],
          [rateLabel, rateValStr],
          ["Thời gian kỳ hạn", durationLabel],
          ["Lãi dự kiến", `${fmt(profit)} VNĐ`],
          ["Tổng nhận", `${fmt(total)} VNĐ`]
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-gray-500">{k}</span>
            <span className="font-semibold text-black text-right">{v}</span>
          </div>
        ))}
      </div>

      {/* Terms */}
      <p className="text-[10px] font-semibold text-black mb-1">Điều 2. Điều khoản</p>
      <p className="text-[9px] text-gray-500 leading-relaxed mb-3">
        Bên B đồng ý ủy quyền số tiền trên cho Bên A quản lý trong thời gian đầu tư. Gốc và lãi
        được thanh toán cho Bên B khi kết thúc kỳ hạn. Hợp đồng có hiệu lực kể từ ngày ký.
      </p>

      {/* Date */}
      <p className="text-[10px] text-gray-600 text-right mb-3">
        Hà Nội, ngày {dd} tháng {mm} năm {yyyy}
      </p>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-2 pt-3 mt-1 border-t border-gray-100">
        {/* BÊN A */}
        <div className="flex flex-col items-center justify-between text-center min-h-[145px]">
          <div>
            <p className="text-[10px] font-bold text-black uppercase tracking-wide">BÊN A</p>
            <p className="text-[8px] text-gray-400 h-4 flex items-center justify-center">(Ký, đóng dấu, ghi rõ họ tên)</p>
          </div>

          <div className="h-16 flex items-center justify-center my-1">
            <img
              src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/0b8fe1b71_image-Photoroom8.png"
              alt="Con dấu Vinpearl"
              className="h-14 w-auto object-contain"
            />
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-800 leading-tight">Nguyễn Việt Quang</p>
            <p className="text-[8.5px] text-gray-400 mt-0.5">Đại diện VinClub</p>
          </div>
        </div>

        {/* BÊN B */}
        <div className="flex flex-col items-center justify-between text-center min-h-[145px]">
          <div>
            <p className="text-[10px] font-bold text-black uppercase tracking-wide">BÊN B</p>
            <p className="text-[8px] text-gray-400 h-4 flex items-center justify-center">(Ký, ghi rõ họ tên)</p>
          </div>

          <div className="h-16 flex items-center justify-center my-1">
            {signature?.content ? (
              signature.type === "draw" ? (
                <img
                  src={signature.content}
                  alt="Chữ ký"
                  className="h-10 max-w-full object-contain"
                />
              ) : (
                <span
                  style={{ fontFamily: "'Great Vibes', cursive" }}
                  className="text-[18px] text-[#16100b] leading-none"
                >
                  {signature.content}
                </span>
              )
            ) : (
              <span className="text-[8.5px] text-gray-300 italic">Chưa ký</span>
            )}
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-800 leading-tight">
              {user?.full_name || user?.name || "Nguyen van a"}
            </p>
            <p className="text-[8.5px] text-gray-400 mt-0.5">Nhà đầu tư</p>
          </div>
        </div>
      </div>
    </div>);

}