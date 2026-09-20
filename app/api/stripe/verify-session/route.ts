import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization")
    const accessToken = authorization?.replace(/^Bearer\s+/i, "")
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    const body = await request.json() as { sessionId?: string }
    if (!accessToken || !supabaseUrl || !supabaseKey || !body.sessionId) return NextResponse.json({ error: "Payment verification is required." }, { status: 400 })

    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } } })
    const { data: { user } } = await supabase.auth.getUser(accessToken)
    if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })

    const session = await getStripe().checkout.sessions.retrieve(body.sessionId)
    if (session.metadata?.user_id !== user.id || session.payment_status !== "paid") return NextResponse.json({ paid: false }, { status: 402 })

    const { error } = await supabase.from("transactions").update({
      payment_status: "Paid",
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
    }).eq("transaction_id", session.metadata.transaction_id).eq("user_id", user.id)
    if (error) throw error

    return NextResponse.json({ paid: true, missionId: session.metadata.mission_id })
  } catch (error) {
    console.error("[Stripe] Payment verification failed", error)
    return NextResponse.json({ error: "Unable to verify payment. Please try again." }, { status: 500 })
  }
}
