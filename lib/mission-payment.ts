import type { SupabaseClient } from "@supabase/supabase-js"

import { getStripe } from "@/lib/stripe-server"

export type MissionPledgeChargeArgs = {
  supabaseClient: SupabaseClient
  user: { id: string; email?: string | null }
  missionId: string
  missionName: string
  amount: number | string
}

export type MissionPledgeChargeResult = {
  paid: boolean
  missionId: string
  transactionId: string
  paymentIntentId: string
  amount: number
  currency: "THB"
  customerId: string
}

export type SavedMissionPaymentMethod = {
  customerId: string
  paymentMethodId: string
  paymentMethodType: string | null
  last4: string | null
}

const isValidMissionId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export async function requireSavedMissionPaymentMethod({
  supabaseClient,
  user,
}: Pick<MissionPledgeChargeArgs, "supabaseClient" | "user">): Promise<SavedMissionPaymentMethod> {
  if (!user?.id) {
    throw Object.assign(new Error("Authentication is required."), { code: "authentication_required", statusCode: 401 })
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("user_id, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (profileError) throw profileError

  const stripeCustomerId = typeof profile?.stripe_customer_id === "string" && profile.stripe_customer_id
    ? profile.stripe_customer_id
    : null

  if (!stripeCustomerId) {
    throw Object.assign(new Error("Please add and save a card before creating this mission."), {
      code: "missing_customer",
      statusCode: 400,
    })
  }

  const stripe = getStripe()
  const paymentMethods = await stripe.customers.listPaymentMethods(stripeCustomerId, { type: "card" })
  const savedPaymentMethod = paymentMethods.data[0]

  if (!savedPaymentMethod) {
    throw Object.assign(new Error("กรุณาเพิ่มบัตรสำหรับการชำระเงินก่อน"), {
      code: "missing_payment_method",
      statusCode: 400,
    })
  }

  return {
    customerId: stripeCustomerId,
    paymentMethodId: savedPaymentMethod.id,
    paymentMethodType: savedPaymentMethod.type ?? null,
    last4: savedPaymentMethod.card?.last4 ?? null,
  }
}

function toStripeError(error: unknown, fallbackMessage: string) {
  const stripeError = error as {
    message?: string
    code?: string
    type?: string
    param?: string
    statusCode?: number
  }

  const message = stripeError.message ?? fallbackMessage
  const statusCode = stripeError.statusCode && Number.isFinite(stripeError.statusCode)
    ? stripeError.statusCode
    : 500

  return {
    error: message,
    code: stripeError.code ?? undefined,
    type: stripeError.type ?? undefined,
    param: stripeError.param ?? undefined,
    status: statusCode,
  }
}

export async function chargeMissionPledge({
  supabaseClient,
  user,
  missionId,
  missionName,
  amount,
}: MissionPledgeChargeArgs): Promise<MissionPledgeChargeResult> {
  const normalizedMissionId = missionId.trim()
  const normalizedMissionName = missionName.trim()
  const normalizedAmount = Number(amount)

  if (!user?.id) {
    throw Object.assign(new Error("Authentication is required."), { code: "authentication_required", statusCode: 401 })
  }

  if (!normalizedMissionId || !isValidMissionId(normalizedMissionId)) {
    throw Object.assign(new Error("A valid mission ID is required."), { code: "invalid_mission_id", statusCode: 400 })
  }

  if (!normalizedMissionName) {
    throw Object.assign(new Error("Mission name is required."), { code: "invalid_mission_name", statusCode: 400 })
  }

  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 10) {
    throw Object.assign(new Error("Mission pledge amount must be at least ฿10."), { code: "invalid_pledge_amount", statusCode: 400 })
  }

  const { data: mission, error: missionError } = await supabaseClient
    .from("missions")
    .select("id, creator_id, pledge_amount, status")
    .eq("id", normalizedMissionId)
    .maybeSingle()

  if (missionError) throw missionError
  if (!mission) {
    throw Object.assign(new Error("Mission not found."), { code: "mission_not_found", statusCode: 404 })
  }

  if (mission.creator_id !== user.id) {
    throw Object.assign(new Error("Mission access denied."), { code: "mission_access_denied", statusCode: 403 })
  }

  const savedAmount = Number(mission.pledge_amount ?? normalizedAmount)
  if (!Number.isFinite(savedAmount) || savedAmount < 10) {
    throw Object.assign(new Error("Mission pledge amount is invalid."), { code: "invalid_pledge_amount", statusCode: 400 })
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("user_id, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (profileError) throw profileError

  const stripeCustomerId = typeof profile?.stripe_customer_id === "string" && profile.stripe_customer_id
    ? profile.stripe_customer_id
    : null

  if (!stripeCustomerId) {
    throw Object.assign(new Error("No Stripe customer is associated with this account. Please complete the secure card setup first."), {
      code: "missing_customer",
      statusCode: 400,
    })
  }

  const stripe = getStripe()
  const paymentMethods = await stripe.customers.listPaymentMethods(stripeCustomerId, { type: "card" })
  const savedPaymentMethod = paymentMethods.data[0]

  if (!savedPaymentMethod) {
    throw Object.assign(new Error("กรุณาเพิ่มบัตรสำหรับการชำระเงินก่อน"), {
      code: "missing_payment_method",
      statusCode: 400,
    })
  }

  const amountInMinorUnits = Math.round(savedAmount * 100)
  const idempotencyKey = `go_mission_pledge_${normalizedMissionId}_${user.id}`

  const transactionId = `go_mission_pledge_${normalizedMissionId}_${user.id}`
  const { data: existingTransaction, error: existingTransactionError } = await supabaseClient
    .from("transactions")
    .select("transaction_id, stripe_payment_intent_id")
    .eq("transaction_id", transactionId)
    .maybeSingle()

  if (existingTransactionError) throw existingTransactionError

  if (existingTransaction) {
    return {
      paid: true,
      missionId: normalizedMissionId,
      transactionId,
      paymentIntentId: typeof existingTransaction.stripe_payment_intent_id === "string" ? existingTransaction.stripe_payment_intent_id : transactionId,
      amount: savedAmount,
      currency: "THB",
      customerId: stripeCustomerId,
    }
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInMinorUnits,
      currency: "thb",
      customer: stripeCustomerId,
      payment_method: savedPaymentMethod.id,
      payment_method_types: ["card"],
      confirm: true,
      off_session: true,
      description: `GO mission pledge: ${normalizedMissionName}`,
      metadata: {
        user_id: user.id,
        mission_id: normalizedMissionId,
        mission_name: normalizedMissionName,
      },
    }, { idempotencyKey })

    if (paymentIntent.status !== "succeeded") {
      const paymentError = paymentIntent.last_payment_error ?? undefined
      throw Object.assign(new Error(paymentError?.message ?? "Payment confirmation is required before this mission can be marked paid."), {
        code: paymentError?.code ?? paymentIntent.status ?? "payment_required",
        type: paymentError?.type ?? "payment_required",
        param: paymentError?.param ?? null,
        statusCode: 402,
        paymentIntentId: paymentIntent.id,
        paymentStatus: paymentIntent.status,
      })
    }

    const { error: insertError } = await supabaseClient.from("transactions").insert({
      transaction_id: transactionId,
      user_id: user.id,
      mission_id: normalizedMissionId,
      amount: savedAmount,
      currency: "THB",
      payment_status: "Paid",
      stripe_customer_id: stripeCustomerId,
      stripe_payment_intent_id: paymentIntent.id,
      created_at: new Date().toISOString(),
    })

    if (insertError) throw insertError

    return {
      paid: true,
      missionId: normalizedMissionId,
      transactionId,
      paymentIntentId: paymentIntent.id,
      amount: savedAmount,
      currency: "THB",
      customerId: stripeCustomerId,
    }
  } catch (error) {
    const mapped = toStripeError(error, "Unable to charge the saved payment method.")
    throw Object.assign(new Error(mapped.error), {
      code: mapped.code,
      type: mapped.type,
      param: mapped.param,
      statusCode: mapped.status,
      paymentIntentId: (error as { paymentIntentId?: string })?.paymentIntentId,
      paymentStatus: (error as { paymentStatus?: string })?.paymentStatus,
    })
  }
}
