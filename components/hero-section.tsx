"use client"

import Link from "next/link"
import { motion } from "framer-motion"

const steps = [
  {
    number: "01",
    title: "สร้างภารกิจ",
    description: "ตั้งเป้าหมายและสร้างภารกิจที่ต้องการทำให้สำเร็จ",
  },
  {
    number: "02",
    title: "วางเงินมัดจำ",
    description: "กำหนดจำนวนเงินเพื่อสร้างแรงจูงใจให้ตัวเอง",
  },
  {
    number: "03",
    title: "ทำภารกิจให้สำเร็จ",
    description: "ลงมือทำและส่งหลักฐานยืนยันความสำเร็จ",
  },
  {
    number: "04",
    title: "รับเงินคืน",
    description: "ทำสำเร็จและได้รับเงินมัดจำทั้งหมดคืน",
  },
]

const features = [
  {
    title: "Photo AI",
    description: "ตรวจสอบภารกิจด้วยรูปภาพ",
  },
  {
    title: "Timelapse",
    description: "บันทึกกิจกรรมระหว่างทำภารกิจ",
  },
  {
    title: "GPS Check",
    description: "ตรวจสอบการไปถึงสถานที่",
  },
  {
    title: "Group Mission",
    description: "สร้างภารกิจร่วมกับเพื่อน",
  },
]

export function HeroSection() {
  return (
    <>
      <section id="home" className="relative min-h-screen overflow-hidden bg-[#f7f8f4] pt-28 pb-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(175,255,0,0.25),transparent_25%),radial-gradient(circle_at_bottom_right,_rgba(18,18,18,0.06),transparent_16%)]" />

        <div className="relative mx-auto grid min-h-[calc(100vh-8rem)] max-w-[72rem] -translate-y-8 items-center gap-14 px-8 lg:grid-cols-[1.05fr_0.95fr] lg:translate-x-[-1.25rem]">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-xl"
          >
            <div className="mb-6 inline-flex items-center rounded-full border border-[#121212]/10 bg-white px-3 py-1.5 text-[11px] font-medium tracking-[0.02em] text-[#121212]/70 shadow-sm md:text-xs">
              มุ่งมั่น · ทำได้ · สำเร็จ
            </div>

            <h1 className="text-[2.1rem] font-black leading-[0.8] tracking-[-0.07em] text-[#121212] sm:text-[2.7rem] md:text-[3.4rem] lg:text-[4rem]">
              <span className="block leading-[0.9]">ตั้งเป้า</span>
              <span className="block leading-[0.9] text-[#121212]">ของคุณ</span>
              <span className="mt-1 block leading-[0.9]">ลงมือ</span>
              <span className="mt-1 block leading-[0.9] text-[#121212]">ทำเลย</span>
              <span className="ml-2 text-[#AFFF00]">ไป!</span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-[#121212]/65 md:text-lg">
              <span className="block">สร้างภารกิจ วางเงินมัดจำ</span>
              <span className="block">และมุ่งมั่นสู่เป้าหมายของคุณ</span>
            </p>

            <div className="mt-8 flex items-center gap-4 lg:translate-x-[-0.5rem]">
              <Link
                href="/signup"
                className="rounded-full bg-[#AFFF00] px-6 py-3 text-sm font-bold text-[#121212] shadow-[0_14px_35px_rgba(175,255,0,0.35)] transition hover:bg-[#baff36]"
              >
                เริ่มต้นเลย
              </Link>
              <button
                type="button"
                onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-full border border-[#121212]/15 bg-white px-6 py-3 text-sm font-bold text-[#121212] transition hover:border-[#121212]/25 hover:bg-[#f4f5ef]"
              >
                วิธีการใช้งาน
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="flex items-center justify-center"
          >
            <motion.div
              className="relative flex h-[280px] w-[280px] items-center justify-center -translate-y-12 sm:-translate-y-14 md:-translate-y-16"
              animate={{ rotateY: 360, rotateX: [0, 12, 0, -12, 0], y: [0, -8, 0] }}
              transition={{
                rotateY: { duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "linear" },
                rotateX: { duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
                y: { duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
              }}
              style={{ transformStyle: "preserve-3d" }}
            >
              <div
                className="flex items-center gap-1 text-[21rem] font-black leading-none tracking-[-0.15em] text-[#AFFF00] sm:text-[24rem] md:text-[28rem] lg:text-[32rem]"
                style={{ transform: "translateZ(30px)" }}
              >
                <span>go</span>
                <span className="text-[#AFFF00]">.</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section id="how-it-works" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <p className="text-xs font-medium tracking-[0.02em] text-[#121212]/60">วิธีการใช้งาน</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] text-[#121212]">เปลี่ยนความตั้งใจให้เป็นความสำเร็จ</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="rounded-[28px] border border-[#121212]/10 bg-[#f7f8f4] p-6"
              >
                <div className="mb-5 text-3xl font-black tracking-[-0.05em] text-[#AFFF00]">{step.number}</div>
                <h3 className="text-xl font-bold text-[#121212]">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#121212]/65">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>


      <section className="bg-[#f7f8f4] py-20">
        <div className="mx-auto max-w-5xl rounded-[32px] border border-[#121212]/10 bg-white px-8 py-14 text-center shadow-[0_18px_60px_rgba(18,18,18,0.04)]">
          <p className="text-xs font-medium tracking-[0.02em] text-[#121212]/60">พร้อมแล้วหรือยัง?</p>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] text-[#121212]">สัญญากับตัวเองและเริ่มต้นภารกิจของคุณวันนี้</h2>
          <Link
            href="/signup"
            className="mt-8 inline-flex rounded-full bg-[#AFFF00] px-7 py-3 text-sm font-bold text-[#121212] shadow-[0_14px_35px_rgba(175,255,0,0.35)] transition hover:bg-[#baff36]"
          >
            เริ่มต้นเลย
          </Link>
        </div>
      </section>
    </>
  )
}
