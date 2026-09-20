"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setErrorMessage("")
    setIsSubmitting(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setIsSubmitting(false)
    if (error) {
      console.error("[Supabase] Login failed", { message: error.message, code: error.code, status: error.status })
      setErrorMessage(error.message)
      return
    }

    if (!data.user || !data.session) {
      console.error("[Supabase] Login returned no authenticated session")
      setErrorMessage("ไม่สามารถสร้างเซสชันที่ยืนยันตัวตนได้")
      return
    }

    console.debug("[Supabase] Login succeeded", { userId: data.user.id, sessionExists: true })
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle()

    if (profileError) {
      console.error("[Supabase] Profile load failed", {
        message: profileError.message,
        code: profileError.code,
        details: profileError.details,
      })
      setErrorMessage("ไม่สามารถโหลดโปรไฟล์ของคุณได้ กรุณาลองอีกครั้ง")
      return
    }

    if (!profile) {
      const metadata = data.user.user_metadata as { name?: string; first_name?: string; last_name?: string }
      const profileName = metadata.name ?? `${metadata.first_name ?? ""} ${metadata.last_name ?? ""}`.trim()
      if (!profileName) {
        setErrorMessage("ไม่สามารถโหลดโปรไฟล์ของคุณได้ กรุณาลองอีกครั้ง")
        return
      }

      const { error: profileCreateError } = await supabase.from("profiles").upsert({
        user_id: data.user.id,
        email: data.user.email ?? email.trim(),
        name: profileName,
      }, { onConflict: "user_id" })
      if (profileCreateError) {
        console.error("[Supabase] Profile creation failed", profileCreateError)
        setErrorMessage("ไม่สามารถโหลดโปรไฟล์ของคุณได้ กรุณาลองอีกครั้ง")
        return
      }
    }

    router.push("/dashboard")
  }

  return (
    <main className="min-h-screen bg-[#f3f7e6] text-[#121212]">
      <div className="relative isolate overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.24),transparent_30%),linear-gradient(135deg,#f3f7e6_0%,#edf4d7_100%)]" />
        <div className="absolute -left-16 top-20 h-48 w-48 rounded-full bg-[#AFFF00]/30 blur-3xl" />
        <div className="absolute right-0 top-10 h-64 w-64 rounded-full bg-[#121212]/5 blur-3xl" />

        <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
          <div className="grid w-full overflow-hidden rounded-[32px] border border-[#121212]/10 bg-white/80 shadow-[0_30px_80px_rgba(18,18,18,0.08)] backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]">
            <section className="relative hidden overflow-hidden bg-[#121212] p-10 text-white lg:flex lg:flex-col lg:justify-between">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(175,255,0,0.18),transparent_25%),radial-gradient(circle_at_bottom_right,_rgba(175,255,0,0.12),transparent_20%)]" />

              <div className="relative z-10 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                  <span className="text-2xl font-black tracking-tighter">go</span>
                  <span className="text-2xl font-black tracking-tighter text-[#AFFF00]">.</span>
                </Link>

                <Link
                  href="/home"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-[#AFFF00]/60 hover:text-[#AFFF00]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  กลับไปหน้าแรก
                </Link>
              </div>

              <div className="relative z-10 space-y-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="space-y-4"
                >
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#AFFF00]/30 bg-[#AFFF00]/10 px-3 py-1.5 text-[10px] font-mono tracking-[0.02em] text-[#AFFF00]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    เข้าสู่ระบบ
                  </div>
                  <h1 className="max-w-md text-4xl font-black tracking-tighter leading-none">
                    ความท้าทายเริ่มต้นเมื่อคุณเข้าสู่ระบบ
                  </h1>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5"
                >
                  <p className="text-sm text-white/60">ทำไมสมาชิกถึงสมัคร</p>
                  <div className="mt-4 space-y-4 text-sm text-white/80">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#AFFF00]" />
                      <span>ติดตามสติกเกอร์ เป้าหมายคืนเงิน และความรับผิดชอบที่ยกระดับได้</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#AFFF00]" />
                      <span>เข้าร่วมกลุ่มท้าทายและทำให้ความมุ่งมั่นชัดเจน</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#AFFF00]" />
                      <span>ปลดล็อกกระบวนการให้รางวัลที่เปลี่ยนการทำตามสัญญาเป็นแรงผลักดัน</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              <div className="relative z-10 text-xs text-white/50">
                สร้างขึ้นเพื่อการเปลี่ยนแปลงนิสัย และออกแบบเพื่อการทำต่อเนื่อง
              </div>
            </section>

            <section className="relative p-6 sm:p-8 lg:p-10">
              <div className="mx-auto max-w-md">
                <div className="mb-8">
                  <p className="text-xs font-mono tracking-[0.02em] text-[#121212]/60">
                    ยินดีต้อนรับ
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-tighter text-[#121212]">
                    เข้าสู่ระบบ GO
                  </h2>
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="email">อีเมล</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="h-12 rounded-2xl border-[#121212]/10 bg-[#f4f5f1] px-4 text-base shadow-none focus-visible:ring-[#AFFF00]"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">รหัสผ่าน</Label>
                      <Link href="/home" className="text-xs font-medium text-[#121212]/60 hover:text-[#121212]">
                        ลืมรหัสผ่าน?
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="กรอกรหัสผ่านของคุณ"
                        className="h-12 rounded-2xl border-[#121212]/10 bg-[#f4f5f1] px-4 pr-11 text-base shadow-none focus-visible:ring-[#AFFF00]"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute inset-y-0 right-3 flex items-center text-[#121212]/50 transition hover:text-[#121212]"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl bg-[#AFFF00]/10 px-3 py-2 text-sm text-[#121212]/70">
                    <label htmlFor="remember" className="flex items-center gap-2">
                      <input id="remember" type="checkbox" className="h-4 w-4 rounded border-[#121212]/20 text-[#121212] accent-[#AFFF00]" />
                      จดจำฉัน
                    </label>
                    <span className="text-xs font-medium text-[#121212]/50">เข้าระบบแบบปลอดภัย</span>
                  </div>

                  {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-2xl bg-[#AFFF00] text-base font-bold text-[#121212] shadow-[0_18px_40px_rgba(175,255,0,0.35)] transition hover:bg-[#b6ff2d]"
                  >
                    {isSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                  </Button>
                </form>

                <div className="mt-6 flex items-center gap-3 text-sm text-[#121212]/50">
                  <div className="h-px flex-1 bg-[#121212]/10" />
                  <span>หรือดำเนินการต่อด้วย</span>
                  <div className="h-px flex-1 bg-[#121212]/10" />
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Button variant="outline" className="h-11 rounded-2xl border-[#121212]/10 bg-white text-[#121212] hover:bg-[#f4f5f1]">
                    Google
                  </Button>
                  <Button variant="outline" className="h-11 rounded-2xl border-[#121212]/10 bg-white text-[#121212] hover:bg-[#f4f5f1]">
                    Apple ID
                  </Button>
                </div>

                <p className="mt-8 text-center text-sm text-[#121212]/60">
                  เป็นสมาชิกใหม่หรือไม่? {" "}
                  <Link href="/signup" className="font-semibold text-[#121212] underline-offset-4 hover:underline">
                    สร้างบัญชี
                  </Link>
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
