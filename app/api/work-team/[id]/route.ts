import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { captureMissionPledgeHold, chargeMissionPledgeForMember, releaseMissionPledgeHold } from "@/lib/mission-payment"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

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

// Resolves any member (creator included) whose mission_members.status just
// became completed/failed but whose pledge hold hasn't been released or
// captured yet. Safe to call after every sync/complete -- both helpers are
// no-ops for a member whose hold is already resolved, so re-checking
// everyone each time never double-charges or double-releases anyone.
async function resolveGroupPledges(missionId: string) {
  const admin = getSupabaseAdmin()
  const { data: members, error } = await admin
    .from("mission_members")
    .select("user_id, status")
    .eq("mission_id", missionId)
    .in("status", ["completed", "failed"])
  if (error || !members) return

  for (const member of members) {
    try {
      if (member.status === "completed") {
        await releaseMissionPledgeHold(admin, missionId, member.user_id)
      } else {
        await captureMissionPledgeHold(admin, missionId, member.user_id)
      }
    } catch (resolveError) {
      console.error("[work-team] Pledge resolution failed for member", member.user_id, resolveError)
    }
  }
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
  return NextResponse.json({
    mission,
    members: (members ?? []).map((member) => ({ ...member, profile: profileMap.get(member.user_id) ?? null })),
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
