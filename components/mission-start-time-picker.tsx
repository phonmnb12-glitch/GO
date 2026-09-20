"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface MissionStartTimePickerProps {
  value?: {
    date: Date
    hour: number
    minute: number
  }
  onChange?: (value: { date: Date; hour: number; minute: number }) => void
}

export function MissionStartTimePicker({
  value = {
    date: new Date(),
    hour: 9,
    minute: 0,
  },
  onChange,
}: MissionStartTimePickerProps) {
  const [date, setDate] = useState(value.date)
  const [hour, setHour] = useState(value.hour)
  const [minute, setMinute] = useState(value.minute)
  const [isDraggingHour, setIsDraggingHour] = useState(false)
  const [isDraggingMinute, setIsDraggingMinute] = useState(false)

  const hourRef = useRef<HTMLDivElement>(null)
  const minuteRef = useRef<HTMLDivElement>(null)
  const hourStartY = useRef(0)
  const minuteStartY = useRef(0)
  const hourScrollTop = useRef(0)
  const minuteScrollTop = useRef(0)

  const ITEM_HEIGHT = 40 // h-10 = 40px
  const CONTAINER_HEIGHT = 128 // h-32 = 128px
  const CENTER_OFFSET = (CONTAINER_HEIGHT - ITEM_HEIGHT) / 2 // Center point to scroll to

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value)
    setDate(newDate)
    onChange?.({ date: newDate, hour, minute })
  }

  const generateItems = (max: number) => {
    return Array.from({ length: max }, (_, i) => i)
  }

  const hours = generateItems(24)
  const minutes = generateItems(60)

  const snapToItem = (scrollTop: number, maxValue: number) => {
    const snappedIndex = Math.round((scrollTop + CENTER_OFFSET) / ITEM_HEIGHT)
    return Math.min(Math.max(snappedIndex, 0), maxValue - 1)
  }

  const handleHourMouseDown = (e: React.MouseEvent) => {
    setIsDraggingHour(true)
    hourStartY.current = e.clientY
    if (hourRef.current) {
      hourScrollTop.current = hourRef.current.scrollTop
    }
  }

  const handleMinuteMouseDown = (e: React.MouseEvent) => {
    setIsDraggingMinute(true)
    minuteStartY.current = e.clientY
    if (minuteRef.current) {
      minuteScrollTop.current = minuteRef.current.scrollTop
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingHour && hourRef.current) {
        const delta = e.clientY - hourStartY.current
        const newScrollTop = hourScrollTop.current - delta
        hourRef.current.scrollTop = newScrollTop
        const currentHour = snapToItem(newScrollTop, 24)
        setHour(currentHour)
      }
      if (isDraggingMinute && minuteRef.current) {
        const delta = e.clientY - minuteStartY.current
        const newScrollTop = minuteScrollTop.current - delta
        minuteRef.current.scrollTop = newScrollTop
        const currentMinute = snapToItem(newScrollTop, 60)
        setMinute(currentMinute)
      }
    }

    const handleMouseUp = () => {
      if (isDraggingHour && hourRef.current) {
        const newHour = snapToItem(hourRef.current.scrollTop, 24)
        setHour(newHour)
        onChange?.({ date, hour: newHour, minute })
        setIsDraggingHour(false)
      }
      if (isDraggingMinute && minuteRef.current) {
        const newMinute = snapToItem(minuteRef.current.scrollTop, 60)
        setMinute(newMinute)
        onChange?.({ date, hour, minute: newMinute })
        setIsDraggingMinute(false)
      }
    }

    if (isDraggingHour || isDraggingMinute) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isDraggingHour, isDraggingMinute, hour, minute, date, onChange])

  // Initialize scroll position on mount
  useEffect(() => {
    if (hourRef.current) {
      hourRef.current.scrollTop = Math.max(hour * ITEM_HEIGHT - CENTER_OFFSET, 0)
    }
    if (minuteRef.current) {
      minuteRef.current.scrollTop = Math.max(minute * ITEM_HEIGHT - CENTER_OFFSET, 0)
    }
  }, [])

  // Sync scroll with hour value
  useEffect(() => {
    if (hourRef.current && !isDraggingHour) {
      hourRef.current.scrollTop = Math.max(hour * ITEM_HEIGHT - CENTER_OFFSET, 0)
    }
  }, [hour, isDraggingHour])

  // Sync scroll with minute value
  useEffect(() => {
    if (minuteRef.current && !isDraggingMinute) {
      minuteRef.current.scrollTop = Math.max(minute * ITEM_HEIGHT - CENTER_OFFSET, 0)
    }
  }, [minute, isDraggingMinute])

  // Handle scroll event for hour picker
  const handleHourScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!isDraggingHour) {
      const scrollTop = (e.target as HTMLDivElement).scrollTop
      const newHour = snapToItem(scrollTop, 24)
      if (newHour !== hour) {
        setHour(newHour)
        onChange?.({ date, hour: newHour, minute })
      }
    }
  }

  // Handle scroll event for minute picker
  const handleMinuteScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!isDraggingMinute) {
      const scrollTop = (e.target as HTMLDivElement).scrollTop
      const newMinute = snapToItem(scrollTop, 60)
      if (newMinute !== minute) {
        setMinute(newMinute)
        onChange?.({ date, hour, minute: newMinute })
      }
    }
  }

  const handleWheel = (e: React.WheelEvent, type: "hour" | "minute") => {
    e.preventDefault()
    if (type === "hour" && hourRef.current) {
      const delta = e.deltaY > 0 ? ITEM_HEIGHT : -ITEM_HEIGHT
      const newScrollTop = hourRef.current.scrollTop + delta
      const newHour = snapToItem(newScrollTop, 24)
      setHour(newHour)
      onChange?.({ date, hour: newHour, minute })
      hourRef.current.scrollTop = newHour * ITEM_HEIGHT
    } else if (type === "minute" && minuteRef.current) {
      const delta = e.deltaY > 0 ? ITEM_HEIGHT : -ITEM_HEIGHT
      const newScrollTop = minuteRef.current.scrollTop + delta
      const newMinute = snapToItem(newScrollTop, 60)
      setMinute(newMinute)
      onChange?.({ date, hour, minute: newMinute })
      minuteRef.current.scrollTop = newMinute * ITEM_HEIGHT
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="space-y-3 p-4 bg-white rounded-[28px] border border-[#121212]/8 shadow-[0_12px_40px_rgba(18,18,18,0.08)]"
    >
      {/* Date Picker */}
      <div>
        <label className="block text-xs font-semibold text-[#121212] mb-2">
          📅 วันที่เริ่มภารกิจ
        </label>
        <motion.input
          whileFocus={{ borderColor: "#AFFF00", boxShadow: "0 0 0 3px rgba(175,255,0,0.1)" }}
          type="date"
          value={date.toISOString().split("T")[0]}
          onChange={handleDateChange}
          className="w-full px-3 py-2.5 bg-[#f9f9f8] border border-[#121212]/10 rounded-[16px] text-[#121212] text-sm focus:outline-none transition-all"
        />
      </div>

      {/* Time Picker */}
      <div>
        <label className="block text-xs font-semibold text-[#121212] mb-2">
          ⏰ เวลาเริ่มภารกิจ
        </label>
        
        <div className="relative h-32 bg-gradient-to-b from-transparent via-[#f9f9f8] to-transparent rounded-[20px] border border-[#121212]/8 overflow-hidden">
          <div className="flex items-center justify-center h-full gap-0.5">
            {/* Hour Picker */}
            <div className="flex-1 h-full flex flex-col items-center justify-center relative">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white to-transparent z-20" />
                <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent z-20" />
              </div>

              <div
                ref={hourRef}
                onMouseDown={handleHourMouseDown}
                onScroll={handleHourScroll}
                onWheel={(e) => handleWheel(e, "hour")}
                className="w-full h-full overflow-hidden scroll-smooth cursor-grab active:cursor-grabbing relative z-10"
                style={{ scrollBehavior: "smooth" }}
              >
                <div className="flex flex-col">
                  {hours.map((h, idx) => {
                    const distance = Math.abs(idx - hour)
                    const opacity = distance === 0 ? 1 : distance === 1 ? 0.5 : distance === 2 ? 0.2 : 0.05
                    return (
                      <div
                        key={idx}
                        className="h-10 flex items-center justify-center text-2xl font-black text-[#121212] tabular-nums select-none transition-opacity duration-200"
                        style={{ opacity }}
                      >
                        {String(h).padStart(2, "0")}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Separator */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="text-3xl font-black text-[#121212]/40 px-1"
            >
              :
            </motion.div>

            {/* Minute Picker */}
            <div className="flex-1 h-full flex flex-col items-center justify-center relative">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white to-transparent z-20" />
                <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent z-20" />
              </div>

              <div
                ref={minuteRef}
                onMouseDown={handleMinuteMouseDown}
                onScroll={handleMinuteScroll}
                onWheel={(e) => handleWheel(e, "minute")}
                className="w-full h-full overflow-hidden scroll-smooth cursor-grab active:cursor-grabbing relative z-10"
                style={{ scrollBehavior: "smooth" }}
              >
                <div className="flex flex-col">
                  {minutes.map((m, idx) => {
                    const distance = Math.abs(idx - minute)
                    const opacity = distance === 0 ? 1 : distance === 1 ? 0.5 : distance === 2 ? 0.2 : 0.05
                    return (
                      <div
                        key={idx}
                        className="h-10 flex items-center justify-center text-2xl font-black text-[#121212] tabular-nums select-none transition-opacity duration-200"
                        style={{ opacity }}
                      >
                        {String(m).padStart(2, "0")}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Display */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gradient-to-r from-[#AFFF00]/12 to-[#AFFF00]/8 rounded-[16px] p-3 border border-[#AFFF00]/30"
      >
        <p className="text-center">
          <span className="text-2xl font-black text-[#121212] font-mono tracking-wider">
            {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
          </span>
          <br />
          <span className="text-xs font-medium text-[#121212]/60 mt-1 block">
            {date.toLocaleDateString("th-TH", {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </p>
      </motion.div>
    </motion.div>
  )
}
