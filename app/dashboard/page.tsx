"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import MissionCreatedPopup from "@/components/mission-created-popup"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Bell, Check, CircleAlert, Clock3, CreditCard, Search, ShieldAlert, User, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { getTimelapseDisplayStatus, type Mission, type MissionNotification } from "@/lib/missions"
import { supabase } from "@/lib/supabase"
import { mapWorkTeamMission, mapWorkTeamNotification } from "@/lib/work-team-client"

function StatCard({ title, value, i }: { title: string; value: React.ReactNode; i: number }) {
  const isActivePledge = title === "เงินมัดจำที่ใช้งาน"

  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: i * 0.08 }}
      whileHover={{ y: -4, scale: 1.01 }}
      className={`card relative overflow-hidden border p-0 ${isActivePledge ? "border-white/60 bg-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_18px_35px_rgba(18,18,18,0.08)] backdrop-blur-xl" : "border-white/70 bg-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_25px_rgba(18,18,18,0.04)] backdrop-blur-xl"}`}
    >
      {isActivePledge ? (
        <div className="bg-white/20 px-4 py-4">
          <div className="text-sm font-medium text-gray-600">{title}</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
        </div>
      ) : (
        <>
          <div className="px-4 py-4">
            <div className="text-sm font-medium text-gray-500">{title}</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
          </div>
        </>
      )}
    </motion.div>
  )
}

function MissionCard({ mission }: { mission: Mission }) {
  const router = useRouter()
  const [now, setNow] = useState(0)

  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const isGpsFinalWindow = mission.verificationType === "GPS Check"
    && now >= new Date(mission.endTime).getTime() - 30 * 60 * 1000
    && now < new Date(mission.endTime).getTime()
  const displayedAsActive = mission.status === "In Progress" || isGpsFinalWindow
  const timeRemaining = (() => {
    const start = new Date(mission.startTime).getTime()
    const end = new Date(mission.endTime).getTime()

    if (!displayedAsActive) {
      const diff = Math.max(0, start - now)
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      return hours > 0 ? `เริ่มใน ${hours} ชั่วโมง ${minutes} นาที` : `เริ่มใน ${minutes} นาที`
    }

    const diff = Math.max(0, end - now)
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) return `เหลือ ${hours} ชั่วโมง ${minutes} นาที`
    return `เหลือ ${minutes} นาที`
  })()

  return (
    <motion.div
      initial={{ scale: 0.995, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.28 }}
      whileHover={{ y: -3 }}
      onClick={() => router.push(mission.verificationType === "Work Team" ? `/work-team-mission/${mission.id}` : `/missions/${mission.id}`)}
      className="card-strong relative cursor-pointer overflow-hidden border border-white/60 bg-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_28px_rgba(18,18,18,0.06)] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-4 px-3">
        <div>
          <div className="text-[1.04rem] font-semibold leading-snug text-[#121212] md:text-lg">{mission.missionName}</div>
          <div className="mt-1 text-sm text-gray-500">{mission.missionType} · {mission.verificationType}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] tracking-[0.02em] text-gray-400 md:text-xs">เงินมัดจำ</div>
          <div className="mt-1 text-sm font-semibold text-[#121212]">฿{mission.pledgeAmount}</div>
          <div className="mt-2 text-[11px] text-gray-600 md:text-xs">{timeRemaining}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between px-3">
        <div className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">{mission.verificationType === "Timelapse Video" ? getTimelapseDisplayStatus(mission, now) : displayedAsActive ? "กำลังดำเนินการ" : mission.status === "Completed" ? "เสร็จสิ้น" : mission.status === "Failed" ? "ล้มเหลว" : mission.status === "Upcoming" ? "กำลังจะเกิดขึ้น" : "กำลังดำเนินการ"}</div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            router.push(mission.verificationType === "Work Team" ? `/work-team-mission/${mission.id}` : `/missions/${mission.id}`)
          }}
          className="rounded-md bg-[#121212] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]"
        >
          ดูรายละเอียด
        </button>
      </div>
    </motion.div>
  )
}

type FriendItem = {
  id: string
  name: string
  friendId: string
  avatar: string
  online: boolean
}

type NotificationFilter = "All" | "Mission" | "Payment" | "Friends" | "Group"

export default function DashboardPage() {
  const { session, isLoading: authLoading } = useAuth()
  const [refreshRequired, setRefreshRequired] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [isProfileLoading, setIsProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [isAddFriendsOpen, setIsAddFriendsOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [friendSearchInput, setFriendSearchInput] = useState("")
  const [searchedUser, setSearchedUser] = useState<{ id: string; name: string; friendId: string; avatar: string } | null>(null)
  const [searchResultMessage, setSearchResultMessage] = useState<string | null>(null)
  const [sentRequests, setSentRequests] = useState<string[]>([])
  const [missions, setMissions] = useState<Mission[]>([])
  const [notifications, setNotifications] = useState<MissionNotification[]>([])
  const [createdGroupMission, setCreatedGroupMission] = useState<string | null>(null)
  const notificationCountRef = useRef<number | null>(null)
  const [currentTime, setCurrentTime] = useState(0)

  const [myFriends, setMyFriends] = useState<FriendItem[]>([])
  const [friendRequests, setFriendRequests] = useState<FriendItem[]>([])

  useEffect(() => {
    if (!session || authLoading) return

    let isMounted = true

    const loadProfile = async () => {
      setIsProfileLoading(true)
      setProfileError(null)

      const { data: profile, error: profileLoadError } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", session.user.id)
        .maybeSingle()

      if (!isMounted) return

      if (profileLoadError || !profile?.name) {
        setProfileError("Unable to load your profile.")
        setIsProfileLoading(false)
        return
      }

      setUsername(profile.name)
      setIsProfileLoading(false)
    }

    void loadProfile()

    return () => {
      isMounted = false
    }
  }, [authLoading, session])

  useEffect(() => {
    setCurrentTime(Date.now())
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    setRefreshRequired(new URLSearchParams(window.location.search).get("refresh") === "1")
  }, [])

  useEffect(() => {
    if (!session || authLoading) return

    let isMounted = true

    const syncMissions = async () => {
      const [missionsResponse, notificationsResponse] = await Promise.all([
        fetch("/api/work-team", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch("/api/work-team?notifications=1", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ])

      if (!isMounted) return

      const missionResult = await missionsResponse.json() as { missions?: Array<Parameters<typeof mapWorkTeamMission>[0]>; friends?: Array<{ user_id: string; name?: string; friend_id?: string }> }
      const notificationResult = await notificationsResponse.json() as { notifications?: Array<Parameters<typeof mapWorkTeamNotification>[0]> }
      setMissions((missionResult.missions ?? []).map(mapWorkTeamMission))
      setNotifications((notificationResult.notifications ?? []).map(mapWorkTeamNotification).slice(0, 5))
      setMyFriends((missionResult.friends ?? []).map((friend) => ({
        id: friend.user_id,
        name: friend.name ?? friend.user_id,
        friendId: friend.friend_id ?? friend.user_id,
        avatar: (friend.name ?? "?").slice(0, 2).toUpperCase(),
        online: false,
      })))

      // Incoming pending friend requests -- same query the real /friends
      // page uses. This popup never fetched these before, so the "friend
      // requests" section always showed empty regardless of reality.
      const { data: pendingRows } = await supabase
        .from("friendships")
        .select("user_id, status")
        .eq("friend_id", session.user.id)
        .eq("status", "pending")
      const requesterIds = (pendingRows ?? []).map((row) => row.user_id)
      const { data: requesterProfiles } = requesterIds.length
        ? await supabase.from("profiles").select("user_id, name, friend_id").in("user_id", requesterIds)
        : { data: [] as { user_id: string; name: string | null; friend_id: string | null }[] }
      setFriendRequests((requesterProfiles ?? []).map((profile) => ({
        id: profile.user_id,
        name: profile.name ?? profile.user_id,
        friendId: profile.friend_id ?? profile.user_id,
        avatar: (profile.name ?? "?").slice(0, 2).toUpperCase(),
        online: false,
      })))
    }

    void syncMissions()

    if (refreshRequired) {
      window.history.replaceState({}, "", "/dashboard")
    }

    const handleFocus = () => {
      void syncMissions()
    }

    const timer = window.setInterval(() => void syncMissions(), 5000)
    window.addEventListener("focus", handleFocus)

    return () => {
      isMounted = false
      window.clearInterval(timer)
      window.removeEventListener("focus", handleFocus)
    }
  }, [authLoading, refreshRequired, session])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAddFriendsOpen(false)
        setIsNotificationsOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleSearchFriend = async () => {
    const query = friendSearchInput.trim()
    if (!query) {
      setSearchedUser(null)
      setSearchResultMessage("ไม่พบผู้ใช้")
      return
    }

    const { data: matches, error } = await supabase.rpc("find_user_by_friend_id", { target_friend_id: query })
    const target = (matches as { user_id: string; name: string | null }[] | null)?.[0]
    if (error || !target) {
      setSearchedUser(null)
      setSearchResultMessage("ไม่พบผู้ใช้")
      return
    }

    setSearchedUser({
      id: target.user_id,
      name: target.name ?? query,
      friendId: query,
      avatar: (target.name ?? "?").slice(0, 2).toUpperCase(),
    })
    setSearchResultMessage(null)
  }

  const handleSendRequest = async (user: { id: string; name: string; friendId: string; avatar: string }) => {
    if (!session) return
    const { error } = await supabase.from("friendships").insert({
      user_id: session.user.id,
      friend_id: user.id,
      status: "pending",
    })
    if (error) {
      setSearchResultMessage(error.message)
      return
    }
    setSentRequests((current) =>
      current.includes(user.friendId) ? current : [...current, user.friendId],
    )
  }

  const handleAcceptRequest = async (id: string) => {
    if (!session) return
    const acceptedFriend = friendRequests.find((request) => request.id === id)
    if (!acceptedFriend) return

    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("user_id", id)
      .eq("friend_id", session.user.id)
    if (error) return

    setMyFriends((current) => {
      const alreadyExists = current.some((friend) => friend.friendId === acceptedFriend.friendId)
      return alreadyExists ? current : [...current, acceptedFriend]
    })
    setFriendRequests((current) => current.filter((request) => request.id !== id))
  }

  const handleDeclineRequest = async (id: string) => {
    if (!session) return
    await supabase
      .from("friendships")
      .update({ status: "declined" })
      .eq("user_id", id)
      .eq("friend_id", session.user.id)
    setFriendRequests((current) => current.filter((request) => request.id !== id))
  }

  const handleNotificationAction = (item: MissionNotification) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === item.id ? { ...notification, unread: false } : notification,
      ),
    )

    void supabase.auth.getUser().then(({ data: authData }) => {
      if (!authData.user) return
      return supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("user_id", authData.user.id)
    })

    if (item.type === "mission" && item.missionId) {
      window.location.href = `/missions/${item.missionId}`
    }

    if (item.type === "payment" && item.missionId) {
      window.location.href = `/missions/${item.missionId}`
    }
  }

  const handleGroupInvitationResponse = async (item: MissionNotification, response: "accept" | "decline") => {
    if (!item.missionId) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    if (item.eventType === "group_invitation") {
      await fetch(`/api/work-team/${item.missionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: response }),
      })
      setNotifications((current) => current.filter((notification) => notification.id !== item.id))
      return
    }

    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", item.id).eq("user_id", session.user.id)
    setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, unread: false } : notification))
  }

  const handleMarkAllNotificationsAsRead = async () => {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) return
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", authData.user.id).is("read_at", null)
    setNotifications((current) => current.map((notification) => ({ ...notification, unread: false })))
  }

  const now = currentTime
  const isGpsBeforeEnd = (mission: Mission) => mission.verificationType === "GPS Check"
    && new Date(mission.endTime).getTime() > now
  const isGpsInFinalWindow = (mission: Mission) => isGpsBeforeEnd(mission)
    && now >= new Date(mission.endTime).getTime() - 30 * 60 * 1000
  const isVisibleGroupMission = (mission: Mission) => mission.missionType !== "Group" || mission.groupMissionLifecycle !== "Cancelled"
  const inProgressMissions = missions.filter((mission) =>
    isVisibleGroupMission(mission) && (
      mission.status === "In Progress" && mission.verificationType !== "GPS Check"
      || isGpsInFinalWindow(mission)
    ),
  )
  const upcomingMissions = missions.filter((mission) =>
    isVisibleGroupMission(mission) && (mission.verificationType === "GPS Check"
      ? isGpsBeforeEnd(mission) && !isGpsInFinalWindow(mission)
      : mission.status === "Upcoming"),
  )
  const completedMissions = missions.filter((mission) => mission.status === "Completed")

  const stats = [
    { id: 1, title: "เงินมัดจำที่ใช้งาน", value: `฿${inProgressMissions.reduce((sum, mission) => sum + mission.pledgeAmount, 0)}` },
    { id: 2, title: "กำลังดำเนินการ", value: inProgressMissions.length },
    { id: 3, title: "เสร็จสิ้น", value: completedMissions.length },
  ]

  const activeMissions = inProgressMissions
  const notificationsToShow = notifications

  useEffect(() => {
    if (notificationCountRef.current === null) {
      notificationCountRef.current = notificationsToShow.length
      return
    }

    if (notificationsToShow.length > notificationCountRef.current) {
      const playBell = () => {
        const audioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

        if (!audioContextClass) return

        const audioContext = new audioContextClass()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.type = "sine"
        oscillator.frequency.value = 880
        gainNode.gain.value = 0.08

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.start()

        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35)
        oscillator.stop(audioContext.currentTime + 0.35)

        setTimeout(() => {
          void audioContext.close()
        }, 400)
      }

      playBell()
    }

    notificationCountRef.current = notificationsToShow.length
  }, [notificationsToShow.length])

  const upcoming = upcomingMissions.slice(0, 3).map((mission) => ({
    id: mission.id,
    title: mission.missionName,
    date: new Date(mission.startTime).toLocaleDateString("th-TH", { dateStyle: "medium" }),
    time: new Date(mission.startTime).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
  }))

  const recentActivities = notificationsToShow.slice(0, 5)

  const notificationToneClasses = {
    success: "border-green-200 bg-green-50/80",
    failed: "border-red-200 bg-red-50/80",
    warning: "border-yellow-200 bg-yellow-50/90",
    info: "border-blue-200 bg-blue-50/80",
    processing: "border-orange-200 bg-orange-50/80",
  } as const

  const notificationIconClasses = {
    success: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-600",
    warning: "bg-yellow-100 text-yellow-700",
    info: "bg-blue-100 text-blue-600",
    processing: "bg-orange-100 text-orange-700",
  } as const

  const renderNotificationIcon = (item: MissionNotification) => {
    if (item.category === "Mission") return <Clock3 className="h-4 w-4" />
    if (item.category === "Payment") return <CreditCard className="h-4 w-4" />
    if (item.category === "Money Received") return <Check className="h-4 w-4" />
    if (item.category === "Friend") return <User className="h-4 w-4" />
    if (item.category === "Group Mission") return <Bell className="h-4 w-4" />

    return <ShieldAlert className="h-4 w-4" />
  }

  const formatRelativeTime = (dateTime: string) => {
    const diffInMinutes = Math.max(0, Math.round((Date.now() - new Date(dateTime).getTime()) / 60000))

    if (diffInMinutes < 1) return "เมื่อสักครู่"
    if (diffInMinutes < 60) return `เมื่อ ${diffInMinutes} นาทีที่แล้ว`

    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return `เมื่อ ${diffInHours} ชั่วโมงที่แล้ว`

    const diffInDays = Math.floor(diffInHours / 24)
    return `เมื่อ ${diffInDays} วันที่แล้ว`
  }

  const handleRecentActivityClick = (item: MissionNotification) => {
    if (item.type === "mission" && item.missionId) {
      window.location.href = `/missions/${item.missionId}`
      return
    }

    if (item.type === "payment" && item.missionId) {
      window.location.href = `/missions/${item.missionId}`
      return
    }

    if (item.type === "friend") {
      setIsAddFriendsOpen(true)
      return
    }

    if (item.type === "group") {
      window.location.href = "/group-mission"
    }
  }

  const unreadNotificationTone = notificationsToShow.find((item) => item.unread)?.status
  const dashboardNotificationTone: "success" | "failed" | "warning" | "info" =
    !unreadNotificationTone || unreadNotificationTone === "processing" ? "info" : unreadNotificationTone

  if (isProfileLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f3f7e6] text-[#121212]">กำลังโหลดข้อมูลโปรไฟล์...</main>
  }

  if (profileError || !username) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f3f7e6] text-[#121212]">ไม่สามารถโหลดข้อมูลโปรไฟล์ได้</main>
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-gray-900">
      <DashboardNav
        onOpenAddFriends={() => setIsAddFriendsOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        notificationTone={dashboardNotificationTone}
        notificationCount={notificationsToShow.filter((item) => item.unread).length}
      />

      <div className="relative overflow-visible bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.8),_transparent_40%),linear-gradient(180deg,#f5f7f2_0%,#eef2f6_100%)]">
        <div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-[#AFFF00]/30 blur-3xl animate-float pointer-events-none" />
        <div className="absolute right-0 top-10 h-96 w-96 rounded-full bg-[#121212]/8 blur-3xl animate-pulse-glow pointer-events-none" />
        <div className="absolute inset-0 opacity-40 mix-blend-screen pointer-events-none">
          <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="g1" x1="0" x2="1">
                <stop offset="0%" stopColor="#AFFF00" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#g1)" />
          </svg>
        </div>

        <div className="relative mx-auto max-w-7xl px-6 py-10">
          <div className="flex items-start justify-between gap-4">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/40 px-4 py-1.5 text-[10px] font-semibold tracking-[0.02em] text-[#121212] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_10px_25px_rgba(18,18,18,0.04)] backdrop-blur-xl md:text-xs">
                <span className="h-2.5 w-2.5 rounded-full bg-[#AFFF00] shadow-[0_0_12px_rgba(175,255,0,0.9)]" />
                ยินดีต้อนรับอีกครั้ง
              </div>
              <div className="mt-2 text-[3.2rem] font-black tracking-[-0.06em] text-[#121212] drop-shadow-[0_10px_25px_rgba(18,18,18,0.06)] md:text-[5rem]">{username}</div>
            </div>

            <div className="pt-20">
              <Link href="/create-mission" className="inline-flex items-center gap-2 rounded-full border border-[#AFFF00]/70 bg-[#AFFF00] px-6 py-3 text-[0.95rem] font-semibold text-[#121212] shadow-[0_18px_30px_rgba(175,255,0,0.25)] transition hover:-translate-y-0.5 hover:bg-[#baff36]">+ สร้างภารกิจ</Link>
            </div>
          </div>

          {createdGroupMission && (
            <MissionCreatedPopup missionType={`Group Mission: ${createdGroupMission}`} onComplete={() => setCreatedGroupMission(null)} />
          )}

          <motion.div className="-mt-1 stat-grid" initial="hidden" animate="visible" variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.08 } }
          }}>
            {stats.map((s, i) => (
              <StatCard key={s.id} title={s.title} value={s.value} i={i} />
            ))}
          </motion.div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div className="inline-flex items-center rounded-full border border-[#AFFF00]/70 bg-[#AFFF00] px-3 py-1.5 shadow-[0_18px_30px_rgba(175,255,0,0.25)]">
                  <h2 className="text-[0.78rem] font-semibold text-[#121212] md:text-[0.82rem]">ภารกิจที่กำลังทำ</h2>
                </div>
                <span className="rounded-full bg-[#121212]/5 px-3 py-1.5 text-[0.78rem] font-medium text-gray-600 md:text-[0.82rem]">{activeMissions.length} กำลังดำเนินการ</span>
              </div>

              <div className="mission-grid">
                {activeMissions.length > 0 ? (
                  activeMissions.map((m) => (
                    <MissionCard key={m.id} mission={m} />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#121212]/20 bg-white/40 p-6 text-center text-sm text-gray-600">
                    ยังไม่มีภารกิจที่กำลังดำเนินการ
                  </div>
                )}
              </div>
            </div>

            <aside className="rounded-2xl border border-white/60 bg-white/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_28px_rgba(18,18,18,0.06)] backdrop-blur-xl">
              <h3 className="text-[1.05rem] font-semibold text-[#121212] md:text-lg">กำลังจะเกิดขึ้น</h3>
              <div className="mt-4 space-y-3">
                {upcoming.length > 0 ? (
                  upcoming.map((u) => (
                    <div
                      key={u.id}
                      className="w-full rounded-xl border border-white/70 bg-white/55 p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition hover:shadow-md"
                    >
                      <div className="font-medium text-[#121212]">{u.title}</div>
                      <div className="mt-1 text-sm text-gray-500">{u.date} · {u.time}</div>
                      <div className="mt-3 flex justify-end">
                        <Link
                          href={`/missions/${u.id}`}
                          className="inline-flex items-center rounded-full bg-[#121212] px-3 py-1.5 text-[10px] font-semibold text-white shadow-sm transition hover:bg-[#2a2a2a]"
                        >
                          ดูรายละเอียด
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[#121212]/20 bg-white/40 p-4 text-sm text-gray-600">
                    ไม่มีภารกิจที่กำลังจะเกิดขึ้น
                  </div>
                )}
              </div>
            </aside>
          </div>

          <div className="mt-10 rounded-2xl border border-white/60 bg-white/45 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_28px_rgba(18,18,18,0.05)] backdrop-blur-xl">
            <h3 className="text-[1.05rem] font-semibold text-[#121212] md:text-lg">กิจกรรมล่าสุด</h3>
            <div className="mt-3 space-y-2">
              {recentActivities.map((item) => {
                const tone = item.status ?? "info"
                const missionItemStyles = notificationToneClasses[tone]
                const iconContainerClasses = notificationIconClasses[tone]

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleRecentActivityClick(item)}
                    className={`w-full rounded-[24px] border p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:brightness-[0.98] ${missionItemStyles}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm ${iconContainerClasses}`}>
                        {renderNotificationIcon(item)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-[#121212]">{item.title}</div>
                            <div className="mt-1 text-sm text-gray-700">{item.description}</div>
                          </div>
                          {item.unread && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#AFFF00] ring-2 ring-white" />}
                        </div>

                        {item.missionName && (
                          <div className="mt-3 grid gap-1 rounded-2xl border border-[#121212]/10 bg-white/40 p-3 text-xs text-gray-700 md:grid-cols-2">
                            <div><span className="font-semibold text-[#121212]">Mission:</span> {item.missionName}</div>
                            {item.amount !== undefined && <div><span className="font-semibold text-[#121212]">Amount:</span> {item.amountLabel ?? `฿${item.amount}`}</div>}
                            {item.from && <div><span className="font-semibold text-[#121212]">From:</span> {item.from}</div>}
                            {item.to && <div><span className="font-semibold text-[#121212]">To:</span> {item.to}</div>}
                            {item.destination && <div><span className="font-semibold text-[#121212]">Destination:</span> {item.destination}</div>}
                            {item.reason && <div><span className="font-semibold text-[#121212]">Reason:</span> {item.reason}</div>}
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-xs text-gray-500">
                            {new Date(item.dateTime).toLocaleString("th-TH", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {!item.unread && (
                            <span className="rounded-full border border-[#121212]/10 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                              อ่านแล้ว
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isNotificationsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-end bg-[#121212]/10 backdrop-blur-[1px]"
            onClick={() => setIsNotificationsOpen(false)}
            onWheel={(event) => event.stopPropagation()}
          >
            <motion.div
              initial={{ opacity: 0, x: 24, y: -8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 24, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
              className="relative mt-4 mr-6 flex w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_30px_80px_rgba(18,18,18,0.22)] backdrop-blur-2xl"
              style={{ maxHeight: "calc(100vh - 2rem)" }}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#121212]/10 pb-3">
                <h2 className="text-xl font-bold tracking-[-0.04em] text-[#121212]">การแจ้งเตือน</h2>
                <button
                  type="button"
                  onClick={handleMarkAllNotificationsAsRead}
                  className="text-xs font-medium text-[#121212] underline-offset-2 hover:underline"
                >
                  ทำเครื่องหมายว่าอ่านแล้วทั้งหมด
                </button>
              </div>

              <div
                className="mt-4 mr-1 min-h-0 flex-1 space-y-4 overflow-y-auto pr-0.5"
                onWheel={(event) => event.stopPropagation()}
                style={{
                  maxHeight: "calc(100vh - 8rem)",
                  scrollbarWidth: "thin",
                  scrollbarColor: "rgba(17,24,39,0.25) transparent",
                  WebkitOverflowScrolling: "touch",
                  overscrollBehavior: "contain",
                  scrollbarGutter: "stable",
                }}
              >
                {[
                  "Mission",
                  "Payment",
                  "Money Received",
                  "Friend",
                  "Group Mission",
                  "System",
                ].map((categoryName) => {
                  const categoryItems = notificationsToShow.filter((item) => item.category === categoryName)
                  if (categoryItems.length === 0) return null

                  return (
                    <div key={categoryName}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{categoryName}</h3>
                      <div className="space-y-2">
                        {categoryItems.map((item) => {
                          const tone = item.status ?? "info"
                          const missionItemStyles = notificationToneClasses[tone]
                          const iconContainerClasses = notificationIconClasses[tone]

                          const icon =
                            item.category === "Mission"
                              ? <Clock3 className="h-4 w-4" />
                              : item.category === "Payment"
                                ? <CreditCard className="h-4 w-4" />
                                : item.category === "Money Received"
                                  ? <Check className="h-4 w-4" />
                                  : item.category === "Friend"
                                    ? <User className="h-4 w-4" />
                                    : item.category === "Group Mission"
                                      ? <Bell className="h-4 w-4" />
                                      : <ShieldAlert className="h-4 w-4" />

                          return (
                            <div
                              key={item.id}
                              className={`rounded-2xl border p-3 ${missionItemStyles}`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full shadow-sm ${iconContainerClasses}`}>
                                  {icon}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="text-sm font-medium text-[#121212]">{item.title}</div>
                                    {item.unread && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#AFFF00]" />}
                                  </div>
                                  <div className="mt-1 text-xs text-gray-600">{item.description}</div>

                                  {item.missionName && (
                                    <div className="mt-2 text-[11px] text-gray-700">
                                      <div><span className="font-semibold">Mission:</span> {item.missionName}</div>
                                      {item.amount !== undefined && (
                                        <div><span className="font-semibold">Amount:</span> {item.amountLabel ?? `฿${item.amount}`}</div>
                                      )}
                                      {item.from && <div><span className="font-semibold">From:</span> {item.from}</div>}
                                      {item.to && <div><span className="font-semibold">To:</span> {item.to}</div>}
                                      {item.destination && <div><span className="font-semibold">Destination:</span> {item.destination}</div>}
                                      {item.reason && <div><span className="font-semibold">Reason:</span> {item.reason}</div>}
                                    </div>
                                  )}

                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-gray-500">
                                      {new Date(item.dateTime).toLocaleString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                    {item.action === "accept" && (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleGroupInvitationResponse(item, "decline")}
                                          className="rounded-full border border-[#121212]/10 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#121212]"
                                        >
                                          Decline
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleGroupInvitationResponse(item, "accept")}
                                          className="rounded-full bg-[#AFFF00] px-2.5 py-1.5 text-[11px] font-semibold text-[#121212]"
                                        >
                                          Accept
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {(item.type === "mission" || item.type === "payment" || item.type === "group") && item.missionId && (
                                <button
                                  type="button"
                                  onClick={() => handleNotificationAction(item)}
                                  className="mt-2 text-xs font-medium text-[#121212] underline-offset-2 hover:underline"
                                >
                                  Open Details
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}

        {isAddFriendsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#121212]/30 backdrop-blur-[2px]"
            onClick={() => setIsAddFriendsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
              className="relative w-full max-w-2xl rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_30px_80px_rgba(18,18,18,0.22)] backdrop-blur-2xl"
            >
              <button
                type="button"
                aria-label="Close friends popup"
                onClick={() => setIsAddFriendsOpen(false)}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[#121212]/10 bg-white text-[#121212] transition hover:bg-[#121212]/5"
              >
                <X className="h-4 w-4" />
              </button>

              <div>
                <h2 className="text-2xl font-bold tracking-[-0.04em] text-[#121212]">เพื่อน</h2>
                <p className="mt-1 text-sm text-gray-600">จัดการเพื่อนและการเชื่อมต่อของคุณ</p>
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-semibold text-[#121212]">เพิ่มเพื่อน</h3>

                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="text"
                    value={friendSearchInput}
                    onChange={(event) => setFriendSearchInput(event.target.value)}
                    placeholder="กรอก Friend ID"
                    className="flex-1 rounded-2xl border border-[#121212]/10 bg-[#f6f6f5] px-4 py-3 text-sm text-[#121212] outline-none placeholder:text-gray-400 focus:border-[#AFFF00]"
                  />
                  <button
                    type="button"
                    onClick={handleSearchFriend}
                    className="rounded-full bg-[#AFFF00] px-4 py-3 text-sm font-semibold text-[#121212] transition hover:bg-[#baff36]"
                  >
                    ค้นหา
                  </button>
                </div>

                {searchResultMessage && (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-600">
                    {searchResultMessage}
                  </div>
                )}

                {searchedUser && (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#121212]/10 bg-[#f8f8f7] p-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#AFFF00] to-[#d9ff9d] text-sm font-bold text-[#121212]">
                      {searchedUser.avatar}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-[#121212]">{searchedUser.name}</div>
                      <div className="truncate text-sm text-gray-500">{searchedUser.friendId}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSendRequest(searchedUser)}
                      disabled={sentRequests.includes(searchedUser.friendId)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        sentRequests.includes(searchedUser.friendId)
                          ? "cursor-default border border-[#AFFF00]/40 bg-[#AFFF00]/15 text-[#121212]"
                          : "bg-[#AFFF00] text-[#121212] hover:bg-[#baff36]"
                      }`}
                    >
                      {sentRequests.includes(searchedUser.friendId) ? "ส่งคำขอแล้ว" : "ส่งคำขอเป็นเพื่อน"}
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-7">
                <h3 className="text-lg font-semibold text-[#121212]">เพื่อนของฉัน</h3>

                <div className="mt-3 space-y-3">
                  {myFriends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center gap-3 rounded-2xl border border-[#121212]/10 bg-[#f8f8f7] p-3"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#121212] to-[#555] text-sm font-bold text-white">
                        {friend.avatar}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-[#121212]">{friend.name}</div>
                        <div className="truncate text-sm text-gray-500">{friend.friendId}</div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${friend.online ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                          {friend.online ? "ออนไลน์" : "ออฟไลน์"}
                        </span>
                        <button
                          type="button"
                          className="rounded-full border border-[#121212]/10 bg-white px-3 py-2 text-sm font-semibold text-[#121212] transition hover:bg-[#121212]/5"
                        >
                          เชิญ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-7">
                <h3 className="text-lg font-semibold text-[#121212]">คำขอเป็นเพื่อน</h3>

                <div className="mt-3 space-y-3">
                  {friendRequests.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#121212]/10 bg-[#f6f6f5] px-3 py-4 text-sm text-gray-500">
                      ไม่มีคำขอเป็นเพื่อนที่รอดำเนินการ
                    </div>
                  ) : (
                    friendRequests.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center gap-3 rounded-2xl border border-[#121212]/10 bg-[#f8f8f7] p-3"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#121212] to-[#555] text-sm font-bold text-white">
                          {request.avatar}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-[#121212]">{request.name}</div>
                          <div className="truncate text-sm text-gray-500">{request.friendId}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAcceptRequest(request.id)}
                            className="rounded-full bg-[#AFFF00] px-3 py-2 text-sm font-semibold text-[#121212] transition hover:bg-[#baff36]"
                          >
                            ยอมรับ
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeclineRequest(request.id)}
                            className="rounded-full border border-[#121212]/10 bg-white px-3 py-2 text-sm font-semibold text-[#121212] transition hover:bg-[#121212]/5"
                          >
                            ปฏิเสธ
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
