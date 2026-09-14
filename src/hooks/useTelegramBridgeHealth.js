import { useState, useEffect } from "react";
import { getTelegramBridgeHealth, subscribeTelegramBridgeHealth } from "@/lib/supabaseDb";

const EMPTY_CHANNEL = { lastSuccessAt: null, lastError: null, lastErrorAt: null, ok: true };

/** Kênh coi là "lỗi" khi có last_error VÀ lần lỗi đó xảy ra SAU lần thành
 * công gần nhất (hoặc chưa từng thành công lần nào) - tránh báo đỏ nhầm cho
 * 1 lỗi thoáng qua đã tự phục hồi ở lần gửi kế tiếp. */
function normalizeChannel(raw) {
  if (!raw) return EMPTY_CHANNEL;
  const lastSuccessAt = raw.last_success_at || null;
  const lastError = raw.last_error || null;
  const lastErrorAt = raw.last_error_at || null;
  const ok = !lastError || !lastErrorAt || (lastSuccessAt && lastSuccessAt >= lastErrorAt);
  return { lastSuccessAt, lastError, lastErrorAt, ok: !!ok };
}

/**
 * Theo dõi trạng thái sức khoẻ 2 kênh forward Telegram (CSKH, Nạp/Rút) -
 * public.telegram_bridge_health, ghi bởi server.ts (recordTelegramHealth()).
 * Admin-only theo RLS - chỉ nên dùng trong khu vực Admin Panel.
 *
 * Trả về `null` khi đang tải lần đầu, hoặc `{ cskh, wallet }` sau khi có dữ
 * liệu (mỗi cái gồm `{ lastSuccessAt, lastError, lastErrorAt, ok }`).
 */
export function useTelegramBridgeHealth() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const apply = (remote) => {
      if (cancelled) return;
      setStatus({
        cskh: normalizeChannel(remote?.cskh),
        wallet: normalizeChannel(remote?.wallet),
      });
    };

    (async () => {
      const remote = await getTelegramBridgeHealth();
      apply(remote);
    })();

    const unsub = subscribeTelegramBridgeHealth(apply);

    return () => {
      cancelled = true;
      if (typeof unsub === "function") unsub();
    };
  }, []);

  return status;
}
