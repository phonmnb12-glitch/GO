import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getSupabaseClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration is missing.")
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization")
    const accessToken = authorization?.replace(/^Bearer\s+/i, "")

    if (!accessToken) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
    }

    const supabase = getSupabaseClient(accessToken)
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken)
    if (userError || !user) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (profileError) throw profileError

    const stripeCustomerId = typeof profile?.stripe_customer_id === "string" && profile.stripe_customer_id ? profile.stripe_customer_id : null
    if (!stripeCustomerId) {
      return NextResponse.json({
        customerExists: false,
        customerId: null,
        hasSavedCard: false,
        paymentMethodId: null,
        paymentMethodType: null,
        last4: null,
      })
    }

    const stripe = getStripe()
    const paymentMethods = await stripe.customers.listPaymentMethods(stripeCustomerId, { type: "card" })
    const saved = paymentMethods.data[0]
    const paymentMethodType = saved?.card?.brand ?? saved?.type ?? null

    return NextResponse.json({
      customerExists: true,
      customerId: stripeCustomerId,
      hasSavedCard: Boolean(saved),
      paymentMethodId: saved?.id ?? null,
      paymentMethodType,
      last4: saved?.card?.last4 ?? null,
    })
  } catch (error) {
    const stripeError = error as { message?: string; code?: string; statusCode?: number }
    console.error("[Stripe] Payment method status failed", {
      message: stripeError.message ?? "Unknown Stripe error",
      code: stripeError.code ?? null,
      status: stripeError.statusCode ?? 500,
    })

    return NextResponse.json({
      error: stripeError.message ?? "ไม่สามารถตรวจสอบสถานะบัตรได้ กรุณาลองใหม่",
      code: stripeError.code ?? null,
    }, { status: stripeError.statusCode && Number.isFinite(stripeError.statusCode) ? stripeError.statusCode : 500 })
  }
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization")
    const accessToken = authorization?.replace(/^Bearer\s+/i, "")

    if (!accessToken) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
    }

    const supabase = getSupabaseClient(accessToken)
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken)
    if (userError || !user) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as { consent?: boolean }
    if (body.consent === false) {
      return NextResponse.json({
        error: "กรุณายืนยันก่อนบันทึกบัตรสำหรับการชำระเงินของ GO",
        code: "consent_required",
      }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (profileError) throw profileError

    const stripe = getStripe()
    let customerId = typeof profile?.stripe_customer_id === "string" && profile.stripe_customer_id ? profile.stripe_customer_id : null

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: user.user_metadata?.full_name || user.user_metadata?.name || undefined,
        metadata: { user_id: user.id },
      })
      customerId = customer.id

      const { error: profileUpdateError } = await supabase.from("profiles").upsert({
        user_id: user.id,
        email: user.email ?? undefined,
        name: user.user_metadata?.full_name || user.user_metadata?.name || undefined,
        stripe_customer_id: customerId,
      }, { onConflict: "user_id" })

      if (profileUpdateError) throw profileUpdateError
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: { user_id: user.id },
    })

    const paymentMethods = await stripe.customers.listPaymentMethods(customerId, { type: "card" })
    const saved = paymentMethods.data[0]
    const paymentMethodType = saved?.card?.brand ?? saved?.type ?? null

    return NextResponse.json({
      customerExists: true,
      customerId,
      hasSavedCard: Boolean(saved),
      paymentMethodId: saved?.id ?? null,
      paymentMethodType,
      last4: saved?.card?.last4 ?? null,
      setupIntentId: setupIntent.id,
      clientSecret: setupIntent.client_secret,
    })
  } catch (error) {
    const stripeError = error as {
      message?: string
      code?: string
      type?: string
      param?: string
      statusCode?: number
    }

    console.error("[Stripe] SetupIntent creation failed", {
      message: stripeError.message ?? "Unknown Stripe error",
      code: stripeError.code ?? null,
      type: stripeError.type ?? null,
      param: stripeError.param ?? null,
      status: stripeError.statusCode ?? 500,
    })

    return NextResponse.json({
      error: stripeError.message ?? "ไม่สามารถเพิ่มบัตรได้ กรุณาลองใหม่",
      code: stripeError.code ?? null,
      type: stripeError.type ?? null,
      param: stripeError.param ?? null,
      status: stripeError.statusCode ?? 500,
    }, {
      status: stripeError.statusCode && Number.isFinite(stripeError.statusCode) ? stripeError.statusCode : 500,
    })
  }
}
