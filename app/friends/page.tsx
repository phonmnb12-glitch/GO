"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import Link from "next/link"

export default function FriendsPage() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <DashboardNav />

      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-2xl font-bold">เพื่อน</h1>
        <p className="mt-2 text-sm text-gray-600">รายการเพื่อนยังอยู่ในระหว่างพัฒนา</p>

        <div className="mt-6">
          <Link href="/dashboard" className="text-sm text-[#AFFF00]">← กลับไปที่ Dashboard</Link>
        </div>
      </div>
    </main>
  )
}
