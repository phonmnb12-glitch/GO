import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { resolveGroupPledges } from "@/lib/work-team-pledges"

export const dynamic = "force-dynamic"

const getClient = async (request: Request) => {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!accessToken || !url || !key) return null
  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${accessToken}` } } })
  const { data: { user }, error } = await client.auth.getUser(accessToken)
  if (error || !user) return null
  return { client, user }
}

// Only the team leader (the mission creator) confirms or rejects a
// member's submitted work (see submit-work/route.ts) -- this used to
// require every OTHER peer to confirm before a submission counted as done,
// but the client asked for a single leader-only confirm/reject instead. A
// leader's "confirm" immediately marks that member completed (using the
// service-role client, since confirming another member isn't that member
// themselves, so the existing self-only complete_work_team_member RPC
// doesn't apply here) and, once every member in the mission has reached
// completed, finishes the mission and releases every pledge hold the same
// way manual completion already does.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getClient(request)
  if (!auth) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
  const { id: missionId } = await context.params
  const body = await request.json().catch(() => ({})) as { targetMemberId?: string; decision?: "confirm" | "reject" }
  const targetMemberId = body.targetMemberId
  const decision = body.decision === "reject" ? "reject" : "confirm"
  if (!targetMemberId) return NextResponse.json({ error: "targetMemberId is required." }, { status: 400 })
  if (targetMemberId === auth.user.id) return NextResponse.json({ error: "You cannot confirm your own submission." }, { status: 400 })

  const { data: mission, error: missionError } = await auth.client
    .from("missions")
    .select("creator_id")
    .eq("id", missionId)
    .maybeSingle()
  if (missionError) return NextResponse.json({ error: missionError.message }, { status: 400 })
  if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 })
  if (mission.creator_id !== auth.user.id) {
    return NextResponse.json({ error: "Only the team leader can confirm or reject work." }, { status: 403 })
  }

  if (decision === "reject") {
    // A peer rejecting a submission doesn't fail the mission outright --
    // it just tells the submitter their photo didn't cut it so they can
    // retake and resubmit before the deadline (submit-work already
    // supports resubmitting; the GET handler always shows each member's
    // latest submission). No mission_members status change here.
    const { error: rejectEventError } = await auth.client.rpc("record_mission_event", {
      target_mission_id: missionId,
      target_event_type: "work_rejected",
      target_payload: { target_member_id: targetMemberId },
    })
    if (rejectEventError) return NextResponse.json({ error: rejectEventError.message }, { status: 400 })

    const admin = getSupabaseAdmin()
    const { data: rejecterProfile } = await admin.from("profiles").select("name").eq("user_id", auth.user.id).maybeSingle()
    await admin.from("notifications").insert({
      user_id: targetMemberId,
      mission_id: missionId,
      event_type: "work_rejected",
      title: "งานของคุณยังไม่ผ่านการยืนยัน",
      description: `${rejecterProfile?.name ?? "เพื่อนในทีม"} ไม่ยืนยันงานที่ส่งไป ลองถ่ายรูปส่งใหม่อีกครั้งก่อนหมดเวลา`,
    })

    return NextResponse.json({ ok: true, targetMemberId, decision: "reject" })
  }

  const { error: eventError } = await auth.client.rpc("record_mission_event", {
    target_mission_id: missionId,
    target_event_type: "work_confirmed",
    target_payload: { target_member_id: targetMemberId },
  })
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 400 })

  const admin = getSupabaseAdmin()

  // Leader-only confirm: a single confirm from the creator is enough, no
  // need to wait on every other peer to also confirm.
  await admin
    .from("mission_members")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("mission_id", missionId)
    .eq("user_id", targetMemberId)

  await admin.from("notifications").insert({
    user_id: targetMemberId,
    mission_id: missionId,
    event_type: "work_confirmed_complete",
    title: "งานของคุณได้รับการยืนยันแล้ว",
    description: "หัวหน้าทีมยืนยันงานของคุณแล้ว ระบบจะคืนเงินมัดจำให้อัตโนมัติ",
  })

  // Release THIS member's own pledge hold now -- per spec, each person's
  // deposit comes back as soon as their own work is confirmed, not only
  // once the whole group has finished (checked separately below).
  await resolveGroupPledges(missionId)

  const { data: refreshedMembers } = await admin
    .from("mission_members")
    .select("status")
    .eq("mission_id", missionId)
  const missionCompleted = (refreshedMembers ?? []).every((member) => member.status === "completed")

  if (missionCompleted) {
    await admin.from("missions").update({ status: "completed" }).eq("id", missionId)
    const { data: memberIds } = await admin.from("mission_members").select("user_id").eq("mission_id", missionId)
    if (memberIds?.length) {
      await admin.from("notifications").insert(
        memberIds.map((member) => ({
          user_id: member.user_id,
          mission_id: missionId,
          event_type: "group_mission_completed",
          title: "Group Mission Completed",
          description: "Everyone completed the mission.",
        })),
      )
    }
    await resolveGroupPledges(missionId)
  }

  return NextResponse.json({ ok: true, targetMemberId, everyoneConfirmed: true, missionCompleted })
}
