"use client"

import { usePathname, useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"

type AuthContextValue = {
  session: Session | null
  user: User | null
  isLoading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const publicPaths = new Set(["/", "/home", "/login", "/signup", "/auth/callback"])

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error("[Supabase] Session check failed", {
          message: error.message,
          code: error.code,
          status: error.status,
        })
      }
      if (!isMounted) return
      setSession(data.session)
      setIsLoading(false)
    }

    void loadSession()
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      setIsLoading(false)
      if (event === "SIGNED_OUT" && !publicPaths.has(pathname)) router.replace("/home")
    })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [pathname, router])

  useEffect(() => {
    if (isLoading || publicPaths.has(pathname)) return
    if (!session) router.replace("/login")
  }, [isLoading, pathname, router, session])

  const value = useMemo(() => ({ session, user: session?.user ?? null, isLoading }), [isLoading, session])

  if (!publicPaths.has(pathname) && !isLoading && !session) {
    return null
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
