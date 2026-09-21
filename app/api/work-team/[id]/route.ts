import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { chargeMissionPledgeForMember } from "@/lib/mission-payment"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { resolveGroupPledges } from "@/lib/work-team-pledges"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

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

// Charges every accepted participant's pledge (real Stripe hold) the
// moment everyone has accepted -- creator included. Unlike GPS Check
// (charged at creation, by the creator alone), the spec has Work Team
// charge everyone "พร้อมกัน" (simultaneously) only once every invite is
// accepted, so the creator's own hold happens here too, not earlier.
async function chargeAcceptedMembers(missionId: string) {
  const admin = getSupabaseAdmin()
  const { data: members, error } = await admin
    .from("mission_members")
    .select("user_id, role")
    .eq("mission_id", missionId)
    .eq("status", "accepted")
  if (error || !members) return

  for (const member of members) {
    try {
      await chargeMissionPledgeForMember(admin, missionId, member.user_id)
    } catch (chargeError) {
      console.error("[work-team] Pledge hold failed for member", member.user_id, chargeError)
    }
  }
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await getClient(request)
  if (!auth) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
  const { id } = await context.params
  await auth.client.rpc("sync_work_team_mission", { target_mission_id: id })
  await resolveGroupPledges(id)
  const { data: mission, error: missionError } = await auth.client.from("missions").select("*").eq("id", id).maybeSingle()
  if (missionError) return NextResponse.json({ error: missionError.message }, { status: 500 })
  if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 })
  const { data: members, error: membersError } = await auth.client.from("mission_members").select("*").eq("mission_id", id)
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 })
  const userIds = (members ?? []).map((member) => member.user_id)
  const { data: profiles, error: profilesError } = userIds.length
    ? await auth.client.from("profiles").select("user_id, name, friend_id").in("user_id", userIds)
    : { data: [], error: null }
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]))

  // Latest work submission per member (photo + AI %-match) plus who has
  // confirmed it so far, so the UI can show each pending submission with a
  // confirm button for everyone except the submitter -- see submit-work and
  // confirm-work.
  const { data: workEvents } = await auth.client
    .from("mission_events")
    .select("user_id, event_type, payload, created_at")
    .eq("mission_id", id)
    .in("event_type", ["work_submitted", "work_confirmed"])
    .order("created_at", { ascending: true })

  const latestSubmissionByMember = new Map<string, { percent: number; reason: string; photo: string; submittedAt: string }>()
  const confirmationsByTarget = new Map<string, Set<string>>()
  for (const event of workEvents ?? []) {
    const payload = event.payload as Record<string, unknown>
    if (event.event_type === "work_submitted") {
      latestSubmissionByMember.set(event.user_id, {
        percent: Number(payload.percent ?? 0),
        reason: typeof payload.reason === "string" ? payload.reason : "",
        photo: typeof payload.photo === "string" ? payload.photo : "",
        submittedAt: event.created_at,
      })
      confirmationsByTarget.set(event.user_id, new Set())
    } else if (event.event_type === "work_confirmed") {
      const targetMemberId = typeof payload.target_member_id === "string" ? payload.target_member_id : null
      if (!targetMemberId) continue
      const set = confirmationsByTarget.get(targetMemberId) ?? new Set<string>()
      set.add(event.user_id)
      confirmationsByTarget.set(targetMemberId, set)
    }
  }

  return NextResponse.json({
    mission,
    members: (members ?? []).map((member) => ({
      ...member,
      profile: profileMap.get(member.user_id) ?? null,
      submission: latestSubmissionByMember.get(member.user_id) ?? null,
      confirmedBy: [...(confirmationsByTarget.get(member.user_id) ?? [])],
    })),
    viewerId: auth.user.id,
  })
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await getClient(request)
  if (!auth) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
  const { id } = await context.params
  const body = await request.json() as { action?: "accept" | "decline" | "complete" }
  if (!body.action) return NextResponse.json({ error: "Action is required." }, { status: 400 })

  const rpc = body.action === "complete" ? "complete_work_team_member" : "respond_work_team_invitation"
  const params = body.action === "complete"
    ? { target_mission_id: id }
    : { target_mission_id: id, response: body.action }
  const { data, error } = await auth.client.rpc(rpc, params)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const result = data as { everyone_accepted?: boolean; completed?: boolean } | null
  if (body.action !== "complete" && result?.everyone_accepted) {
    await chargeAcceptedMembers(id)
  }
  if (body.action === "complete" && result?.completed) {
    await resolveGroupPledges(id)
  }

  return NextResponse.json(data)
}
