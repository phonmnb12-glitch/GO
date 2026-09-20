import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !webhookSecret) return new NextResponse("Webhook is not configured", { status: 400 })

  try {
    const event = getStripe().webhooks.constructEvent(await request.text(), signature, webhookSecret)
    const object = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent
    const metadata = object.metadata
    const status = event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded" ? "Paid" : event.type === "payment_intent.payment_failed" ? "Failed" : null
    if (status && metadata?.transaction_id) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service role is not configured for Stripe webhooks")
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      const { error } = await supabase.from("transactions").update({ payment_status: status }).eq("transaction_id", metadata.transaction_id).eq("user_id", metadata.user_id)
      if (error) throw error
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[Stripe] Webhook handling failed", error)
    return new NextResponse("Webhook error", { status: 400 })
  }
}
