"use client"

import type React from "react"

import { motion, AnimatePresence, useSpring } from "framer-motion"
import { useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"

const modes = [
  {
    id: 1,
    name: "โฟกัส & ทำงานลึก",
    tagline: "โหมด 01",
    description: "จดจ่อกับการตรวจสอบ AI OCR และหลักฐานไทยแลปไทม์ ให้ทุกช่วงเวลาทำงานลึกนับรวมอย่างแท้จริง",
    image: "/images/drink2.png",
    bgColor: "from-[#84cc16]/20 via-[#84cc16]/10 to-transparent",
    accentColor: "#84cc16",
    badges: ["AI OCR ตรวจสอบ", "ไทยแลปไทม์"],
  },
  {
    id: 2,
    name: "ตำแหน่ง & ออกกำลังกาย",
    tagline: "โหมด 02",
    description: "สแดงตัวตนในโลกพร้อมหลักฐาน GPS geofencing และภาพถ่ายสถานที่จริงตรวจสอบการไปออกกำลังกาย",
    image: "/images/drink1.png",
    bgColor: "from-[#f59e0b]/20 via-[#f59e0b]/10 to-transparent",
    accentColor: "#f59e0b",
    badges: ["GPS Geofencing", "ภาพสถานที่จริง"],
  },
  {
    id: 3,
    name: "ท้าทายกับทีม",
    tagline: "โหมด 03",
    description: "เดิมพันด้วยกัน โหมดร่วมและแข่งขันทำให้ทั้งทีมต่างรับผิดชอบ ชนะด้วยกันหรือแข่งกัน",
    image: "/mystery-energy-drink-can-silhouette.jpg",
    bgColor: "from-[#AFFF00]/20 via-[#AFFF00]/5 to-transparent",
    accentColor: "#AFFF00",
    badges: ["ร่วมทีม", "แข่งขัน"],
  },
]

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
    scale: 0.9,
    rotateY: direction > 0 ? 15 : -15,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    rotateY: 0,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 30,
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -300 : 300,
    opacity: 0,
    scale: 0.9,
    rotateY: direction > 0 ? -15 : 15,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 30,
    },
  }),
}

export function FlavorCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [[page, direction], setPage] = useState([0, 0])
  const currentMode = modes[currentIndex]

  const rotateX = useSpring(0, { stiffness: 150, damping: 20 })
  const rotateY = useSpring(0, { stiffness: 150, damping: 20 })

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const x = (e.clientX - centerX) / (rect.width / 2)
    const y = (e.clientY - centerY) / (rect.height / 2)
    rotateY.set(x * 5)
    rotateX.set(-y * 5)
  }

  const handleMouseLeave = () => {
    rotateX.set(0)
    rotateY.set(0)
  }

  const paginate = (newDirection: number) => {
    const newIndex = (currentIndex + newDirection + modes.length) % modes.length
    setCurrentIndex(newIndex)
    setPage([page + newDirection, newDirection])
  }

  const nextMode = () => paginate(1)
  const prevMode = () => paginate(-1)

  return (
    <section id="modes" className="relative py-16 pb-24 bg-white overflow-hidden">
      <motion.div
        className={`absolute inset-0 bg-gradient-to-br ${currentMode.bgColor}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        key={currentMode.id}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
          className="text-center mb-10"
        >
          <motion.span
            className="font-mono text-[#121212]/60 text-xs tracking-widest"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            โหมดการท้าทาย
          </motion.span>
          <h2 className="text-3xl md:text-5xl font-black text-[#121212] tracking-tighter mt-2 overflow-hidden">
            <motion.span
              className="inline-block"
              initial={{ y: 80 }}
              whileInView={{ y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] }}
            >
              เลือก{" "}
            </motion.span>
            <motion.span
              className="inline-block"
              style={{ color: currentMode.accentColor }}
              initial={{ y: 80 }}
              whileInView={{ y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1], delay: 0.1 }}
            >
              โหมดของคุณ
            </motion.span>
          </h2>
        </motion.div>

        <div className="relative">
          <div className="flex items-center justify-center gap-6">
            <motion.button
              onClick={prevMode}
              className="hidden md:flex w-12 h-12 rounded-full border-2 border-[#121212] items-center justify-center hover:bg-[#121212] hover:text-white transition-colors"
              whileHover={{ scale: 1.1, rotate: -5 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>

            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentMode.id}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="relative w-full max-w-3xl"
                style={{ perspective: 1000 }}
              >
                <motion.div
                  className="bg-white rounded-3xl p-6 md:p-8 border-2 border-[#121212]/10 shadow-xl"
                  style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className="grid md:grid-cols-2 gap-6 items-center">
                    <motion.div
                      className="relative aspect-[3/4] flex items-center justify-center"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <Image
                        src={currentMode.image || "/placeholder.svg"}
                        alt={currentMode.name}
                        fill
                        className="object-contain"
                      />
                    </motion.div>

                    <div className="space-y-4">
                      <div>
                        <motion.span
                          className="font-mono text-xs tracking-widest"
                          style={{ color: currentMode.accentColor }}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                        >
                          {currentMode.tagline}
                        </motion.span>
                        <motion.h3
                          className="text-3xl md:text-4xl font-black text-[#121212] tracking-tighter mt-1"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3, type: "spring", stiffness: 100 }}
                        >
                          {currentMode.name}
                        </motion.h3>
                      </div>

                      <motion.p
                        className="text-sm text-[#121212]/60 font-mono"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                      >
                        {currentMode.description}
                      </motion.p>

                      <motion.div
                        className="flex flex-wrap gap-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                      >
                        {currentMode.badges.map((badge) => (
                          <span
                            key={badge}
                            className="px-2 py-1 bg-[#121212]/5 rounded-full text-xs font-mono text-[#121212]/60"
                          >
                            {badge}
                          </span>
                        ))}
                      </motion.div>

                      <motion.button
                        className="px-6 py-3 rounded-full font-bold text-sm tracking-wide w-full md:w-auto relative overflow-hidden"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 400, damping: 17 }}
                        style={{ backgroundColor: currentMode.accentColor, color: "#121212" }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <motion.span
                          className="absolute inset-0 bg-white/20"
                          initial={{ x: "-100%" }}
                          whileHover={{ x: "100%" }}
                          transition={{ duration: 0.5 }}
                        />
                        <span className="relative z-10">เริ่มโหมดนี้เลย</span>
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>

            <motion.button
              onClick={nextMode}
              className="hidden md:flex w-12 h-12 rounded-full border-2 border-[#121212] items-center justify-center hover:bg-[#121212] hover:text-white transition-colors"
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          </div>

          <div className="flex md:hidden justify-center gap-4 mt-6">
            <motion.button
              onClick={prevMode}
              className="w-10 h-10 rounded-full border-2 border-[#121212] flex items-center justify-center"
              whileTap={{ scale: 0.9 }}
            >
              <ChevronLeft className="w-4 h-4" />
            </motion.button>
            <motion.button
              onClick={nextMode}
              className="w-10 h-10 rounded-full border-2 border-[#121212] flex items-center justify-center"
              whileTap={{ scale: 0.9 }}
            >
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>

          <div className="flex justify-center gap-2 mt-6">
            {modes.map((mode, index) => (
              <motion.button
                key={mode.id}
                onClick={() => {
                  const newDirection = index > currentIndex ? 1 : -1
                  setCurrentIndex(index)
                  setPage([index, newDirection])
                }}
                className="h-2 rounded-full transition-all"
                style={{
                  backgroundColor: index === currentIndex ? mode.accentColor : "#12121220",
                }}
                animate={{
                  width: index === currentIndex ? 28 : 10,
                }}
                whileHover={{ scale: 1.2 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
