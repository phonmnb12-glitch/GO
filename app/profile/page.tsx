"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function ProfilePage() {
  const [profile, setProfile] = useState<{ name?: string; email?: string; friend_id?: string } | null>(null)

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase.from("profiles").select("name, email, friend_id").eq("user_id", user.id).maybeSingle()
      if (error) {
        console.error("[Supabase] Profile load failed", error)
        return
      }
      setProfile(data)
    }
    void loadProfile()
  }, [])

  const initials = (profile?.name ?? "?").trim().slice(0, 2).toUpperCase()

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
      <DashboardNav />

      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">บัญชีของฉัน</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#121212]">โปรไฟล์</h1>

        <div className="mt-6 rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
          {profile ? (
            <>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#121212] to-[#555] text-lg font-bold text-white">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold text-[#121212]">{profile.name}</div>
                  <div className="truncate text-sm text-gray-500">{profile.email}</div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] p-4">
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500">Friend ID</div>
                <div className="mt-1 text-sm font-semibold text-[#121212]">{profile.friend_id}</div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">กำลังโหลดข้อมูลโปรไฟล์...</p>
          )}

          <div className="mt-6 flex items-center gap-3 border-t border-[#121212]/10 pt-5">
            <Link href="/profile/settings" className="rounded-full bg-[#AFFF00] px-5 py-2.5 text-sm font-semibold text-[#121212] transition hover:bg-[#baff36]">การตั้งค่า</Link>
            <Link href="/dashboard" className="text-sm font-medium text-gray-600 transition hover:text-[#121212]">← กลับไปที่ Dashboard</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
