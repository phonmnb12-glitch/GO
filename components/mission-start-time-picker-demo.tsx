"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { MissionStartTimePicker } from "./mission-start-time-picker"

interface TimeValue {
  date: Date
  hour: number
  minute: number
}

export function MissionStartTimePickerDemo() {
  const [selectedTime, setSelectedTime] = useState<TimeValue>({
    date: new Date(),
    hour: 9,
    minute: 0,
  })

  return (
    <div className="p-6 min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)]">
      <div className="max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-black text-[#121212] mb-2">
            เลือก⏰เวลา
          </h1>
          <p className="text-sm text-[#121212]/60">
            กำหนดวันที่และเวลาเริ่มภารกิจของคุณ
          </p>
        </motion.div>

        <MissionStartTimePicker
          value={selectedTime}
          onChange={setSelectedTime}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mt-6 p-4 bg-white rounded-[20px] border border-[#121212]/8 shadow-[0_8px_32px_rgba(18,18,18,0.06)]"
        >
          <h2 className="text-sm font-bold text-[#121212] mb-3">ข้อมูลที่เลือก:</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 bg-[#AFFF00]/10 rounded-lg">
              <span className="text-xs font-medium text-[#121212]/70">วันที่:</span>
              <span className="text-sm font-bold text-[#121212]">
                {selectedTime.date.toLocaleDateString("th-TH", {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 bg-[#AFFF00]/10 rounded-lg">
              <span className="text-xs font-medium text-[#121212]/70">เวลา:</span>
              <span className="text-lg font-black text-[#121212] font-mono">
                {String(selectedTime.hour).padStart(2, "0")}:
                {String(selectedTime.minute).padStart(2, "0")}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
