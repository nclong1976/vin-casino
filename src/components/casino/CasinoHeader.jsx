import React from "react";

export default function CasinoHeader({ title = "CASINO CORONA" }) {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#120d08] border-b border-[#3a2c14]">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-center">
        <h1 className="text-[14px] sm:text-base font-semibold tracking-wide text-[#e8c87a] text-center">
          {title}
        </h1>
      </div>
    </header>
  );
}