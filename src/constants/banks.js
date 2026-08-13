export const BANKS = [
  { code: "VCB", name: "Vietcombank", color: "#00745A", logo: "https://api.vietqr.io/img/VCB.png" },
  { code: "BIDV", name: "BIDV", color: "#0066B3", logo: "https://api.vietqr.io/img/BIDV.png" },
  { code: "VTB", name: "VietinBank", color: "#DD1F26", logo: "https://api.vietqr.io/img/ICB.png" },
  { code: "AGB", name: "Agribank", color: "#C8102E", logo: "https://api.vietqr.io/img/VBA.png" },
  { code: "TCB", name: "Techcombank", color: "#C40B2F", logo: "https://api.vietqr.io/img/TCB.png" },
  { code: "MB", name: "MB Bank", color: "#1B3A6B", logo: "https://api.vietqr.io/img/MB.png" },
  { code: "ACB", name: "ACB", color: "#005BAA", logo: "https://api.vietqr.io/img/ACB.png" },
  { code: "TPB", name: "TPBank", color: "#8B2C8B", logo: "https://api.vietqr.io/img/TPB.png" },
  { code: "VPB", name: "VPBank", color: "#1C5C9C", logo: "https://api.vietqr.io/img/VPB.png" },
  { code: "STB", name: "Sacombank", color: "#D11F2C", logo: "https://api.vietqr.io/img/STB.png" },
  { code: "SHB", name: "SHB", color: "#00A0E3", logo: "https://api.vietqr.io/img/SHB.png" },
  { code: "HDB", name: "HDBank", color: "#E8332A", logo: "https://api.vietqr.io/img/HDB.png" },
  { code: "MSB", name: "MSB", color: "#EA5404", logo: "https://api.vietqr.io/img/MSB.png" },
  { code: "OCB", name: "OCB", color: "#008837", logo: "https://api.vietqr.io/img/OCB.png" },
  { code: "LPB", name: "LPBank", color: "#EF4129", logo: "https://api.vietqr.io/img/LPB.png" },
  { code: "VIB", name: "VIB", color: "#0055A5", logo: "https://api.vietqr.io/img/VIB.png" },
];

export const BANK_MAP = BANKS.reduce((acc, b) => {
  acc[b.code] = b;
  return acc;
}, {});

export function getBankLogo(bankCode) {
  if (!bankCode) return null;
  const code = bankCode.toUpperCase();
  if (BANK_MAP[code]?.logo) return BANK_MAP[code].logo;
  // Fallback map for common codes
  const codeAliasMap = {
    ICB: "https://api.vietqr.io/img/ICB.png",
    VBA: "https://api.vietqr.io/img/VBA.png",
    VIETCOMBANK: "https://api.vietqr.io/img/VCB.png",
    VIETINBANK: "https://api.vietqr.io/img/ICB.png",
    AGRIBANK: "https://api.vietqr.io/img/VBA.png",
    TECHCOMBANK: "https://api.vietqr.io/img/TCB.png",
    MBBANK: "https://api.vietqr.io/img/MB.png",
    TPBANK: "https://api.vietqr.io/img/TPB.png",
    VPBANK: "https://api.vietqr.io/img/VPB.png",
    SACOMBANK: "https://api.vietqr.io/img/STB.png",
    HDBANK: "https://api.vietqr.io/img/HDB.png",
  };
  return codeAliasMap[code] || `https://api.vietqr.io/img/${code}.png`;
}
