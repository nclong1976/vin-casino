/**
 * Centralized Casino Configuration and Maintenance State Engine
 * Manages global maintenance status, per-game maintenance toggles,
 * and specific game controls for Tiger Baccarat & Baccarat Long Hổ.
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
    odds205: false, // Tỷ lệ trả thưởng Player & Banker 1.1x (kh\u00f4ng H\u00f2a)
    totalBets: 1250000000,
    totalPayout: 1140000000
  },
  "baccarat-long-ho": { 
    name: "Baccarat Long Hổ", 
    isMaintenance: false, 
    minBet: 10000, 
    maxBet: 500000000, 
    forcedOutcome: "auto", // 'auto', 'player', 'banker', 'tie', 'tiger'
    odds205: false, // Tỷ lệ trả thưởng Player & Banker 1.1x (kh\u00f4ng H\u00f2a)
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
};

const DEFAULT_CONFIG = {
  globalMaintenance: false,
  maintenanceMessage: "Hệ thống Casino Corona đang trong quá trình nâng cấp định kỳ. Vui lòng quay lại sau!",
  games: DEFAULT_GAMES_MAINTENANCE,
};

export function getCasinoConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    const mergedGames = {};
    const parsedGames = parsed.games || {};
    Object.keys(DEFAULT_GAMES_MAINTENANCE).forEach((k) => {
      mergedGames[k] = { ...DEFAULT_GAMES_MAINTENANCE[k], ...(parsedGames[k] || {}) };
    });

    return {
      globalMaintenance: parsed.globalMaintenance ?? false,
      maintenanceMessage: parsed.maintenanceMessage || DEFAULT_CONFIG.maintenanceMessage,
      games: mergedGames,
    };
  } catch (e) {
    return DEFAULT_CONFIG;
  }
}

export function saveCasinoConfig(newConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    window.dispatchEvent(new CustomEvent("vinclub:casino_config_updated", { detail: newConfig }));
    import('@/lib/rtdbSync').then(({ pushCasinoConfigToRTDB }) => {
      pushCasinoConfigToRTDB(newConfig);
    }).catch(() => null);
  } catch (e) {
    console.error("Failed to save casino config", e);
  }
}

/**
 * Cộng dồn tiền cược/tiền trả thưởng thật của 1 ván vừa kết thúc vào thống
 * kê doanh thu của game đó, để màn Admin hiển thị số liệu thật thay vì số
 * tĩnh gán sẵn. Đọc config mới nhất tại thời điểm gọi để giảm khả năng ghi
 * đè giữa các ván diễn ra gần nhau.
 */
export function incrementGameStats(gameKey, betDelta = 0, payoutDelta = 0) {
  if (!gameKey || (!betDelta && !payoutDelta)) return;
  try {
    const cfg = getCasinoConfig();
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
    saveCasinoConfig({ ...cfg, games: updatedGames });
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
