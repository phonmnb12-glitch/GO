"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { useState } from "react"

const soloMissionTypes = [
  { key: "photo-ai", label: "Photo AI", description: "ใช้การยืนยันภาพ", href: "/create-photo-ai" },
  { key: "timelapse", label: "วิดีโอ Timelapse", description: "บันทึกความก้าวหน้า", href: "/create-timelapse-video" },
  { key: "gps-check", label: "GPS Check", description: "ติดตามเส้นทางของคุณ", href: "/gps-check-mission" },
]

export default function SoloMissionPage() {
  const router = useRouter()
  const [selectedType, setSelectedType] = useState<string | null>(null)

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
      <DashboardNav />

      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/create-mission" className="text-sm font-medium text-gray-600 transition hover:text-[#121212]">
            ← กลับ
          </Link>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">ประเภทภารกิจ</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#121212]">ภารกิจโซโล</h1>
          </div>
          <div className="w-20" />
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
          <div className="mb-4 inline-flex rounded-full border border-[#AFFF00]/70 bg-[#AFFF00] px-3 py-1 text-xs font-semibold text-[#121212]">
            พร้อมเริ่ม
          </div>
          <h2 className="text-2xl font-bold tracking-[-0.04em] text-[#121212]">สร้างความท้าทายโซโลของคุณ</h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            กำหนดเป้าหมาย ติดตามความก้าวหน้า และทำภารกิจให้สำเร็จด้วยการยืนยันภาพ วิดีโอ หรือ GPS
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {soloMissionTypes.map((type) => {
              const isSelected = selectedType === type.key
              return (
                <button
                  key={type.key}
                  type="button"
                  onClick={() => setSelectedType(type.key)}
                  className={`rounded-2xl border p-4 text-left transition ${isSelected ? "border-[#AFFF00] bg-[#AFFF00]/15" : "border-[#121212]/10 bg-[#f9f9f8] hover:border-[#AFFF00]/40 hover:bg-[#AFFF00]/10"}`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#121212]"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#AFFF00]"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>{type.label}</div>
                  <div className="mt-1 text-xs text-gray-600">{type.description}</div>
                </button>
              )
            })}
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              disabled={!selectedType}
              onClick={() => {
                const type = soloMissionTypes.find((item) => item.key === selectedType)
                if (type) router.push(type.href)
              }}
              className="rounded-full bg-[#121212] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2f2f2f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              ดำเนินการต่อ
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
