"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import Link from "next/link"
import { Check } from "lucide-react"

export default function GroupMissionPage() {

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
            <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#121212]">ภารกิจกลุ่ม</h1>
          </div>
          <div className="w-20" />
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
          <div className="mb-4 inline-flex rounded-full border border-[#AFFF00]/70 bg-[#AFFF00] px-3 py-1 text-xs font-semibold text-[#121212]">
            โหมดทีม
          </div>
          <h2 className="text-2xl font-bold tracking-[-0.04em] text-[#121212]">สร้างความท้าทายสำหรับกลุ่มของคุณ</h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            ร่วมมือกับเพื่อน กำหนดจุดตรวจสอบ และทำภารกิจร่วมกันด้วยความรับผิดชอบที่แน่นแฟ้น
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              { label: "ทีมงาน", value: "ทำงานร่วมกับเพื่อน", href: "/work-team-mission" },
              { label: "GPS Check", value: "ติดตามความคืบหน้าร่วมกัน", href: "/gps-check-mission?mode=group" },
            ].map((item) => (
              <Link href={item.href ?? "/missions"} key={item.label} className="rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] p-4 transition hover:border-[#AFFF00]/50 hover:bg-[#AFFF00]/10">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#121212]"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#AFFF00]"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>{item.label}</div>
                <div className="mt-1 text-xs text-gray-600">{item.value}</div>
              </Link>
            ))}
          </div>

          <div className="mt-8 flex justify-end">
            <Link href="/missions" className="rounded-full bg-[#121212] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2f2f2f]">ดำเนินการต่อ</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
