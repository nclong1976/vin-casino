import { getCasinoMaintenanceConfig, saveCasinoMaintenanceConfig } from "@/lib/supabaseDb";

/**
 * Centralized Casino Configuration and Maintenance State Engine
 * Manages global maintenance status, per-game maintenance toggles,
 * and specific game controls for Tiger Baccarat & Baccarat Long Hổ.
 *
 * Nguồn sự thật: bảng public.casino_maintenance_config trên Supabase (mọi
 * user đã đăng nhập đọc được, chỉ Admin ghi được - xem migration
 * add_casino_maintenance_config_table). localStorage chỉ còn là cache hiển
 * thị tức thời (optimistic) cho lần render đầu tiên trước khi đọc xong
 * Supabase - KHÔNG còn là nguồn thật, khác với thiết kế cũ dùng Firebase
 * RTDB để đồng bộ giữa các thiết bị.
 */
const STORAGE_KEY = "vinclub_casino_config_v1";

const DEFAULT_GAMES_MAINTENANCE = {
  "bai-cao": { name: "Bài Cào", isMaintenance: false },
  "tiger-baccarat": {
    name: "Tiger Baccarat",
    isMaintenance: false,
    minBet: 10000,
    maxBet: 500000000,
    forcedOutcome: "auto", // 'auto', 'player', 'banker', 'tie', 'tiger'
    odds205: false, // Tỷ lệ trả thưởng Player & Banker 1.1x (không Hòa)
    totalBets: 1250000000,
    totalPayout: 1140000000
  },
  "baccarat-long-ho": {
    name: "Baccarat Long Hổ",
    isMaintenance: false,
    minBet: 10000,
    maxBet: 500000000,
    forcedOutcome: "auto", // 'auto', 'player', 'banker', 'tie', 'tiger'
    odds205: false, // Tỷ lệ trả thưởng Player & Banker 1.1x (không Hòa)
    totalBets: 980000000,
    totalPayout: 890000000
  },
  "xi-to-texas": { name: "Xì Tố Texas Hold 'em", isMaintenance: false },
  "xi-to-ba-la": { name: "Xì Tố Ba Lá", isMaintenance: false },
  "xi-to-nga": { name: "Xì Tố Nga", isMaintenance: false },
  "xi-dach": { name: "Xì Dách", isMaintenance: false },
  "niu-niu": { name: "Niu Niu Poker", isMaintenance: false },
  "caribbean-stud": { name: "Caribbean Stud Poker", isMaintenance: false },
  "xuc-xac": { name: "Xúc Xắc", isMaintenance: false },
  "slots": { name: "Slots", isMaintenance: false },
  "co-quay": { name: "Cò Quay", isMaintenance: false },
  "lucky-wheel": { name: "Vòng Quay May Mắn", isMaintenance: false },
};

const DEFAULT_CONFIG = {
  globalMaintenance: false,
  maintenanceMessage: "Hệ thống Casino Corona đang trong quá trình nâng cấp định kỳ. Vui lòng quay lại sau!",
  games: DEFAULT_GAMES_MAINTENANCE,
};

function mergeWithDefaults(parsed) {
  const mergedGames = {};
  const parsedGames = parsed?.games || {};
  Object.keys(DEFAULT_GAMES_MAINTENANCE).forEach((k) => {
    mergedGames[k] = { ...DEFAULT_GAMES_MAINTENANCE[k], ...(parsedGames[k] || {}) };
  });

  return {
    globalMaintenance: parsed?.globalMaintenance ?? false,
    maintenanceMessage: parsed?.maintenanceMessage || DEFAULT_CONFIG.maintenanceMessage,
    games: mergedGames,
  };
}

/** Đọc cache cục bộ tức thời (đồng bộ, dùng cho render đầu tiên) - gọi
 * refreshCasinoConfig() để lấy bản mới nhất từ Supabase. */
export function getCasinoConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return mergeWithDefaults(JSON.parse(raw));
  } catch (e) {
    return DEFAULT_CONFIG;
  }
}

function setLocalCache(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {}
}

/** Đọc bản mới nhất từ Supabase, cập nhật cache cục bộ và bắn sự kiện cho
 * các component đang dùng getCasinoConfig() đồng bộ. */
export async function refreshCasinoConfig() {
  const remote = await getCasinoMaintenanceConfig();
  const merged = mergeWithDefaults(remote);
  setLocalCache(merged);
  window.dispatchEvent(new CustomEvent("vinclub:casino_config_updated", { detail: merged }));
  return merged;
}

export async function saveCasinoConfig(newConfig) {
  setLocalCache(newConfig);
  window.dispatchEvent(new CustomEvent("vinclub:casino_config_updated", { detail: newConfig }));
  await saveCasinoMaintenanceConfig(newConfig);
}

/**
 * Cộng dồn tiền cược/tiền trả thưởng thật của 1 ván vừa kết thúc vào thống
 * kê doanh thu của game đó, để màn Admin hiển thị số liệu thật thay vì số
 * tĩnh gán sẵn. Đọc config mới nhất tại thời điểm gọi để giảm khả năng ghi
 * đè giữa các ván diễn ra gần nhau.
 */
export async function incrementGameStats(gameKey, betDelta = 0, payoutDelta = 0) {
  if (!gameKey || (!betDelta && !payoutDelta)) return;
  try {
    const cfg = await refreshCasinoConfig();
    const current = cfg.games[gameKey];
    if (!current) return;
    const updatedGames = {
      ...cfg.games,
      [gameKey]: {
        ...current,
        totalBets: (current.totalBets || 0) + (betDelta || 0),
        totalPayout: (current.totalPayout || 0) + (payoutDelta || 0),
      },
    };
    await saveCasinoConfig({ ...cfg, games: updatedGames });
  } catch (e) {
    console.error("Failed to increment game stats", e);
  }
}

export function isGameUnderMaintenance(gameKey) {
  const cfg = getCasinoConfig();
  if (cfg.globalMaintenance) return true;
  if (!gameKey) return false;

  // Normalize slug
  const normalizedKey = gameKey.toLowerCase().replace(/^\/casino\//, "").replace(/^\//, "");
  const game = cfg.games[normalizedKey];
  return game ? !!game.isMaintenance : false;
}
