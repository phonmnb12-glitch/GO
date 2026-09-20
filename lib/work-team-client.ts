import { getMissionCheckWindows, normalizeMission, type GroupMember, type Mission, type MissionNotification } from "@/lib/missions"

type WorkTeamMissionRow = {
  id: string
  name: string
  description: string
  category: string
  start_time: string
  end_time: string
  pledge_amount: number
  failed_destination: string
  status: "waiting_for_members" | "upcoming" | "in_progress" | "completed" | "cancelled" | "failed"
  mission_type?: "solo" | "group" | "work_team"
  verification_type?: "Photo AI" | "Timelapse Video" | "GPS Check" | "Work Team" | null
  duration_minutes?: number | null
  checks?: Mission["checks"]
  photos?: Record<string, string> | null
  video_url?: string | null
  video_submitted_at?: string | null
  started_at?: string | null
  recording_started_at?: string | null
  recording_status?: string | null
  paused_at?: string | null
  recording_paused_at?: string | null
  timelapse_state?: Mission["timelapseState"]
  gps_check_in_at?: string | null
  gps_check_in_latitude?: number | null
  gps_check_in_longitude?: number | null
  gps_check_in_distance?: number | null
  gps_verification_status?: "Pending" | "Passed" | "Failed" | null
  gps_failure_reason?: string | null
  friend_recipient?: string | null
  foundation_recipient?: string | null
  support_recipient?: string | null
  gps_destination_name?: string | null
  gps_destination_address?: string | null
  gps_latitude?: number | null
  gps_longitude?: number | null
  created_at: string
  mission_members?: Array<{
    user_id: string
    role: "creator" | "member"
    status: "pending" | "accepted" | "declined" | "in_progress" | "completed" | "failed"
    payment_status: "pending" | "paid" | "returned" | "sent"
    responded_at?: string | null
    completed_at?: string | null
    failed_at?: string | null
    profile?: { name?: string; friend_id?: string } | null
  }>
}

export const mapWorkTeamMission = (row: WorkTeamMissionRow): Mission => {
  const now = Date.now()
  const startTime = new Date(row.start_time).getTime()
  const endTime = new Date(row.end_time).getTime()
  const rawMissionType = row.mission_type ?? "solo"
  const rawVerificationType = row.verification_type ?? undefined
  const normalizedMissionType = rawMissionType === "solo" ? "Solo" : rawMissionType === "group" ? "Group" : rawMissionType === "work_team" ? "Group" : "Solo"
  const verificationType = rawVerificationType === "Photo AI" || rawVerificationType === "Timelapse Video" || rawVerificationType === "GPS Check" || rawVerificationType === "Work Team"
    ? rawVerificationType
    : rawMissionType === "work_team"
      ? "Work Team"
      : rawVerificationType === "photo_ai"
        ? "Photo AI"
        : rawVerificationType === "timelapse_video"
          ? "Timelapse Video"
          : rawVerificationType === "gps_check"
            ? "GPS Check"
            : row.category === "Photo AI"
              ? "Photo AI"
              : row.category === "Timelapse Video"
                ? "Timelapse Video"
                : row.category === "GPS Check"
                  ? "GPS Check"
                  : "GPS Check"
  const isTerminal = row.status === "completed" || row.status === "failed" || row.status === "cancelled"
  const gpsActive = verificationType === "GPS Check" && now >= endTime - 30 * 60 * 1000 && now < endTime
  const completedByEvidence = verificationType === "Photo AI"
    ? row.checks?.first === "Completed" && row.checks?.mid === "Completed" && row.checks?.final === "Completed"
    : verificationType === "Timelapse Video"
      ? Boolean(row.video_submitted_at)
      : verificationType === "GPS Check"
        ? Boolean(row.gps_check_in_at)
        : false
  const timelapseExpired = verificationType === "Timelapse Video" && !row.started_at && now >= startTime + 5 * 60 * 1000
  const status = isTerminal
    ? row.status === "completed" ? "Completed" : row.status === "cancelled" ? "Cancelled" : "Failed"
    : now >= endTime
      ? completedByEvidence ? "Completed" : "Failed"
    : verificationType === "Timelapse Video"
      ? row.started_at
        ? "In Progress"
        : timelapseExpired
          ? "Failed"
          : "Upcoming"
    : verificationType === "Photo AI"
      ? now >= startTime ? "In Progress" : "Upcoming"
    : row.status === "waiting_for_members" || now < startTime || (verificationType === "GPS Check" && !gpsActive)
      ? "Upcoming"
      : now < endTime
        ? "In Progress"
        : "Failed"
  const groupMembers: GroupMember[] = (row.mission_members ?? []).map((member) => ({
    memberId: member.user_id,
    missionId: row.id,
    name: member.profile?.name ?? member.user_id,
    status: member.status === "pending" ? "Pending" : member.status === "accepted" ? "Accepted" : member.status === "declined" ? "Declined" : member.status === "in_progress" ? "In Progress" : member.status === "completed" ? "Completed" : "Failed",
    pledgeAmount: Number(row.pledge_amount),
    paymentStatus: member.payment_status === "paid" ? "Paid" : "Pending",
    acceptedAt: member.responded_at ?? undefined,
    startTime: row.start_time,
    completionStatus: member.status === "completed" ? "Completed" : member.status === "failed" ? "Failed" : "Pending",
  }))

  const baseMission: Mission = {
    id: row.id,
    missionName: row.name ?? "Untitled Mission",
    description: row.description ?? "",
    category: row.category ?? "General",
    missionType: normalizedMissionType,
    verificationType,
    durationLabel: `${Math.max(0, Math.round((endTime - startTime) / 60000))} Minutes`,
    durationMinutes: Math.max(0, Math.round((endTime - startTime) / 60000)),
    startTime: row.start_time,
    endTime: row.end_time,
    pledgeAmount: Number(row.pledge_amount ?? 0),
    failedMissionDest: row.failed_destination ?? "return-to-friends",
    status,
    checks: row.checks ?? { first: "Waiting", mid: "Waiting", final: "Waiting" },
    createdAt: row.created_at,
    groupMembers,
    groupMissionLifecycle: row.status === "waiting_for_members" ? "Waiting for Members" : row.status === "cancelled" ? "Cancelled" : "Created",
    friendRecipient: row.friend_recipient ?? undefined,
    foundationRecipient: row.foundation_recipient ?? undefined,
    supportRecipient: row.support_recipient ?? undefined,
    gpsDestinationName: row.gps_destination_name ?? undefined,
    gpsDestinationAddress: row.gps_destination_address ?? undefined,
    gpsLatitude: row.gps_latitude ?? undefined,
    gpsLongitude: row.gps_longitude ?? undefined,
    gpsCheckInAt: row.gps_check_in_at ?? undefined,
    gpsCheckInLatitude: row.gps_check_in_latitude ?? undefined,
    gpsCheckInLongitude: row.gps_check_in_longitude ?? undefined,
    gpsCheckInDistance: row.gps_check_in_distance ?? undefined,
    gpsVerificationStatus: row.gps_verification_status ?? undefined,
    gpsFailureReason: row.gps_failure_reason ?? undefined,
    photos: row.photos ?? undefined,
    startedAt: row.started_at ?? undefined,
    recordingStartedAt: row.recording_started_at ?? undefined,
    videoUrl: row.video_url ?? undefined,
    videoSubmittedAt: row.video_submitted_at ?? undefined,
    recordingStatus: row.recording_status ?? undefined,
    recordingPausedAt: row.paused_at ?? row.recording_paused_at ?? undefined,
    timelapseState: row.timelapse_state,
  }

  return normalizeMission({
    ...baseMission,
    checkWindows: getMissionCheckWindows(baseMission),
  })
}

export const mapWorkTeamNotification = (notification: {
  id: string
  user_id: string
  event_type: string
  title: string
  description: string
  mission_id?: string | null
  payload?: Record<string, unknown>
  created_at: string
  read_at?: string | null
}): MissionNotification => {
  const payload = notification.payload ?? {}
  const amount = typeof payload.amount === "number" ? payload.amount : typeof payload.pledge_amount === "number" ? payload.pledge_amount : undefined
  return {
    id: notification.id,
    type: "group",
    category: notification.event_type.includes("pledge") || notification.event_type.includes("money") ? "Payment" : "Group Mission",
    title: notification.title,
    description: notification.description,
    missionId: notification.mission_id ?? undefined,
    userId: notification.user_id,
    missionName: typeof payload.mission_name === "string" ? payload.mission_name : undefined,
    amount,
    amountLabel: amount === undefined ? undefined : `฿${amount}`,
    dateTime: notification.created_at,
    unread: !notification.read_at,
    action: notification.event_type === "group_invitation" ? "accept" : "details",
    status: notification.event_type.includes("cancelled") || notification.event_type.includes("failed") ? "failed" : notification.event_type.includes("pledge") || notification.event_type.includes("money") ? "warning" : "success",
    eventType: notification.event_type,
  }
}
