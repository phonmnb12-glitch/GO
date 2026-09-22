"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

const pad2 = (value: number) => String(value).padStart(2, "0")
const toDatePart = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
const toTimePart = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`

const wheelWindow = (current: number, max: number) => [current === 0 ? max : current - 1, current, current === max ? 0 : current + 1]

// The browser's native datetime-local picker renders in whatever AM/PM or
// 24h format the OS's own regional settings use, which isn't something a
// web page can force -- so instead of a native time input, this is a fully
// custom 24-hour hour:minute wheel (same drag/tap pattern already used for
// Photo AI and GPS Check's own time pickers), which always displays and
// reads the same way regardless of the visitor's OS locale.
function TimeWheel({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [hourStr, minuteStr] = value.split(":")
  const hour = Number(hourStr) || 0
  const minute = Number(minuteStr) || 0

  const changeTime = (part: "hour" | "minute", delta: number) => {
    const nextHour = part === "hour" ? (hour + delta + 24) % 24 : hour
    const nextMinute = part === "minute" ? (minute + delta + 60) % 60 : minute
    onChange(`${pad2(nextHour)}:${pad2(nextMinute)}`)
  }

  const dragRef = useRef<{ part: "hour" | "minute"; startY: number; consumed: number; captured: boolean } | null>(null)
  const ROW_HEIGHT = 28
  const DRAG_THRESHOLD = 6

  const handlePointerDown = (part: "hour" | "minute") => (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { part, startY: event.clientY, consumed: 0, captured: false }
  }
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const totalDelta = event.clientY - drag.startY
    if (!drag.captured) {
      if (Math.abs(totalDelta) < DRAG_THRESHOLD) return
      drag.captured = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const steps = Math.trunc((totalDelta - drag.consumed) / ROW_HEIGHT)
    if (steps !== 0) {
      const stepCount = Math.abs(steps)
      for (let i = 0; i < stepCount; i += 1) changeTime(drag.part, steps > 0 ? -1 : 1)
      drag.consumed += steps * ROW_HEIGHT
    }
  }
  const handlePointerUp = () => { dragRef.current = null }

  return (
    <div
      className="mt-2 flex h-[92px] items-center justify-center gap-3 rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-3 py-1"
      onWheel={(event) => { event.preventDefault(); changeTime(event.deltaY > 0 ? "minute" : "hour", event.deltaY > 0 ? 1 : -1) }}
    >
      <div
        className="flex touch-none select-none flex-col items-center leading-none"
        onWheel={(event) => { event.stopPropagation(); changeTime("hour", event.deltaY > 0 ? 1 : -1) }}
        onPointerDown={handlePointerDown("hour")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {wheelWindow(hour, 23).map((h, index) => (
          <button key={`${h}-${index}`} type="button" onClick={() => onChange(`${pad2(h)}:${pad2(minute)}`)} className={`flex h-7 w-10 items-center justify-center text-base transition-all ${index === 1 ? "scale-105 font-bold text-[#121212]" : "text-gray-300"}`}>
            {pad2(h)}
          </button>
        ))}
      </div>
      <span className="text-base font-bold text-[#121212]">:</span>
      <div
        className="flex touch-none select-none flex-col items-center leading-none"
        onWheel={(event) => { event.stopPropagation(); changeTime("minute", event.deltaY > 0 ? 1 : -1) }}
        onPointerDown={handlePointerDown("minute")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {wheelWindow(minute, 59).map((m, index) => (
          <button key={`${m}-${index}`} type="button" onClick={() => onChange(`${pad2(hour)}:${pad2(m)}`)} className={`flex h-7 w-10 items-center justify-center text-base transition-all ${index === 1 ? "scale-105 font-bold text-[#121212]" : "text-gray-300"}`}>
            {pad2(m)}
          </button>
        ))}
      </div>
    </div>
  )
}

type Friend = { user_id: string; name?: string; friend_id?: string }

export default function WorkTeamMissionPage() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [friendTasks, setFriendTasks] = useState<Record<string, string>>({})
  const [missionName, setMissionName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [startDate, setStartDate] = useState(toDatePart(new Date(Date.now() + 60 * 60 * 1000)))
  const [startTimeStr, setStartTimeStr] = useState(toTimePart(new Date(Date.now() + 60 * 60 * 1000)))
  const [endDate, setEndDate] = useState(toDatePart(new Date(Date.now() + 2 * 60 * 60 * 1000)))
  const [endTimeStr, setEndTimeStr] = useState(toTimePart(new Date(Date.now() + 2 * 60 * 60 * 1000)))
  const startTime = `${startDate}T${startTimeStr}`
  const endTime = `${endDate}T${endTimeStr}`
  const [pledgeAmount, setPledgeAmount] = useState("10")
  const [failedDestination, setFailedDestination] = useState("return-to-friends")
  const [foundationRecipient, setFoundationRecipient] = useState("มูลนิธิ A")
  const [supportRecipient, setSupportRecipient] = useState("GO Support Fund")
  const [errorMessage, setErrorMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const loadFriends = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const response = await fetch("/api/work-team", { headers: { Authorization: `Bearer ${session.access_token}` } })
      const result = await response.json() as { friends?: Friend[]; error?: string }
      if (!response.ok) setErrorMessage(result.error ?? "Unable to load friends.")
      setFriends(result.friends ?? [])
      setIsLoading(false)
    }
    void loadFriends()
  }, [])

  const toggleFriend = (userId: string) => {
    setSelectedFriends((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId])
    setFriendTasks((current) => {
      if (!(userId in current)) return current
      const next = { ...current }
      delete next[userId]
      return next
    })
  }

  const createMission = async () => {
    setErrorMessage("")
    if (!missionName.trim() || !category.trim() || selectedFriends.length === 0 || new Date(endTime) <= new Date(startTime)) {
      setErrorMessage("กรอกชื่อภารกิจ ชื่อวิชา/งาน เลือกเพื่อนอย่างน้อย 1 คน และเลือกช่วงเวลาให้ถูกต้อง")
      return
    }
    if (new Date(startTime).getTime() <= Date.now()) {
      setErrorMessage("เวลาเริ่มต้องเป็นเวลาในอนาคต ไม่สามารถเลือกเวลาที่ผ่านไปแล้วได้")
      return
    }
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Authentication is required.")
      const response = await fetch("/api/work-team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name: missionName,
          description,
          category,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          pledgeAmount: Number(pledgeAmount),
          friendIds: selectedFriends,
          friendTasks,
          failedDestination,
          foundationRecipient: failedDestination === "donate-to-foundation" ? foundationRecipient : undefined,
          supportRecipient: failedDestination === "support" ? supportRecipient : undefined,
        }),
      })
      const result = await response.json() as { missionId?: string; error?: string }
      if (!response.ok || !result.missionId) throw new Error(result.error ?? "Unable to create Work Team mission.")
      window.location.href = `/work-team-mission/${result.missionId}`
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create Work Team mission.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
      <DashboardNav />
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/group-mission" className="text-sm font-medium text-gray-600 transition hover:text-[#121212]">← กลับ</Link>
          <div className="text-center"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">ประเภทภารกิจ</p><h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#121212]">ภารกิจทีมงาน</h1></div>
          <div className="w-20" />
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
          <div className="mb-4 inline-flex rounded-full border border-[#AFFF00]/70 bg-[#AFFF00] px-3 py-1 text-xs font-semibold text-[#121212]">โหมดทีม</div>
          <h2 className="text-2xl font-bold tracking-[-0.04em] text-[#121212]">สร้างความท้าทายเพื่อทีมงานของคุณ</h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">เชิญเพื่อนและรอให้ทุกคนตอบรับก่อนเรียกเก็บเงินมัดจำทีม</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#121212]">ชื่อภารกิจ<input value={missionName} onChange={(event) => setMissionName(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 font-normal outline-none focus:border-[#AFFF00]" placeholder="ความท้าทายของทีม" /></label>
            <label className="text-sm font-semibold text-[#121212]">ชื่อวิชา หรือ งานนั้นๆ<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="เช่น คณิตศาสตร์, โปรเจคจบ" className="mt-2 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 font-normal outline-none focus:border-[#AFFF00]" /></label>
            <label className="text-sm font-semibold text-[#121212] md:col-span-2">คำอธิบายภารกิจ<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 font-normal outline-none focus:border-[#AFFF00]" placeholder="ทีมจะทำอะไรบ้าง?" /></label>
            <div>
              <p className="text-sm font-semibold text-[#121212]">เวลาเริ่ม</p>
              <input type="date" value={startDate} min={toDatePart(new Date())} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 font-normal outline-none focus:border-[#AFFF00]" />
              <TimeWheel value={startTimeStr} onChange={setStartTimeStr} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#121212]">เวลาสิ้นสุด</p>
              <input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 font-normal outline-none focus:border-[#AFFF00]" />
              <TimeWheel value={endTimeStr} onChange={setEndTimeStr} />
            </div>
            <label className="text-sm font-semibold text-[#121212]">เงินมัดจำต่อคน<input type="number" min="0" value={pledgeAmount} onChange={(event) => setPledgeAmount(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 font-normal outline-none focus:border-[#AFFF00]" /></label>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-[#121212]">เพิ่มเพื่อน</h3><span className="rounded-full bg-[#AFFF00]/15 px-2 py-1 text-[11px] font-medium text-[#121212]">{selectedFriends.length} เลือก</span></div>
            {isLoading ? (
              <p className="mt-3 text-sm text-gray-600">กำลังโหลดเพื่อน...</p>
            ) : friends.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">ไม่มีเพื่อนที่ยอมรับแล้ว</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {friends.map((friend) => {
                  const isSelected = selectedFriends.includes(friend.user_id)
                  return (
                    <div key={friend.user_id} className={`rounded-2xl border p-3 transition ${isSelected ? "border-[#AFFF00] bg-[#AFFF00]/10" : "border-[#121212]/10 bg-[#f8f8f7]"}`}>
                      <button type="button" onClick={() => toggleFriend(friend.user_id)} className="flex w-full items-center gap-3 text-left">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#121212] to-[#555] text-sm font-bold text-white">{(friend.name ?? "?").slice(0, 2).toUpperCase()}</div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[#121212]">{friend.name ?? "เพื่อนที่ไม่มีชื่อ"}</div>
                          <div className="text-sm text-gray-500">{friend.friend_id ?? friend.user_id}</div>
                        </div>
                        <span className="text-xs font-semibold text-[#121212]">{isSelected ? "เลือกแล้ว" : "เลือก"}</span>
                      </button>
                      {isSelected && (
                        <input
                          value={friendTasks[friend.user_id] ?? ""}
                          onChange={(event) => setFriendTasks((current) => ({ ...current, [friend.user_id]: event.target.value }))}
                          onClick={(event) => event.stopPropagation()}
                          placeholder="มอบหมายงานให้เพื่อนคนนี้ทำอะไร (ไม่บังคับ)"
                          className="mt-3 w-full rounded-xl border border-[#121212]/10 bg-white px-3 py-2 text-sm outline-none focus:border-[#AFFF00]"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold text-[#121212]">หากภารกิจล้มเหลว</h3>
            <p className="mt-1 text-xs text-gray-600">เลือกปลายทางเงินมัดจำของคนที่ทำภารกิจไม่สำเร็จ</p>
            <div className="mt-3 space-y-3">
              {[["return-to-friends", "หารให้เพื่อนในกลุ่ม"], ["donate-to-foundation", "บริจาคมูลนิธิ"], ["support", "สนับสนุน go."]].map(([value, label]) => (
                <div key={value} className={`rounded-xl border-2 bg-[#f9f9f8] p-3 transition ${failedDestination === value ? "border-[#AFFF00] bg-[#AFFF00]/10" : "border-[#121212]/10 hover:border-[#AFFF00]/40"}`}>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="radio" name="work-team-failed-destination" checked={failedDestination === value} onChange={() => setFailedDestination(value)} className="h-4 w-4" />
                    <span className="text-sm font-medium text-[#121212]">{label}</span>
                  </label>
                  {value === "return-to-friends" && failedDestination === "return-to-friends" && (
                    <p className="mt-2 border-t border-[#121212]/10 pt-2 text-xs text-gray-600">เงินมัดจำของคนที่ไม่ผ่านจะถูกหารเท่าๆ กันให้เพื่อนในทีมที่ทำสำเร็จ</p>
                  )}
                  {value === "donate-to-foundation" && failedDestination === "donate-to-foundation" && (
                    <div className="mt-3 space-y-2 border-t border-[#121212]/10 pt-3">
                      {["มูลนิธิ A", "มูลนิธิ B", "มูลนิธิ C"].map((foundation) => (
                        <button key={foundation} type="button" onClick={() => setFoundationRecipient(foundation)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${foundationRecipient === foundation ? "border-[#AFFF00] bg-[#AFFF00]/15" : "border-[#121212]/10 bg-white hover:border-[#AFFF00]/40"}`}>
                          <span className="text-sm font-medium text-[#121212]">{foundation}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {value === "support" && failedDestination === "support" && (
                    <div className="mt-3 space-y-2 border-t border-[#121212]/10 pt-3">
                      {["GO Support Fund", "GO Community Support"].map((support) => (
                        <button key={support} type="button" onClick={() => setSupportRecipient(support)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${supportRecipient === support ? "border-[#AFFF00] bg-[#AFFF00]/15" : "border-[#121212]/10 bg-white hover:border-[#AFFF00]/40"}`}>
                          <span className="text-sm font-medium text-[#121212]">{support}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {errorMessage && <p className="mt-5 text-sm text-red-600">{errorMessage}</p>}
          <div className="mt-8 flex justify-end"><button type="button" disabled={isSubmitting} onClick={() => void createMission()} className="rounded-full bg-[#121212] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2f2f2f] disabled:opacity-50">{isSubmitting ? "กำลังสร้าง..." : "สร้างภารกิจทีมงาน"}</button></div>
        </div>
      </div>
    </main>
  )
}
