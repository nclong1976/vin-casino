import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Home as HomeIcon } from "lucide-react";

export default function StockHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[#0d1117] border-b border-[#1f2630]">
      <Link to="/" className="p-1 -m-1 active:scale-90 transition-transform">
        <ArrowLeft className="w-4 h-4 text-white" />
      </Link>
      <h1 className="text-[14px] font-semibold tracking-wide text-white">
        ĐẦU TƯ CHỨNG KHOÁN
      </h1>
      <Link to="/" className="p-1 -m-1 active:scale-90 transition-transform">
        <HomeIcon className="w-4 h-4 text-white" />
      </Link>
    </header>
  );
}