import { useState, useEffect } from "react";
import { getAppMaintenanceConfig, subscribeAppMaintenanceConfig } from "@/lib/supabaseDb";

const FALLBACK_MESSAGE = "Hệ thống đang trong thời gian bảo trì. Vui lòng quay lại sau.";

/**
 * Theo dõi cờ bảo trì toàn bộ trang chủ (public.app_maintenance_config).
 * `enabled=false` (vd. tài khoản Admin) khiến hook no-op hoàn toàn - không
 * tải, không subscribe Realtime - để Admin không bị ảnh hưởng bởi tính
 * năng này dù ở bất kỳ hình thức nào. Gọi vô điều kiện trước mọi
 * early-return (Rules of Hooks), giống mẫu useDailyPayoutToast đã dùng
 * trong App.jsx.
 *
 * Trả về `null` khi đang tải lần đầu (chưa biết trạng thái thật), hoặc
 * `{ enabled, message }` sau khi đã có dữ liệu.
 */
export function useAppMaintenance(enabled) {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setConfig(null);
      return;
    }
    let cancelled = false;

    (async () => {
      const remote = await getAppMaintenanceConfig();
      if (!cancelled) {
        setConfig({
          enabled: !!remote?.enabled,
          message: remote?.message || FALLBACK_MESSAGE,
        });
      }
    })();

    const unsub = subscribeAppMaintenanceConfig((remote) => {
      if (cancelled) return;
      setConfig({
        enabled: !!remote?.enabled,
        message: remote?.message || FALLBACK_MESSAGE,
      });
    });

    return () => {
      cancelled = true;
      if (typeof unsub === "function") unsub();
    };
  }, [enabled]);

  return config;
}
