"use client"

import { useAuth } from "@/components/auth-provider"
import { Footer } from "@/components/footer"
import { HeroSection } from "@/components/hero-section"
import { Navigation } from "@/components/navigation"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function Page() {
  const router = useRouter()
  const { session, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && session) {
      router.replace("/dashboard")
    }
  }, [isLoading, router, session])

  if (isLoading) return null
  if (session) return null

  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#121212]">
      <Navigation />
      <HeroSection />
      <Footer />
    </main>
  )
}
