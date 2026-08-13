import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Home as HomeIcon } from "lucide-react";

export default function ProjectsHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[#1a1410] border-b border-[#2a2218]">
      <Link to="/" className="p-1 -m-1 active:scale-90 transition-transform">
        <ArrowLeft className="w-4 h-4 text-[#FDFDFD]" />
      </Link>
      <h1 className="text-[14px] font-semibold tracking-wide text-[#FDFDFD]">
        DỰ ÁN
      </h1>
      <Link to="/" className="p-1 -m-1 active:scale-90 transition-transform">
        <HomeIcon className="w-4 h-4 text-[#FDFDFD]" />
      </Link>
    </header>
  );
}