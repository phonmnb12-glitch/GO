"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import { useAuth } from "@/components/auth-provider"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { type Mission } from "@/lib/missions"
import { supabase } from "@/lib/supabase"
import { mapWorkTeamMission } from "@/lib/work-team-client"

const tabs = ["All", "In Progress", "Upcoming", "Completed", "Failed"] as const

type Tab = (typeof tabs)[number]

export default function MissionsPage() {
  const router = useRouter()
  const { session, isLoading: authLoading } = useAuth()
  const [missions, setMissions] = useState<Mission[]>([])
  const [activeTab, setActiveTab] = useState<Tab>("All")

  useEffect(() => {
    if (!session || authLoading) return

    const syncMissions = async () => {
      const response = await fetch("/api/work-team", { headers: { Authorization: `Bearer ${session.access_token}` } })
      const result = await response.json() as { missions?: Array<Parameters<typeof mapWorkTeamMission>[0]> }
      setMissions((result.missions ?? []).map(mapWorkTeamMission))
    }

    void syncMissions()
    const timer = window.setInterval(() => void syncMissions(), 5000)

    return () => window.clearInterval(timer)
  }, [authLoading, session])

  const filteredMissions = useMemo(() => {
    const visibleMissions = missions.filter((mission) => mission.missionType !== "Group" || mission.groupMissionLifecycle !== "Cancelled")
    if (activeTab === "All") return visibleMissions
    return visibleMissions.filter((mission) => mission.status === activeTab)
  }, [missions, activeTab])

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
      <DashboardNav />

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">ศูนย์ภารกิจ</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#121212]">ภารกิจ</h1>
          </div>
          <Link href="/dashboard" className="rounded-full border border-[#121212]/10 bg-white/70 px-4 py-2 text-sm font-medium text-[#121212] transition hover:bg-white">
            กลับไปที่ Dashboard
          </Link>
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/70 p-4 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab
                    ? "bg-[#AFFF00] text-[#121212]"
                    : "border border-[#121212]/10 bg-[#f9f9f8] text-gray-600 hover:border-[#AFFF00]/40"
                }`}
              >
                {tab === "All" ? "ทั้งหมด" : tab === "In Progress" ? "กำลังดำเนินการ" : tab === "Upcoming" ? "กำลังจะเกิดขึ้น" : tab === "Completed" ? "เสร็จสิ้น" : "ล้มเหลว"}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {filteredMissions.length > 0 ? (
              filteredMissions.map((mission) => (
                <button
                  key={mission.id}
                  type="button"
                  onClick={() => router.push(mission.verificationType === "Timelapse Video" ? `/timelapse-mission/${mission.id}` : `/work-team-mission/${mission.id}`)}
                  className="block w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] p-4 text-left transition hover:border-[#AFFF00]/40 hover:bg-[#AFFF00]/5"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-lg font-bold text-[#121212]">{mission.missionName}</div>
                      <div className="mt-1 text-sm text-gray-600">{mission.verificationType} · {mission.category}</div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-[#AFFF00]/20 px-2.5 py-1 text-xs font-semibold text-[#121212]">{mission.status}</span>
                      <span className="text-sm font-semibold text-[#121212]">฿{mission.pledgeAmount}</span>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[#121212]/20 bg-white/40 p-6 text-center text-sm text-gray-600">
                ยังไม่มีภารกิจในหมวดนี้
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
