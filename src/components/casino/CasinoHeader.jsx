import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Home as HomeIcon } from "lucide-react";

export default function CasinoHeader({ title = "CASINO CORONA" }) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[#120d08] border-b border-[#3a2c14]">
      <Link to="/" className="p-1 -m-1 active:scale-90 transition-transform">
        <ArrowLeft className="w-4 h-4 text-[#e8c87a]" />
      </Link>
      <h1 className="text-[13px] font-semibold tracking-wide text-[#e8c87a]">
        {title}
      </h1>
      <Link to="/" className="p-1 -m-1 active:scale-90 transition-transform">
        <HomeIcon className="w-4 h-4 text-[#e8c87a]" />
      </Link>
    </header>
  );
}