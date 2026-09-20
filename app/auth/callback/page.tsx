"use client"

import { supabase } from "@/lib/supabase"
import type { EmailOtpType } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    let isMounted = true

    const completeConfirmation = async () => {
      const url = new URL(window.location.href)
      const code = url.searchParams.get("code")
      const tokenHash = url.searchParams.get("token_hash")
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""))
      const accessToken = hashParams.get("access_token")
      const refreshToken = hashParams.get("refresh_token")

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw error
      } else if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (url.searchParams.get("type") ?? "signup") as EmailOtpType,
        })
        if (error) throw error
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (error) throw error
      } else {
        throw new Error("The confirmation link is missing its authentication result.")
      }

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) throw userError ?? new Error("Unable to identify the confirmed account.")

      const metadata = userData.user.user_metadata as { name?: string; first_name?: string; last_name?: string }
      const name = metadata.name ?? `${metadata.first_name ?? ""} ${metadata.last_name ?? ""}`.trim()
      if (!name) throw new Error("The confirmed account has no profile name.")

      const { error: profileError } = await supabase.from("profiles").upsert({
        user_id: userData.user.id,
        email: userData.user.email ?? undefined,
        name,
      }, { onConflict: "user_id" })
      if (profileError) throw profileError

      if (isMounted) router.replace("/dashboard")
    }

    void completeConfirmation().catch((error: unknown) => {
      console.error("[Supabase] Email confirmation failed", error)
      if (isMounted) setErrorMessage("Unable to confirm your account. Please request a new confirmation email.")
    })

    return () => {
      isMounted = false
    }
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f7e6] px-6 text-center text-[#121212]">
      <p className="text-sm text-gray-600">{errorMessage || "Confirming your account..."}</p>
    </main>
  )
}
