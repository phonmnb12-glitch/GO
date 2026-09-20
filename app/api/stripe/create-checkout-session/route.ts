import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let requestUserId: string | null = null
  let requestMissionId: string | null = null
  let requestMissionName: string | null = null
  let requestAmount: number | null = null
  let requestCurrency = "thb"
  let stripeCustomerExists = false

  try {
    const authorization = request.headers.get("authorization")
    const accessToken = authorization?.replace(/^Bearer\s+/i, "")
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!accessToken || !supabaseUrl || !supabaseKey) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })

    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } } })
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken)
    if (userError || !user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
    requestUserId = user.id

    const body = await request.json() as { missionId?: string; missionName?: string; amount?: number | string }
    const missionId = typeof body.missionId === "string" ? body.missionId.trim() : ""
    const missionName = typeof body.missionName === "string" ? body.missionName.trim() : ""
    const amount = Number(body.amount)
    requestMissionId = missionId || null
    requestMissionName = missionName || null
    requestAmount = Number.isFinite(amount) ? amount : null

    if (!missionId || !missionName || !Number.isFinite(amount) || amount < 10) {
      const validationError = `Invalid payment details: missionId, missionName, and amount are required. amount=${body.amount ?? "missing"}`
      console.error("[Stripe] Payment request validation failed", {
        message: validationError,
        userId: requestUserId,
        missionId: requestMissionId,
        missionName: requestMissionName,
        amount: requestAmount,
        currency: requestCurrency,
        stripe_customer_id_exists: stripeCustomerExists,
      })
      return NextResponse.json({
        error: validationError,
        userId: requestUserId,
        missionId: requestMissionId,
        missionName: requestMissionName,
        amount: requestAmount,
        currency: requestCurrency,
        stripe_customer_id_exists: stripeCustomerExists,
      }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase.from("profiles").select("user_id, stripe_customer_id").eq("user_id", user.id).maybeSingle()
    if (profileError) throw profileError
    stripeCustomerExists = Boolean(profile?.stripe_customer_id)

    const stripe = getStripe()
    let customerId = typeof profile?.stripe_customer_id === "string" && profile.stripe_customer_id ? profile.stripe_customer_id : null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? undefined,
        metadata: { user_id: user.id },
      })
      customerId = customer.id
      stripeCustomerExists = true

      const { error } = await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("user_id", user.id)
      if (error) throw error
    }

    const amountInSatang = Math.round(amount * 100)
    const transactionId = `txn_${crypto.randomUUID()}`
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: requestCurrency,
          product_data: { name: `GO pledge: ${missionName}` },
          unit_amount: amountInSatang,
        },
        quantity: 1,
      }],
      metadata: { transaction_id: transactionId, user_id: user.id, mission_id: missionId },
      payment_intent_data: { metadata: { transaction_id: transactionId, user_id: user.id, mission_id: missionId } },
      success_url: `${new URL(request.url).origin}/gps-check-mission?stripe_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${new URL(request.url).origin}/gps-check-mission?payment_cancelled=1`,
    })

    const { error: transactionError } = await supabase.from("transactions").insert({
      transaction_id: transactionId,
      user_id: user.id,
      mission_id: missionId,
      stripe_customer_id: customerId,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      amount,
      currency: "THB",
      payment_status: "Pending",
      created_at: new Date().toISOString(),
    })
    if (transactionError) throw transactionError

    return NextResponse.json({ checkoutUrl: session.url })
  } catch (error) {
    const stripeError = error as {
      message?: string
      code?: string
      type?: string
      param?: string
      statusCode?: number
    }

    console.error("[Stripe] Checkout session creation failed", {
      message: stripeError.message ?? "Unknown Stripe error",
      code: stripeError.code ?? null,
      type: stripeError.type ?? null,
      param: stripeError.param ?? null,
      status: stripeError.statusCode ?? 500,
      userId: requestUserId,
      missionId: requestMissionId,
      missionName: requestMissionName,
      amount: requestAmount,
      currency: requestCurrency,
      stripe_customer_id_exists: stripeCustomerExists,
    })

    const devError = {
      error: stripeError.message ?? "Unable to start payment.",
      code: stripeError.code ?? null,
      type: stripeError.type ?? null,
      param: stripeError.param ?? null,
      status: stripeError.statusCode ?? 500,
      userId: requestUserId,
      missionId: requestMissionId,
      missionName: requestMissionName,
      amount: requestAmount,
      currency: requestCurrency,
      stripe_customer_id_exists: stripeCustomerExists,
    }

    return NextResponse.json(
      process.env.NODE_ENV === "development" ? devError : { error: "Unable to start payment. Please try again." },
      { status: stripeError.statusCode && Number.isFinite(stripeError.statusCode) ? stripeError.statusCode : 500 },
    )
  }
}
