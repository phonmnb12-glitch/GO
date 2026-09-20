"use client"

import Link from "next/link"
import { motion } from "framer-motion"

const footerLinks = [
  { label: "เกี่ยวกับเรา", href: "#about" },
  { label: "ติดต่อเรา", href: "#contact" },
  { label: "นโยบายความเป็นส่วนตัว", href: "#privacy" },
  { label: "ข้อกำหนดการใช้งาน", href: "#terms" },
]

export function Footer() {
  return (
    <footer id="about" className="relative bg-[#121212] py-12 text-white">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black tracking-tighter">go</span>
            <span className="text-2xl font-black tracking-tighter text-[#AFFF00]">.</span>
          </div>

          <nav className="flex flex-wrap items-center gap-6 text-sm text-white/70">
            {footerLinks.map((link) => (
              <Link key={link.label} href={link.href} className="transition hover:text-[#AFFF00]">
                {link.label}
              </Link>
            ))}
          </nav>
        </motion.div>

        <div className="mt-8 h-px bg-white/10" />

        <div className="mt-6 flex flex-col gap-2 text-sm text-white/45 md:flex-row md:items-center md:justify-between">
          <p>© 2026 go. สงวนลิขสิทธิ์ทุกประการ</p>
          <p>มุ่งมั่นสู่ภารกิจ สำเร็จด้วยความมั่นใจ</p>
        </div>
      </div>
    </footer>
  )
}
