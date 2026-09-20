import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

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

export async function GET(request: Request, context: RouteContext) {
  const auth = await getClient(request)
  if (!auth) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
  const { id } = await context.params
  await auth.client.rpc("sync_work_team_mission", { target_mission_id: id })
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
  return NextResponse.json(data)
}
