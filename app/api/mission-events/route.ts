import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

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
  const context = await getClient(request)
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })

  const body = await request.json() as {
    missionId?: string
    eventType?: string
    payload?: Record<string, unknown>
    title?: string
    description?: string
  }
  if (!body.missionId || !body.eventType) return NextResponse.json({ error: "Mission ID and event type are required." }, { status: 400 })

  const { data: eventId, error } = await context.client.rpc("record_mission_event", {
    target_mission_id: body.missionId,
    target_event_type: body.eventType,
    target_payload: body.payload ?? {},
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const eventTitle = body.title || body.eventType.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  const eventDescription = body.description || `Your mission event '${eventTitle}' was recorded.`

  const notificationCopy: Record<string, { title: string; description: string }> = {
    mission_started: { title: "เริ่มภารกิจ", description: "เริ่มภารกิจ Timelapse แล้ว" },
    recording_started: { title: "เริ่มบันทึกวิดีโอ", description: "การบันทึกวิดีโอเริ่มทำงานแล้ว" },
    pause_started: { title: "หยุดชั่วคราว", description: "ภารกิจถูกพักตามเวลาที่อนุมัติ" },
    mission_resumed: { title: "ทำต่อ", description: "กลับมาทำภารกิจต่อแล้ว" },
    video_submitted: { title: "ส่งวิดีโอสำเร็จ", description: "วิดีโอถูกส่งและบันทึกแล้ว" },
    mission_completed: { title: "ภารกิจสำเร็จ", description: "ภารกิจเสร็จสมบูรณ์" },
    mission_failed: { title: "ภารกิจไม่สำเร็จ", description: "ภารกิจไม่สำเร็จตามเงื่อนไข" },
    pledge_deducted: { title: "หักเงินประกัน", description: "เงินประกันถูกหักตามผลภารกิจ" },
  }
  const copy = notificationCopy[body.eventType]
  if (copy) {
    const { data: existingNotification, error: notificationLookupError } = await context.client
      .from("notifications")
      .select("id")
      .eq("mission_id", body.missionId)
      .eq("event_type", body.eventType)
      .eq("user_id", context.user.id)
      .limit(1)
      .maybeSingle()
    if (!notificationLookupError && !existingNotification) {
      await context.client.from("notifications").insert({
        user_id: context.user.id,
        mission_id: body.missionId,
        event_type: body.eventType,
        title: copy.title,
        description: copy.description,
        payload: body.payload ?? {},
        action: "view",
      })
    }
  }

  return NextResponse.json({ eventId, userId: context.user.id }, { status: 201 })
}
