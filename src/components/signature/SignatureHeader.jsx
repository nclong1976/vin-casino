import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Home } from "lucide-react";

export default function SignatureHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
      <Link
        to="/"
        className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
      >
        <ArrowLeft className="w-4 h-4" />
      </Link>
      <h1 className="text-[14px] font-bold text-black">Chữ ký điện tử</h1>
      <Link
        to="/"
        className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
      >
        <Home className="w-4 h-4" />
      </Link>
    </header>
  );
}