import { captureMissionPledgeHold, releaseMissionPledgeHold } from "@/lib/mission-payment"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

// Resolves any member (creator included) whose mission_members.status just
// became completed/failed but whose pledge hold hasn't been released or
// captured yet. Safe to call any time -- both helpers are no-ops for a
// member whose hold is already resolved, so re-checking everyone every call
// never double-charges or double-releases anyone. Shared by the sync/
// complete/decline path (app/api/work-team/[id]/route.ts) and the peer
// work-confirmation path (app/api/work-team/[id]/confirm-work/route.ts).
export async function resolveGroupPledges(missionId: string) {
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
