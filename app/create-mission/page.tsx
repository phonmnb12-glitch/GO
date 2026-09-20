"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Bell, Check, Search, X } from "lucide-react"
import { useEffect, useState } from "react"

type FriendSummary = {
  userId: string
  friendId: string
  name: string
  online: boolean
}

const missionCards = [
  {
    title: "โซโล",
    description: "ทำภารกิจด้วยตนเอง",
    features: ["Photo AI", "วิดีโอ Timelapse", "GPS Check"],
    buttonText: "สร้างภารกิจโซโล",
    href: "/solo-mission",
    accent: "from-[#AFFF00] to-[#d8ff7a]",
  },
  {
    title: "กลุ่ม",
    description: "ทำภารกิจร่วมกับเพื่อนของคุณ",
    features: ["Work Team", "GPS Check"],
    buttonText: "สร้างภารกิจกลุ่ม",
    href: "/group-mission",
    accent: "from-[#121212] to-[#3c3c3c]",
  },
]

export default function CreateMissionPage() {
  const [isFriendsOpen, setIsFriendsOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [friends, setFriends] = useState<FriendSummary[]>([])

  useEffect(() => {
    const loadFriends = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setFriends([])
        return
      }

      const { data: friendships, error: friendshipsError } = await supabase
        .from("friendships")
        .select("friend_id")
        .eq("user_id", user.id)
        .eq("status", "accepted")

      if (friendshipsError || !friendships?.length) {
        setFriends([])
        return
      }

      const friendIds = friendships.map((friend) => friend.friend_id)
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", friendIds)

      const nextFriends = (profiles ?? []).map((profile) => ({
        userId: profile.user_id,
        friendId: profile.user_id,
        name: profile.name ?? "ผู้ใช้",
        online: false,
      }))

      setFriends(profilesError ? [] : nextFriends)
    }

    void loadFriends()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFriendsOpen(false)
        setIsNotificationsOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
      <DashboardNav
        onOpenAddFriends={() => setIsFriendsOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
      />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 transition hover:text-[#121212]">
            <ArrowLeft className="h-4 w-4" />
            กลับ
          </Link>

          <div className="text-center">
            <h1 className="text-3xl font-black tracking-[-0.06em] text-[#121212]">สร้างภารกิจ</h1>
            <p className="mt-2 text-sm text-gray-600">เลือกวิธีที่คุณต้องการจะทำภารกิจ</p>
          </div>

          <div className="w-[82px]" />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {missionCards.map((card) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl"
            >
              <div className={`mb-5 inline-flex rounded-full bg-gradient-to-r ${card.accent} px-3 py-1 text-xs font-semibold text-[#121212]`}>
                {card.title}
              </div>

              <h2 className="text-2xl font-bold tracking-[-0.04em] text-[#121212]">{card.title}</h2>
              <p className="mt-2 text-sm text-gray-600">{card.description}</p>

              <div className="mt-5 space-y-2">
                {card.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#AFFF00] text-[#121212]"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                    {feature}
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Link
                  href={card.href}
                  className="inline-flex rounded-full bg-[#AFFF00] px-5 py-3 text-sm font-semibold text-[#121212] shadow-[0_18px_30px_rgba(175,255,0,0.25)] transition hover:bg-[#baff36]"
                >
                  {card.buttonText}
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 text-center text-sm text-gray-600">
          ทำการมัดจำ เสร็จภารกิจแล้ว และรับเงินคืนกลับมา
        </div>
      </div>

      <AnimatePresence>
        {isFriendsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#121212]/30 backdrop-blur-[2px]"
            onClick={() => setIsFriendsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
              className="relative w-full max-w-2xl rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_30px_80px_rgba(18,18,18,0.22)] backdrop-blur-2xl"
            >
              <button
                type="button"
                aria-label="Close friends popup"
                onClick={() => setIsFriendsOpen(false)}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[#121212]/10 bg-white text-[#121212] transition hover:bg-[#121212]/5"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="text-2xl font-bold tracking-[-0.04em] text-[#121212]">เพื่อน</h2>
              <p className="mt-1 text-sm text-gray-600">จัดการเพื่อนและการเชื่อมต่อของคุณ</p>

              <div className="mt-6">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="กรอก Friend ID"
                    className="flex-1 rounded-2xl border border-[#121212]/10 bg-[#f6f6f5] px-4 py-3 text-sm text-[#121212] outline-none placeholder:text-gray-400 focus:border-[#AFFF00]"
                  />
                  <button type="button" className="rounded-full bg-[#AFFF00] px-4 py-3 text-sm font-semibold text-[#121212]">
                    ค้นหา
                  </button>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#121212]">เพื่อนของฉัน</h3>
                <span className="rounded-full bg-[#AFFF00]/15 px-2 py-1 text-[11px] font-medium text-[#121212]">{friends.length}</span>
              </div>

              <div className="mt-3 space-y-3">
                {friends.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#121212]/15 bg-[#f8f8f7] p-6 text-center text-sm text-gray-600">
                    ยังไม่มีเพื่อน
                  </div>
                ) : (
                  friends.map((friend) => (
                    <div key={friend.userId} className="flex items-center gap-3 rounded-2xl border border-[#121212]/10 bg-[#f8f8f7] p-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#121212] to-[#555] text-sm font-bold text-white">
                        {friend.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[#121212]">{friend.name}</div>
                        <div className="text-sm text-gray-500">{friend.friendId}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${friend.online ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                          {friend.online ? "ออนไลน์" : "ออฟไลน์"}
                        </span>
                        <button type="button" className="rounded-full border border-[#121212]/10 bg-white px-3 py-2 text-sm font-semibold text-[#121212]">
                          เชิญ
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNotificationsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-end bg-[#121212]/10 backdrop-blur-[1px]"
            onClick={() => setIsNotificationsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, x: 24, y: -8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 24, y: -8 }}
              onClick={(event) => event.stopPropagation()}
              className="relative mt-4 mr-6 w-full max-w-md rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_30px_80px_rgba(18,18,18,0.22)] backdrop-blur-2xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#121212]/10 pb-3">
                <h2 className="text-xl font-bold tracking-[-0.04em] text-[#121212]">การแจ้งเตือน</h2>
                <button type="button" className="text-xs font-medium text-[#121212] underline-offset-2 hover:underline">
                  ทำเครื่องหมายว่าอ่านแล้วทั้งหมด
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {[
                  { title: "ภารกิจของคุณจะเริ่มใน 5 นาที", subtitle: "Read 20 pages before lunch", time: "5 นาทีที่แล้ว", unread: true },
                  { title: "คุณได้รับคำเชิญเข้าร่วมภารกิจกลุ่ม", subtitle: "Morning Run Challenge · โดย Ethan", time: "12 นาทีที่แล้ว", unread: true },
                  { title: "ชำระเงินมัดจำสำเร็จ", subtitle: "ภารกิจ: Morning Run Challenge", time: "1 ชั่วโมงที่แล้ว", unread: false },
                ].map((item, index) => (
                  <div key={index} className={`rounded-2xl border p-3 ${item.unread ? "border-[#AFFF00]/40 bg-[#AFFF00]/8" : "border-[#121212]/10 bg-[#f8f8f7]"}`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#121212] shadow-sm">
                        {item.unread ? <Bell className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium text-[#121212]">{item.title}</div>
                          {item.unread && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#AFFF00]" />}
                        </div>
                        <div className="mt-1 text-xs text-gray-600">{item.subtitle}</div>
                        <div className="mt-2 text-[11px] text-gray-500">{item.time}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
