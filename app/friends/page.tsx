"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type FriendProfile = { user_id: string; name: string | null; friend_id: string | null }

export default function FriendsPage() {
  const [myFriendId, setMyFriendId] = useState<string | null>(null)
  const [friends, setFriends] = useState<FriendProfile[]>([])
  const [incoming, setIncoming] = useState<FriendProfile[]>([])
  const [outgoing, setOutgoing] = useState<FriendProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [codeInput, setCodeInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [sendMessage, setSendMessage] = useState("")
  const [sendError, setSendError] = useState("")
  const [respondingTo, setRespondingTo] = useState<string | null>(null)

  const loadFriends = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: myProfile } = await supabase.from("profiles").select("friend_id").eq("user_id", user.id).maybeSingle()
      setMyFriendId(myProfile?.friend_id ?? null)

      const { data: rows, error } = await supabase
        .from("friendships")
        .select("user_id, friend_id, status")
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      if (error) throw error

      const otherIds = Array.from(new Set((rows ?? []).map((row) => (row.user_id === user.id ? row.friend_id : row.user_id))))
      const { data: profiles } = otherIds.length
        ? await supabase.from("profiles").select("user_id, name, friend_id").in("user_id", otherIds)
        : { data: [] as FriendProfile[] }
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]))

      const nextFriends: FriendProfile[] = []
      const nextIncoming: FriendProfile[] = []
      const nextOutgoing: FriendProfile[] = []

      for (const row of rows ?? []) {
        const isMeRequester = row.user_id === user.id
        const otherId = isMeRequester ? row.friend_id : row.user_id
        const profile = profileMap.get(otherId) ?? { user_id: otherId, name: null, friend_id: null }

        if (row.status === "accepted") {
          nextFriends.push(profile)
        } else if (row.status === "pending") {
          if (isMeRequester) nextOutgoing.push(profile)
          else nextIncoming.push(profile)
        }
      }

      setFriends(nextFriends)
      setIncoming(nextIncoming)
      setOutgoing(nextOutgoing)
    } catch (error) {
      console.error("[Supabase] Friends load failed", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadFriends()
  }, [])

  const sendFriendRequest = async () => {
    setSendError("")
    setSendMessage("")
    const code = codeInput.trim()
    if (!code) {
      setSendError("กรุณากรอก Friend ID")
      return
    }

    setIsSending(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("กรุณาเข้าสู่ระบบก่อน")

      if (myFriendId && code === myFriendId) {
        throw new Error("ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้")
      }

      const { data: matches, error: lookupError } = await supabase.rpc("find_user_by_friend_id", { target_friend_id: code })
      if (lookupError) throw lookupError
      const target = matches?.[0] as { user_id: string; name: string | null } | undefined
      if (!target) throw new Error("ไม่พบ Friend ID นี้ในระบบ")
      if (target.user_id === user.id) throw new Error("ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้")

      const alreadyRelated = [...friends, ...incoming, ...outgoing].some((profile) => profile.user_id === target.user_id)
      if (alreadyRelated) throw new Error("มีความสัมพันธ์กับผู้ใช้นี้อยู่แล้ว")

      const { error: insertError } = await supabase.from("friendships").insert({
        user_id: user.id,
        friend_id: target.user_id,
        status: "pending",
      })
      if (insertError) throw insertError

      setSendMessage(`ส่งคำขอเป็นเพื่อนถึง ${target.name ?? "ผู้ใช้นี้"} แล้ว`)
      setCodeInput("")
      await loadFriends()
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถส่งคำขอเป็นเพื่อนได้"
      setSendError(message)
    } finally {
      setIsSending(false)
    }
  }

  const respondToRequest = async (requesterId: string, response: "accepted" | "declined") => {
    setRespondingTo(requesterId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from("friendships")
        .update({ status: response, accepted_at: response === "accepted" ? new Date().toISOString() : null })
        .eq("user_id", requesterId)
        .eq("friend_id", user.id)
      if (error) throw error

      await loadFriends()
    } catch (error) {
      console.error("[Supabase] Friend request response failed", error)
    } finally {
      setRespondingTo(null)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <DashboardNav />

      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-2xl font-bold">เพื่อน</h1>
        <p className="mt-2 text-sm text-gray-600">
          Friend ID ของคุณ: <span className="font-semibold text-gray-900">{myFriendId ?? "..."}</span> (ส่งให้เพื่อนเพื่อให้เขาเพิ่มคุณ)
        </p>

        <div className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">เพิ่มเพื่อนด้วย Friend ID</div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value)}
              placeholder="กรอก Friend ID ของเพื่อน"
              className="flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-[#121212] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void sendFriendRequest()}
              disabled={isSending}
              className="rounded-2xl bg-[#121212] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSending ? "กำลังส่ง..." : "ส่งคำขอ"}
            </button>
          </div>
          {(sendMessage || sendError) && (
            <div className={`mt-3 rounded-2xl border px-4 py-2.5 text-sm ${sendError ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
              {sendError || sendMessage}
            </div>
          )}
        </div>

        {incoming.length > 0 && (
          <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-gray-900">คำขอเป็นเพื่อน</div>
            <div className="mt-3 space-y-3">
              {incoming.map((profile) => (
                <div key={profile.user_id} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{profile.name ?? "ผู้ใช้ไม่ระบุชื่อ"}</div>
                    <div className="text-xs text-gray-500">{profile.friend_id}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void respondToRequest(profile.user_id, "accepted")}
                      disabled={respondingTo === profile.user_id}
                      className="rounded-xl bg-[#AFFF00] px-3 py-2 text-xs font-semibold text-[#121212] disabled:opacity-50"
                    >
                      ตอบรับ
                    </button>
                    <button
                      type="button"
                      onClick={() => void respondToRequest(profile.user_id, "declined")}
                      disabled={respondingTo === profile.user_id}
                      className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"
                    >
                      ปฏิเสธ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">เพื่อนของฉัน {friends.length > 0 && `(${friends.length})`}</div>
          <div className="mt-3 space-y-2">
            {isLoading ? (
              <p className="text-sm text-gray-500">กำลังโหลด...</p>
            ) : friends.length === 0 ? (
              <p className="text-sm text-gray-500">ยังไม่มีเพื่อน</p>
            ) : (
              friends.map((profile) => (
                <div key={profile.user_id} className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#121212] to-[#555] text-xs font-bold text-white">
                    {(profile.name ?? "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{profile.name ?? "ผู้ใช้ไม่ระบุชื่อ"}</div>
                    <div className="text-xs text-gray-500">{profile.friend_id}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {outgoing.length > 0 && (
          <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-gray-900">รอการตอบรับ</div>
            <div className="mt-3 space-y-2">
              {outgoing.map((profile) => (
                <div key={profile.user_id} className="flex items-center justify-between rounded-2xl bg-gray-50 p-3 text-sm text-gray-700">
                  <span>{profile.name ?? "ผู้ใช้ไม่ระบุชื่อ"}</span>
                  <span className="text-xs text-gray-500">รอการตอบรับ...</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link href="/dashboard" className="text-sm text-[#AFFF00]">← กลับไปที่ Dashboard</Link>
        </div>
      </div>
    </main>
  )
}
