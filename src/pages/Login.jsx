import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { signIn as supaSignIn, signUp as supaSignUp, mapSupabaseUser } from "@/lib/supabaseAuth";
import { upsertSupabaseUser } from "@/lib/supabaseDb";
import { normalizeIdentifierToAuthEmail, isPhoneNumber } from "@/lib/identifier";
import { pushUserToRTDB } from "@/lib/rtdbSync";
import { Loader2, Eye, EyeOff, CheckCircle2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import GoogleIcon from "@/components/GoogleIcon";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "@/components/ui/use-toast";
import { useConfig } from "@/lib/ConfigContext";

export default function Login() {
  const { config, triggerSound: playFx } = useConfig();
  const [step, setStep] = useState("login"); // "login" | "otp"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [countdown, setCountdown] = useState(30);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPushNotification, setShowPushNotification] = useState(false);
  const [notificationFilled, setNotificationFilled] = useState(false);

  const triggerSound = (type) => {
    if (playFx) {
      playFx(type);
    }
  };

  // Helper to generate a random 6-digit OTP code (100000 to 999999)
  const generateRandomOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  // Timer logic for OTP resend
  useEffect(() => {
    let timer;
    if (step === "otp" && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  // Trigger push notification after entering OTP step
  useEffect(() => {
    if (step === "otp") {
      setNotificationFilled(false);
      const delayMs = config?.pushNotificationDelay || 600;
      const notifTimer = setTimeout(() => {
        setShowPushNotification(true);
        triggerSound("notification");
      }, delayMs);
      return () => clearTimeout(notifTimer);
    } else {
      setShowPushNotification(false);
    }
  }, [step, generatedOtp]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Step 1 Input Validation
    if (!email.trim() || !password.trim()) {
      setError("Vui lòng nhập đầy đủ thông tin");
      triggerSound("click");
      return;
    }

    setLoading(true);
    try {
      const rawIdentifier = email.trim();
      const authEmail = normalizeIdentifierToAuthEmail(rawIdentifier);

      // Ưu tiên đăng nhập qua Supabase Auth (dùng email đã chuẩn hóa để
      // khớp với tài khoản được tạo lúc đăng ký, kể cả khi định danh là
      // số điện thoại/tên đăng nhập chứ không phải email)
      let loginSuccess = false;
      try {
        await supaSignIn(authEmail, password);
        loginSuccess = true;
      } catch (supaErr) {
        // Fallback sang base44 legacy (chỉ tồn tại cục bộ trên thiết bị này)
        try {
          const legacyResult = await base44.auth.loginViaEmailPassword(rawIdentifier, password);
          loginSuccess = true;

          // "Bảo lưu" tài khoản cũ: mật khẩu vừa được xác thực đúng nhưng
          // tài khoản này chưa từng tồn tại thật trên Supabase (chỉ có ở
          // localStorage thiết bị này) - tạo ngay tài khoản Supabase tương
          // ứng để từ nay đăng nhập được trên mọi thiết bị, không cần
          // đăng ký lại. Chạy ngầm, không chặn luồng đăng nhập nếu lỗi.
          const legacyUser = legacyResult?.user;
          if (legacyUser) {
            supaSignUp(authEmail, password, {
              full_name: legacyUser.full_name || legacyUser.name,
              name: legacyUser.full_name || legacyUser.name,
              role: legacyUser.role || "user",
              balance: legacyUser.balance || 0,
              total_deposited: legacyUser.total_deposited || 0,
              membership_tier: legacyUser.membership_tier || "VIP 1 - Gold",
              identifier: rawIdentifier,
              phone: isPhoneNumber(rawIdentifier) ? rawIdentifier : (legacyUser.phone || ""),
            }).catch(() => {});
            upsertSupabaseUser({ ...legacyUser, identifier: rawIdentifier, email: authEmail }).catch(() => {});
          }
        } catch (legacyErr) {
          throw new Error(supaErr.message || legacyErr.message || "Tài khoản hoặc mật khẩu không chính xác");
        }
      }

      if (loginSuccess) {
        // Generate a new random 6-digit OTP
        const newOtp = generateRandomOtp();
        setGeneratedOtp(newOtp);
        setStep("otp");
        setCountdown(30);
        setOtpCode("");
        triggerSound("toggle");
      }
    } catch (err) {
      setError(err.message || "Tài khoản hoặc mật khẩu không chính xác");
      triggerSound("click");
    } finally {
      setLoading(false);
    }
  };

  const handleFillOtp = () => {
    if (!generatedOtp) return;
    setOtpCode(generatedOtp);
    setNotificationFilled(true);
    setError("");
    triggerSound("click");
    toast({
      title: "Đã điền mã OTP",
      description: `Mã ${generatedOtp} đã được tự động áp dụng.`,
    });
    // Fade out notification after clicking
    setTimeout(() => {
      setShowPushNotification(false);
    }, 1200);
  };

  const handleOtpSubmit = async (e) => {
    if (e) e.preventDefault();
    if (otpCode.length < 6) return;
    setError("");

    // Validate OTP against generatedOtp
    if (otpCode !== generatedOtp) {
      setError("Mã OTP không đúng hoặc đã hết hạn");
      triggerSound("click");
      return;
    }

    setLoading(true);
    try {
      // OTP validated locally — session đã được thiết lập ở bước signIn
      triggerSound("win");

      // Lấy user từ Supabase session để xác định role & nạp toàn bộ dữ liệu thiết bị mới
      let role = "user";
      try {
        const { getSession } = await import("@/lib/supabaseAuth");
        const { hydrateUserOnNewDevice } = await import("@/lib/syncEngine");
        const session = await getSession();
        if (session?.user) {
          const vinUser = mapSupabaseUser(session.user);
          role = vinUser.role || "user";
          // Đồng bộ toàn diện P0, P1, P2 cho thiết bị mới
          await hydrateUserOnNewDevice(vinUser);
        }
      } catch (e) {
        // Fallback sang base44 user
        try {
          const { hydrateUserOnNewDevice } = await import("@/lib/syncEngine");
          const currentUser = await base44.auth.me();
          if (currentUser) {
            role = currentUser?.role || "user";
            await hydrateUserOnNewDevice(currentUser);
          }
        } catch (_) {}
      }

      if (role === "admin") {
        window.location.href = "/admin";
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      setError("Mã OTP không đúng hoặc đã hết hạn");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setError("");
    try {
      await base44.auth.resendOtp(email);
      const newOtp = generateRandomOtp();
      setGeneratedOtp(newOtp);
      setOtpCode("");
      setCountdown(30);
      setShowPushNotification(true);
      setNotificationFilled(false);
      triggerSound("notification");
      toast({
        title: "Đã gửi lại OTP",
        description: `Mã xác thực mới đã được tạo và gửi đến ${email}.`,
      });
    } catch (err) {
      setError("Không thể gửi lại mã OTP");
    }
  };

  // Đăng nhập Google đã bị vô hiệu hóa - nút chỉ giữ lại để trang trí giao diện
  const handleGoogle = () => {
    triggerSound("click");
  };

  if (step === "otp") {
    return (
      <div className="bg-black text-white min-h-screen w-full relative overflow-hidden flex flex-col justify-between items-center py-12 px-6">
        {/* Background Image: Đà Nẵng Downtown */}
        <div className="absolute inset-0 z-0 h-full w-full">
          <img
            src="https://vcdn1-vnexpress.vnecdn.net/2025/08/18/da-nang-downtown-1755511501-5262-1755511781.jpg?w=1020&h=0&q=100&dpr=1&fit=crop&s=KTB4QWx6fZ-I6eaDKpTk_g"
            alt="Đà Nẵng Downtown Background"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/85 backdrop-blur-[2px]" />
        </div>

        {/* Push Notification Banner - iOS Style */}
        <AnimatePresence>
          {showPushNotification && (
            <motion.div
              initial={{ y: -100, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -100, opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="fixed top-3 left-3 right-3 sm:left-auto sm:right-auto sm:w-[380px] mx-auto z-50 cursor-pointer group"
              onClick={handleFillOtp}
            >
              <div className="bg-[#e4ece9]/95 backdrop-blur-2xl border border-white/50 text-[#1c1c1e] rounded-[22px] p-3.5 sm:p-4 shadow-[0_12px_32px_rgba(0,0,0,0.3)] flex flex-col gap-2 relative overflow-hidden transition-all hover:bg-[#dce6e2] active:scale-[0.98]">
                {/* Header Row: Icon + App Name + Time */}
                <div className="flex items-center justify-between text-[13px] font-medium text-[#6e7175]">
                  <div className="flex items-center gap-2">
                    {/* iOS Messages Icon (Green bubble) */}
                    <div className="w-5 h-5 rounded-[5px] bg-[#34c759] flex items-center justify-center shadow-sm text-white shrink-0">
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                      </svg>
                    </div>
                    <span className="uppercase tracking-wide text-[11px] font-semibold text-[#54585c]">
                      MESSAGES
                    </span>
                  </div>
                  <span className="text-[12px] text-[#8e8e93]">now</span>
                </div>

                {/* Message Content */}
                <div className="flex flex-col gap-0.5 pl-0.5">
                  <p className="text-[14px] font-bold text-[#000000] leading-snug">
                    Hệ thống Vinclub
                  </p>
                  <p className="text-[13px] font-semibold text-[#3a3a3c] leading-tight">
                    Mã xác thực OTP
                  </p>
                  <p className="text-[13px] text-[#2c2c2e] leading-snug mt-0.5">
                    Mã xác thực OTP của bạn là: <span className="font-bold text-[#000000] bg-white/80 px-1.5 py-0.5 rounded border border-black/10 font-mono text-[14px]">{generatedOtp}</span> (Có hiệu lực trong 5 phút).
                  </p>
                </div>

                {/* Interactive hint/status footer */}
                <div className="mt-1 flex items-center justify-between text-[12px] pt-1.5 border-t border-black/5 text-[#2b6045] font-semibold">
                  {notificationFilled ? (
                    <span className="flex items-center gap-1 text-[#28844b]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã tự động điền mã {generatedOtp}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 hover:underline">
                      <Sparkles className="w-3.5 h-3.5 text-[#28844b]" /> Chạm để tự động điền {generatedOtp}
                    </span>
                  )}
                  <span className="text-[11px] text-[#8e8e93]">Chạm để điền</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Header Title */}
        <div className="w-full max-w-[400px] text-center pt-4 z-10">
          <h1 className="text-white text-2xl font-bold tracking-tight drop-shadow-md">Xác thực</h1>
        </div>

        {/* Main Glass Card */}
        <div className="w-full max-w-[400px] bg-[#1a1715]/85 backdrop-blur-xl rounded-3xl shadow-[0_16px_40px_rgba(0,0,0,0.5)] border border-[#948154]/40 p-7 sm:p-8 flex flex-col items-center my-auto z-10 text-white">
          <h2 className="text-gray-200 text-[16px] font-normal text-center mb-7">
            Mã OTP đã được gửi đến <span className="font-semibold text-white">{email}</span>
          </h2>

          {error && (
            <div className="w-full mb-5 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-sm text-center font-medium">
              {error}
            </div>
          )}

          {/* 6-Digit OTP Box */}
          <div className="flex justify-center w-full mb-6">
            <InputOTP
              maxLength={6}
              value={otpCode}
              onChange={(val) => {
                setOtpCode(val);
                if (val.length === 6) {
                  setError("");
                }
              }}
              autoFocus
            >
              <InputOTPGroup className="gap-2 sm:gap-2.5">
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <InputOTPSlot
                    key={idx}
                    index={idx}
                    className="w-11 h-13 sm:w-12 sm:h-14 bg-white/10 border border-white/30 rounded-xl text-white text-xl font-bold shadow-none focus:border-[#d0bfae] focus:ring-1 focus:ring-[#d0bfae] transition-all"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          {/* Quick Auto-fill button */}
          {!showPushNotification && generatedOtp && (
            <button
              type="button"
              onClick={handleFillOtp}
              className="text-xs text-[#d0bfae] hover:underline font-medium mb-4 flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Điền nhanh mã OTP ({generatedOtp})
            </button>
          )}

          {/* Resend Timer Text */}
          <div className="text-center mb-7 text-sm text-gray-300">
            {countdown > 0 ? (
              <span>Gửi lại OTP sau: 0:{countdown < 10 ? `0${countdown}` : countdown}</span>
            ) : (
              <button
                type="button"
                onClick={handleResendOtp}
                className="text-[#d0bfae] font-semibold hover:underline cursor-pointer"
              >
                Gửi lại OTP ngay
              </button>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleOtpSubmit}
            disabled={loading || otpCode.length < 6}
            className="w-full bg-[#948154] hover:bg-[#837045] active:opacity-90 disabled:bg-[#948154]/40 text-white font-semibold text-[17px] rounded-2xl py-4 flex items-center justify-center transition-all shadow-md mb-6 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-white" /> Đang xác thực...
              </span>
            ) : (
              "Tiếp tục"
            )}
          </button>

          {/* Switch Account / Login Link */}
          <div className="text-center text-[15px] text-gray-300">
            Truy cập bằng tài khoản khác?{" "}
            <button
              type="button"
              onClick={() => {
                setStep("login");
                setError("");
              }}
              className="text-[#d0bfae] font-semibold hover:underline ml-1 cursor-pointer"
            >
              Đăng nhập
            </button>
          </div>
        </div>

        {/* Bottom spacing helper */}
        <div className="h-6" />
      </div>
    );
  }

  return (
    <div className="bg-black text-white min-h-screen w-full relative overflow-x-hidden flex flex-col justify-end">
      {/* Background Image & Gradient */}
      <div className="absolute inset-0 z-0 h-full w-full">
        <img
          src="https://cf.bstatic.com/xdata/images/hotel/max1024x768/477767104.jpg?k=2ae7b99fb7660cf72863b3266e8edb093f27ed2b281348a779114277ffeb5e27&o="
          alt="Background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121110] via-[#121110]/80 to-transparent bottom-0 top-[35%]" />
      </div>

      {/* Main Content Area */}
      <main className="relative z-10 w-full px-6 py-12 flex flex-col items-center justify-end min-h-screen">
        {/* Title / Logo Text */}
        <div className="mb-8 flex justify-center w-full">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuD2W88SSbkvFUpE7qEo9PrSBtBIjCijg5KRSEhU4FiD3VSuG47YzRANIOJMasJynVTQGxMt0PFWcKS0ijjraTbX087Cj35wNmeXKwhSdoHElgbtkKZFxmjKB8jLHKnZirjvQGGJTfktSN3zbXsP-csJ9gvKllPAzPretg7k4dn4YrybZNrQR1IYiT6p8cNYRihjqsad0t_gAFQoc_mhvjwfrFgwE6dW9yNO1-8eu7622uNIAzfd1I6XEyZB-C3FRatd_aHAIlEznRYeMDM"
            alt="Vinclub Logo"
            className="max-h-[120px] w-auto object-contain"
          />
        </div>

        {/* Input Form */}
        <form onSubmit={handleLoginSubmit} className="w-full max-w-[400px] flex flex-col gap-5">
          {error && (
            <div className="p-3.5 rounded-[12px] bg-red-500/20 border border-red-500/30 text-red-300 text-sm text-center font-medium">
              {error}
            </div>
          )}

          {/* Contact / Email Input */}
          <div className="relative w-full">
            <input
              className="w-full bg-transparent border border-white rounded-[12px] py-4 px-5 text-base text-white placeholder:text-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-white transition-all"
              placeholder="Tên đăng nhập hoặc số điện thoại"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password Input */}
          <div className="relative w-full">
            <input
              className="w-full bg-transparent border border-white rounded-[12px] py-4 px-5 text-base text-white placeholder:text-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-white transition-all pr-12"
              placeholder="Nhập mật khẩu"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
              aria-label="Toggle password visibility"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {/* Submit Button */}
          <button
            className="w-full bg-button-bg text-white font-medium text-[17px] rounded-[12px] py-4 flex items-center justify-center transition-all hover:bg-[#6c5847] active:opacity-80 disabled:opacity-60 cursor-pointer"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Đang xử lý...
              </span>
            ) : (
              "Tiếp tục"
            )}
          </button>

          {/* Google Login optional link/button */}
          <button
            type="button"
            onClick={handleGoogle}
            className="w-full border border-white/30 text-white/90 font-medium text-[15px] rounded-[12px] py-3.5 flex items-center justify-center gap-2.5 transition-all hover:bg-white/10 active:opacity-80 cursor-pointer"
          >
            <GoogleIcon className="w-4 h-4" />
            Đăng nhập với Google
          </button>

          {/* Footer Navigation Links */}
          <div className="flex flex-col items-center gap-3 mt-2">
            <Link
              to="/register"
              className="text-center text-white/70 text-base hover:text-white transition-opacity"
            >
              Đăng ký tài khoản mới
            </Link>
            <Link
              to="/forgot-password"
              className="text-center text-white/40 text-xs hover:text-white/70 transition-opacity"
            >
              Quên mật khẩu?
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}


