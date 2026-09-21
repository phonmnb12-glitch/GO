"use client"

import Link from "next/link"
import { Bell, User } from "lucide-react"

type DashboardNavProps = {
  onOpenAddFriends?: () => void
  onOpenNotifications?: () => void
  notificationTone?: "success" | "failed" | "warning" | "info"
  notificationCount?: number
}

export function DashboardNav({ onOpenAddFriends, onOpenNotifications, notificationTone = "info", notificationCount = 0 }: DashboardNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#121212]/10 bg-white/80 backdrop-blur-xl shadow-[0_10px_30px_rgba(18,18,18,0.04)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex flex-1 items-center justify-start gap-8">
          <Link href="/home" className="flex items-center gap-0 text-2xl font-extrabold leading-none tracking-[-0.12em] text-[#121212]">
            <span>go</span>
            <span className="text-[#AFFF00]">.</span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-2 md:flex">
            <Link href="/dashboard" className="rounded-full px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-[#121212]/5 hover:text-gray-900">หน้าแรก</Link>
            <Link href="/create-mission" className="rounded-full px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-[#121212]/5 hover:text-gray-900">สร้างภารกิจ</Link>
            <Link href="/missions" className="rounded-full px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-[#121212]/5 hover:text-gray-900">ภารกิจ</Link>
            <Link href="/help" className="rounded-full px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-[#121212]/5 hover:text-gray-900">ช่วยเหลือ</Link>
            {onOpenAddFriends ? (
              <button
                type="button"
                onClick={onOpenAddFriends}
                className="rounded-full px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-[#121212]/5 hover:text-gray-900"
              >
                เพื่อน
              </button>
            ) : (
              <Link href="/friends" className="rounded-full px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-[#121212]/5 hover:text-gray-900">เพื่อน</Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {onOpenNotifications ? (
            <button
              type="button"
              onClick={onOpenNotifications}
              aria-label="Notifications"
              className="relative rounded-full border border-[#121212]/10 bg-white p-2.5 text-gray-700 transition hover:border-[#AFFF00]/40 hover:bg-[#AFFF00]/10 hover:text-[#121212]"
            >
              <Bell className="h-5 w-5" />
              {notificationCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-white" />
              )}
            </button>
          ) : (
            <Link href="/notifications" aria-label="Notifications" className="relative rounded-full border border-[#121212]/10 bg-white p-2.5 text-gray-700 transition hover:border-[#AFFF00]/40 hover:bg-[#AFFF00]/10 hover:text-[#121212]">
              <Bell className="h-5 w-5" />
              {notificationCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-white" />
              )}
            </Link>
          )}

          <Link href="/profile" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#121212]/10 bg-gradient-to-br from-[#f5f5f5] to-[#e5e7eb] shadow-sm">
              <User className="h-5 w-5 text-gray-700" />
            </div>
          </Link>
        </div>
      </div>
    </header>
  )
}
