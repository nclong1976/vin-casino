/**
 * transactionHistory.js
 * ─────────────────────────────────────────────────────────────────
 * Chuẩn hoá bản ghi WalletTransaction thô (nhiều field không nhất quán
 * giữa các nguồn tạo ra nó: description/note, deposit/withdraw/investment/
 * withdrawal, completed/approved/pending/rejected/failed...) thành ĐÚNG 1
 * dòng lịch sử giao dịch duy nhất, không có khái niệm "Biến động số dư"
 * chung chung nào - mọi dòng đều được gọi tên đúng bản chất (Nạp/Rút/
 * Đầu tư/Thưởng-Lãi) và không có 2 dòng nào trùng nhau cho cùng 1 hành
 * động tài chính, vì đây LUÔN là map 1-1 từ 1 bản ghi WalletTransaction
 * sang 1 dòng hiển thị (không tạo thêm dòng phụ nào từ Notification).
 *
 * Đây là "hợp đồng dữ liệu" (data contract) duy nhất giữa lớp lưu trữ và
 * mọi UI hiển thị lịch sử giao dịch - UI không được tự suy luận loại/màu/
 * dấu +- từ field thô nữa, chỉ đọc từ NormalizedTransaction.
 */

// Các category đánh dấu 1 bản ghi type:"deposit" là THƯỞNG/LÃI (casino
// thắng, vòng quay, lãi VIP, đáo hạn dự án) chứ không phải nạp tiền ngân
// hàng thật - khớp đúng field `category` mà các luồng tương ứng đang ghi
// (BaiCao.jsx, TigerBaccarat.jsx, XiToBaLa.jsx, LuckyWheel.jsx,
// dailyYieldEngine.js). Nạp tiền ngân hàng thật / admin cộng ví không có
// category nên rơi vào nhánh mặc định "Nạp tiền".
const BONUS_CATEGORIES = new Set([
  "Thắng Casino",
  "Thưởng Vòng Quay",
  "Lãi VIP Hằng Ngày",
  "Đáo Hạn Dự Án",
]);

export const TRANSACTION_KINDS = /** @type {const} */ ({
  DEPOSIT: "deposit",
  WITHDRAW: "withdraw",
  INVESTMENT: "investment",
  BONUS: "bonus",
});

const KIND_META = {
  [TRANSACTION_KINDS.DEPOSIT]: { label: "Nạp tiền", sign: 1 },
  [TRANSACTION_KINDS.WITHDRAW]: { label: "Rút tiền", sign: -1 },
  [TRANSACTION_KINDS.INVESTMENT]: { label: "Đầu tư / Đặt cược", sign: -1 },
  [TRANSACTION_KINDS.BONUS]: { label: "Thưởng / Lãi", sign: 1 },
};

/**
 * Suy ra loại giao dịch chuẩn hoá từ `type`/`category` thô của
 * WalletTransaction. type gốc trong DB có 4 giá trị: deposit, withdraw,
 * investment (đầu tư dự án/chứng khoán), withdrawal (đặt cược casino) -
 * "investment" và "withdrawal" đều gộp vào 1 nhóm hiển thị "Đầu tư/Đặt cược"
 * vì cùng bản chất (tiền RA để tham gia 1 hoạt động, không phải rút ví).
 */
export function resolveTransactionKind(raw) {
  const type = raw?.type;
  if (type === "withdraw") return TRANSACTION_KINDS.WITHDRAW;
  if (type === "investment" || type === "withdrawal") return TRANSACTION_KINDS.INVESTMENT;
  if (type === "deposit" && BONUS_CATEGORIES.has(raw?.category)) return TRANSACTION_KINDS.BONUS;
  return TRANSACTION_KINDS.DEPOSIT;
}

const SETTLED_STATUSES = new Set(["completed", "approved"]);
const FAILED_STATUSES = new Set(["rejected", "failed"]);

/**
 * Chuẩn hoá trạng thái thô về đúng 3 trạng thái hiển thị. "completed" (luồng
 * cần Admin duyệt) và "approved" (luồng tự động tức thì: casino/vòng quay/
 * lãi VIP) đều là ĐÃ CHỐT TIỀN - trước đây STATUS_CONFIG của UI không có
 * khoá "approved" nên mọi giao dịch casino/thưởng bị hiển thị sai trạng thái.
 */
export function resolveTransactionStatus(raw) {
  const status = raw?.status || "pending";
  if (SETTLED_STATUSES.has(status)) return "success";
  if (FAILED_STATUSES.has(status)) return "failed";
  return "pending";
}

/**
 * @typedef {Object} NormalizedTransaction
 * @property {string} id
 * @property {"deposit"|"withdraw"|"investment"|"bonus"} kind
 * @property {string} kindLabel Nhãn tiếng Việt: "Nạp tiền" | "Rút tiền" | "Đầu tư / Đặt cược" | "Thưởng / Lãi"
 * @property {number} amount Luôn dương (giá trị tuyệt đối)
 * @property {number} signedAmount Dấu +/- đã áp đúng theo kind; 0 nếu status khác "success" (tiền chưa/không di chuyển)
 * @property {"success"|"pending"|"failed"} status
 * @property {string} statusLabel "Thành công" | "Chờ xử lý" | "Thất bại"
 * @property {string|null} isoTime created_date gốc (ISO 8601), dùng để format HH:mm:ss - DD/MM/YYYY ở UI
 * @property {string} code Mã giao dịch hiển thị cho người dùng
 * @property {string} description Mô tả gộp từ description/note (2 field khác nhau tuỳ nguồn tạo)
 * @property {string|null} rejectionReason
 * @property {string|null} bankName
 * @property {string|null} accountNumber
 * @property {number|null} balanceAfter Số dư SAU giao dịch này - gán bởi attachRunningBalance()
 */

/** Chuẩn hoá 1 bản ghi WalletTransaction thô thành đúng 1 NormalizedTransaction. */
export function normalizeWalletTransaction(raw) {
  const kind = resolveTransactionKind(raw);
  const meta = KIND_META[kind];
  const amount = Math.abs(Number(raw?.amount) || 0);
  const status = resolveTransactionStatus(raw);

  return {
    id: raw?.id,
    kind,
    kindLabel: meta.label,
    amount,
    signedAmount: status === "success" ? meta.sign * amount : 0,
    status,
    statusLabel: status === "success" ? "Thành công" : status === "pending" ? "Chờ xử lý" : "Thất bại",
    isoTime: raw?.created_date || raw?.created_at || null,
    code: raw?.code || raw?.id || "",
    description: raw?.description || raw?.note || meta.label,
    rejectionReason: raw?.rejection_reason || null,
    bankName: raw?.bank_name || null,
    accountNumber: raw?.account_number || null,
    balanceAfter: null,
  };
}

/**
 * Gán `balanceAfter` cho từng dòng bằng cách LÙI DẦN từ số dư HIỆN TẠI
 * (nguồn chân lý, truyền vào từ `user.balance`) qua danh sách đã sắp xếp
 * MỚI NHẤT TRƯỚC. Hệ thống không lưu sẵn "số dư sau giao dịch" ở đâu cả nên
 * đây là cách suy ra duy nhất - chỉ chính xác nếu `items` chứa ĐẦY ĐỦ giao
 * dịch đã chốt (status "success") của user đó, không bị lọc trước khi gọi
 * hàm này (lọc theo loại/trạng thái để HIỂN THỊ thì làm sau, không phải
 * trước khi tính balanceAfter).
 */
export function attachRunningBalance(items, currentBalance) {
  let running = Number(currentBalance) || 0;
  return items.map((item) => {
    const withBalance = { ...item, balanceAfter: running };
    if (item.status === "success") {
      running -= item.signedAmount;
    }
    return withBalance;
  });
}

/**
 * Hàm DUY NHẤT UI nên gọi: nhận mảng WalletTransaction thô + số dư hiện
 * tại, trả về mảng NormalizedTransaction đã sort mới nhất trước và có sẵn
 * balanceAfter. Việc lọc theo loại/trạng thái để hiển thị nên áp dụng SAU
 * khi gọi hàm này (trên kết quả trả về), không phải trên mảng thô đầu vào.
 */
export function buildTransactionHistory(rawList, currentBalance) {
  const normalized = (rawList || [])
    .map(normalizeWalletTransaction)
    .sort((a, b) => new Date(b.isoTime || 0) - new Date(a.isoTime || 0));
  return attachRunningBalance(normalized, currentBalance);
}
