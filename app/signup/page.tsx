"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, BadgeCheck, CreditCard, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

// Real Stripe.js card capture — tokenizes in Stripe's own iframe, the raw
// card number/expiry/cvc never touch our own state or backend. Mirrors the
// same pattern already used in app/profile/settings/page.tsx.
function CardSetupForm({
  clientSecret,
  onSuccess,
  onError,
}: {
  clientSecret: string
  onSuccess: () => void
  onError: (message: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!stripe || !elements) {
      onError("ไม่สามารถเริ่มการเพิ่มบัตรได้ กรุณาลองใหม่")
      return
    }

    const cardElement = elements.getElement(CardElement)
    if (!cardElement) {
      onError("ไม่พบแบบฟอร์มบัตร กรุณาลองใหม่")
      return
    }

    try {
      setIsSubmitting(true)
      const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      })

      if (error) throw new Error(error.message || "ไม่สามารถบันทึกบัตรได้ กรุณาลองใหม่")
      if (setupIntent?.status !== "succeeded") throw new Error("ไม่สามารถบันทึกบัตรได้ กรุณาลองใหม่")

      onSuccess()
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกบัตรได้ กรุณาลองใหม่"
      onError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-2xl border border-[#121212]/10 bg-white p-3">
        <CardElement
          options={{
            hidePostalCode: false,
            style: {
              base: { fontSize: "16px", color: "#111827", fontFamily: "inherit", iconColor: "#111827" },
              invalid: { color: "#dc2626" },
            },
          }}
        />
      </div>
      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-12 w-full rounded-2xl bg-[#AFFF00] text-base font-bold text-[#121212] shadow-[0_18px_40px_rgba(175,255,0,0.35)] transition hover:bg-[#b6ff2d] disabled:opacity-60"
      >
        {isSubmitting ? "กำลังบันทึกบัตร..." : "บันทึกบัตร"}
      </Button>
    </form>
  )
}

export default function SignupPage() {
  const [saveCardConsent, setSaveCardConsent] = useState(true)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState("")
  const [cardSecret, setCardSecret] = useState<string | null>(null)
  const [cardError, setCardError] = useState("")
  const [pendingName, setPendingName] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const startCardSetup = async (accessToken: string) => {
    const setupResponse = await fetch("/api/stripe/setup-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ consent: saveCardConsent }),
    })

    const setupResult = await setupResponse.json() as { error?: string; hasSavedCard?: boolean; clientSecret?: string | null }
    if (!setupResponse.ok) throw new Error(setupResult.error ?? "ไม่สามารถเริ่มการเพิ่มบัตรได้")
    if (setupResult.hasSavedCard) return null
    if (!setupResult.clientSecret) throw new Error("ไม่สามารถเริ่มการเพิ่มบัตรได้ กรุณาลองใหม่")
    return setupResult.clientSecret
  }

  const handleContinue = async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.error("[Supabase] Signup session check failed", { message: error.message, code: error.code, status: error.status })
      setSuccessMessage("กรุณายืนยันอีเมลของคุณก่อน")
      return
    }
    if (!data.session) {
      setSuccessMessage("กรุณายืนยันอีเมลของคุณก่อน")
      return
    }
    router.push("/dashboard")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = `${firstName.trim()} ${lastName.trim()}`.trim()
    const nextErrors: Record<string, string> = {}
    if (!name) nextErrors.name = "กรุณากรอกชื่อ"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = "กรุณากรอกอีเมลที่ถูกต้อง"
    if (password.length < 8) nextErrors.password = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"
    if (confirmPassword !== password) nextErrors.confirmPassword = "รหัสผ่านไม่ตรงกัน"
    if (!saveCardConsent) nextErrors.saveCardConsent = "กรุณายืนยันว่าบัตรจะถูกบันทึกสำหรับการชาร์จ pledge ในอนาคต"
    setErrors(nextErrors)
    setFormError("")
    setSuccessMessage("")
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" })
      if (signOutError) throw signOutError

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name, first_name: firstName.trim(), last_name: lastName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        console.error("[Supabase] Sign up failed - full error object", error)
        console.error("[Supabase] Sign up error details", {
          message: error.message,
          code: error.code,
          status: error.status,
          details: (error as { details?: unknown }).details,
        })
        if (/already registered|already been registered|user already exists/i.test(error.message)) {
          setFormError("อีเมลนี้ถูกใช้งานแล้ว")
        } else {
          setFormError(error.message)
        }
        return
      }

      if (!data.user) throw new Error("Supabase did not return a user")
      if (data.session) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          user_id: data.user.id,
          email: data.user.email ?? email.trim(),
          name,
        }, { onConflict: "user_id" })
        if (profileError) throw profileError

        const clientSecret = await startCardSetup(data.session.access_token)
        if (clientSecret) {
          setPendingName(name)
          setCardSecret(clientSecret)
        } else {
          setSuccessMessage(`ยินดีต้อนรับสู่ GO, ${name}`)
          setShowSuccessPopup(true)
        }
      } else {
        setSuccessMessage("กรุณายืนยันอีเมลของคุณก่อน")
        setShowSuccessPopup(true)
      }
    } catch (error) {
      console.error("[Supabase] Account creation failed - full error object", error)
      const caughtError = error as { message?: string; code?: string; status?: number; details?: unknown }
      console.error("[Supabase] Account creation error details", {
        message: caughtError.message,
        code: caughtError.code,
        status: caughtError.status,
        details: caughtError.details,
      })
      const errorText = caughtError.message ?? String(error)
      const isNetworkError = /fetch failed|failed to fetch|network|enotfound|eai_again|dns|name not resolved|connection/i.test(errorText)
      setFormError(isNetworkError ? "ไม่สามารถเชื่อมต่อกับ Supabase ได้" : errorText)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f7e6] text-[#121212]">
      <div className="relative isolate overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.22),transparent_30%),linear-gradient(135deg,#f5faeb_0%,#edf4d7_100%)]" />
        <div className="absolute -left-12 top-16 h-48 w-48 rounded-full bg-[#AFFF00]/30 blur-3xl" />
        <div className="absolute right-0 top-10 h-64 w-64 rounded-full bg-[#121212]/4 blur-3xl" />

        <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
          <div className="grid w-full overflow-hidden rounded-[32px] border border-[#121212]/10 bg-white/80 shadow-[0_30px_80px_rgba(18,18,18,0.08)] backdrop-blur-xl lg:grid-cols-[0.95fr_1.05fr]">
            <section className="relative hidden overflow-hidden bg-[#121212] p-10 text-white lg:flex lg:flex-col lg:justify-between">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(175,255,0,0.18),transparent_25%),radial-gradient(circle_at_bottom_right,_rgba(175,255,0,0.12),transparent_20%)]" />

              <div className="relative z-10 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                  <span className="text-2xl font-black tracking-tighter">go</span>
                  <span className="text-2xl font-black tracking-tighter text-[#AFFF00]">.</span>
                </Link>

                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-[#AFFF00]/60 hover:text-[#AFFF00]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  กลับไปหน้าเข้าสู่ระบบ
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
                    สมาชิกใหม่
                  </div>
                  <h1 className="max-w-md text-4xl font-black tracking-tighter leading-none">
                    เริ่มสติกเกอร์ความรับผิดชอบของคุณด้วยบัตรที่ปลอดภัย
                  </h1>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5"
                >
                    <div className="mb-4 flex items-center justify-between">
                    <div className="text-sm text-white/60">ตั้งค่าการชำระเงินแบบปลอดภัย</div>
                    <BadgeCheck className="h-5 w-5 text-[#AFFF00]" />
                  </div>

                  <div className="rounded-2xl border border-[#AFFF00]/20 bg-[#AFFF00]/5 p-4">
                      <div className="flex items-center justify-between text-xs tracking-[0.02em] text-white/60">
                      <span>เดบิต / เครดิต</span>
                      <CreditCard className="h-4 w-4 text-[#AFFF00]" />
                    </div>
                    <div className="mt-5 text-xl font-semibold tracking-[0.25em] text-white">
                      ••••  ••••  ••••  ••••
                    </div>
                    <div className="mt-6 flex items-center justify-between text-sm text-white/80">
                      <span>GO MEMBER</span>
                      <span>ผูกบัตรผ่าน Stripe อย่างปลอดภัย</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              <div className="relative z-10 text-xs text-white/50">
                สร้างขึ้นเพื่อการทำตามแนวทาง และปกป้องความมุ่งมั่นของคุณ
              </div>
            </section>

            <section className="relative p-6 sm:p-8 lg:p-10">
              <div className="mx-auto max-w-xl">
                <div className="mb-8">
                  <p className="text-xs font-mono tracking-[0.02em] text-[#121212]/60">
                    สร้างบัญชี
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-tighter text-[#121212]">
                    สมัครสมาชิกเพื่อเข้าร่วม GO
                  </h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">ชื่อ</Label>
                      <Input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Jane" className="h-11 rounded-2xl border-[#121212]/10 bg-[#f4f5f1] px-4 shadow-none focus-visible:ring-[#AFFF00]" />
                      {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">นามสกุล</Label>
                      <Input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Doe" className="h-11 rounded-2xl border-[#121212]/10 bg-[#f4f5f1] px-4 shadow-none focus-visible:ring-[#AFFF00]" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="h-11 rounded-2xl border-[#121212]/10 bg-[#f4f5f1] px-4 shadow-none focus-visible:ring-[#AFFF00]" />
                    {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">รหัสผ่าน</Label>
                    <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a strong password" className="h-11 rounded-2xl border-[#121212]/10 bg-[#f4f5f1] px-4 shadow-none focus-visible:ring-[#AFFF00]" />
                    {errors.password && <p className="text-xs text-red-600">{errors.password}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">ยืนยันรหัสผ่าน</Label>
                    <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm your password" className="h-11 rounded-2xl border-[#121212]/10 bg-[#f4f5f1] px-4 shadow-none focus-visible:ring-[#AFFF00]" />
                    {errors.confirmPassword && <p className="text-xs text-red-600">{errors.confirmPassword}</p>}
                  </div>

                  <div className="space-y-3 rounded-3xl border border-[#121212]/10 bg-[#f8f9f5] p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#121212]">
                      <CreditCard className="h-4 w-4 text-[#121212]" />
                      บัตรเดบิต / เครดิต
                    </div>
                    <p className="text-xs text-[#121212]/60">
                      หลังสร้างบัญชี ระบบจะให้คุณกรอกบัตรผ่านแบบฟอร์มที่ปลอดภัยของ Stripe โดยตรง (เราไม่เก็บเลขบัตรของคุณเอง)
                    </p>

                    <label className="mt-2 flex items-start gap-3 rounded-2xl border border-[#121212]/10 bg-white px-3 py-3 text-sm text-[#121212]/75">
                      <input type="checkbox" checked={saveCardConsent} onChange={(event) => setSaveCardConsent(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-[#121212]/20 text-[#AFFF00] focus:ring-[#AFFF00]" />
                      <span>บันทึกบัตรนี้เพื่อใช้ชำระ pledge GO ในภายหลังโดยไม่ต้องกรอกบัตรอีกครั้ง</span>
                    </label>
                    {errors.saveCardConsent && <p className="mt-2 text-xs text-red-600">{errors.saveCardConsent}</p>}
                  </div>

                  {formError && <p className="text-sm text-red-600">{formError}</p>}
                              {successMessage && !showSuccessPopup && <p className="text-sm font-semibold text-green-700">{successMessage}</p>}
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-2xl bg-[#AFFF00] text-base font-bold text-[#121212] shadow-[0_18px_40px_rgba(175,255,0,0.35)] transition hover:bg-[#b6ff2d]"
                  >
                    {isSubmitting ? "กำลังสร้างบัญชี..." : "สร้างบัญชี"}
                  </Button>
                </form>

                <p className="mt-6 text-center text-sm text-[#121212]/60">
                  เป็นสมาชิกอยู่แล้ว? {" "}
                  <Link href="/" className="font-semibold text-[#121212] underline-offset-4 hover:underline">
                    เข้าสู่ระบบ
                  </Link>
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
      {cardSecret && stripePromise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121212]/40 p-6">
          <div className="w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl">
            <div className="flex items-center gap-2 text-lg font-black text-[#121212]">
              <CreditCard className="h-5 w-5" />
              เพิ่มบัตรของคุณ
            </div>
            <p className="mt-1 text-sm text-gray-600">สร้างบัญชีสำเร็จแล้ว กรอกบัตรเพื่อใช้ชำระ pledge ของ GO</p>
            <div className="mt-5">
              <Elements stripe={stripePromise}>
                <CardSetupForm
                  clientSecret={cardSecret}
                  onSuccess={() => {
                    setCardSecret(null)
                    setCardError("")
                    setSuccessMessage(`ยินดีต้อนรับสู่ GO, ${pendingName}`)
                    setShowSuccessPopup(true)
                  }}
                  onError={(message) => setCardError(message)}
                />
              </Elements>
              {cardError && <p className="mt-3 text-sm text-red-600">{cardError}</p>}
            </div>
          </div>
        </div>
      )}

      {showSuccessPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121212]/40 p-6">
          <div className="w-full max-w-md rounded-[28px] bg-white p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</div>
            <h2 className="mt-4 text-2xl font-black">สร้างบัญชีสำเร็จ</h2>
            <p className="mt-2 text-sm text-gray-600">{successMessage}</p>
            <Button type="button" onClick={() => void handleContinue()} className="mt-5 h-11 w-full rounded-2xl bg-[#AFFF00] font-bold text-[#121212] hover:bg-[#b6ff2d]">
              ดำเนินการต่อ
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
