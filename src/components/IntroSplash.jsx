import React, { useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

const SESSION_KEY = "vinclub_intro_seen";

export default function IntroSplash() {
  const [visible, setVisible] = useState(() => !sessionStorage.getItem(SESSION_KEY));
  const videoRef = useRef(null);

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
        >
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            src="/videos/welcome-intro.mp4"
            autoPlay
            muted
            playsInline
            onEnded={dismiss}
            onError={dismiss}
          />
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-xs border border-white/20 text-white flex items-center justify-center transition-all"
            title="Bỏ qua"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={dismiss}
            className="absolute bottom-6 right-4 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-xs border border-white/20 text-white text-[11px] font-semibold transition-all"
          >
            Bỏ qua
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
