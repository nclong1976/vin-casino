/**
 * Thông báo "Biến động số dư" kiểu tin nhắn ngân hàng - cùng định dạng với
 * thông báo khi Admin duyệt lệnh nạp/rút (trigger process_wallet_transaction):
 *   TK Yen1987: +5,000,000 VND luc 16:47 11/09/2026. SD: 105,400,401 VND. ND: ...
 */

export const BALANCE_NOTICE_TITLE = "Biến động số dư";
export const DEFAULT_CREDIT_MEMO = "CT CP VINCLUB CHUYEN TIEN";
export const DEFAULT_DEBIT_MEMO = "VINCLUB DIEU CHINH SO DU";

const money = (n) => Math.abs(Math.trunc(Number(n) || 0)).toLocaleString("en-US");

/** Bỏ dấu tiếng Việt, viết hoa, gọn khoảng trắng - như nội dung chuyển khoản ngân hàng. */
export function toMemo(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 160);
}

/** Tên tài khoản hiển thị: mã hội viên → phần trước @ của email → id. */
export function accountLabel(user) {
  return String(user?.identifier || "").trim() || String(user?.email || "").split("@")[0] || user?.id || "";
}

function vnTime(at) {
  const d = at ? new Date(at) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false,
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.hour === "24" ? "00" : p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}`;
}

/**
 * @param {{ user, delta: number, balanceAfter?: number|null, memo?: string, at?: string|Date }} args
 * @returns {{ title: string, content: string, type: "deposit"|"withdraw" }}
 */
export function balanceChangeNotice({ user, delta, balanceAfter = null, memo = "", at }) {
  const credit = Number(delta) >= 0;
  const sd = balanceAfter === null || balanceAfter === undefined || !Number.isFinite(Number(balanceAfter)) ? "" : ` SD: ${money(balanceAfter)} VND.`;
  const nd = toMemo(memo) || (credit ? DEFAULT_CREDIT_MEMO : DEFAULT_DEBIT_MEMO);
  return {
    title: BALANCE_NOTICE_TITLE,
    content: `TK ${accountLabel(user)}: ${credit ? "+" : "-"}${money(delta)} VND luc ${vnTime(at)}.${sd} ND: ${nd}`,
    type: credit ? "deposit" : "withdraw",
  };
}
