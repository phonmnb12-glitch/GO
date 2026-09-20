"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { useEffect, useState } from "react"

const toInputValue = (date: Date) => date.toISOString().slice(0, 16)

type Friend = { user_id: string; name?: string; friend_id?: string }

export default function WorkTeamMissionPage() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [missionName, setMissionName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("Work Team")
  const [startTime, setStartTime] = useState(toInputValue(new Date(Date.now() + 60 * 60 * 1000)))
  const [endTime, setEndTime] = useState(toInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000)))
  const [pledgeAmount, setPledgeAmount] = useState("10")
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
  }

  const createMission = async () => {
    setErrorMessage("")
    if (!missionName.trim() || selectedFriends.length === 0 || new Date(endTime) <= new Date(startTime)) {
      setErrorMessage("Enter a mission name, select at least one friend, and choose a valid time range.")
      return
    }
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Authentication is required.")
      const response = await fetch("/api/work-team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: missionName, description, category, startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString(), pledgeAmount: Number(pledgeAmount), friendIds: selectedFriends }),
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
            <label className="text-sm font-semibold text-[#121212]">หมวดหมู่<input value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 font-normal outline-none focus:border-[#AFFF00]" /></label>
            <label className="text-sm font-semibold text-[#121212] md:col-span-2">คำอธิบายภารกิจ<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 font-normal outline-none focus:border-[#AFFF00]" placeholder="ทีมจะทำอะไรบ้าง?" /></label>
            <label className="text-sm font-semibold text-[#121212]">เวลาเริ่ม<input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 font-normal outline-none focus:border-[#AFFF00]" /></label>
            <label className="text-sm font-semibold text-[#121212]">เวลาสิ้นสุด<input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 font-normal outline-none focus:border-[#AFFF00]" /></label>
            <label className="text-sm font-semibold text-[#121212]">เงินมัดจำต่อคน<input type="number" min="0" value={pledgeAmount} onChange={(event) => setPledgeAmount(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 font-normal outline-none focus:border-[#AFFF00]" /></label>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-[#121212]">เพิ่มเพื่อน</h3><span className="rounded-full bg-[#AFFF00]/15 px-2 py-1 text-[11px] font-medium text-[#121212]">{selectedFriends.length} เลือก</span></div>
            {isLoading ? <p className="mt-3 text-sm text-gray-600">กำลังโหลดเพื่อน...</p> : friends.length === 0 ? <p className="mt-3 text-sm text-gray-600">ไม่มีเพื่อนที่ยอมรับแล้ว</p> : <div className="mt-3 grid gap-3 md:grid-cols-2">{friends.map((friend) => <button type="button" key={friend.user_id} onClick={() => toggleFriend(friend.user_id)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedFriends.includes(friend.user_id) ? "border-[#AFFF00] bg-[#AFFF00]/10" : "border-[#121212]/10 bg-[#f8f8f7]"}`}><div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#121212] to-[#555] text-sm font-bold text-white">{(friend.name ?? "?").slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="font-semibold text-[#121212]">{friend.name ?? "เพื่อนที่ไม่มีชื่อ"}</div><div className="text-sm text-gray-500">{friend.friend_id ?? friend.user_id}</div></div><span className="text-xs font-semibold text-[#121212]">{selectedFriends.includes(friend.user_id) ? "เลือกแล้ว" : "เลือก"}</span></button>)}</div>}
          </div>

          {errorMessage && <p className="mt-5 text-sm text-red-600">{errorMessage}</p>}
          <div className="mt-8 flex justify-end"><button type="button" disabled={isSubmitting} onClick={() => void createMission()} className="rounded-full bg-[#121212] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2f2f2f] disabled:opacity-50">{isSubmitting ? "กำลังสร้าง..." : "สร้างภารกิจทีมงาน"}</button></div>
        </div>
      </div>
    </main>
  )
}
