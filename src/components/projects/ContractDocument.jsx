import React from "react";
import { TERM_RATE_LABEL } from "@/lib/investmentTerms";
import { useContractLetterhead } from "@/lib/contractLetterhead";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");
const FONT = "'Noto Serif Doc', 'Noto Serif', serif";
// Tỉ lệ mm (khổ A4 của Khung văn bản) → px trên thẻ hợp đồng trong ứng dụng.
const PX_PER_MM = 2;

function Article({ title, children }) {
  return (
    <>
      <p className="text-[10.5px] font-bold text-black mb-1">{title}</p>
      <p className="text-[10px] text-gray-800 leading-relaxed mb-2.5 text-justify">{children}</p>
    </>
  );
}

/**
 * Hợp đồng hợp tác đầu tư dự án. Giao diện theo Khung văn bản mặc định (tab
 * Văn bản của Admin): logo + tên đơn vị, Quốc hiệu - tiêu ngữ, người đại diện,
 * chữ ký + con dấu và footer. Hợp đồng được dựng lại từ giao dịch mỗi lần
 * xem, nên đổi khung là mọi hợp đồng hiện có đổi giao diện theo; điều khoản,
 * số liệu và chữ ký của nhà đầu tư giữ nguyên.
 */
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
  signature,
  dailyRateLabel,
  createdDate
}) {
  const { letterhead, ready } = useContractLetterhead();
  const { header, issuer, footer, theme } = letterhead;

  // createdDate = tx.created_date (thời điểm giao dịch ĐÃ được tạo/ký thật) -
  // BẮT BUỘC dùng giá trị này khi xem lại 1 hợp đồng đã ký (Contract.jsx),
  // KHÔNG được lấy new Date() lúc render vì mỗi lần khách/admin mở lại trang
  // xem hợp đồng, ngày ký sẽ tự nhảy sang đúng ngày đang xem. Chỉ khi CHƯA có
  // createdDate (bước xem trước ở DepositModal) mới lùi về ngày giờ hiện tại.
  // Luôn quy đổi theo giờ Việt Nam (Asia/Ho_Chi_Minh).
  const contractDate = createdDate ? new Date(createdDate) : new Date();
  const today = contractDate.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const [dd, mm, yyyy] = today.split("/");
  // Đánh số theo contractDate (ổn định 1 khi đã có createdDate).
  const contractNo = `VC/${contractDate.getTime().toString().slice(-6)}/HĐHTĐT`;

  const rateLabel = TERM_RATE_LABEL;
  const rateValStr = `${rate}%`;
  const durationLabel = isMinute ? `${durationVal || 60} phút` : isHourly ? `${durationVal || hours || 24} giờ` : `${durationVal || days || 30} ngày`;
  const primary = theme.primary || "#948154";
  const logoH = Math.min(80, Math.max(16, (header.logo_size_mm ?? 12) * PX_PER_MM));
  const investorName = user?.full_name || user?.name || "Nguyen van a";

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white px-4 pt-4 pb-3 shadow-sm transition-opacity ${ready ? "opacity-100" : "opacity-60"}`}
      style={{ fontFamily: FONT }}
    >
      {/* Header theo Khung văn bản: cột trái đơn vị phát hành, cột phải Quốc hiệu */}
      <div className="grid grid-cols-[42%_58%] items-start gap-1 mb-3">
        <div className="flex flex-col items-center text-center min-w-0">
          {header.logo_url && (
            <img src={header.logo_url} alt="" className="object-contain mb-1 max-w-full" style={{ height: logoH }} />
          )}
          <p className="text-[8.5px] font-bold uppercase leading-tight text-black break-words">{header.org_name}</p>
          {header.org_sub && <p className="text-[8px] text-gray-800 leading-tight">{header.org_sub}</p>}
          <p className="text-[8px] text-gray-800 mt-0.5">Số: {contractNo}</p>
        </div>
        <div className="flex flex-col items-center text-center">
          {header.show_national_motto !== false && (
            <>
              <p className="text-[8.5px] font-bold leading-tight text-black">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
              <p className="text-[8.5px] font-bold leading-tight text-black border-b border-black pb-px">Độc lập - Tự do - Hạnh phúc</p>
            </>
          )}
          <p className="text-[8.5px] italic text-gray-800 mt-1.5">
            {header.place}, ngày {dd} tháng {mm} năm {yyyy}
          </p>
        </div>
      </div>

      <h2 className="text-center text-[14px] font-bold tracking-wide text-black">HỢP ĐỒNG HỢP TÁC ĐẦU TƯ</h2>
      <div className="w-10 mx-auto my-1.5 border-t-2" style={{ borderColor: primary }} />

      <p className="text-[9.5px] text-gray-700 italic leading-relaxed mb-2.5 text-justify">
        Căn cứ Bộ luật Dân sự nước CHXHCN Việt Nam; căn cứ nhu cầu góp vốn đầu tư của Bên B và khả
        năng tiếp nhận, quản lý vốn của Bên A, hai Bên thống nhất giao kết Hợp đồng với các điều
        khoản sau:
      </p>

      <div className="space-y-1.5 text-[10px] text-gray-800 mb-3">
        <p>
          <b>Bên A (Bên nhận ủy thác đầu tư):</b> {header.org_name} — đại diện bởi Ông/Bà {issuer.name}, chức vụ {issuer.title}.
        </p>
        <p>
          <b>Bên B (Bên ủy thác đầu tư / Nhà đầu tư):</b> {user?.full_name || "…"}
          {user?.email ? ` — ${user.email}` : ""}
        </p>
      </div>

      <p className="text-[10.5px] font-bold text-black mb-1">Điều 1. Đối tượng và nội dung đầu tư</p>
      <table className="w-full text-[10px] mb-3 border-collapse">
        <tbody>
          {[
            ["Dự án", project.title],
            ["Số tiền đầu tư", `${fmt(amount)} VNĐ`],
            ["Phương thức", method],
            [rateLabel, rateValStr],
            ...(dailyRateLabel ? [["Lãi suất/ngày", `~${dailyRateLabel}`]] : []),
            ["Thời gian kỳ hạn", durationLabel],
            ["Lãi dự kiến", `${fmt(profit)} VNĐ`],
            ["Tổng nhận", `${fmt(total)} VNĐ`]
          ].map(([k, v]) => (
            <tr key={k} className="border border-gray-300">
              <td className="px-2 py-1 text-gray-700 w-[42%] border-r border-gray-300">{k}</td>
              <td className="px-2 py-1 font-bold text-black text-right">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Article title="Điều 2. Quyền và nghĩa vụ của Bên A">
        Quản lý, sử dụng số vốn nhận ủy thác đúng mục đích đầu tư đã nêu tại Điều 1; thanh toán đầy
        đủ, đúng hạn gốc và lãi cho Bên B khi kết thúc kỳ hạn; bảo mật thông tin cá nhân của Bên B.
      </Article>
      <Article title="Điều 3. Quyền và nghĩa vụ của Bên B">
        Cam kết nguồn vốn ủy thác là hợp pháp; có quyền được cung cấp thông tin về tình hình sử
        dụng vốn khi có yêu cầu chính đáng và nhận đầy đủ gốc, lãi đúng thời hạn cam kết.
      </Article>
      <Article title="Điều 4. Chấm dứt hợp đồng và Bất khả kháng">
        Hợp đồng đương nhiên chấm dứt khi Bên A hoàn tất nghĩa vụ thanh toán tại Điều 1. Trường hợp
        xảy ra sự kiện bất khả kháng, hai Bên cùng thương lượng trên tinh thần thiện chí, hợp tác.
      </Article>
      <Article title="Điều 5. Điều khoản chung">
        Hợp đồng có hiệu lực kể từ thời điểm Bên B hoàn tất ký xác nhận điện tử, được lập thành 02
        bản có giá trị pháp lý như nhau, mỗi Bên giữ 01 bản để theo dõi và thực hiện.
      </Article>

      {/* Khung ký như Khung văn bản: người nhận (Bên B) bên trái, bên phát hành (Bên A) bên phải */}
      <div className="grid grid-cols-2 gap-2 pt-2 mt-2">
        <div className="flex flex-col items-center text-center">
          <p className="text-[10px] font-bold text-black uppercase">BÊN B</p>
          <p className="text-[8.5px] italic text-gray-600">(Ký, ghi rõ họ tên)</p>
          <div className="h-20 w-full flex items-center justify-center">
            {signature?.content ? (
              signature.type === "draw" ? (
                <img src={signature.content} alt="Chữ ký" className="h-12 max-w-full object-contain" />
              ) : (
                <span style={{ fontFamily: "'Great Vibes', cursive" }} className="text-[20px] text-[#16100b] leading-none">
                  {signature.content}
                </span>
              )
            ) : (
              <span className="text-[9px] text-gray-300 italic">Chưa ký</span>
            )}
          </div>
          <p className="text-[10px] font-bold text-black leading-tight">{investorName}</p>
          <p className="text-[8.5px] text-gray-600 mt-0.5">Nhà đầu tư</p>
        </div>

        <div className="flex flex-col items-center text-center">
          <p className="text-[10px] font-bold text-black uppercase">ĐẠI DIỆN BÊN A</p>
          <p className="text-[8.5px] italic text-gray-600">(Ký, đóng dấu)</p>
          <div className="relative h-20 w-full flex items-center justify-center">
            {issuer.seal_url && <img src={issuer.seal_url} alt="Con dấu" className="absolute h-[72px] w-auto object-contain opacity-90" />}
            {issuer.signature_url && <img src={issuer.signature_url} alt="Chữ ký đại diện" className="relative h-11 max-w-[85%] object-contain" />}
          </div>
          <p className="text-[10px] font-bold text-black leading-tight">{issuer.name}</p>
          <p className="text-[8.5px] text-gray-600 mt-0.5">{issuer.title}</p>
        </div>
      </div>

      {/* Footer theo Khung văn bản */}
      <div className="mt-3 pt-1.5 border-t border-gray-300 text-center">
        {footer.lines.map((line) => (
          <p key={line} className="text-[8px] text-gray-500 leading-snug">{line}</p>
        ))}
        <p className="text-[7.5px] text-gray-400 mt-0.5">Số HĐ: {contractNo}</p>
      </div>
    </div>
  );
}
