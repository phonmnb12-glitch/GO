import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { chargeMissionPledge } from "@/lib/mission-payment"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization")
    const accessToken = authorization?.replace(/^Bearer\s+/i, "")
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!accessToken || !supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken)
    if (userError || !user) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
    }

    const body = await request.json() as { missionId?: string; missionName?: string; amount?: number | string }
    const result = await chargeMissionPledge({
      supabaseClient: supabase,
      user,
      missionId: typeof body.missionId === "string" ? body.missionId : "",
      missionName: typeof body.missionName === "string" ? body.missionName : "",
      amount: body.amount ?? 0,
    })

    return NextResponse.json(result)
  } catch (error) {
    const stripeError = error as {
      message?: string
      code?: string
      type?: string
      param?: string
      statusCode?: number
      paymentIntentId?: string
      paymentStatus?: string
    }

    console.error("[Stripe] Mission pledge payment failed", {
      message: stripeError.message ?? "Unknown Stripe error",
      code: stripeError.code ?? null,
      type: stripeError.type ?? null,
      param: stripeError.param ?? null,
      status: stripeError.statusCode ?? 500,
      paymentIntentId: stripeError.paymentIntentId ?? null,
      paymentStatus: stripeError.paymentStatus ?? null,
    })

    return NextResponse.json({
      error: stripeError.message ?? "Unable to charge the saved payment method.",
      code: stripeError.code ?? null,
      type: stripeError.type ?? null,
      param: stripeError.param ?? null,
      paymentIntentId: stripeError.paymentIntentId ?? null,
      paymentStatus: stripeError.paymentStatus ?? null,
    }, {
      status: stripeError.statusCode && Number.isFinite(stripeError.statusCode) ? stripeError.statusCode : 500,
    })
  }
}
