import { NextResponse } from "next/server"

import { analyzeMissionSnapshot, type AiMonitoringState } from "@/lib/ai-vision-service"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const getClient = async (request: Request) => {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!accessToken || !url || !key) return null

  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${accessToken}` } } })
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return null
  return { client, user }
}

export async function POST(request: Request) {
  try {
    const context = await getClient(request)
    if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })

    const body = await request.json() as {
      missionId?: string
      imageDataUrl?: string
      missionName?: string
      missionDescription?: string
      missionCategory?: string
      remainingTime?: string
      recordingStatus?: string
      monitoringState?: AiMonitoringState
      warningCount?: number
    }
    if (!body.missionId || !body.imageDataUrl?.startsWith("data:image/")) {
      return NextResponse.json({ error: "Mission ID and a camera snapshot are required." }, { status: 400 })
    }

    const { data: mission, error: missionError } = await context.client
      .from("missions")
      .select("id, creator_id")
      .eq("id", body.missionId)
      .maybeSingle()
    if (missionError) return NextResponse.json({ error: missionError.message }, { status: 400 })
    if (!mission) return NextResponse.json({ error: "Mission not found or access denied." }, { status: 404 })
    if (mission.creator_id !== context.user.id) return NextResponse.json({ error: "Mission access denied." }, { status: 403 })

    const result = await analyzeMissionSnapshot({
      imageDataUrl: body.imageDataUrl,
      missionName: body.missionName ?? "Untitled mission",
      missionDescription: body.missionDescription ?? "",
      missionCategory: body.missionCategory ?? "",
      remainingTime: body.remainingTime ?? "unknown",
      recordingStatus: body.recordingStatus ?? "unknown",
      monitoringState: body.monitoringState ?? "unknown",
      warningCount: body.warningCount ?? 0,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[AI Vision] request failed", error)
    return NextResponse.json({ error: "AI monitoring is temporarily unavailable." }, { status: 503 })
  }
}
