import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Home } from "lucide-react";

export default function PageHeader({ title }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-white/65 backdrop-blur-md border-b border-white/40 shadow-xs transition-all">
      <button
        onClick={() => navigate(-1)}
        className="w-8 h-8 flex items-center justify-center rounded-full text-gray-700 bg-white/40 hover:bg-white/70 backdrop-blur-xs border border-white/30 transition-all"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <h1 className="text-[14px] font-bold text-black drop-shadow-2xs">{title}</h1>
      <Link
        to="/"
        className="w-8 h-8 flex items-center justify-center rounded-full text-gray-700 bg-white/40 hover:bg-white/70 backdrop-blur-xs border border-white/30 transition-all"
      >
        <Home className="w-4 h-4" />
      </Link>
    </header>
  );
}