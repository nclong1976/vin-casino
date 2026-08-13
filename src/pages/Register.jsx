import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { signUp as supaSignUp, mapSupabaseUser } from "@/lib/supabaseAuth";
import { pushUserToRTDB } from "@/lib/rtdbSync";
import { Loader2, Eye, EyeOff } from "lucide-react";
import GoogleIcon from "@/components/GoogleIcon";
import { toast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Terms and Conditions Modal state
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Form submit -> Show terms modal first
  const handleFormSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    const cleanRefCode = referralCode.trim().toUpperCase();
    if (!cleanRefCode) {
      setError("Vui lòng nhập mã giới thiệu do Admin cấp để đăng ký");
      return;
    }

    if (cleanRefCode !== "E-CUV") {
      setError("Mã giới thiệu không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ Admin để nhận mã.");
      return;
    }

    setTermsAccepted(false);
    setShowTermsModal(true);
  };

  // Terms confirmation -> proceed to register API directly
  const handleConfirmTerms = async () => {
    if (!termsAccepted) return;
    setError("");

    const cleanRefCode = referralCode.trim().toUpperCase();
    if (cleanRefCode !== "E-CUV") {
      setError("Mã giới thiệu không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ Admin để nhận mã.");
      setShowTermsModal(false);
      return;
    }

    setLoading(true);
    try {
      // (Ưu tiên) Đăng ký qua Supabase Auth
      let supaData = null;
      try {
        supaData = await supaSignUp(email, password, {
          full_name: fullName,
          name: fullName,
          role: "user",
          balance: 0,
          membership_tier: "VIP 1 - Gold",
          referral_code: referralCode,
        });
      } catch (supaErr) {
        console.warn("[Register] Supabase signUp warning:", supaErr.message);
      }

      // Song song đăng ký qua base44 legacy (để tương thích Admin panel)
      try {
        const result = await base44.auth.register({
          email,
          password,
          name: fullName,
          referral_code: referralCode
        });
        if (result?.access_token) {
          base44.auth.setToken(result.access_token);
        }
      } catch (legacyErr) {
        // Legacy có thể thất bại nếu đã tồn tại, bỏ qua
        console.warn("[Register] base44 register warning:", legacyErr.message);
      }

      // Đẩy user lên Firebase RTDB để Admin thấy ngay lập tức
      if (supaData?.user) {
        const vinUser = mapSupabaseUser(supaData.user, {
          full_name: fullName,
          balance: 0,
          membership_tier: "VIP 1 - Gold",
        });
        pushUserToRTDB(vinUser);
        localStorage.setItem("base44_local_user", JSON.stringify(vinUser));
      }

      setShowTermsModal(false);
      toast({
        title: "Đăng ký thành công",
        description: "Chào mừng bạn đến với VinClub!",
      });
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "Đăng ký thất bại");
      setShowTermsModal(false);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", "/");
  };

  return (
    <div className="bg-black text-white min-h-screen w-full relative overflow-x-hidden flex flex-col justify-end">
      {/* Background Image & Gradient */}
      <div className="absolute inset-0 z-0 h-full w-full">
        <img
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDMW8xQjXeuOouQGM1CoQHlodnrZf1j8CB1W2YsyJVeKKwaK_g_k13slg28BfOTZUbDU3Anqeh0cXbTVE4RudV7Fce7oK7i1HjCfAqbj1KoeMmt2st6iu-F3D3XLDsq_0x_s4fBe8JzuAfu-dDfDx7h608A12_8DGXpohjKqz845PuIXbAcKdUHIu06Z54ToeYn6cGOeyliTNc9_g9g0LkeG82IF8uojgRwiaDclRfDxyI1S_aH7D_YDw"
          alt="Background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121110] via-[#121110]/80 to-transparent bottom-0 top-[30%]" />
      </div>

      {/* Main Content Area */}
      <main className="relative z-10 w-full px-6 py-12 flex flex-col items-center justify-end min-h-screen">
        {/* Logo Section */}
        <div className="mb-6 flex justify-center w-full">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuD2W88SSbkvFUpE7qEo9PrSBtBIjCijg5KRSEhU4FiD3VSuG47YzRANIOJMasJynVTQGxMt0PFWcKS0ijjraTbX087Cj35wNmeXKwhSdoHElgbtkKZFxmjKB8jLHKnZirjvQGGJTfktSN3zbXsP-csJ9gvKllPAzPretg7k4dn4YrybZNrQR1IYiT6p8cNYRihjqsad0t_gAFQoc_mhvjwfrFgwE6dW9yNO1-8eu7622uNIAzfd1I6XEyZB-C3FRatd_aHAIlEznRYeMDM"
            alt="Vinclub Logo"
            className="max-h-[110px] w-auto object-contain"
          />
        </div>

        {/* Registration Form */}
        <form onSubmit={handleFormSubmit} className="w-full max-w-[400px] flex flex-col gap-4">
          {error && (
            <div className="p-3.5 rounded-[12px] bg-red-500/20 border border-red-500/30 text-red-300 text-sm text-center">
              {error}
            </div>
          )}

          {/* Full Name Input */}
          <div className="relative w-full">
            <label className="sr-only" htmlFor="fullname">Nhập họ và tên</label>
            <input
              id="fullname"
              name="fullname"
              className="w-full bg-transparent border border-white rounded-[12px] py-3.5 px-5 text-base text-white placeholder:text-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-white transition-all"
              placeholder="Họ và Tên "
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          {/* Phone or Email Input */}
          <div className="relative w-full">
            <label className="sr-only" htmlFor="contact">Nhập số điện thoại hoặc email</label>
            <input
              id="contact"
              name="contact"
              className="w-full bg-transparent border border-white rounded-[12px] py-3.5 px-5 text-base text-white placeholder:text-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-white transition-all"
              placeholder="Tên đăng nhập hoặc số điện thoại"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Password Input */}
          <div className="relative w-full">
            <label className="sr-only" htmlFor="password">Nhập mật khẩu</label>
            <input
              id="password"
              name="password"
              className="w-full bg-transparent border border-white rounded-[12px] py-3.5 px-5 text-base text-white placeholder:text-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-white transition-all pr-12"
              placeholder="Nhập mật khẩu"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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

          {/* Confirm Password Input */}
          <div className="relative w-full">
            <label className="sr-only" htmlFor="confirm_password">Xác nhận mật khẩu</label>
            <input
              id="confirm_password"
              name="confirm_password"
              className="w-full bg-transparent border border-white rounded-[12px] py-3.5 px-5 text-base text-white placeholder:text-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-white transition-all"
              placeholder="Xác nhận mật khẩu"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {/* Referral Code Input */}
          <div className="relative w-full">
            <label className="sr-only" htmlFor="referral_code">Nhập mã giới thiệu do Admin cấp (bắt buộc)</label>
            <input
              id="referral_code"
              name="referral_code"
              className="w-full bg-transparent border border-white rounded-[12px] py-3.5 px-5 text-base text-white placeholder:text-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-white transition-all"
              placeholder="Mã giới thiệu do Admin cấp (bắt buộc)"
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              required
            />
          </div>

          {/* Submit Button */}
          <button
            className="w-full bg-button-bg text-white font-medium text-[17px] rounded-[12px] py-4 flex items-center justify-center transition-all hover:bg-[#6c5847] active:opacity-80 disabled:opacity-60 mt-1"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Đang xử lý...
              </span>
            ) : (
              "Đăng ký"
            )}
          </button>

          {/* Google Signup option */}
          <button
            type="button"
            onClick={handleGoogle}
            className="w-full border border-white/30 text-white/90 font-medium text-[15px] rounded-[12px] py-3 flex items-center justify-center gap-2.5 transition-all hover:bg-white/10 active:opacity-80"
          >
            <GoogleIcon className="w-4 h-4" />
            Đăng ký với Google
          </button>

          {/* Link to Login */}
          <Link
            to="/login"
            className="text-center text-white/70 text-base mt-2 hover:text-white transition-opacity block w-full"
          >
            Đã có tài khoản? Đăng nhập
          </Link>
        </form>
      </main>

      {/* Terms & Privacy Agreement Modal */}
      <AnimatePresence>
        {showTermsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTermsModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Terms Modal Card matching design */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="relative z-10 bg-white text-[#1a1a1a] rounded-[1.25rem] p-6 shadow-2xl flex flex-col gap-6 max-w-md w-full"
            >
              {/* Checkbox and Legal Text */}
              <div className="flex items-start gap-3.5">
                <input
                  id="terms-checkbox"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="w-6 h-6 rounded border border-gray-400 text-[#c5a070] focus:ring-[#c5a070] shrink-0 mt-0.5 cursor-pointer accent-[#c5a070]"
                />
                <label
                  htmlFor="terms-checkbox"
                  className="text-[0.95rem] leading-relaxed text-[#1a1a1a] cursor-pointer select-none"
                >
                  Bằng việc đánh dấu vào ô này và nhấn "Xác nhận", Tôi đồng ý với{" "}
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="text-[#c5a070] font-semibold hover:underline"
                  >
                    Điều khoản & điều kiện
                  </a>{" "}
                  và{" "}
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="text-[#c5a070] font-semibold hover:underline"
                  >
                    Chính sách bảo vệ dữ liệu cá nhân (DLCN)
                  </a>{" "}
                  của VinClub và chấp thuận để VinClub xử lý DLCN của tôi theo quy định của pháp luật về bảo vệ DLCN.
                </label>
              </div>

              {/* Confirm Button */}
              <button
                type="button"
                onClick={handleConfirmTerms}
                disabled={!termsAccepted || loading}
                className={`w-full py-3.5 px-4 rounded-xl font-semibold text-lg transition-all flex items-center justify-center ${
                  termsAccepted && !loading
                    ? "bg-[#c5a070] text-white hover:bg-[#b08b5b] active:scale-[0.99] cursor-pointer shadow-md"
                    : "bg-[#ebdcd0] text-white cursor-not-allowed"
                }`}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-white" /> Đang xử lý...
                  </span>
                ) : (
                  "Xác nhận"
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
