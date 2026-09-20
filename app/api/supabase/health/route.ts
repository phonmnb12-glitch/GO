import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!rawUrl || !publishableKey) {
    console.error("[Supabase] Runtime configuration missing", {
      hasUrl: Boolean(rawUrl),
      hasPublishableKey: Boolean(publishableKey),
    })
    return NextResponse.json({ ok: false, kind: "configuration", error: "Supabase environment variables are not configured" }, { status: 503 })
  }

  let host: string
  try {
    host = new URL(rawUrl).hostname
  } catch (error) {
    console.error("[Supabase] Invalid URL", error)
    return NextResponse.json({ ok: false, kind: "configuration", error: "NEXT_PUBLIC_SUPABASE_URL is invalid" }, { status: 503 })
  }

  console.debug("[Supabase] Health check host", host)
  try {
    const response = await fetch(`${rawUrl.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      cache: "no-store",
    })
    const body = await response.text()
    if (!response.ok) {
      console.error("[Supabase] Auth health request failed", { host, status: response.status, body })
      return NextResponse.json({ ok: false, kind: "auth", host, status: response.status, error: body }, { status: 502 })
    }
    return NextResponse.json({ ok: true, kind: "auth", host })
  } catch (error) {
    const networkError = error as { name?: string; message?: string; code?: string }
    console.error("[Supabase] Network/DNS health request failed", { host, name: networkError.name, message: networkError.message, code: networkError.code, error })
    return NextResponse.json({ ok: false, kind: "network", host, error: networkError.message ?? String(error) }, { status: 503 })
  }
}
