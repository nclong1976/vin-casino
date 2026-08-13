import React from "react";
import { motion } from "framer-motion";

export default function AuthLayout({ 
  icon: Icon, 
  title, 
  subtitle, 
  footer, 
  bgImage = "https://vcdn1-vnexpress.vnecdn.net/2025/08/18/da-nang-downtown-1755511501-5262-1755511781.jpg?w=1020&h=0&q=100&dpr=1&fit=crop&s=KTB4QWx6fZ-I6eaDKpTk_g", 
  children 
}) {
  return (
    <div className="bg-black text-white min-h-screen w-full relative overflow-x-hidden flex flex-col justify-end">
      {/* Background Image & Gradient */}
      <div className="absolute inset-0 z-0 h-full w-full">
        <img
          src={bgImage}
          alt="Background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121110] via-[#121110]/80 to-transparent bottom-0 top-[30%]" />
      </div>

      {/* Main Content Area */}
      <main className="relative z-10 w-full px-6 py-12 flex flex-col items-center justify-end min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[400px]"
        >
          {/* Logo Section */}
          <div className="mb-6 flex justify-center w-full">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuD2W88SSbkvFUpE7qEo9PrSBtBIjCijg5KRSEhU4FiD3VSuG47YzRANIOJMasJynVTQGxMt0PFWcKS0ijjraTbX087Cj35wNmeXKwhSdoHElgbtkKZFxmjKB8jLHKnZirjvQGGJTfktSN3zbXsP-csJ9gvKllPAzPretg7k4dn4YrybZNrQR1IYiT6p8cNYRihjqsad0t_gAFQoc_mhvjwfrFgwE6dW9yNO1-8eu7622uNIAzfd1I6XEyZB-C3FRatd_aHAIlEznRYeMDM"
              alt="Vinclub Logo"
              className="max-h-[110px] w-auto object-contain"
            />
          </div>

          {(title || subtitle) && (
            <div className="mb-6 text-center">
              {Icon && (
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 mb-3">
                  <Icon className="w-5 h-5 text-[#c4a35a]" aria-hidden="true" />
                </div>
              )}
              {title && <h1 className="text-white text-xl font-bold tracking-tight">{title}</h1>}
              {subtitle && <p className="text-white/60 text-sm mt-1">{subtitle}</p>}
            </div>
          )}

          <div className="w-full">
            {children}
          </div>

          {footer && (
            <p className="text-center text-sm text-white/70 mt-6">{footer}</p>
          )}
        </motion.div>
      </main>
    </div>
  );
}
