import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { requireSavedMissionPaymentMethod } from "@/lib/mission-payment"

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

export async function GET(request: Request) {
  const context = await getClient(request)
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
  const { client, user } = context
  const url = new URL(request.url)

  if (url.searchParams.get("notifications") === "1") {
    const { data: persistedNotifications, error: notificationsError } = await client
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (notificationsError) return NextResponse.json({ error: notificationsError.message }, { status: 500 })

    const { data: memberships, error: membershipError } = await client
      .from("mission_members")
      .select("mission_id")
      .eq("user_id", user.id)

    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 })

    const missionIds = [...new Set((memberships ?? []).map((membership) => membership.mission_id).filter(Boolean))]
    const { data: createdMissions, error: createdMissionError } = missionIds.length
      ? await client.from("missions").select("id, name").in("id", missionIds)
      : { data: [], error: null }

    if (createdMissionError) return NextResponse.json({ error: createdMissionError.message }, { status: 500 })

    const missionNameMap = new Map((createdMissions ?? []).map((mission) => [mission.id, mission.name]))

    const { data: eventRows, error: eventError } = missionIds.length
      ? await client
        .from("mission_events")
        .select("id, mission_id, event_type, payload, created_at")
        .in("mission_id", missionIds)
        .order("created_at", { ascending: false })
      : { data: [], error: null }

    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

    // These event types already get a real, properly-worded row inserted
    // into `notifications` by the RPC/route that causes them (e.g.
    // create_work_team_mission inserts a real "Group Mission Invitation"
    // notification for group_invitation). Generating a fallback for them
    // too produced a second card for the same event under a generic
    // "Mission Activity" title -- for group_invitation specifically, that
    // second card also rendered its own Accept/Decline buttons (action is
    // re-derived from event_type on the client), so an invitee saw what
    // looked like two separate invitations to respond to.
    const eventTypesWithRealNotifications = new Set([
      "group_invitation", "member_accepted", "member_declined", "group_mission_ready",
      "group_mission_cancelled", "group_mission_started", "member_failed",
      "group_mission_completed", "member_completed", "work_submitted", "work_confirmed_complete",
      "pledge_split", "work_rejected",
    ])

    const fallbackNotifications = (eventRows ?? [])
      .filter((event) => !eventTypesWithRealNotifications.has(event.event_type ?? ""))
      .map((event) => {
      const missionName = missionNameMap.get(event.mission_id) ?? "Mission"
      const eventType = event.event_type ?? "mission_event"
      const title = eventType === "mission_created"
        ? "Mission Created"
        : eventType === "mission_started"
          ? "Mission Started"
          : eventType === "mission_failed"
            ? "Mission Failed"
            : eventType === "checkpoint_ready"
              ? "Checkpoint Ready"
              : eventType === "checkpoint_completed"
                ? "Photo Submitted"
                : eventType.includes("failed")
                  ? "Mission Update"
                  : eventType.includes("completed")
                    ? "Mission Update"
                    : "Mission Activity"

      const description = eventType === "mission_created"
        ? `Your mission '${missionName}' was created successfully.`
        : eventType === "mission_started"
          ? `Your mission '${missionName}' has started.`
          : eventType === "mission_failed"
            ? `Your mission '${missionName}' failed.`
            : typeof event.payload?.mission_name === "string"
              ? `${missionName}`
              : `Activity for '${missionName}' was recorded.`

      return {
        id: event.id,
        user_id: user.id,
        mission_id: event.mission_id,
        event_type: eventType,
        title,
        description,
        payload: event.payload ?? {},
        action: "details",
        read_at: null,
        created_at: event.created_at,
      }
    })

    const mergedNotifications = [...(persistedNotifications ?? []), ...fallbackNotifications]
      .filter((entry, index, array) => array.findIndex((candidate) => candidate.id === entry.id) === index)
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())

    return NextResponse.json({ notifications: mergedNotifications })
  }

  const { data: friendships, error: friendsError } = await client
    .from("friendships")
    .select("user_id, friend_id, status")
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
    .eq("status", "accepted")
  if (friendsError) return NextResponse.json({ error: friendsError.message }, { status: 500 })

  const friendIds = [...new Set((friendships ?? []).map((friendship) => friendship.user_id === user.id ? friendship.friend_id : friendship.user_id))]
  const { data: friends, error: profileError } = friendIds.length
    ? await client.from("profiles").select("user_id, name, friend_id").in("user_id", friendIds)
    : { data: [], error: null }
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  const { data: memberships, error: missionsError } = await client
    .from("mission_members")
    .select("*")
    .eq("user_id", user.id)
  if (missionsError) return NextResponse.json({ error: missionsError.message }, { status: 500 })
  const missionIds = (memberships ?? []).map((membership) => membership.mission_id)
  const { data: missions, error: missionError } = missionIds.length
    ? await client.from("missions").select("*").in("id", missionIds).order("created_at", { ascending: false })
    : { data: [], error: null }
  if (missionError) return NextResponse.json({ error: missionError.message }, { status: 500 })

  const memberRows = missionIds.length
    ? (await client.from("mission_members").select("*").in("mission_id", missionIds)).data ?? []
    : []
  const memberUserIds = [...new Set(memberRows.map((member) => member.user_id))]
  const { data: memberProfiles, error: memberProfilesError } = memberUserIds.length
    ? await client.from("profiles").select("user_id, name, friend_id").in("user_id", memberUserIds)
    : { data: [], error: null }
  if (memberProfilesError) return NextResponse.json({ error: memberProfilesError.message }, { status: 500 })
  const memberProfileMap = new Map((memberProfiles ?? []).map((profile) => [profile.user_id, profile]))
  const missionMembersByMission = new Map<string, unknown[]>()
  memberRows.forEach((member) => {
    const rows = missionMembersByMission.get(member.mission_id) ?? []
    rows.push({ ...member, profile: memberProfileMap.get(member.user_id) ?? null })
    missionMembersByMission.set(member.mission_id, rows)
  })

  return NextResponse.json({
    friends: friends ?? [],
    missions: (missions ?? []).map((mission) => ({
      ...mission,
      mission_members: missionMembersByMission.get(mission.id) ?? [],
    })),
  })
}

export async function POST(request: Request) {
  const context = await getClient(request)
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
  const body = await request.json() as {
    name?: string
    description?: string
    category?: string
    startTime?: string
    endTime?: string
    pledgeAmount?: number
    friendIds?: string[]
    failedDestination?: string
    foundationRecipient?: string
    supportRecipient?: string
    friendTasks?: Record<string, string>
  }
  if (!body.name || !body.startTime || !body.endTime || !Array.isArray(body.friendIds)) {
    return NextResponse.json({ error: "Mission name, time, and friends are required." }, { status: 400 })
  }

  const { data: friendships, error: friendsError } = await context.client
    .from("friendships")
    .select("user_id, friend_id")
    .or(`user_id.eq.${context.user.id},friend_id.eq.${context.user.id}`)
    .eq("status", "accepted")
  if (friendsError) return NextResponse.json({ error: friendsError.message }, { status: 400 })

  const acceptedFriendIds = [...new Set((friendships ?? []).map((friendship) =>
    friendship.user_id === context.user.id ? friendship.friend_id : friendship.user_id,
  ))]

  try {
    await requireSavedMissionPaymentMethod({
      supabaseClient: context.client,
      user: context.user,
    })
  } catch (error) {
    const stripeError = error as {
      message?: string
      code?: string
      type?: string
      param?: string
      statusCode?: number
    }
    return NextResponse.json({
      error: stripeError.message ?? "Please add and save a card before creating this mission.",
      code: stripeError.code ?? "missing_payment_method",
      type: stripeError.type ?? null,
      param: stripeError.param ?? null,
    }, { status: stripeError.statusCode && Number.isFinite(stripeError.statusCode) ? stripeError.statusCode : 400 })
  }

  const { data: friendProfiles, error: profilesError } = acceptedFriendIds.length
    ? await context.client.from("profiles").select("user_id, friend_id").in("user_id", acceptedFriendIds)
    : { data: [], error: null }
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 400 })

  const friendIdToUserId = new Map<string, string>()
  ;(friendProfiles ?? []).forEach((profile) => {
    friendIdToUserId.set(profile.user_id, profile.user_id)
    if (profile.friend_id) friendIdToUserId.set(profile.friend_id, profile.user_id)
  })
  const invitedUserIds = [...new Set(body.friendIds.map((friendId) => friendIdToUserId.get(friendId)).filter((userId): userId is string => Boolean(userId)))]
  if (invitedUserIds.length !== body.friendIds.length) {
    return NextResponse.json({ error: "One or more selected friends are not accepted friends." }, { status: 400 })
  }

  if (new Date(body.startTime).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Start time must be in the future." }, { status: 400 })
  }

  // friendTasks is keyed by whatever id the client picked the friend with
  // (friend_id or user_id) -- re-key it by the resolved user_id so it lines
  // up with invited_user_ids for the RPC.
  const invitedUserTasks: Record<string, string> = {}
  if (body.friendTasks) {
    for (const [friendKey, task] of Object.entries(body.friendTasks)) {
      const userId = friendIdToUserId.get(friendKey)
      if (userId && task.trim()) invitedUserTasks[userId] = task.trim()
    }
  }

  const { data, error } = await context.client.rpc("create_work_team_mission", {
    mission_name: body.name.trim(),
    mission_description: body.description?.trim() ?? "",
    mission_category: body.category?.trim() || "Work Team",
    mission_start: body.startTime,
    mission_end: body.endTime,
    mission_pledge: Number(body.pledgeAmount ?? 0),
    invited_user_ids: invitedUserIds,
    failure_destination: body.failedDestination ?? "return-to-friends",
    invited_user_tasks: invitedUserTasks,
    foundation_recipient: body.foundationRecipient ?? null,
    support_recipient: body.supportRecipient ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ missionId: data }, { status: 201 })
}
