import React from "react";

export default function PageHeader({ title }) {
  return (
    <header className="sticky top-0 z-40 w-full bg-white/75 backdrop-blur-md border-b border-white/40 shadow-xs transition-all">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-center">
        <h1 className="text-[15px] sm:text-base font-bold text-black drop-shadow-2xs text-center">{title}</h1>
      </div>
    </header>
  );
}