"use client"

import Link from "next/link"
import { DashboardNav } from "@/components/dashboard-nav"

export default function ActiveMissionPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
      <DashboardNav />

      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="text-sm font-medium text-gray-600 transition hover:text-[#121212]">
            ← กลับไปยัง Dashboard
          </Link>

          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">สถานะภารกิจ</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#121212]">ภารกิจที่กำลังทำอยู่</h1>
          </div>

          <div className="w-24" />
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
          <div className="space-y-4">
            <p className="text-lg font-semibold text-[#121212]">ยังไม่มีภารกิจที่กำลังทำอยู่</p>
            <p className="text-sm text-gray-600">ข้อมูลภารกิจที่แสดงจะมาจาก Supabase เท่านั้น</p>
            <Link
              href="/missions"
              className="inline-flex items-center rounded-full bg-[#AFFF00] px-5 py-3 text-sm font-semibold text-[#121212] transition hover:bg-[#baff36]"
            >
              ดูภารกิจทั้งหมด
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
