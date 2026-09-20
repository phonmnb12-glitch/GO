"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import { useAuth } from "@/components/auth-provider"
import type { MissionNotification } from "@/lib/missions"
import { Bell, Check, Clock3, CreditCard, ShieldAlert, User } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { mapWorkTeamNotification } from "@/lib/work-team-client"

type NotificationFilter = "All" | "Mission" | "Payment" | "Friend" | "Group Mission" | "System"

const filterLabels: NotificationFilter[] = ["All", "Mission", "Payment", "Friend", "Group Mission", "System"]

const notificationToneClasses = {
  success: "border-green-200 bg-green-50/80",
  failed: "border-red-200 bg-red-50/80",
  warning: "border-yellow-200 bg-yellow-50/90",
  info: "border-blue-200 bg-blue-50/80",
  processing: "border-gray-200 bg-gray-50/80",
} as const

const notificationIconClasses = {
  success: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-600",
  warning: "bg-yellow-100 text-yellow-700",
  info: "bg-blue-100 text-blue-600",
  processing: "bg-gray-100 text-gray-700",
} as const

export default function NotificationsPage() {
  const router = useRouter()
  const { session, isLoading: authLoading } = useAuth()
  const [filter, setFilter] = useState<NotificationFilter>("All")
  const [notifications, setNotifications] = useState<MissionNotification[]>([])

  useEffect(() => {
    if (!session || authLoading) return

    const syncNotifications = async () => {
      const response = await fetch("/api/work-team?notifications=1", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!response.ok) {
        setNotifications([])
        return
      }

      const result = await response.json() as { notifications?: Array<Parameters<typeof mapWorkTeamNotification>[0]> }
      setNotifications((result.notifications ?? []).map(mapWorkTeamNotification))
    }

    void syncNotifications()
    const timer = window.setInterval(() => void syncNotifications(), 5000)

    return () => window.clearInterval(timer)
  }, [authLoading, session])

  const filteredNotifications = useMemo(() => {
    return filter === "All"
      ? notifications
      : notifications.filter((notification) => notification.category === filter)
  }, [filter, notifications])

  const unreadCount = notifications.filter((notification) => notification.unread).length

  const handleOpenDetails = async (item: MissionNotification) => {
    if (item.missionId && session?.user.id) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", item.id).eq("user_id", session.user.id)
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === item.id ? { ...notification, unread: false } : notification,
        ),
      )
      router.push(`/missions/${item.missionId}`)
    }
  }

  const handleMarkAllAsRead = async () => {
    if (!session?.user.id) return
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", session.user.id).is("read_at", null)
    setNotifications((current) => current.map((notification) => ({ ...notification, unread: false })))
  }


  const renderIcon = (item: MissionNotification) => {
    if (item.category === "Mission") return <Clock3 className="h-4 w-4" />
    if (item.category === "Payment") return <CreditCard className="h-4 w-4" />
    if (item.category === "Money Received") return <Check className="h-4 w-4" />
    if (item.category === "Friend") return <User className="h-4 w-4" />
    if (item.category === "Group Mission") return <Bell className="h-4 w-4" />

    return <ShieldAlert className="h-4 w-4" />
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-gray-900">
      <DashboardNav notificationCount={unreadCount} />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm">
              {unreadCount} unread
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.06em] text-[#121212]">การแจ้งเตือน</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              className="rounded-full border border-[#121212]/10 bg-white px-3 py-2 text-sm font-medium text-[#121212] shadow-sm transition hover:border-[#AFFF00]/50 hover:bg-[#AFFF00]/10"
            >
              ทำเครื่องหมายว่าอ่านแล้วทั้งหมด
            </button>
            <Link href="/dashboard" className="rounded-full bg-[#121212] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#2a2a2a]">
              กลับไปที่ Dashboard
            </Link>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {filterLabels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setFilter(label)}
              className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                filter === label
                  ? "border-[#AFFF00] bg-[#AFFF00] text-[#121212]"
                  : "border-white/70 bg-white/60 text-gray-700 hover:border-[#AFFF00]/60 hover:bg-[#AFFF00]/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {filteredNotifications.length > 0 ? (
            filteredNotifications.map((item) => {
              const tone = item.status ?? "info"

              return (
                <div
                  key={item.id}
                  className={`rounded-[24px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${notificationToneClasses[tone]}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-full shadow-sm ${notificationIconClasses[tone]}`}>
                      {renderIcon(item)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-[#121212]">{item.title}</div>
                          <div className="mt-1 text-sm text-gray-700">{item.description}</div>
                        </div>

                        {item.unread && (
                          <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[#AFFF00] ring-2 ring-white" />
                        )}
                      </div>

                      {item.missionName && (
                        <div className="mt-3 grid gap-1 rounded-2xl border border-[#121212]/10 bg-white/40 p-3 text-xs text-gray-700 md:grid-cols-2">
                          {item.missionName && <div><span className="font-semibold text-[#121212]">Mission:</span> {item.missionName}</div>}
                          {item.amount !== undefined && <div><span className="font-semibold text-[#121212]">Amount:</span> {item.amountLabel ?? `฿${item.amount}`}</div>}
                          {item.from && <div><span className="font-semibold text-[#121212]">From:</span> {item.from}</div>}
                          {item.to && <div><span className="font-semibold text-[#121212]">To:</span> {item.to}</div>}
                          {item.destination && <div><span className="font-semibold text-[#121212]">Destination:</span> {item.destination}</div>}
                          {item.reason && <div><span className="font-semibold text-[#121212]">Reason:</span> {item.reason}</div>}
                        </div>
                      )}

                      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <span className="text-xs text-gray-500">
                          {new Date(item.dateTime).toLocaleString("th-TH", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>

                        <div className="flex items-center gap-2">
                          {!item.unread && (
                            <span className="rounded-full border border-[#121212]/10 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                              อ่านแล้ว
                            </span>
                          )}

                          {item.missionId && (
                            <button
                              type="button"
                              onClick={() => handleOpenDetails(item)}
                              className="rounded-full bg-[#121212] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2a2a2a]"
                            >
                              ดูรายละเอียด
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#121212]/20 bg-white/40 p-8 text-center text-gray-600">
              ไม่มีการแจ้งเตือนในหมวดนี้
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
