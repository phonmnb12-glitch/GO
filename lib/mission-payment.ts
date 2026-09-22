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
    // capture_method: "manual" authorizes (holds) the card for this amount
    // without moving any money yet — matches the spec's "Payment Intent /
    // Card Authorization Hold" requirement. The hold is only ever resolved
    // later by releaseMissionPledgeHold() (mission succeeds) or
    // captureMissionPledgeHold() (mission fails), never here.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInMinorUnits,
      currency: "thb",
      customer: stripeCustomerId,
      payment_method: savedPaymentMethod.id,
      payment_method_types: ["card"],
      confirm: true,
      off_session: true,
      capture_method: "manual",
      description: `GO mission pledge hold: ${normalizedMissionName}`,
      metadata: {
        user_id: user.id,
        mission_id: normalizedMissionId,
        mission_name: normalizedMissionName,
      },
    }, { idempotencyKey })

    if (paymentIntent.status !== "requires_capture") {
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
      payment_status: "Authorized",
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

// Same hold-creation as chargeMissionPledge, but for a group mission MEMBER
// rather than its creator -- chargeMissionPledge hard-requires
// mission.creator_id === user.id, which a group member never satisfies.
// Used once every invited member has accepted a Work Team / Group GPS Check
// mission, called with a service-role client (see lib/supabase-admin.ts)
// since it has to read/write rows belonging to whichever member is being
// charged, not the request's own authenticated user.
export async function chargeMissionPledgeForMember(
  supabaseClient: SupabaseClient,
  missionId: string,
  memberUserId: string,
): Promise<MissionPledgeChargeResult> {
  const normalizedMissionId = missionId.trim()
  if (!normalizedMissionId || !isValidMissionId(normalizedMissionId)) {
    throw Object.assign(new Error("A valid mission ID is required."), { code: "invalid_mission_id", statusCode: 400 })
  }

  const { data: mission, error: missionError } = await supabaseClient
    .from("missions")
    .select("id, name, pledge_amount, status")
    .eq("id", normalizedMissionId)
    .maybeSingle()
  if (missionError) throw missionError
  if (!mission) throw Object.assign(new Error("Mission not found."), { code: "mission_not_found", statusCode: 404 })

  const { data: membership, error: membershipError } = await supabaseClient
    .from("mission_members")
    .select("user_id, status")
    .eq("mission_id", normalizedMissionId)
    .eq("user_id", memberUserId)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership || membership.status !== "accepted") {
    throw Object.assign(new Error("This member has not accepted the mission."), { code: "member_not_accepted", statusCode: 400 })
  }

  const savedAmount = Number(mission.pledge_amount ?? 0)
  if (!Number.isFinite(savedAmount) || savedAmount < 10) {
    throw Object.assign(new Error("Mission pledge amount is invalid."), { code: "invalid_pledge_amount", statusCode: 400 })
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("user_id, stripe_customer_id")
    .eq("user_id", memberUserId)
    .maybeSingle()
  if (profileError) throw profileError

  const stripeCustomerId = typeof profile?.stripe_customer_id === "string" && profile.stripe_customer_id ? profile.stripe_customer_id : null
  if (!stripeCustomerId) {
    throw Object.assign(new Error("This member has not saved a payment method."), { code: "missing_customer", statusCode: 400 })
  }

  const stripe = getStripe()
  const paymentMethods = await stripe.customers.listPaymentMethods(stripeCustomerId, { type: "card" })
  const savedPaymentMethod = paymentMethods.data[0]
  if (!savedPaymentMethod) {
    throw Object.assign(new Error("This member has not saved a payment method."), { code: "missing_payment_method", statusCode: 400 })
  }

  const amountInMinorUnits = Math.round(savedAmount * 100)
  const transactionId = `go_mission_pledge_${normalizedMissionId}_${memberUserId}`
  const idempotencyKey = transactionId

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

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInMinorUnits,
    currency: "thb",
    customer: stripeCustomerId,
    payment_method: savedPaymentMethod.id,
    payment_method_types: ["card"],
    confirm: true,
    off_session: true,
    capture_method: "manual",
    description: `GO group mission pledge hold: ${mission.name}`,
    metadata: { user_id: memberUserId, mission_id: normalizedMissionId, mission_name: mission.name },
  }, { idempotencyKey })

  if (paymentIntent.status !== "requires_capture") {
    const paymentError = paymentIntent.last_payment_error ?? undefined
    throw Object.assign(new Error(paymentError?.message ?? "Payment authorization failed for this member."), {
      code: paymentError?.code ?? paymentIntent.status ?? "payment_required",
      statusCode: 402,
      paymentIntentId: paymentIntent.id,
      paymentStatus: paymentIntent.status,
    })
  }

  const { error: insertError } = await supabaseClient.from("transactions").insert({
    transaction_id: transactionId,
    user_id: memberUserId,
    mission_id: normalizedMissionId,
    amount: savedAmount,
    currency: "THB",
    payment_status: "Authorized",
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
}

export type MissionPledgeResolutionResult = {
  resolved: boolean
  transactionId: string
  paymentIntentId: string | null
  paymentStatus: string | null
}

async function findMissionPledgeTransaction(supabaseClient: SupabaseClient, missionId: string, creatorId: string) {
  const transactionId = `go_mission_pledge_${missionId}_${creatorId}`
  const { data: transaction, error } = await supabaseClient
    .from("transactions")
    .select("transaction_id, stripe_payment_intent_id, payment_status")
    .eq("transaction_id", transactionId)
    .maybeSingle()

  if (error) throw error
  return { transactionId, transaction }
}

// Releases the authorization hold without ever moving money — called when a
// mission's creator succeeds. Safe to call more than once: once the
// transaction is no longer "Authorized" this is a silent no-op, so a mission
// whose status flips (or a retry) never double-releases.
export async function releaseMissionPledgeHold(
  supabaseClient: SupabaseClient,
  missionId: string,
  creatorId: string,
): Promise<MissionPledgeResolutionResult> {
  const { transactionId, transaction } = await findMissionPledgeTransaction(supabaseClient, missionId, creatorId)
  if (!transaction || transaction.payment_status !== "Authorized" || typeof transaction.stripe_payment_intent_id !== "string") {
    return { resolved: false, transactionId, paymentIntentId: transaction?.stripe_payment_intent_id ?? null, paymentStatus: transaction?.payment_status ?? null }
  }

  // Claim the row atomically (conditional UPDATE) before touching Stripe --
  // two concurrent callers (e.g. the dashboard's parallel /api/work-team and
  // /api/work-team?notifications=1 requests both sweeping the same expired
  // mission) would otherwise both read "Authorized" above and both proceed.
  // Only the caller whose UPDATE actually flips a row is the real resolver.
  const { data: claimed, error: claimError } = await supabaseClient
    .from("transactions")
    .update({ payment_status: "Returned" })
    .eq("transaction_id", transactionId)
    .eq("payment_status", "Authorized")
    .select("transaction_id")
  if (claimError) throw claimError
  if (!claimed || claimed.length === 0) {
    return { resolved: false, transactionId, paymentIntentId: transaction.stripe_payment_intent_id, paymentStatus: "Returned" }
  }

  const stripe = getStripe()
  try {
    await stripe.paymentIntents.cancel(transaction.stripe_payment_intent_id)
  } catch (error) {
    // A concurrent call can win this race first (e.g. two checkpoint
    // resolutions firing close together) -- Stripe itself already refuses to
    // move money twice, so this specific error just means the hold is
    // already in its terminal state. Our own row is already claimed above,
    // so there's nothing left to reconcile here.
    const isAlreadyResolved = error instanceof Error && "code" in error && (error as { code?: string }).code === "payment_intent_unexpected_state"
    if (!isAlreadyResolved) throw error
  }

  return { resolved: true, transactionId, paymentIntentId: transaction.stripe_payment_intent_id, paymentStatus: "Returned" }
}

// Captures the authorization hold (real money moves to the GO platform's
// Stripe account) — called when a mission's creator fails. GO does not move
// money on to a third party's own bank account (that needs Stripe Connect,
// out of scope here); the chosen failed_destination/friend_recipient/
// foundation_recipient/support_recipient columns remain the record of where
// it was meant to go. Same double-capture guard as release, above.
export async function captureMissionPledgeHold(
  supabaseClient: SupabaseClient,
  missionId: string,
  creatorId: string,
): Promise<MissionPledgeResolutionResult> {
  const { transactionId, transaction } = await findMissionPledgeTransaction(supabaseClient, missionId, creatorId)
  if (!transaction || transaction.payment_status !== "Authorized" || typeof transaction.stripe_payment_intent_id !== "string") {
    return { resolved: false, transactionId, paymentIntentId: transaction?.stripe_payment_intent_id ?? null, paymentStatus: transaction?.payment_status ?? null }
  }

  // Claim the row atomically (conditional UPDATE) before touching Stripe or
  // any downstream side effect -- splitFailedPledgeAmongTeam chains off
  // `resolved` below, so without this, two concurrent callers (e.g. the
  // dashboard's parallel /api/work-team and /api/work-team?notifications=1
  // requests both sweeping the same expired mission) would both read
  // "Authorized" above and both go on to split/notify, producing duplicate
  // "you got a share of the forfeited pledge" notifications. Only the
  // caller whose UPDATE actually flips a row is the real resolver.
  const { data: claimed, error: claimError } = await supabaseClient
    .from("transactions")
    .update({ payment_status: "Sent" })
    .eq("transaction_id", transactionId)
    .eq("payment_status", "Authorized")
    .select("transaction_id")
  if (claimError) throw claimError
  if (!claimed || claimed.length === 0) {
    return { resolved: false, transactionId, paymentIntentId: transaction.stripe_payment_intent_id, paymentStatus: "Sent" }
  }

  const stripe = getStripe()
  try {
    await stripe.paymentIntents.capture(transaction.stripe_payment_intent_id)
  } catch (error) {
    // Same race as releaseMissionPledgeHold: a concurrent call can already
    // have captured this hold. Our own row is already claimed above, so
    // there's nothing left to reconcile here.
    const isAlreadyResolved = error instanceof Error && "code" in error && (error as { code?: string }).code === "payment_intent_unexpected_state"
    if (!isAlreadyResolved) throw error
  }

  return { resolved: true, transactionId, paymentIntentId: transaction.stripe_payment_intent_id, paymentStatus: "Sent" }
}
