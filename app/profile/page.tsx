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

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <DashboardNav />

      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-2xl font-bold">โปรไฟล์</h1>
        <p className="mt-2 text-sm text-gray-600">{profile?.name ?? "กำลังโหลดข้อมูลโปรไฟล์..."}</p>
        {profile && <div className="mt-4 space-y-1 text-sm text-gray-600"><div>{profile.email}</div><div>Friend ID: {profile.friend_id}</div></div>}

        <div className="mt-6 space-x-3">
          <Link href="/profile/settings" className="text-sm text-[#AFFF00]">การตั้งค่า</Link>
          <Link href="/dashboard" className="text-sm text-gray-600">← กลับไปที่ Dashboard</Link>
        </div>
      </div>
    </main>
  )
}
