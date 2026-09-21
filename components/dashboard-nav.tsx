"use client"

import Link from "next/link"
import { Bell, Menu, User, X } from "lucide-react"
import { useState } from "react"

type DashboardNavProps = {
  onOpenAddFriends?: () => void
  onOpenNotifications?: () => void
  notificationTone?: "success" | "failed" | "warning" | "info"
  notificationCount?: number
}

export function DashboardNav({ onOpenAddFriends, onOpenNotifications, notificationTone = "info", notificationCount = 0 }: DashboardNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navLinkClass = "rounded-full px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-[#121212]/5 hover:text-gray-900"

  return (
    <header className="sticky top-0 z-40 border-b border-[#121212]/10 bg-white/80 backdrop-blur-xl shadow-[0_10px_30px_rgba(18,18,18,0.04)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex flex-1 items-center justify-start gap-8">
          <Link href="/dashboard" className="flex items-center gap-0 text-2xl font-extrabold leading-none tracking-[-0.12em] text-[#121212]">
            <span>go</span>
            <span className="text-[#AFFF00]">.</span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-2 md:flex">
            <Link href="/dashboard" className={navLinkClass}>หน้าแรก</Link>
            <Link href="/create-mission" className={navLinkClass}>สร้างภารกิจ</Link>
            <Link href="/missions" className={navLinkClass}>ภารกิจ</Link>
            <Link href="/help" className={navLinkClass}>ช่วยเหลือ</Link>
            {onOpenAddFriends ? (
              <button type="button" onClick={onOpenAddFriends} className={navLinkClass}>
                เพื่อน
              </button>
            ) : (
              <Link href="/friends" className={navLinkClass}>เพื่อน</Link>
            )}
          </nav>
        </div>

        <button
          type="button"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileMenuOpen((value) => !value)}
          className="mr-2 rounded-full border border-[#121212]/10 bg-white p-2.5 text-gray-700 md:hidden"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

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

      {mobileMenuOpen && (
        <nav className="flex flex-col gap-1 border-t border-[#121212]/10 bg-white px-6 py-4 md:hidden">
          <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>หน้าแรก</Link>
          <Link href="/create-mission" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>สร้างภารกิจ</Link>
          <Link href="/missions" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>ภารกิจ</Link>
          <Link href="/help" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>ช่วยเหลือ</Link>
          {onOpenAddFriends ? (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false)
                onOpenAddFriends()
              }}
              className={`${navLinkClass} text-left`}
            >
              เพื่อน
            </button>
          ) : (
            <Link href="/friends" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>เพื่อน</Link>
          )}
        </nav>
      )}
    </header>
  )
}
