import type { Mission } from "@/lib/missions"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { mapWorkTeamMission } from "@/lib/work-team-client"

export async function createMissionInSupabase(mission: Mission, sessionOverride?: Session) {
	const { data: { session: refreshedSession }, error: sessionError } = sessionOverride
		? { data: { session: sessionOverride }, error: null }
		: await supabase.auth.refreshSession()
	const session = refreshedSession
	if (sessionError || !session?.access_token) throw new Error(sessionError?.message ?? "Authentication is required.")
	const { data: { user }, error: userError } = await supabase.auth.getUser(session.access_token)
	if (userError || !user) throw new Error(userError?.message ?? "Authentication is required.")

	const response = await fetch("/api/missions", {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
		body: JSON.stringify(mission),
	})
	const result = await response.json() as { mission?: Mission; error?: string }
	if (!response.ok || !result.mission) throw new Error(result.error ?? "Unable to create mission.")
	return result.mission
}

export async function recordMissionEventInSupabase(event: {
	missionId: string
	eventType: string
	payload?: Record<string, unknown>
}) {
	const { data: { session } } = await supabase.auth.getSession()
	if (!session) throw new Error("Authentication is required.")
	const response = await fetch("/api/mission-events", {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
		body: JSON.stringify(event),
	})
	const result = await response.json() as { eventId?: string; error?: string }
	if (!response.ok || !result.eventId) throw new Error(result.error ?? "Unable to record mission event.")
	return result.eventId
}

export async function getMissionFromSupabase(missionId: string) {
	const { data: { session } } = await supabase.auth.getSession()
	if (!session) return null
	const response = await fetch(`/api/missions?id=${encodeURIComponent(missionId)}`, {
		headers: { Authorization: `Bearer ${session.access_token}` },
	})
	const result = await response.json() as { mission?: Parameters<typeof mapWorkTeamMission>[0] }
	return response.ok && result.mission ? mapWorkTeamMission(result.mission) : null
}

export async function updateMissionInSupabase(missionId: string, patch: Partial<Mission>) {
	const { data: { session } } = await supabase.auth.getSession()
	if (!session) throw new Error("Authentication is required.")
	const response = await fetch(`/api/missions?id=${encodeURIComponent(missionId)}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
		body: JSON.stringify(patch),
	})
	const result = await response.json() as { error?: string }
	if (!response.ok) throw new Error(result.error ?? "Unable to update mission.")
}
