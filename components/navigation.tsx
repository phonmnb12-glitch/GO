"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { useLenis } from "lenis/react"
import { Menu, X } from "lucide-react"

export function Navigation() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const lenis = useLenis()

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollToSection = (id: string) => {
    const element = document.querySelector(id)
    if (element instanceof HTMLElement && lenis) {
      lenis.scrollTo(element, { offset: -100 })
    }
    setMobileMenuOpen(false)
  }

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-500 ${
        scrolled ? "border-b border-[#121212]/10 bg-white/85 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/home" className="flex items-center gap-2">
          <motion.span
            className="text-2xl font-black tracking-tighter"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <span className={scrolled ? "text-[#121212]" : "text-[#121212]"}>go</span>
            <span className="text-[#AFFF00]">.</span>
          </motion.span>
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="rounded-full border border-[#121212]/15 bg-white px-5 py-2.5 text-sm font-semibold text-[#121212] transition hover:border-[#121212]/25 hover:bg-[#f7f8f4]"
          >
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-[#AFFF00] px-5 py-2.5 text-sm font-semibold text-[#121212] shadow-[0_10px_30px_rgba(175,255,0,0.28)] transition hover:bg-[#baff36]"
          >
            สมัครสมาชิก
          </Link>
        </div>

        <motion.button
          className="p-2 md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          whileTap={{ scale: 0.9 }}
        >
          <AnimatePresence mode="wait">
            {mobileMenuOpen ? (
              <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                <X className="text-[#121212]" />
              </motion.div>
            ) : (
              <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                <Menu className="text-[#121212]" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.4, 0.25, 1] }}
            className="border-t border-[#121212]/10 bg-white/95 md:hidden"
          >
            <div className="mx-auto max-w-6xl space-y-3 px-6 py-5">
              <div className="grid gap-3 pt-2">
                <Link href="/login" className="rounded-full border border-[#121212]/15 px-4 py-2.5 text-center font-semibold text-[#121212]">
                  เข้าสู่ระบบ
                </Link>
                <Link href="/signup" className="rounded-full bg-[#AFFF00] px-4 py-2.5 text-center font-semibold text-[#121212]">
                  สมัครสมาชิก
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
