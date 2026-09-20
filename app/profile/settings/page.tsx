"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

function CardSetupForm({
  clientSecret,
  onSuccess,
  onError,
  onCancel,
}: {
  clientSecret: string
  onSuccess: () => void
  onError: (message: string) => void
  onCancel: () => void
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
        payment_method: {
          card: cardElement,
          billing_details: {
            name: "GO Account",
          },
        },
      })

      if (error) {
        throw new Error(error.message || "ไม่สามารถเพิ่มบัตรได้ กรุณาลองใหม่")
      }

      if (setupIntent?.status !== "succeeded") {
        throw new Error("ไม่สามารถเพิ่มบัตรได้ กรุณาลองใหม่")
      }

      onSuccess()
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถเพิ่มบัตรได้ กรุณาลองใหม่"
      onError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-3">
        <CardElement
          options={{
            hidePostalCode: false,
            style: {
              base: {
                fontSize: "16px",
                color: "#111827",
                fontFamily: "inherit",
                iconColor: "#111827",
              },
              invalid: {
                color: "#dc2626",
              },
            },
          }}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-2xl bg-[#121212] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "กำลังบันทึกบัตร..." : "ยืนยันบัตร"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  )
}

export default function ProfileSettingsPage() {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [name, setName] = useState("")
  const [nameInput, setNameInput] = useState("")
  const [isSavingName, setIsSavingName] = useState(false)
  const [nameMessage, setNameMessage] = useState("")
  const [nameError, setNameError] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [customerExists, setCustomerExists] = useState<boolean | null>(null)
  const [hasSavedCard, setHasSavedCard] = useState(false)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [paymentMethodType, setPaymentMethodType] = useState<string | null>(null)
  const [last4, setLast4] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCardForm, setShowCardForm] = useState(false)
  const [setupIntentClientSecret, setSetupIntentClientSecret] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const loadStripeStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setCustomerExists(false)
        setHasSavedCard(false)
        setCustomerId(null)
        setPaymentMethodType(null)
        setLast4(null)
        setIsLoading(false)
        return
      }

      const response = await fetch("/api/stripe/setup-intent", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await response.json() as {
        customerExists?: boolean
        customerId?: string | null
        hasSavedCard?: boolean
        paymentMethodType?: string | null
        last4?: string | null
        paymentMethodId?: string | null
        error?: string
      }

      if (!response.ok) {
        throw new Error(result.error ?? "ไม่สามารถตรวจสอบสถานะบัตรได้")
      }

      const nextHasSavedCard = Boolean(result.hasSavedCard)
      setCustomerExists(Boolean(result.customerExists))
      setCustomerId(result.customerId ?? null)
      setHasSavedCard(nextHasSavedCard)
      setPaymentMethodType(result.paymentMethodType ?? null)
      setLast4(result.last4 ?? null)

      if (nextHasSavedCard) {
        setStatusMessage("มีบัตรสำหรับการชำระเงินแล้ว")
      } else if (result.customerId) {
        setStatusMessage("มี Stripe Customer แล้ว แต่ยังไม่มีบัตรที่ใช้ชำระได้")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถตรวจสอบสถานะบัตรได้"
      setErrorMessage(message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadStripeStatus()
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile, error } = await supabase.from("profiles").select("name").eq("user_id", user.id).maybeSingle()
      if (error) {
        console.error("[Supabase] Profile name load failed", error)
        return
      }
      const currentName = profile?.name ?? ""
      setName(currentName)
      setNameInput(currentName)
    })()
  }, [])

  const saveName = async () => {
    setNameError("")
    setNameMessage("")
    const trimmed = nameInput.trim()
    if (!trimmed) {
      setNameError("กรุณากรอกชื่อ")
      return
    }

    setIsSavingName(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("กรุณาเข้าสู่ระบบก่อน")

      const { error } = await supabase.from("profiles").update({ name: trimmed }).eq("user_id", user.id)
      if (error) throw error

      setName(trimmed)
      setNameMessage("บันทึกชื่อเรียบร้อยแล้ว")
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกชื่อได้ กรุณาลองใหม่"
      setNameError(message)
    } finally {
      setIsSavingName(false)
    }
  }

  const savePassword = async () => {
    setPasswordError("")
    setPasswordMessage("")

    if (newPassword.length < 6) {
      setPasswordError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("รหัสผ่านทั้งสองช่องไม่ตรงกัน")
      return
    }

    setIsSavingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setPasswordMessage("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถเปลี่ยนรหัสผ่านได้ กรุณาลองใหม่"
      setPasswordError(message)
    } finally {
      setIsSavingPassword(false)
    }
  }

  const openCardForm = async () => {
    setErrorMessage("")
    setStatusMessage("")
    setIsSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setErrorMessage("กรุณาเข้าสู่ระบบก่อนเพิ่มบัตร")
        return
      }

      const response = await fetch("/api/stripe/setup-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ consent: true }),
      })

      const result = await response.json() as {
        error?: string
        customerExists?: boolean
        customerId?: string | null
        hasSavedCard?: boolean
        paymentMethodType?: string | null
        last4?: string | null
        clientSecret?: string | null
      }

      if (!response.ok) {
        throw new Error(result.error ?? "ไม่สามารถเพิ่มบัตรได้ กรุณาลองใหม่")
      }

      if (!result.clientSecret) {
        throw new Error("ไม่สามารถเริ่มการเพิ่มบัตรได้ กรุณาลองใหม่")
      }

      setCustomerExists(Boolean(result.customerExists ?? customerExists))
      setCustomerId(result.customerId ?? customerId)
      setSetupIntentClientSecret(result.clientSecret)
      setShowCardForm(true)
      setStatusMessage("กรุณากรอกข้อมูลบัตร Stripe Test")
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถเพิ่มบัตรได้ กรุณาลองใหม่"
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCardSaved = async () => {
    setShowCardForm(false)
    setSetupIntentClientSecret(null)
    setStatusMessage("เพิ่มบัตรสำเร็จ")
    await loadStripeStatus()
  }

  const signOut = async () => {
    setIsSigningOut(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error("[Supabase] Sign out failed", error)
      setIsSigningOut(false)
      return
    }
    router.replace("/home")
  }

  const savedCardLabel = hasSavedCard && paymentMethodType && last4
    ? `${paymentMethodType.charAt(0).toUpperCase()}${paymentMethodType.slice(1)} •••• ${last4}`
    : null

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <DashboardNav />

      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-2xl font-bold">การตั้งค่า</h1>
        <p className="mt-2 text-sm text-gray-600">บัญชี / การชำระเงิน สำหรับบัญชี GO</p>

        <div className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">เปลี่ยนชื่อ</div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder="ชื่อของคุณ"
              className="flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-[#121212] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void saveName()}
              disabled={isSavingName || nameInput.trim() === name}
              className="rounded-2xl bg-[#121212] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSavingName ? "กำลังบันทึก..." : "บันทึกชื่อ"}
            </button>
          </div>
          {(nameMessage || nameError) && (
            <div className={`mt-3 rounded-2xl border px-4 py-2.5 text-sm ${nameError ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
              {nameError || nameMessage}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">เปลี่ยนรหัสผ่าน</div>
          <div className="mt-3 space-y-3">
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-16 text-sm text-gray-900 focus:border-[#121212] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((current) => !current)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500"
              >
                {showNewPassword ? "ซ่อน" : "แสดง"}
              </button>
            </div>
            <input
              type={showNewPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="ยืนยันรหัสผ่านใหม่"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-[#121212] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void savePassword()}
              disabled={isSavingPassword || !newPassword || !confirmPassword}
              className="w-full rounded-2xl bg-[#121212] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSavingPassword ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
            </button>
          </div>
          {(passwordMessage || passwordError) && (
            <div className={`mt-3 rounded-2xl border px-4 py-2.5 text-sm ${passwordError ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
              {passwordError || passwordMessage}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
            <div className="rounded-2xl bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-[0.12em] text-gray-500">Stripe Customer</div>
              <div className="mt-2 font-semibold">{isLoading ? "กำลังตรวจสอบ..." : customerExists ? "มีอยู่แล้ว" : "ยังไม่มี"}</div>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-[0.12em] text-gray-500">Payment Method</div>
              <div className="mt-2 font-semibold">{isLoading ? "กำลังตรวจสอบ..." : hasSavedCard ? "พร้อมใช้งาน" : "ยังไม่มี"}</div>
            </div>
          </div>

          {customerId && (
            <p className="mt-4 text-xs text-gray-500">Stripe Customer ID: {customerId}</p>
          )}

          {(statusMessage || errorMessage) && (
            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${errorMessage ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
              {errorMessage ?? statusMessage}
            </div>
          )}

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <div className="font-medium text-gray-900">การชำระเงิน</div>
              <div className="mt-2">{hasSavedCard ? "มีบัตรสำหรับการชำระเงินแล้ว" : "ยังไม่มีบัตรสำหรับการชำระเงิน"}</div>
              {savedCardLabel && (
                <div className="mt-2 text-xs text-gray-600">บัตร: {savedCardLabel}</div>
              )}
            </div>

            <button
              type="button"
              onClick={() => void openCardForm()}
              disabled={isSubmitting || isLoading}
              className="w-full rounded-2xl bg-[#121212] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "กำลังเตรียมบัตร..." : hasSavedCard ? "เปลี่ยนบัตร" : "เพิ่มบัตร"}
            </button>
          </div>

          {showCardForm && stripePromise && setupIntentClientSecret && (
            <Elements stripe={stripePromise}>
              <CardSetupForm
                clientSecret={setupIntentClientSecret}
                onSuccess={() => void handleCardSaved()}
                onError={(message) => setErrorMessage(message)}
                onCancel={() => {
                  setShowCardForm(false)
                  setSetupIntentClientSecret(null)
                  setStatusMessage("")
                }}
              />
            </Elements>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Link href="/profile" className="text-sm text-[#AFFF00]">← กลับไปที่โปรไฟล์</Link>
          <button type="button" onClick={() => void signOut()} disabled={isSigningOut} className="rounded-2xl bg-[#121212] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {isSigningOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
          </button>
        </div>
      </div>
    </main>
  )
}
