import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, ChevronRight, LogIn, UserPlus } from "lucide-react";

export default function WelcomeIntroPlayer({ onFinish }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
        setCurrentTime(video.currentTime);
        setDuration(video.duration);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      setIsReady(true);
      video.play().then(() => setIsPlaying(true)).catch(() => {
        // Autoplay policy prevented playback, keep muted and retry
        video.muted = true;
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      });
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, []);

  const handleComplete = (targetRoute = "/login") => {
    sessionStorage.setItem("vinclub_welcome_seen", "true");
    if (typeof onFinish === "function") {
      onFinish(targetRoute);
    } else {
      navigate(targetRoute);
    }
  };

  const toggleSound = (e) => {
    e.stopPropagation();
    if (videoRef.current) {
      const nextMuted = !isMuted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  const fmtTime = (secs) => {
    const s = Math.floor(secs || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? "0" : ""}${rem}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[99999] bg-[#0c0a09] flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Background Video */}
      <video
        ref={videoRef}
        src="/videos/welcome-intro.mp4"
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted={isMuted}
        playsInline
        webkit-playsinline="true"
        onEnded={() => handleComplete("/login")}
        onError={() => handleComplete("/login")}
      />

      {/* Cinematic Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 pointer-events-none" />

      {/* Top Header Bar */}
      <div className="relative z-10 p-4 sm:p-6 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="VinClub"
            className="w-9 h-9 rounded-xl object-cover border border-[#948154]/50 shadow-[0_0_15px_rgba(148,129,84,0.4)]"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#eddab3] via-[#d4af37] to-[#b38b2d] uppercase">
                VinClub
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#948154]/30 border border-[#948154]/60 text-[#eedbb2] font-bold">
                VIP
              </span>
            </div>
            <p className="text-[9.5px] text-gray-300 font-medium tracking-wide">
              Đẳng cấp thượng lưu & Thịnh vượng
            </p>
          </div>
        </div>

        {/* Skip button top-right */}
        <button
          onClick={() => handleComplete("/login")}
          className="px-3.5 py-1.5 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md border border-white/20 hover:border-[#948154]/60 text-white text-[11.5px] font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-md"
        >
          <span>Bỏ qua</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Center Sound Toggle Prompt (If muted) */}
      {isMuted && isReady && (
        <div className="relative z-10 flex items-center justify-center p-4">
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: [0.95, 1.05, 0.95], opacity: 1 }}
            transition={{ repeat: Infinity, duration: 2.2 }}
            onClick={toggleSound}
            className="px-4 py-2 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-lg border border-[#948154]/80 text-[#ebd7aa] text-[12px] font-bold flex items-center gap-2 shadow-[0_0_25px_rgba(212,175,55,0.3)] cursor-pointer"
          >
            <VolumeX className="w-4 h-4 text-[#d4af37]" />
            <span>Chạm để bật âm thanh</span>
          </motion.button>
        </div>
      )}

      {/* Bottom Controls & Navigation */}
      <div className="relative z-10 p-4 sm:p-6 space-y-3 pb-8 sm:pb-6">
        {/* Progress Bar & Time */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-gray-300">
            <span>{fmtTime(currentTime)}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSound}
                className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title={isMuted ? "Bật tiếng" : "Tắt tiếng"}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-[#d4af37]" />}
              </button>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>

          <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-xs">
            <div
              className="h-full bg-gradient-to-r from-[#948154] to-[#d4af37] rounded-full transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            onClick={() => handleComplete("/login")}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#948154] via-[#ab9461] to-[#837045] hover:from-[#a38e5c] hover:to-[#73623c] text-white text-[12.5px] font-bold shadow-[0_4px_20px_rgba(148,129,84,0.4)] flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer border border-[#d4af37]/40"
          >
            <LogIn className="w-4 h-4" />
            <span>Đăng nhập ngay</span>
          </button>

          <button
            onClick={() => handleComplete("/register")}
            className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-[12.5px] font-bold border border-white/20 hover:border-white/40 flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-[#eddab3]" />
            <span>Đăng ký mới</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
