import { NextResponse } from "next/server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

// Meant to be hit by a real scheduler (Vercel Cron -- see vercel.json --
// or any external cron pinging this URL every minute) since Next.js has no
// built-in background timer of its own. Finds missions starting within the
// next 5 minutes that haven't been reminded yet (deduped via a
// mission_events row, so re-running this on a schedule never double-sends),
// and notifies every member -- matches spec 2.4's "5 minutes before start"
// reminder, which previously only existed in the disconnected localStorage
// mock, never for real.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authorization = request.headers.get("authorization")
    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const admin = getSupabaseAdmin()
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 5 * 60 * 1000)

  const { data: missions, error: missionsError } = await admin
    .from("missions")
    .select("id, name, start_time")
    .eq("status", "upcoming")
    .gte("start_time", now.toISOString())
    .lte("start_time", windowEnd.toISOString())
  if (missionsError) return NextResponse.json({ error: missionsError.message }, { status: 500 })

  let remindedCount = 0
  for (const mission of missions ?? []) {
    const { data: alreadyReminded } = await admin
      .from("mission_events")
      .select("id")
      .eq("mission_id", mission.id)
      .eq("event_type", "reminder_5min_sent")
      .maybeSingle()
    if (alreadyReminded) continue

    const { data: members } = await admin
      .from("mission_members")
      .select("user_id")
      .eq("mission_id", mission.id)
    const userIds = (members ?? []).map((member) => member.user_id)
    if (!userIds.length) continue

    await admin.from("notifications").insert(
      userIds.map((userId) => ({
        user_id: userId,
        mission_id: mission.id,
        event_type: "mission_starting_soon",
        title: "ภารกิจของคุณจะเริ่มใน 5 นาที",
        description: `ภารกิจ '${mission.name}' จะเริ่มในอีก 5 นาที`,
        payload: { mission_name: mission.name, start_time: mission.start_time },
        action: "details",
      })),
    )
    await admin.from("mission_events").insert({
      mission_id: mission.id,
      event_type: "reminder_5min_sent",
      payload: { reminded_at: now.toISOString() },
    })
    remindedCount += 1
  }

  return NextResponse.json({ ok: true, checked: missions?.length ?? 0, reminded: remindedCount })
}
