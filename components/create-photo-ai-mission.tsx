"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, AlertCircle, Bell, Check, X } from "lucide-react"
import { DashboardNav } from "@/components/dashboard-nav"
import MissionCreatedPopup from "@/components/mission-created-popup"
import { defaultChecks, type Mission } from "@/lib/missions"
import { createMissionInSupabase, updateMissionInSupabase } from "@/lib/mission-data"
import { supabase } from "@/lib/supabase"

const categoryOptions = [
  { label: "อ่านหนังสือ", value: "Reading" },
  { label: "ออกกำลัง", value: "Exercise" },
  { label: "เขียน", value: "Writing" },
  { label: "อื่นๆ", value: "Other" },
]

const durationOptions = [
  { label: "30 นาที", value: "30" },
  { label: "1 ชั่วโมง", value: "60" },
  { label: "2 ชั่วโมง", value: "120" },
  { label: "กำหนดเอง", value: "custom" },
]

const failedMissionOptions = [
  { label: "คืนให้เพื่อน", value: "return-to-friends" },
  { label: "บริจาคมูลนิธิ", value: "donate-to-foundation" },
  { label: "สนับสนุน go.", value: "support" },
]

type Friend = { user_id: string; name?: string; friend_id?: string }

const foundationOptions = [
  { label: "มูลนิธิ A", value: "มูลนิธิ A" },
  { label: "มูลนิธิ B", value: "มูลนิธิ B" },
  { label: "มูลนิธิ C", value: "มูลนิธิ C" },
]

const pad = (value: number) => String(value).padStart(2, "0")

const getLocalDateInputValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const getLocalTimeInputValue = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

const getWheelWindow = (value: number, maximum: number) => [
  value === 0 ? maximum : value - 1,
  value,
  value === maximum ? 0 : value + 1,
]

const getStartTimeValidationError = (startDate: string, startTime: string, currentNow: Date | null) => {
  if (!startDate || !startTime) {
    return "กรุณาเลือกวันที่และเวลาเริ่มภารกิจ"
  }

  const selectedStartDateTime = new Date(`${startDate}T${startTime}:00`)

  if (Number.isNaN(selectedStartDateTime.getTime())) {
    return "เวลาเริ่มภารกิจไม่ถูกต้อง"
  }

  if (!currentNow) return null

  const currentDate = getLocalDateInputValue(currentNow)
  const currentTime = getLocalTimeInputValue(currentNow)

  if (startDate < currentDate) {
    return "ไม่สามารถเลือกเวลาในอดีตได้"
  }

  if (startDate === currentDate && startTime < currentTime) {
    return "ไม่สามารถเลือกเวลาในอดีตได้"
  }

  return ""
}

const moveWheelValue = (value: number, delta: number, maximum: number) => {
  const nextValue = value + delta
  if (nextValue < 0) return maximum
  if (nextValue > maximum) return 0
  return nextValue
}

const formatDurationLabel = (duration: string, customHours: string, customMinutes: string) => {
  if (duration === "30") return "30 นาที"
  if (duration === "60") return "1 ชั่วโมง"
  if (duration === "120") return "2 ชั่วโมง"
  if (duration === "custom") {
    const hours = Number(customHours) || 0
    const minutes = Number(customMinutes) || 0

    if (!hours && !minutes) return "กำหนดเอง"
    if (hours && minutes) return `${hours} ชั่วโมง ${minutes} นาที`
    if (hours) return `${hours} ชั่วโมง`
    return `${minutes} นาที`
  }

  return ""
}

const formatFailedDestination = (value: string) => {
  const matched = failedMissionOptions.find((option) => option.value === value)
  return matched ? matched.label : "คืนให้เพื่อน"
}

type CreatePhotoAIMissionProps = {
  verificationType?: "Photo AI" | "Timelapse Video"
}

export default function CreatePhotoAIMission({ verificationType = "Photo AI" }: CreatePhotoAIMissionProps) {
  const router = useRouter()
  const isTimelapse = verificationType === "Timelapse Video"
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNotificationsOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  const defaultDate = now ? getLocalDateInputValue(now) : ""
  const defaultTime = now ? getLocalTimeInputValue(now) : ""

  const [missionName, setMissionName] = useState("")
  const [category, setCategory] = useState("")
  const [customCategory, setCustomCategory] = useState("")
  const [startDate, setStartDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState(defaultTime)
  const [duration, setDuration] = useState("30")
  const [customHours, setCustomHours] = useState("")
  const [customMinutes, setCustomMinutes] = useState("")
  const [pledgeAmount, setPledgeAmount] = useState("10")
  const [failedMissionDest, setFailedMissionDest] = useState("return-to-friends")
  const [friendRecipient, setFriendRecipient] = useState("")
  const [foundationRecipient, setFoundationRecipient] = useState(foundationOptions[0]?.value ?? "")
  const [showError, setShowError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [createdMission, setCreatedMission] = useState<Mission | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const loadFriends = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const response = await fetch("/api/work-team", { headers: { Authorization: `Bearer ${session.access_token}` } })
      const result = await response.json() as { friends?: Friend[] }
      setFriends(result.friends ?? [])
      setFriendRecipient((current) => current || result.friends?.[0]?.user_id || "")
    }
    void loadFriends()
  }, [])

  useEffect(() => {
    if (!now) return
    setStartDate((current) => current || getLocalDateInputValue(now))
    setStartTime((current) => current || getLocalTimeInputValue(now))
  }, [now])

  const startTimeValidationError = getStartTimeValidationError(startDate, startTime, now)
  const selectedHour = startTime.split(":")[0] || defaultTime.split(":")[0]
  const selectedMinute = startTime.split(":")[1] || defaultTime.split(":")[1]
  const hasSelectedFriend = failedMissionDest === "return-to-friends" && !!friendRecipient
  const hasSelectedFoundation = failedMissionDest === "donate-to-foundation" && !!foundationRecipient

  const changeStartTime = (part: "hour" | "minute", delta: number) => {
    const hour = Number(selectedHour) || 0
    const minute = Number(selectedMinute) || 0
    const nextHour = part === "hour" ? moveWheelValue(hour, delta, 23) : hour
    const nextMinute = part === "minute" ? moveWheelValue(minute, delta, 59) : minute
    setStartTime(`${pad(nextHour)}:${pad(nextMinute)}`)
  }

  // onWheel only fires for a mouse/trackpad scroll, which doesn't exist on a
  // touchscreen -- without this, phones had no way to change the hour/minute
  // beyond the one-tap-at-a-time +-1 buttons. Pointer events cover touch,
  // mouse, and pen in one handler, so dragging up/down on the wheel now
  // works the same way a native picker wheel would.
  const wheelDragRef = useRef<{ part: "hour" | "minute"; startY: number; consumed: number; captured: boolean } | null>(null)
  const WHEEL_ROW_HEIGHT = 28
  const WHEEL_DRAG_THRESHOLD = 6

  const handleWheelPointerDown = (part: "hour" | "minute") => (event: React.PointerEvent<HTMLDivElement>) => {
    // Capture is deferred until real drag movement is detected -- capturing
    // immediately on pointerdown (the previous version) swallowed the click
    // that was supposed to land on the actual number button under the
    // finger, so tapping the visible +-1 values stopped working entirely
    // once dragging was added. A plain tap now never captures, so its
    // native click still fires normally.
    wheelDragRef.current = { part, startY: event.clientY, consumed: 0, captured: false }
  }

  const handleWheelPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = wheelDragRef.current
    if (!drag) return
    const totalDelta = event.clientY - drag.startY
    if (!drag.captured) {
      if (Math.abs(totalDelta) < WHEEL_DRAG_THRESHOLD) return
      drag.captured = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const steps = Math.trunc((totalDelta - drag.consumed) / WHEEL_ROW_HEIGHT)
    if (steps !== 0) {
      const stepCount = Math.abs(steps)
      for (let i = 0; i < stepCount; i += 1) {
        changeStartTime(drag.part, steps > 0 ? -1 : 1)
      }
      drag.consumed += steps * WHEEL_ROW_HEIGHT
    }
  }

  const handleWheelPointerUp = () => {
    wheelDragRef.current = null
  }

  const previewEndTime = (() => {
    if (!startDate || !startTime) return null

    const finalDurationMinutes = duration === "custom"
      ? (Number(customHours) || 0) * 60 + (Number(customMinutes) || 0)
      : Number(duration) || 0

    if (!finalDurationMinutes) return null

    const startDateTime = new Date(`${startDate}T${startTime}:00`)
    return new Date(startDateTime.getTime() + finalDurationMinutes * 60 * 1000)
  })()

  const canCreateMission = !!missionName.trim() && !!category &&
    (category !== "Other" || !!customCategory.trim()) &&
    !!startDate && !!startTime && !startTimeValidationError &&
    !!duration && (duration !== "custom" || (!!customHours || !!customMinutes)) &&
    Number(pledgeAmount) >= 10 &&
    (failedMissionDest !== "return-to-friends" || !!friendRecipient) &&
    (failedMissionDest !== "donate-to-foundation" || !!foundationRecipient)

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isSubmitting) return

    if (!missionName.trim()) {
      setShowError(true)
      setErrorMessage("กรุณากรอกชื่อภารกิจ")
      return
    }

    if (!category) {
      setShowError(true)
      setErrorMessage("กรุณาเลือกหมวดหมู่ภารกิจ")
      return
    }

    if (category === "Other" && !customCategory.trim()) {
      setShowError(true)
      setErrorMessage("กรุณาระบุหมวดหมู่ที่กำหนดเอง")
      return
    }

    if (!startDate) {
      setShowError(true)
      setErrorMessage("กรุณาเลือกวันที่เริ่มภารกิจ")
      return
    }

    if (!startTime) {
      setShowError(true)
      setErrorMessage("กรุณาเลือกเวลาเริ่มภารกิจ")
      return
    }

    const startTimeValidation = getStartTimeValidationError(startDate, startTime, now)

    if (startTimeValidation) {
      setShowError(true)
      setErrorMessage(`เวลาเริ่มภารกิจไม่ถูกต้อง\n${startTimeValidation}`)
      return
    }

    if (!duration) {
      setShowError(true)
      setErrorMessage("กรุณาเลือกระยะเวลาภารกิจ")
      return
    }

    if (duration === "custom" && !customHours && !customMinutes) {
      setShowError(true)
      setErrorMessage("กรุณาระบุระยะเวลาภารกิจแบบกำหนดเอง")
      return
    }

    const amount = Number(pledgeAmount) || 0

    if (amount < 10) {
      setShowError(true)
      setErrorMessage("จำนวนเงินมัดจำต้องไม่น้อยกว่า ฿10")
      return
    }

    if (failedMissionDest === "return-to-friends" && !friendRecipient) {
      setShowError(true)
      setErrorMessage("ไม่มีเพื่อนสำหรับส่งเงิน")
      return
    }

    if (failedMissionDest === "donate-to-foundation" && !foundationRecipient) {
      setShowError(true)
      setErrorMessage("กรุณาเลือกมูลนิธิเพื่อจัดสรรเงิน")
      return
    }

    let finalDurationMinutes = Number(duration)

    if (duration === "custom") {
      const hours = Number(customHours) || 0
      const minutes = Number(customMinutes) || 0
      finalDurationMinutes = hours * 60 + minutes
    }

    const finalCategory = category === "Other" ? customCategory.trim() : category

    const startDateTime = new Date(`${startDate}T${startTime}:00`)
    const endTime = new Date(startDateTime.getTime() + finalDurationMinutes * 60 * 1000).toISOString()

    const mission: Mission = {
      id: "",
      missionName: missionName.trim(),
      category: finalCategory,
      missionType: "Solo" as const,
      verificationType,
      durationLabel: formatDurationLabel(duration, customHours, customMinutes),
      durationMinutes: finalDurationMinutes,
      startTime: startDateTime.toISOString(),
      endTime,
      pledgeAmount: amount,
      failedMissionDest,
      friendRecipient: failedMissionDest === "return-to-friends" ? friendRecipient : undefined,
      foundationRecipient: failedMissionDest === "donate-to-foundation" ? foundationRecipient : undefined,
      status: "Upcoming" as const,
      checks: { ...defaultChecks },
      createdAt: new Date().toISOString(),
      photos: {},
    }

    setIsSubmitting(true)

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession()
      if (sessionError || !session?.access_token) throw new Error(sessionError?.message ?? "Authentication is required")
      const created = await createMissionInSupabase(mission, session)

      const paymentResponse = await fetch("/api/stripe/charge-mission-pledge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ missionId: created.id, missionName: mission.missionName, amount: Number(mission.pledgeAmount) || 0 }),
      })

      const paymentResult = await paymentResponse.json() as {
        paid?: boolean
        error?: string
        code?: string
        type?: string
        param?: string
      }

      if (!paymentResponse.ok || !paymentResult.paid) {
        await updateMissionInSupabase(created.id, { status: "Failed" })
        const message = paymentResult.error === "กรุณาเพิ่มบัตรสำหรับการชำระเงินก่อน"
          ? "กรุณาเพิ่มบัตรสำหรับการชำระเงินก่อน"
          : paymentResult.error ?? "Payment confirmation is required before this mission can be marked paid."
        setShowError(true)
        setErrorMessage(message)
        setTimeout(() => router.push("/profile/settings"), 800)
        return
      }

      setShowError(false)
      setErrorMessage("")
      setCreatedMission(created)
    } catch (error) {
      setShowError(true)
      setErrorMessage(error instanceof Error ? error.message : "Unable to create mission.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayDuration = formatDurationLabel(duration, customHours, customMinutes)

  const formatMissionStart = (value: string) => {
    return new Date(value).toLocaleString("en-US", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
      <DashboardNav onOpenNotifications={() => setIsNotificationsOpen(true)} />

      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/solo-mission"
            className="flex items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-[#121212]"
          >
            <ArrowLeft className="h-4 w-4" />
            กลับ
          </Link>

          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">ตั้งค่า</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#121212]">
              {isTimelapse ? "Create Timelapse Video Mission" : "Create Photo AI Mission"}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {isTimelapse ? "ตั้งค่าภารกิจและการบันทึกวิดีโอแบบ Timelapse" : "ตั้งค่าภารกิจและการตรวจสอบ"}
            </p>
          </div>

          <div className="w-20" />
        </div>

        {showError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-6 flex items-center gap-3 rounded-lg bg-red-100 p-4"
          >
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="text-sm font-medium text-red-800">{errorMessage}</span>
          </motion.div>
        )}

        <form onSubmit={handleCreateMission} className="space-y-6">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <motion.div
              variants={itemVariants}
              className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl"
            >
              <label className="block text-sm font-semibold text-[#121212]">
                ชื่อภารกิจ
                <span className="text-red-500"> *</span>
              </label>
              <p className="mt-1 text-xs text-gray-600">ตั้งชื่อภารกิจให้ชัดเจน</p>
              <input
                type="text"
                value={missionName}
                onChange={(e) => setMissionName(e.target.value)}
                placeholder="อ่านหนังสือ 1 ชั่วโมง"
                className="mt-3 w-full rounded-xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 text-sm focus:border-[#AFFF00] focus:outline-none focus:ring-2 focus:ring-[#AFFF00]/20"
              />
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl"
            >
              <label className="block text-sm font-semibold text-[#121212]">
                วันที่และเวลาเริ่มภารกิจ
                <span className="text-red-500"> *</span>
              </label>
              <p className="mt-1 text-xs text-gray-600">กำหนดวัน เวลา ปี ที่ภารกิจจะเริ่ม</p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="flex h-[120px] flex-col">
                  <label className="mb-1 block text-xs font-semibold text-gray-600">วันที่</label>
                  <div className="relative h-[92px]">
                    <input
                      type="date"
                      value={startDate}
                      min={defaultDate}
                      aria-label="วันที่เริ่มภารกิจ"
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{ color: "transparent", caretColor: "transparent" }}
                      className="start-date-input absolute inset-0 h-full w-full rounded-xl border border-[#121212]/10 bg-[#f9f9f8] px-3 py-2 text-center text-base font-semibold focus:border-[#AFFF00] focus:outline-none focus:ring-2 focus:ring-[#AFFF00]/20"
                    />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center pr-8 text-base font-semibold text-[#121212]">
                      {startDate.split("-").reverse().join("/")}
                    </span>
                  </div>
                </div>
                <div className="flex h-[120px] flex-col">
                  <label className="mb-1 block text-xs font-semibold text-gray-600">เวลา</label>
                  <div className="flex h-[92px] min-h-0 items-center justify-center gap-3 rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-3 py-1" onWheel={(event) => { event.preventDefault(); changeStartTime(event.deltaY > 0 ? "minute" : "hour", event.deltaY > 0 ? 1 : -1) }}>
                    <div
                      className="flex touch-none select-none flex-col items-center leading-none"
                      onWheel={(event) => { event.stopPropagation(); changeStartTime("hour", event.deltaY > 0 ? 1 : -1) }}
                      onPointerDown={handleWheelPointerDown("hour")}
                      onPointerMove={handleWheelPointerMove}
                      onPointerUp={handleWheelPointerUp}
                      onPointerCancel={handleWheelPointerUp}
                    >
                      {getWheelWindow(Number(selectedHour), 23).map((hour, index) => (
                        <button key={`${hour}-${index}`} type="button" onClick={() => setStartTime(`${pad(hour)}:${selectedMinute}`)} className={`flex h-7 w-10 items-center justify-center text-base transition-all ${index === 1 ? "scale-105 font-bold text-[#121212]" : "text-gray-300"}`}>
                          {pad(hour)}
                        </button>
                      ))}
                    </div>
                    <span className="text-base font-bold text-[#121212]">:</span>
                    <div
                      className="flex touch-none select-none flex-col items-center leading-none"
                      onWheel={(event) => { event.stopPropagation(); changeStartTime("minute", event.deltaY > 0 ? 1 : -1) }}
                      onPointerDown={handleWheelPointerDown("minute")}
                      onPointerMove={handleWheelPointerMove}
                      onPointerUp={handleWheelPointerUp}
                      onPointerCancel={handleWheelPointerUp}
                    >
                      {getWheelWindow(Number(selectedMinute), 59).map((minute, index) => (
                        <button key={`${minute}-${index}`} type="button" onClick={() => setStartTime(`${selectedHour}:${pad(minute)}`)} className={`flex h-7 w-10 items-center justify-center text-base transition-all ${index === 1 ? "scale-105 font-bold text-[#121212]" : "text-gray-300"}`}>
                          {pad(minute)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {startTimeValidationError && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <div className="font-semibold">เวลาเริ่มภารกิจไม่ถูกต้อง</div>
                  <div className="mt-1">{startTimeValidationError}</div>
                </div>
              )}
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl"
            >
              <label className="block text-sm font-semibold text-[#121212]">
                หมวดหมู่ภารกิจ
                <span className="text-red-500"> *</span>
              </label>
              <p className="mt-1 text-xs text-gray-600">เลือกประเภทภารกิจ</p>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                {categoryOptions.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => {
                      setCategory(cat.value)
                      if (cat.value !== "Other") {
                        setCustomCategory("")
                      }
                    }}
                    className={`rounded-xl border-2 px-4 py-3 text-sm font-medium transition ${
                      category === cat.value
                        ? "border-[#AFFF00] bg-[#AFFF00]/10 text-[#121212]"
                        : "border-[#121212]/10 bg-[#f9f9f8] text-gray-600 hover:border-[#AFFF00]/40"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {category === "Other" && (
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="ระบุหมวดหมู่ที่กำหนดเอง"
                  className="mt-3 w-full rounded-xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 text-sm focus:border-[#AFFF00] focus:outline-none focus:ring-2 focus:ring-[#AFFF00]/20"
                />
              )}
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl"
            >
              <label className="block text-sm font-semibold text-[#121212]">
                ระยะเวลาภารกิจ
                <span className="text-red-500"> *</span>
              </label>
              <p className="mt-1 text-xs text-gray-600">ขั้นต่ำ 30 นาที</p>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                {durationOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDuration(opt.value)}
                    className={`rounded-xl border-2 px-4 py-3 text-sm font-medium transition ${
                      duration === opt.value
                        ? "border-[#AFFF00] bg-[#AFFF00]/10 text-[#121212]"
                        : "border-[#121212]/10 bg-[#f9f9f8] text-gray-600 hover:border-[#AFFF00]/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {duration === "custom" && (
                <div className="mt-3 grid gap-3 grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">ชั่วโมง</label>
                    <input
                      type="number"
                      value={customHours}
                      onChange={(e) => setCustomHours(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full rounded-xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 text-sm focus:border-[#AFFF00] focus:outline-none focus:ring-2 focus:ring-[#AFFF00]/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">นาที</label>
                    <input
                      type="number"
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      placeholder="0"
                      min="0"
                      max="59"
                      className="w-full rounded-xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 text-sm focus:border-[#AFFF00] focus:outline-none focus:ring-2 focus:ring-[#AFFF00]/20"
                    />
                  </div>
                </div>
              )}
            </motion.div>

            {!isTimelapse && (
              <motion.div
                variants={itemVariants}
                className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-[#121212]">การตรวจสอบ AI</h3>
                    <p className="mt-1 text-xs text-gray-600">AI จะตรวจสอบภารกิจของคุณโดยใช้ภาพ real-time 3 ภาพ</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    { title: "ตรวจครั้งที่ 1", desc: "ภายใน 5 นาทีแรก" },
                    { title: "ตรวจครั้งที่ 2", desc: "ช่วงกลางของภารกิจ" },
                    { title: "ตรวจครั้งที่ 3", desc: "ภายใน 5 นาทีสุดท้าย" },
                  ].map((check, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[#AFFF00]/30 bg-[#AFFF00]/10 p-3"
                    >
                      <p className="text-sm font-semibold text-[#121212]">{check.title}</p>
                      <p className="mt-1 text-xs text-gray-600">{check.desc}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            <motion.div
              variants={itemVariants}
              className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl"
            >
              <label className="block text-sm font-semibold text-[#121212]">
                จำนวนเงินมัดจำ
                <span className="text-red-500"> *</span>
              </label>
              <p className="mt-1 text-xs text-gray-600">ขั้นต่ำ: ฿10</p>

              <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-4">
                {["10", "50", "100"].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setPledgeAmount(amount)}
                    className={`rounded-xl border-2 px-4 py-3 text-sm font-medium transition ${
                      pledgeAmount === amount
                        ? "border-[#AFFF00] bg-[#AFFF00]/10 text-[#121212]"
                        : "border-[#121212]/10 bg-[#f9f9f8] text-gray-600 hover:border-[#AFFF00]/40"
                    }`}
                  >
                    ฿{amount}
                  </button>
                ))}
              </div>

              <input
                type="number"
                value={pledgeAmount}
                onChange={(e) => setPledgeAmount(e.target.value)}
                placeholder="จำนวนเงินที่กำหนดเอง"
                min="10"
                className="mt-3 w-full rounded-xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 text-sm focus:border-[#AFFF00] focus:outline-none focus:ring-2 focus:ring-[#AFFF00]/20"
              />
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl"
            >
              <label className="block text-sm font-semibold text-[#121212]">
                หากภารกิจล้มเหลว
                <span className="text-red-500"> *</span>
              </label>
              <p className="mt-1 text-xs text-gray-600">เลือกปลายทาง</p>
              <div className="mt-3 space-y-3">
                {failedMissionOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`rounded-xl border-2 bg-[#f9f9f8] p-3 transition ${
                      failedMissionDest === option.value
                        ? "border-[#AFFF00] bg-[#AFFF00]/10"
                        : "border-[#121212]/10 hover:border-[#AFFF00]/40"
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="radio"
                        name="failedMissionDest"
                        value={option.value}
                        checked={failedMissionDest === option.value}
                        onChange={(e) => setFailedMissionDest(e.target.value)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-medium text-[#121212]">{option.label}</span>
                    </label>

                    {failedMissionDest === "return-to-friends" && option.value === "return-to-friends" && (
                      <div className="mt-3 space-y-2 border-t border-[#121212]/10 pt-3">
                        {friends.length > 0 ? (
                          friends.map((friend) => (
                            <button
                              key={friend.user_id}
                              type="button"
                              onClick={() => setFriendRecipient(friend.user_id)}
                              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                                friendRecipient === friend.user_id
                                  ? "border-[#AFFF00] bg-[#AFFF00]/15"
                                  : "border-[#121212]/10 bg-white hover:border-[#AFFF00]/40"
                              }`}
                            >
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#121212] to-[#555] text-xs font-bold text-white">
                                {(friend.name ?? "?").slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-[#121212]">{friend.name ?? "Unnamed friend"}</div>
                                <div className="text-xs text-gray-500">{friend.friend_id ?? friend.user_id}</div>
                              </div>
                            </button>
                          ))
                        ) : (
                          <p className="text-sm text-red-600">ไม่มีเพื่อนสำหรับส่งเงิน</p>
                        )}
                      </div>
                    )}

                    {failedMissionDest === "donate-to-foundation" && option.value === "donate-to-foundation" && (
                      <div className="mt-3 space-y-2 border-t border-[#121212]/10 pt-3">
                        {foundationOptions.map((foundation) => (
                          <button
                            key={foundation.value}
                            type="button"
                            onClick={() => setFoundationRecipient(foundation.value)}
                            className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                              foundationRecipient === foundation.value
                                ? "border-[#AFFF00] bg-[#AFFF00]/15"
                                : "border-[#121212]/10 bg-white hover:border-[#AFFF00]/40"
                            }`}
                          >
                            <span className="text-sm font-medium text-[#121212]">{foundation.label}</span>
                            <span className="text-xs text-gray-500">฿{pledgeAmount || "10"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="rounded-[28px] border-2 border-[#AFFF00]/50 bg-[#AFFF00]/10 p-6"
          >
            <h3 className="text-sm font-bold text-[#121212]">สรุปภารกิจ</h3>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">ชื่อภารกิจ</span>
                <span className="font-semibold text-[#121212]">{missionName || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">วันที่เริ่ม</span>
                <span className="font-semibold text-[#121212]">{startDate || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">เวลาเริ่ม</span>
                <span className="font-semibold text-[#121212]">{startTime || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">End Time</span>
                <span className="font-semibold text-[#121212]">
                  {previewEndTime ? new Date(previewEndTime).toLocaleString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">หมวดหมู่</span>
                <span className="font-semibold text-[#121212]">{category === "Other" ? customCategory || "—" : category || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">ระยะเวลา</span>
                <span className="font-semibold text-[#121212]">{displayDuration || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">การตรวจสอบ</span>
                <span className="font-semibold text-[#121212]">{verificationType}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">จำนวนเงินมัดจำ</span>
                <span className="font-bold text-[#AFFF00]">฿{pledgeAmount || "10"}</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-[#AFFF00]/30 pt-2">
                <span className="font-semibold text-[#121212]">ปลายทางถ้าภารกิจล้มเหลว</span>
                <span className="font-semibold text-[#121212]">{formatFailedDestination(failedMissionDest)}</span>
              </div>
            </div>
          </motion.div>

          <motion.button
            variants={itemVariants}
            type="submit"
            disabled={!canCreateMission || isSubmitting}
            className={`w-full rounded-full px-6 py-4 font-bold text-[#121212] transition ${
              canCreateMission && !isSubmitting
                ? "bg-[#AFFF00] hover:bg-[#AFFF00]/90"
                : "cursor-not-allowed bg-[#d7d7d4] text-[#5d5d5d]"
            }`}
          >
            {isSubmitting ? "กำลังสร้างภารกิจ..." : "สร้างภารกิจ"}
          </motion.button>
        </form>
      </div>

      <AnimatePresence>
        {isNotificationsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-end bg-[#121212]/10 backdrop-blur-[1px]"
            onClick={() => setIsNotificationsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, x: 24, y: -8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 24, y: -8 }}
              onClick={(event) => event.stopPropagation()}
              className="relative mt-4 mr-6 w-full max-w-md rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_30px_80px_rgba(18,18,18,0.22)] backdrop-blur-2xl"
            >
              <button
                type="button"
                aria-label="Close notifications"
                onClick={() => setIsNotificationsOpen(false)}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[#121212]/10 bg-white text-[#121212] transition hover:bg-[#121212]/5"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="pr-10">
                <h2 className="text-xl font-bold tracking-[-0.04em] text-[#121212]">Notifications</h2>
                <p className="mt-1 text-sm text-gray-600">Your latest updates</p>
              </div>

              <div className="mt-4 space-y-3">
                {[
                  {
                    title: "Mission is starting soon",
                    subtitle: "Read 20 pages before lunch",
                    time: "5 minutes ago",
                    unread: true,
                  },
                  {
                    title: "You received a group mission invitation",
                    subtitle: "Morning Run Challenge · by Ethan",
                    time: "12 minutes ago",
                    unread: true,
                  },
                  {
                    title: "Your pledge payment succeeded",
                    subtitle: "Mission: Morning Run Challenge",
                    time: "1 hour ago",
                    unread: false,
                  },
                ].map((item, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setIsNotificationsOpen(false)
                      router.push("/missions")
                    }}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                      item.unread ? "border-[#AFFF00]/40 bg-[#AFFF00]/8" : "border-[#121212]/10 bg-[#f8f8f7]"
                    }`}
                  >
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#121212] shadow-sm">
                      {item.unread ? <Bell className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium text-[#121212]">{item.title}</div>
                        {item.unread && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#AFFF00]" />}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">{item.subtitle}</div>
                      <div className="mt-2 text-[11px] text-gray-500">{item.time}</div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {createdMission && (
        <MissionCreatedPopup
          missionType={isTimelapse ? "Timelapse Video" : "Photo AI"}
          onComplete={() => router.push("/dashboard?refresh=1")}
        />
      )}
    </main>
  )
}
