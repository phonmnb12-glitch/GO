import { captureMissionPledgeHold, releaseMissionPledgeHold } from "@/lib/mission-payment"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

// When a team member fails and the mission's failure destination is
// "return-to-friends", the spec's intent is that the forfeited pledge is
// split among the teammates who actually completed their part -- not sent
// in full to whichever single friend happened to be picked at creation
// (the schema's friend_recipient field is for solo missions, which have no
// teammates to split with). The real money is already captured into the
// platform's own Stripe account by captureMissionPledgeHold; this records
// each teammate's share and notifies them, since actually wiring a portion
// of that capture out to each teammate's own bank account would need Stripe
// Connect (a much bigger, separate integration -- out of scope here).
async function splitFailedPledgeAmongTeam(
  admin: ReturnType<typeof getSupabaseAdmin>,
  missionId: string,
  failedUserId: string,
) {
  const { data: mission } = await admin
    .from("missions")
    .select("failed_destination, pledge_amount, name")
    .eq("id", missionId)
    .maybeSingle()
  if (!mission || mission.failed_destination !== "return-to-friends") return

  const { data: allMembers } = await admin
    .from("mission_members")
    .select("user_id, status")
    .eq("mission_id", missionId)
  const recipients = (allMembers ?? []).filter((member) => member.user_id !== failedUserId && member.status === "completed")
  if (recipients.length === 0) return

  const totalAmount = Number(mission.pledge_amount ?? 0)
  const shareAmount = Math.round((totalAmount / recipients.length) * 100) / 100
  if (shareAmount <= 0) return

  const { data: failedProfile } = await admin.from("profiles").select("name").eq("user_id", failedUserId).maybeSingle()
  const failedName = failedProfile?.name ?? "เพื่อนในทีม"

  await admin.from("mission_events").insert({
    mission_id: missionId,
    user_id: failedUserId,
    event_type: "pledge_split",
    payload: { total_amount: totalAmount, share_amount: shareAmount, recipient_ids: recipients.map((r) => r.user_id) },
  })

  await admin.from("notifications").insert(
    recipients.map((recipient) => ({
      user_id: recipient.user_id,
      mission_id: missionId,
      event_type: "pledge_split",
      title: "ได้รับส่วนแบ่งเงินมัดจำ",
      description: `${failedName} ทำภารกิจ '${mission.name}' ไม่สำเร็จ คุณได้รับส่วนแบ่ง ${shareAmount} บาท`,
      payload: { amount: shareAmount, from_user_id: failedUserId },
    })),
  )
}

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
        const result = await captureMissionPledgeHold(admin, missionId, member.user_id)
        if (result.resolved) {
          await splitFailedPledgeAmongTeam(admin, missionId, member.user_id)
        }
      }
    } catch (resolveError) {
      console.error("[work-team] Pledge resolution failed for member", member.user_id, resolveError)
    }
  }
}
