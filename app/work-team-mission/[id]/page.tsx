"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

type Mission = { id: string; creator_id: string; name: string; description: string; category: string; start_time: string; end_time: string; pledge_amount: number; status: string }
type Submission = { percent: number; reason: string; photo: string; submittedAt: string }
type Member = { user_id: string; role: string; status: string; payment_status: string; completed_at?: string; failed_at?: string; assigned_task?: string | null; profile?: { name?: string; friend_id?: string } | null; submission?: Submission | null; confirmedBy?: string[] }
type Payload = { mission?: Mission; members?: Member[]; viewerId?: string; error?: string }

const statusClasses: Record<string, string> = {
  pending: "border-blue-200 bg-blue-50 text-blue-700",
  accepted: "border-green-200 bg-green-50 text-green-700",
  in_progress: "border-yellow-200 bg-yellow-50 text-yellow-700",
  completed: "border-green-200 bg-green-100 text-green-800",
  failed: "border-red-200 bg-red-50 text-red-700",
  declined: "border-red-200 bg-red-50 text-red-700",
}

const labelStatus = (status: string) => status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
const formatTime = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })

export default function WorkTeamMissionDetailPage() {
  const params = useParams<{ id: string }>()
  const [payload, setPayload] = useState<Payload>({})
  const [now, setNow] = useState(Date.now())
  const [errorMessage, setErrorMessage] = useState("")
  const [isActing, setIsActing] = useState(false)
  const [isSubmittingWork, setIsSubmittingWork] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadMission = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const response = await fetch(`/api/work-team/${params.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
    const result = await response.json() as Payload
    if (!response.ok) setErrorMessage(result.error ?? "Unable to load mission.")
    else setPayload(result)
  }

  useEffect(() => {
    void loadMission()
    const timer = window.setInterval(() => {
      setNow(Date.now())
      void loadMission()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [params.id])

  const act = async (action: "accept" | "decline" | "complete") => {
    setIsActing(true)
    setErrorMessage("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Authentication is required.")
      const response = await fetch(`/api/work-team/${params.id}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? "Unable to update mission.")
      await loadMission()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update mission.")
    } finally {
      setIsActing(false)
    }
  }

  const submitWork = async (file: File) => {
    setIsSubmittingWork(true)
    setErrorMessage("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Authentication is required.")
      const formData = new FormData()
      formData.append("image", file)
      const response = await fetch(`/api/work-team/${params.id}/submit-work`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? "Unable to submit work.")
      await loadMission()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to submit work.")
    } finally {
      setIsSubmittingWork(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const confirmWork = async (targetMemberId: string, decision: "confirm" | "reject" = "confirm") => {
    setConfirmingId(targetMemberId)
    setErrorMessage("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Authentication is required.")
      const response = await fetch(`/api/work-team/${params.id}/confirm-work`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ targetMemberId, decision }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? "Unable to confirm work.")
      await loadMission()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to confirm work.")
    } finally {
      setConfirmingId(null)
    }
  }

  const mission = payload.mission
  const members = payload.members ?? []
  const completed = members.filter((member) => member.status === "completed").length
  const progress = members.length ? Math.round((completed / members.length) * 100) : 0
  const remaining = mission ? Math.max(0, new Date(mission.end_time).getTime() - now) : 0
  const timeRemaining = useMemo(() => {
    const totalMinutes = Math.floor(remaining / 60000)
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
  }, [remaining])
  const viewer = members.find((member) => member.user_id === payload.viewerId)
  const isLeader = Boolean(mission && payload.viewerId && mission.creator_id === payload.viewerId)

  if (!mission) return <main className="min-h-screen bg-[#f5f5f3] text-[#111111]"><DashboardNav /><div className="mx-auto max-w-4xl px-6 py-16"><h1 className="text-2xl font-bold">ภารกิจทีมงาน</h1><p className="mt-2 text-sm text-gray-600">{errorMessage || "กำลังโหลดภารกิจ..."}</p></div></main>

  return (
    <main className="min-h-screen bg-[#f5f5f3] text-[#111111]">
      <DashboardNav />
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 md:px-8">
        <div className="mb-5 flex items-center justify-between gap-4"><Link href="/missions" className="inline-flex items-center gap-2 text-sm font-medium text-[#5d5d5d] transition hover:text-[#111111]">← กลับไปยังภารกิจ</Link><div className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClasses[mission.status] ?? "border-gray-200 bg-white text-gray-700"}`}>{labelStatus(mission.status)}</div></div>
        <section className="rounded-[30px] border border-[#111111]/5 bg-white p-4 sm:p-6"><p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">ภารกิจทีมงาน</p><h1 className="mt-3 max-w-2xl text-3xl font-black tracking-[-0.08em] text-[#111111] md:text-[3.5rem]">{mission.name}</h1><p className="mt-4 max-w-2xl text-sm text-[#5d5d5d]">{mission.description || "ทำงานร่วมกันและเสร็จภารกิจที่ได้รับมอบหมาย"}</p><div className="mt-5 flex flex-wrap gap-2 text-sm"><span className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1">{mission.category}</span><span className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1">฿{mission.pledge_amount} ต่อคน</span></div></section>

        <section className="mt-6 rounded-[30px] border border-[#111111]/5 bg-[#f7f7f5] p-5 md:p-6"><div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#6b6b6b]">ความคืบหน้าทีม</p><div className="mt-2 text-4xl font-black tracking-[-0.08em] text-[#111111]">{progress}%</div></div><div className="text-sm font-medium text-[#5d5d5d]">สำเร็จ: {completed} / {members.length} คน</div></div><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#111111]/6"><div className="h-full rounded-full bg-[#b7ff28] transition-all duration-500" style={{ width: `${progress}%` }} /></div></section>

        <section className="mt-6 grid gap-3 md:grid-cols-3"><div className="rounded-[24px] border border-[#111111]/5 bg-white p-4"><div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">เวลาเริ่ม</div><div className="mt-2 text-base font-bold">{formatTime(mission.start_time)}</div></div><div className="rounded-[24px] border border-[#111111]/5 bg-white p-4"><div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">เวลาสิ้นสุด</div><div className="mt-2 text-base font-bold">{formatTime(mission.end_time)}</div></div><div className="rounded-[24px] border border-[#111111]/5 bg-white p-4"><div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">เวลาที่เหลือ</div><div className="mt-2 text-base font-bold">{mission.status === "in_progress" ? timeRemaining : mission.status === "upcoming" ? "รอเริ่ม" : "—"}</div></div></section>

        <section className="mt-6 rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">สมาชิก</p><h2 className="mt-2 text-2xl font-black tracking-[-0.06em]">สมาชิกทีม</h2></div>
            <span className="rounded-full border border-[#AFFF00]/60 bg-[#f1ffc9] px-3 py-1.5 text-xs font-semibold">{members.length} คน</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {members.map((member) => {
              const isViewer = member.user_id === payload.viewerId
              return (
                <div key={member.user_id} className="rounded-2xl border border-[#111111]/10 bg-[#f7f7f5] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{member.profile?.name ?? member.user_id}{isViewer && " (คุณ)"}</div>
                      <div className="mt-1 truncate text-xs text-[#6b6b6b]">{member.profile?.friend_id ?? member.user_id}</div>
                      {member.assigned_task && <div className="mt-1 text-xs font-medium text-[#8bbf00]">งาน: {member.assigned_task}</div>}
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[member.status] ?? "border-gray-200 bg-white text-gray-700"}`}>{labelStatus(member.status)}</span>
                  </div>
                  {member.submission && (
                    <div className="mt-3 rounded-xl border border-[#111111]/10 bg-white p-3">
                      <div className="flex items-start gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={member.submission.photo} alt="งานที่ส่ง" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-[#111111]">ตรงกับงาน {member.submission.percent}%</div>
                          <div className="mt-0.5 whitespace-pre-line break-words text-xs text-[#6b6b6b]">{member.submission.reason}</div>
                        </div>
                      </div>
                      {isLeader && !isViewer && member.status !== "completed" && (
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={confirmingId === member.user_id}
                            onClick={() => void confirmWork(member.user_id, "reject")}
                            className="flex-1 rounded-full border border-[#111111]/15 bg-white px-4 py-2 text-xs font-semibold text-[#111111] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            ไม่ยืนยัน
                          </button>
                          <button
                            type="button"
                            disabled={confirmingId === member.user_id}
                            onClick={() => void confirmWork(member.user_id, "confirm")}
                            className="flex-1 rounded-full bg-[#AFFF00] px-4 py-2 text-xs font-semibold text-[#121212] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {confirmingId === member.user_id ? "กำลังส่ง..." : "ยืนยันงานนี้"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {viewer && (
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            {viewer.status === "pending" && (
              <>
                <button type="button" disabled={isActing} onClick={() => void act("decline")} className="rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 disabled:opacity-50">ปฏิเสธ</button>
                <button type="button" disabled={isActing} onClick={() => void act("accept")} className="rounded-full bg-[#AFFF00] px-5 py-3 text-sm font-semibold text-[#121212] disabled:opacity-50">ตอบรับ</button>
              </>
            )}
            {(viewer.status === "accepted" || viewer.status === "in_progress") && mission.status === "in_progress" && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void submitWork(file)
                  }}
                />
                <button
                  type="button"
                  disabled={isSubmittingWork}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full border border-[#111111]/15 bg-white px-5 py-3 text-sm font-semibold text-[#111111] disabled:opacity-50"
                >
                  {isSubmittingWork ? "กำลังส่ง..." : "ถ่ายรูปส่งงาน"}
                </button>
                <button type="button" disabled={isActing} onClick={() => void act("complete")} className="rounded-full bg-[#121212] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">เสร็จสิ้นภารกิจ</button>
              </>
            )}
          </div>
        )}
        {errorMessage && <p className="mt-4 text-right text-sm text-red-600">{errorMessage}</p>}
      </div>
    </main>
  )
}
