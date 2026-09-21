import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { captureMissionPledgeHold, releaseMissionPledgeHold, requireSavedMissionPaymentMethod } from "@/lib/mission-payment"
import type { Mission } from "@/lib/missions"

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

export async function POST(request: Request) {
	const context = await getClient(request)
	if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })

	const body = await request.json() as Record<string, unknown>
	const invitedUserIds = Array.isArray(body.invitedFriends)
		? body.invitedFriends.filter((value): value is string => typeof value === "string")
		: []
	const missionType = body.missionType === "Group" ? "group" : "solo"
	const status = body.status === "In Progress" ? "in_progress" : body.status === "Completed" ? "completed" : body.status === "Failed" ? "failed" : "upcoming"
	const pledgeAmount = Number(body.pledgeAmount ?? 0)

	if (Number.isFinite(pledgeAmount) && pledgeAmount >= 10) {
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
	}

	const { data: acceptedFriendships, error: friendshipsError } = invitedUserIds.length
		? await context.client
			.from("friendships")
			.select("user_id, friend_id")
			.eq("status", "accepted")
			.or(`user_id.eq.${context.user.id},friend_id.eq.${context.user.id}`)
		: { data: [], error: null }
	if (friendshipsError) return NextResponse.json({ error: friendshipsError.message }, { status: 400 })

	const acceptedFriendIds = new Set((acceptedFriendships ?? []).map((friendship) =>
		friendship.user_id === context.user.id ? friendship.friend_id : friendship.user_id,
	))
	const validInvitedUserIds = invitedUserIds.filter((userId) => acceptedFriendIds.has(userId))
	// A group mission (Group GPS Check is the only type created through this
	// route -- Work Team has its own dedicated create_work_team_mission RPC)
	// must wait for every invited member to accept before it can ever start,
	// mirroring Work Team's own gate. Without this override it was created
	// straight into "upcoming", so the creator's own check-in effect started
	// running the moment start_time arrived regardless of anyone else's
	// response.
	const isGatedGroupMission = missionType === "group" && validInvitedUserIds.length > 0
	const initialStatus = isGatedGroupMission ? "waiting_for_members" : status

	const { data: mission, error: missionError } = await context.client.from("missions").insert({
		creator_id: context.user.id,
		mission_type: missionType,
		name: body.missionName,
		description: typeof body.description === "string" ? body.description : "",
		category: body.category,
		verification_type: body.verificationType,
		start_time: body.startTime,
		end_time: body.endTime,
		duration_minutes: body.durationMinutes,
		pledge_amount: body.pledgeAmount,
		failed_destination: body.failedMissionDest ?? "return-to-friends",
		friend_recipient: body.friendRecipient ?? null,
		foundation_recipient: body.foundationRecipient ?? null,
		support_recipient: body.supportRecipient ?? null,
		gps_destination_name: body.gpsDestinationName ?? null,
		gps_destination_address: body.gpsDestinationAddress ?? null,
		gps_latitude: body.gpsLatitude ?? null,
		gps_longitude: body.gpsLongitude ?? null,
		checks: body.checks ?? { first: "Waiting", mid: "Waiting", final: "Waiting" },
		status: initialStatus,
	}).select("*").single()

	if (missionError) return NextResponse.json({ error: missionError.message }, { status: 400 })

	const { error: createdEventError } = await context.client.rpc("record_mission_event", {
		target_mission_id: mission.id,
		target_event_type: "mission_created",
		target_payload: {
			mission_name: mission.name,
			mission_type: missionType,
			verification_type: body.verificationType,
			pledge_amount: Number(body.pledgeAmount ?? 0),
			created_at: new Date().toISOString(),
		},
	})
	if (createdEventError) {
		console.warn("[missions] mission_created event insert failed", createdEventError.message)
	}

	const members = [
		{ mission_id: mission.id, user_id: context.user.id, role: "creator", status: "accepted" },
		...validInvitedUserIds
			.filter((userId) => userId !== context.user.id)
			.map((userId) => ({ mission_id: mission.id, user_id: userId, role: "member", status: "pending" })),
	]
	const { error: membersError } = await context.client.from("mission_members").insert(members)
	if (membersError) return NextResponse.json({ error: membersError.message }, { status: 400 })

	if (isGatedGroupMission) {
		const pendingMemberIds = members.filter((member) => member.role === "member").map((member) => member.user_id)
		const { error: invitationNotificationError } = await context.client.from("notifications").insert(
			pendingMemberIds.map((userId) => ({
				user_id: userId,
				mission_id: mission.id,
				event_type: "group_invitation",
				title: "Group Mission Invitation",
				description: `You have been invited to join ${mission.name}.`,
				payload: {
					mission_name: mission.name,
					creator_id: context.user.id,
					start_time: mission.start_time,
					end_time: mission.end_time,
					duration_minutes: mission.duration_minutes,
					pledge_amount: mission.pledge_amount,
				},
				action: "respond",
			})),
		)
		if (invitationNotificationError) {
			console.warn("[missions] group invitation notification insert failed", invitationNotificationError.message)
		}
	}

	return NextResponse.json({ mission }, { status: 201 })
}

export async function PATCH(request: Request) {
	const context = await getClient(request)
	if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
	const missionId = new URL(request.url).searchParams.get("id")
	if (!missionId) return NextResponse.json({ error: "Mission ID is required." }, { status: 400 })

	const body = await request.json() as Record<string, unknown>
	const update: Record<string, unknown> = {}
	if (typeof body.status === "string") update.status = body.status === "In Progress" ? "in_progress" : body.status === "Completed" ? "completed" : body.status === "Failed" ? "failed" : "upcoming"
	if (typeof body.startedAt === "string") update.started_at = body.startedAt
	if (typeof body.recordingStatus === "string") update.recording_status = body.recordingStatus
	if (typeof body.recordingPausedAt === "string") update.paused_at = body.recordingPausedAt
	if (typeof body.videoUrl === "string") update.video_url = body.videoUrl
	if (typeof body.videoSubmittedAt === "string") update.video_submitted_at = body.videoSubmittedAt
	if (body.checks && typeof body.checks === "object") update.checks = body.checks
	if (body.photos && typeof body.photos === "object") update.photos = body.photos
	if (typeof body.gpsCheckInAt === "string") update.gps_check_in_at = body.gpsCheckInAt
	if (typeof body.gpsCheckInLatitude === "number") update.gps_check_in_latitude = body.gpsCheckInLatitude
	if (typeof body.gpsCheckInLongitude === "number") update.gps_check_in_longitude = body.gpsCheckInLongitude
	if (typeof body.gpsCheckInDistance === "number") update.gps_check_in_distance = body.gpsCheckInDistance
	if (typeof body.gpsVerificationStatus === "string") update.gps_verification_status = body.gpsVerificationStatus.toLowerCase()
	if (typeof body.gpsFailureReason === "string") update.gps_failure_reason = body.gpsFailureReason

	const { data: currentMission, error: missionLookupError } = await context.client
		.from("missions")
		.select("id, creator_id, start_time, started_at, status")
		.eq("id", missionId)
		.maybeSingle()
	if (missionLookupError) return NextResponse.json({ error: missionLookupError.message }, { status: 400 })
	if (!currentMission) return NextResponse.json({ error: "Mission not found or access denied." }, { status: 404 })
	if (currentMission.creator_id !== context.user.id) return NextResponse.json({ error: "Mission access denied." }, { status: 403 })

	const now = Date.now()
	const missionStartMs = new Date(currentMission.start_time).getTime()
	const deadlineMs = missionStartMs + 5 * 60 * 1000
	const hasStartedAlready = Boolean(currentMission.started_at)
	const isLateStartAttempt = !hasStartedAlready && (typeof body.startedAt === "string" || update.status === "in_progress") && now >= deadlineMs
	if (isLateStartAttempt) {
		const { error: failError } = await context.client.from("missions").update({ status: "failed" }).eq("id", missionId).eq("creator_id", context.user.id)
		if (failError) return NextResponse.json({ error: failError.message }, { status: 400 })
		try {
			await captureMissionPledgeHold(context.client, missionId, context.user.id)
		} catch (pledgeError) {
			console.error("[missions] Late-start pledge capture failed", pledgeError)
		}
		return NextResponse.json({ error: "Mission start deadline passed. The mission failed before it began." }, { status: 400 })
	}

	const { data: updatedMission, error } = await context.client
		.from("missions")
		.update(update)
		.eq("id", missionId)
		.eq("creator_id", context.user.id)
		.select("id, started_at, status")
		.maybeSingle()
	if (error) return NextResponse.json({ error: error.message }, { status: 400 })
	if (!updatedMission) return NextResponse.json({ error: "Mission update was not persisted. Check the authenticated creator RLS update policy." }, { status: 403 })

	// Resolve the pledge hold exactly once the mission's final outcome is
	// known — release (no money ever moves) on success, capture (real charge)
	// on failure. Both helpers are no-ops if the hold was already resolved.
	if (updatedMission.status === "completed") {
		try {
			await releaseMissionPledgeHold(context.client, missionId, context.user.id)
		} catch (pledgeError) {
			console.error("[missions] Pledge release failed", pledgeError)
		}
	} else if (updatedMission.status === "failed") {
		try {
			await captureMissionPledgeHold(context.client, missionId, context.user.id)
		} catch (pledgeError) {
			console.error("[missions] Pledge capture failed", pledgeError)
		}
	}

	return NextResponse.json({ ok: true })
}

export async function GET(request: Request) {
	const context = await getClient(request)
	if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })

	const missionId = new URL(request.url).searchParams.get("id")
	if (!missionId) return NextResponse.json({ error: "Mission ID is required." }, { status: 400 })

	const { data: mission, error: missionError } = await context.client
		.from("missions")
		.select("*")
		.eq("id", missionId)
		.maybeSingle()
	if (missionError) return NextResponse.json({ error: missionError.message }, { status: 400 })
	if (!mission) return NextResponse.json({ error: "Mission not found or access denied." }, { status: 404 })

	const { data: members, error: membersError } = await context.client
		.from("mission_members")
		.select("*")
		.eq("mission_id", missionId)
	if (membersError) return NextResponse.json({ error: membersError.message }, { status: 400 })
	const { data: timelapseEvents, error: timelapseEventsError } = await context.client
		.from("mission_events")
		.select("event_type, payload, created_at")
		.eq("mission_id", missionId)
		.in("event_type", ["pause_started", "mission_resumed", "recording_started", "video_submitted", "ai_observation"])
		.order("created_at", { ascending: true })
	if (timelapseEventsError) return NextResponse.json({ error: timelapseEventsError.message }, { status: 400 })

	const timelapseState = (timelapseEvents ?? []).reduce((state, event) => {
		const payload = event.payload as Record<string, unknown>
		if (event.event_type === "pause_started") {
			const pauseDurationMinutes = Number(payload.pause_duration_minutes ?? 0)
			return { ...state, pauseStartedAt: String(payload.pause_started_at ?? event.created_at), pauseDurationMinutes: Number(state.pauseDurationMinutes ?? 0) + pauseDurationMinutes, currentPauseDurationMinutes: pauseDurationMinutes, aiMonitoringState: "paused" as const }
		}
		if (event.event_type === "mission_resumed") {
			return { ...state, resumedAt: String(payload.resumed_at ?? event.created_at), currentPauseDurationMinutes: undefined, aiMonitoringState: "normal" as const }
		}
		if (event.event_type === "recording_started") {
			return { ...state, recordingStartedAt: String(payload.started_at ?? event.created_at) }
		}
		if (event.event_type === "video_submitted") {
			return { ...state, videoSubmittedAt: String(payload.submitted_at ?? event.created_at), videoUrl: typeof payload.video_url === "string" ? payload.video_url : undefined }
		}
		return {
			...state,
			aiMonitoringState: payload.state as "normal" | "warning" | "away" | "paused" | "unknown",
			aiWarningCount: Number(payload.warning_count ?? state.aiWarningCount ?? 0),
		}
	}, {} as NonNullable<Mission["timelapseState"]>)

	const userIds = (members ?? []).map((member) => member.user_id)
	const { data: profiles, error: profilesError } = userIds.length
		? await context.client.from("profiles").select("user_id, name").in("user_id", userIds)
		: { data: [], error: null }
	if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 400 })
	const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]))

	const normalizedMission = {
		...mission,
		recording_started_at: mission.recording_started_at ?? timelapseState.recordingStartedAt,
		video_url: mission.video_url ?? timelapseState.videoUrl,
		video_submitted_at: mission.video_submitted_at ?? timelapseState.videoSubmittedAt,
		mission_type: mission.mission_type ?? (mission.verification_type === "Photo AI" ? "solo" : mission.verification_type === "Work Team" ? "work_team" : "group"),
		verification_type: mission.verification_type ?? (mission.category === "Photo AI" ? "Photo AI" : mission.category === "Timelapse Video" ? "Timelapse Video" : mission.category === "GPS Check" ? "GPS Check" : "GPS Check"),
		status: mission.status === "in_progress" ? "in_progress" : mission.status === "completed" ? "completed" : mission.status === "failed" ? "failed" : mission.status === "cancelled" ? "cancelled" : "upcoming",
		mission_members: (members ?? []).map((member) => ({
			...member,
			profile: profileMap.get(member.user_id) ?? null,
		})),
		timelapse_state: Object.keys(timelapseState).length > 0 ? timelapseState : undefined,
	}

	return NextResponse.json({ mission: normalizedMission })
}
