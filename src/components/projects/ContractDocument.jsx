import React from "react";
import { TERM_RATE_LABEL } from "@/lib/investmentTerms";

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

  const rateLabel = TERM_RATE_LABEL;
  const rateValStr = `${rate}%`;
  const durationLabel = isMinute ? `${durationVal || 60} phút` : isHourly ? `${durationVal || hours || 24} giờ` : `${durationVal || days || 30} ngày`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-3">
        <p className="text-[9px] font-semibold tracking-widest text-[#948154]">
          CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
        </p>
        <p className="text-[8px] text-gray-400">Độc lập - Tự do - Hạnh phúc</p>
        <div className="w-6 border-t border-gray-300 mx-auto my-1" />
        <h2 className="text-[14px] font-bold text-black mt-1 tracking-wide">HỢP ĐỒNG HỢP TÁC ĐẦU TƯ</h2>
        <p className="text-[9px] text-gray-400">
          Số: VC/{Date.now().toString().slice(-6)}/HĐHTĐT
        </p>
      </div>

      {/* Legal basis */}
      <p className="text-[8.5px] text-gray-400 italic leading-relaxed mb-2.5">
        Căn cứ Bộ luật Dân sự nước CHXHCN Việt Nam; căn cứ nhu cầu góp vốn đầu tư của Bên B và khả
        năng tiếp nhận, quản lý vốn của Bên A, hai Bên thống nhất giao kết Hợp đồng với các điều
        khoản sau:
      </p>

      {/* Parties */}
      <div className="space-y-1.5 text-[10px] text-gray-700 mb-3">
        <p>
          <b>Bên A (Bên nhận ủy thác đầu tư):</b> VinClub — đại diện bởi Ông Nguyễn Việt Quang, chức
          vụ Giám đốc điều hành.
        </p>
        <p>
          <b>Bên B (Bên ủy thác đầu tư / Nhà đầu tư):</b> {user?.full_name || "…"}
          {user?.email ? ` — ${user.email}` : ""}
        </p>
      </div>

      {/* Investment details */}
      <p className="text-[10px] font-semibold text-black mb-1">Điều 1. Đối tượng và nội dung đầu tư</p>
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
      <p className="text-[10px] font-semibold text-black mb-1">Điều 2. Quyền và nghĩa vụ của Bên A</p>
      <p className="text-[9px] text-gray-500 leading-relaxed mb-2.5">
        Quản lý, sử dụng số vốn nhận ủy thác đúng mục đích đầu tư đã nêu tại Điều 1; thanh toán đầy
        đủ, đúng hạn gốc và lãi cho Bên B khi kết thúc kỳ hạn; bảo mật thông tin cá nhân của Bên B.
      </p>

      <p className="text-[10px] font-semibold text-black mb-1">Điều 3. Quyền và nghĩa vụ của Bên B</p>
      <p className="text-[9px] text-gray-500 leading-relaxed mb-2.5">
        Cam kết nguồn vốn ủy thác là hợp pháp; có quyền được cung cấp thông tin về tình hình sử
        dụng vốn khi có yêu cầu chính đáng và nhận đầy đủ gốc, lãi đúng thời hạn cam kết.
      </p>

      <p className="text-[10px] font-semibold text-black mb-1">Điều 4. Chấm dứt hợp đồng và Bất khả kháng</p>
      <p className="text-[9px] text-gray-500 leading-relaxed mb-2.5">
        Hợp đồng đương nhiên chấm dứt khi Bên A hoàn tất nghĩa vụ thanh toán tại Điều 1. Trường hợp
        xảy ra sự kiện bất khả kháng, hai Bên cùng thương lượng trên tinh thần thiện chí, hợp tác.
      </p>

      <p className="text-[10px] font-semibold text-black mb-1">Điều 5. Điều khoản chung</p>
      <p className="text-[9px] text-gray-500 leading-relaxed mb-3">
        Hợp đồng có hiệu lực kể từ thời điểm Bên B hoàn tất ký xác nhận điện tử, được lập thành 02
        bản có giá trị pháp lý như nhau, mỗi Bên giữ 01 bản để theo dõi và thực hiện.
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