#!/usr/bin/env python3
"""
Subset font Noto Serif cho văn bản điện tử (spec mục 3.4, 8.4).

    pip install fonttools && python3 scripts/subset-fonts.py

Đọc font gốc ở assets/fonts-src/noto-serif/, chỉ giữ đúng bảng ký tự mà bộ dàn
trang đo được (ASCII, Latin-1, Latin Extended-A, Ơ/Ư, toàn bộ chữ Việt có dấu,
dấu câu thường gặp), bỏ kerning/hinting, ghi ra public/fonts/noto-serif/.
Trang web và Edge Function tạo PDF cùng dùng các file này; PDF nhúng NGUYÊN
file đã subset (không dùng subset của pdf-lib - làm mất glyph với font này).
Chạy lại khi đổi font, rồi chạy `npm run build:font-metrics`.
"""
from pathlib import Path
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/fonts-src/noto-serif"
OUT = ROOT / "public/fonts/noto-serif"

# Phải khớp RANGES/EXTRA trong scripts/build-font-metrics.mjs.
RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x100, 0x17F), (0x1A0, 0x1B0), (0x1EA0, 0x1EF9)]
EXTRA = [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AB, 0x2116, 0x2122, 0x00B7]

def unicodes():
    cps = set(EXTRA)
    for a, b in RANGES:
        cps.update(range(a, b + 1))
    return sorted(cps)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for src in sorted(SRC.glob("NotoSerif-*.ttf")):
        options = subset.Options()
        options.layout_features = []  # không kerning / ligature - khớp bảng metrics
        options.hinting = False
        options.name_IDs = ["*"]
        options.notdef_outline = True
        options.glyph_names = False
        font = subset.load_font(str(src), options)
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=unicodes())
        subsetter.subset(font)
        out = OUT / src.name
        subset.save_font(font, str(out), options)
        print(f"{src.name}: {src.stat().st_size} -> {out.stat().st_size} bytes")

if __name__ == "__main__":
    main()
