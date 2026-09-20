export type MissionStatus = "Upcoming" | "In Progress" | "Completed" | "Failed" | "Cancelled"
export type VerificationStatus = "Waiting" | "Ready" | "Completed" | "Missed"
export type MissionCheckKey = "first" | "mid" | "final"
export type MissionCheckWindow = {
  start: string
  end: string
}
export type GroupMemberStatus = "Pending" | "Accepted" | "Declined" | "In Progress" | "Completed" | "Failed"
export type GroupMember = {
  memberId: string
  missionId: string
  name: string
  status: GroupMemberStatus
  pledgeAmount: number
  paymentStatus: "Pending" | "Paid"
  acceptedAt?: string
  startTime?: string
  completionStatus: "Pending" | "Completed" | "Failed"
}
export type GroupMissionLifecycle = "Waiting for Members" | "Created" | "Cancelled"

export type Mission = {
  id: string
  missionName: string
  description?: string
  category: string
  missionType: "Solo" | "Group"
  verificationType: "Photo AI" | "Timelapse Video" | "GPS Check" | "Work Team"
  durationLabel: string
  durationMinutes: number
  startTime: string
  endTime: string
  pledgeAmount: number
  failedMissionDest: string
  friendRecipient?: string
  foundationRecipient?: string
  supportRecipient?: string
  status: MissionStatus
  checks: {
    first: VerificationStatus
    mid: VerificationStatus
    final: VerificationStatus
  }
  checkWindows?: Record<MissionCheckKey, MissionCheckWindow>
  createdAt: string
  startedAt?: string
  videoUrl?: string
  videoSubmittedAt?: string
  recordingStatus?: string
  recordingStartedAt?: string
  recordingPausedAt?: string
  timelapseState?: {
    pauseStartedAt?: string
    pauseDurationMinutes?: number
    currentPauseDurationMinutes?: number
    resumedAt?: string
    recordingStartedAt?: string
    videoSubmittedAt?: string
    videoUrl?: string
    aiMonitoringState?: "normal" | "warning" | "away" | "paused" | "unknown"
    aiWarningCount?: number
  }
  aiVerificationStatus?: "Waiting for AI"
  gpsDestinationName?: string
  gpsDestinationAddress?: string
  gpsLatitude?: number
  gpsLongitude?: number
  gpsCheckInAt?: string
  gpsCheckInLatitude?: number
  gpsCheckInLongitude?: number
  gpsCheckInDistance?: number
  gpsVerificationStatus?: "Pending" | "Passed" | "Failed"
  gpsFailureReason?: string
  invitedFriends?: string[]
  groupMembers?: GroupMember[]
  groupMissionLifecycle?: GroupMissionLifecycle
  _notified_starting_soon?: boolean
  _notified_started?: boolean
  _notified_failed?: boolean
  photos?: {
    first?: string
    mid?: string
    final?: string
  }
}

export const getTimelapseDisplayStatus = (mission: Mission, now = Date.now()) => {
  if (mission.status === "Completed") return "เสร็จสิ้น"
  if (mission.status === "Failed") return "ล้มเหลว"
  if (mission.status === "Cancelled") return "ยกเลิกแล้ว"
  if (mission.status === "Upcoming" && !mission.startedAt) {
    return now >= new Date(mission.startTime).getTime() ? "กำลังจะทำ" : "กำลังจะเกิดขึ้น"
  }
  if (mission.status === "In Progress") return "กำลังดำเนินการ"
  return mission.status
}

export type NotificationCategory = "Mission" | "Payment" | "Money Received" | "Friend" | "Group Mission" | "System"
export type NotificationTone = "success" | "failed" | "warning" | "info" | "processing"

export type MissionNotification = {
  id: string
  type: "mission" | "payment" | "friend" | "group" | "system"
  category: NotificationCategory
  title: string
  description: string
  missionId?: string
  missionName?: string
  amount?: number
  amountLabel?: string
  from?: string
  to?: string
  destination?: string
  reason?: string
  dateTime: string
  unread: boolean
  action?: "accept" | "decline" | "view" | "details"
  status?: NotificationTone
  eventType?: string
  activityText?: string
  userId?: string
  personName?: string
}

const MISSIONS_STORAGE_KEY = "go-missions"
const ACTIVE_MISSION_STORAGE_KEY = "activeMission"
const NOTIFICATIONS_STORAGE_KEY = "go-notifications"

const readStorageValue = (key: string) => {
  if (typeof window === "undefined") return null

  try {
    const localValue = window.localStorage.getItem(key)
    if (localValue !== null) return localValue
  } catch {
    // Safari Private Browsing can reject localStorage access.
  }

  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

const writeStorageValue = (key: string, value: string) => {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(key, value)
    return
  } catch {
    // Fall back to sessionStorage when localStorage is read-only or unavailable.
  }

  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Storage can be disabled completely by the browser; the caller can still continue in memory.
  }
}

export const defaultChecks = {
  first: "Waiting",
  mid: "Waiting",
  final: "Waiting",
} as const

const formatNotificationDate = (value: string) =>
  new Date(value).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

export const getMissionCheckWindows = (mission: Mission): Record<MissionCheckKey, MissionCheckWindow> => {
  const startTime = new Date(mission.startTime).getTime()
  const endTime = new Date(mission.endTime).getTime()
  const durationMs = Math.max(endTime - startTime, 0)
  const midStart = startTime + durationMs / 2
  const finalStart = Math.max(startTime, endTime - 5 * 60 * 1000)

  const toDeadline = (scheduledAt: number) => new Date(scheduledAt + 5 * 60 * 1000).toISOString()

  return {
    first: {
      start: new Date(startTime).toISOString(),
      end: toDeadline(startTime),
    },
    mid: {
      start: new Date(midStart).toISOString(),
      end: toDeadline(midStart),
    },
    final: {
      start: new Date(finalStart).toISOString(),
      end: toDeadline(finalStart),
    },
  }
}

const getCheckStatus = (mission: Mission, checkKey: MissionCheckKey, now: number): VerificationStatus => {
  const checkValue = mission.checks[checkKey] ?? "Waiting"

  if (checkValue === "Completed") return "Completed"
  if (checkValue === "Missed") return "Missed"

  const { start } = getMissionCheckWindows(mission)[checkKey]
  const scheduledTime = new Date(start).getTime()
  const deadlineTime = scheduledTime + 5 * 60 * 1000

  if (now < scheduledTime) return "Waiting"
  if (now <= deadlineTime) return "Ready"

  return "Missed"
}

export const normalizeMission = (mission: Mission): Mission => {
  const now = Date.now()
  const startTime = new Date(mission.startTime).getTime()
  const endTime = new Date(mission.endTime).getTime()
  const startWindowDeadline = startTime + 5 * 60 * 1000
  const requiresStartWindow = mission.verificationType === "Photo AI" || mission.verificationType === "Timelapse Video"

  const checkWindows = getMissionCheckWindows(mission)

  const nextChecks = {
    first: getCheckStatus(mission, "first", now),
    mid: getCheckStatus(mission, "mid", now),
    final: getCheckStatus(mission, "final", now),
  }

  const groupMembers = mission.missionType === "Group"
    ? (mission.groupMembers ?? (mission.invitedFriends ?? []).map((memberId) => ({
      memberId,
      missionId: mission.id,
      name: memberId,
      status: "Pending" as const,
      pledgeAmount: mission.pledgeAmount,
      paymentStatus: "Pending" as const,
      completionStatus: "Pending" as const,
    }))).map((member) => {
      if (member.status !== "Accepted" && member.status !== "In Progress") return member
      if (member.completionStatus !== "Pending") return member
      return now >= startTime
        ? { ...member, status: "In Progress" as const, startTime: member.startTime ?? mission.startTime }
        : member
    })
    : undefined
  const hasAcceptedMember = groupMembers?.some((member) => member.status !== "Pending" && member.status !== "Declined") ?? true
  const isGroupWaiting = mission.missionType === "Group" && mission.groupMissionLifecycle === "Waiting for Members"
  let nextStatus = mission.status

  if (mission.status === "Completed" || mission.status === "Failed" || mission.status === "Cancelled") {
    nextStatus = mission.status
  } else if (mission.gpsCheckInAt && mission.verificationType === "GPS Check") {
    nextStatus = "Completed"
  } else if (mission.startedAt) {
    if (now >= endTime) {
      nextStatus = mission.videoSubmittedAt || (mission.verificationType === "GPS Check" && mission.gpsCheckInAt) ? "Completed" : "Failed"
    } else {
      nextStatus = "In Progress"
    }
  } else if (mission.verificationType === "Timelapse Video") {
    if (now >= startWindowDeadline) {
      nextStatus = "Failed"
    } else {
      nextStatus = "Upcoming"
    }
  } else if (mission.verificationType === "Photo AI" && !isGroupWaiting && now >= endTime) {
    nextStatus = Object.values(nextChecks).every((value) => value === "Completed") ? "Completed" : "Failed"
  } else if (!isGroupWaiting && now >= startTime && hasAcceptedMember) {
    if (mission.verificationType === "Photo AI" && now < endTime) {
      nextStatus = "In Progress"
    } else if (requiresStartWindow && now >= startWindowDeadline) {
      nextStatus = "Failed"
    } else {
      nextStatus = "In Progress"
    }
  } else {
    nextStatus = "Upcoming"
  }

  return {
    ...mission,
    status: nextStatus,
    checkWindows,
    checks: {
      first: nextChecks.first,
      mid: nextChecks.mid,
      final: nextChecks.final,
    },
    groupMembers,
    gpsVerificationStatus:
      mission.verificationType === "GPS Check" && nextStatus === "Failed" && !mission.gpsCheckInAt
        ? "Failed"
        : mission.gpsVerificationStatus,
    gpsFailureReason:
      mission.verificationType === "GPS Check" && nextStatus === "Failed" && !mission.gpsCheckInAt
        ? "Check-in time expired"
        : mission.gpsFailureReason,
  }
}

const readStoredMissions = (): Mission[] => {
  if (typeof window === "undefined") return []

  try {
    const raw = readStorageValue(MISSIONS_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as Mission[]
    return parsed.map((mission) => normalizeMission(mission))
  } catch {
    return []
  }
}

const writeStoredMissions = (missions: Mission[]) => {
  if (typeof window === "undefined") return
  writeStorageValue(MISSIONS_STORAGE_KEY, JSON.stringify(missions.map((mission) => normalizeMission(mission))))
}

const toMoney = (amount: number) => `฿${amount}`

const readStoredNotifications = (): MissionNotification[] => {
  if (typeof window === "undefined") return []

  try {
    const raw = readStorageValue(NOTIFICATIONS_STORAGE_KEY)
    if (!raw) return []

    return JSON.parse(raw) as MissionNotification[]
  } catch {
    return []
  }
}

const writeStoredNotifications = (notifications: MissionNotification[]) => {
  if (typeof window === "undefined") return

  writeStorageValue(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications))
}

export const updateStoredNotification = (notificationId: string, updater: (notification: MissionNotification) => MissionNotification) => {
  const notifications = readStoredNotifications()
  const nextNotifications = notifications.map((notification) => notification.id === notificationId ? updater(notification) : notification)
  writeStoredNotifications(nextNotifications)
  return nextNotifications
}

export const syncNotificationsFromMissions = (missions: Mission[]) => {
  const storedNotifications = readStoredNotifications()
  const existingIds = new Set(storedNotifications.map((notification) => notification.id))
  const nextNotifications = [...storedNotifications]

  const addIfMissing = (notification: MissionNotification) => {
    if (existingIds.has(notification.id)) return

    nextNotifications.unshift(notification)
    existingIds.add(notification.id)
  }

  missions.forEach((mission) => {
    const missionName = mission.missionName
    const startTime = new Date(mission.startTime).getTime()
    const now = Date.now()

    if (mission.missionType === "Group" && mission.groupMissionLifecycle !== "Created") {
      if (mission.groupMissionLifecycle === "Waiting for Members") {
        mission.groupMembers?.forEach((member) => {
          if (member.status !== "Pending") return
          addIfMissing({
            id: `group-waiting-${mission.id}-${member.memberId}`,
            type: "group",
            category: "Group Mission",
            title: "🔵 Waiting for Response",
            description: `${member.name} has not responded to the group mission invitation.`,
            missionId: mission.id,
            missionName,
            userId: member.memberId,
            personName: member.name,
            dateTime: mission.createdAt,
            unread: true,
            action: "details",
            status: "info",
          })
        })
      }
      return
    }

    addIfMissing({
      id: `mission-created-${mission.id}`,
      type: "mission",
      category: "Mission",
      title: "Mission Created",
      description: `Your mission '${missionName}' was created successfully.`,
      missionId: mission.id,
      missionName,
      amount: mission.pledgeAmount,
      amountLabel: toMoney(mission.pledgeAmount),
      from: "GO Mission Builder",
      destination: "Mission Holding Balance",
      reason: "Mission created",
      dateTime: mission.createdAt,
      unread: true,
      action: "view",
      status: "success",
    })

    if (mission.missionType !== "Group") {
      addIfMissing({
        id: `mission-pledge-deducted-${mission.id}`,
        type: "payment",
        category: "Payment",
        title: "Money Deducted",
        description: `${toMoney(mission.pledgeAmount)} was deducted for your mission.`,
        missionId: mission.id,
        missionName,
        amount: mission.pledgeAmount,
        amountLabel: `-${toMoney(mission.pledgeAmount)}`,
        destination: "Mission Holding Balance",
        reason: "Mission Pledge",
        dateTime: mission.createdAt,
        unread: true,
        action: "details",
        status: "warning",
      })
    }

    if (mission.status === "Upcoming" && now >= startTime - 5 * 60 * 1000 && now < startTime) {
      addIfMissing({
        id: `mission-starting-soon-${mission.id}`,
        type: "mission",
        category: "Mission",
        title: "Starting Soon",
        description: `Your mission '${missionName}' will start in 5 minutes.`,
        missionId: mission.id,
        missionName,
        amount: mission.pledgeAmount,
        amountLabel: toMoney(mission.pledgeAmount),
        dateTime: new Date(startTime - 5 * 60 * 1000).toISOString(),
        unread: true,
        action: "view",
        status: "warning",
      })
    }

    if (mission.status === "In Progress") {
      addIfMissing({
        id: `mission-started-${mission.id}`,
        type: "mission",
        category: "Mission",
        title: "Mission Started",
        description: `Your mission '${missionName}' has started.`,
        missionId: mission.id,
        missionName,
        amount: mission.pledgeAmount,
        amountLabel: toMoney(mission.pledgeAmount),
        reason: `Duration: ${mission.durationLabel}`,
        destination: "Next checkpoint window",
        dateTime: mission.startTime,
        unread: true,
        action: "view",
        status: "success",
      })
    }

    const checkpoints = [
      { key: "first", label: "Checkpoint 1" },
      { key: "mid", label: "Checkpoint 2" },
      { key: "final", label: "Checkpoint 3" },
    ] as const

    checkpoints.forEach(({ key, label }) => {
      const checkState = mission.checks[key]
      const windowStart = mission.checkWindows?.[key]?.start ?? mission.startTime
      const windowEnd = mission.checkWindows?.[key]?.end ?? mission.endTime

      if (checkState === "Ready") {
        addIfMissing({
          id: `checkpoint-ready-${mission.id}-${key}`,
          type: "mission",
          category: "Mission",
          title: "Photo Required",
          description: `${label} is now ready.`,
          missionId: mission.id,
          missionName,
          reason: `Submission time: ${formatNotificationDate(windowStart)}`,
          destination: `Time remaining until ${formatNotificationDate(windowEnd)}`,
          dateTime: windowStart,
          unread: true,
          action: "view",
          status: "success",
        })

        if (now >= new Date(windowEnd).getTime() - 2 * 60 * 1000 && now < new Date(windowEnd).getTime()) {
          addIfMissing({
            id: `checkpoint-reminder-${mission.id}-${key}`,
            type: "mission",
            category: "Mission",
            title: "Reminder",
            description: "You have 2 minutes left to submit your photo.",
            missionId: mission.id,
            missionName,
            reason: `${label} · Time remaining`,
            destination: `Time remaining: ${formatNotificationDate(windowEnd)}`,
            dateTime: new Date(windowEnd).toISOString(),
            unread: true,
            action: "view",
            status: "warning",
          })
        }
      }

      if (checkState === "Completed") {
        addIfMissing({
          id: `photo-submitted-${mission.id}-${key}`,
          type: "mission",
          category: "Mission",
          title: "Photo Submitted",
          description: `Your photo for ${label} was submitted successfully.`,
          missionId: mission.id,
          missionName,
          reason: "Status: Waiting for AI",
          dateTime: new Date().toISOString(),
          unread: true,
          action: "view",
          status: "info",
        })
      }
    })

    if (mission.status === "Completed") {
      addIfMissing({
        id: `mission-completed-${mission.id}`,
        type: "mission",
        category: "Mission",
        title: "Mission Completed",
        description: `Congratulations! You completed '${missionName}'.`,
        missionId: mission.id,
        missionName,
        amount: mission.pledgeAmount,
        amountLabel: `+${toMoney(mission.pledgeAmount)}`,
        from: "GO Mission Holding Balance",
        reason: "Mission Completed Successfully",
        dateTime: mission.endTime,
        unread: true,
        action: "view",
        status: "success",
      })

      addIfMissing({
        id: `money-returned-${mission.id}`,
        type: "payment",
        category: "Money Received",
        title: "Money Returned",
        description: "Your pledge has been returned.",
        missionId: mission.id,
        missionName,
        amount: mission.pledgeAmount,
        amountLabel: `+${toMoney(mission.pledgeAmount)}`,
        from: "GO Mission Holding Balance",
        reason: "Mission Completed Successfully",
        dateTime: mission.endTime,
        unread: true,
        action: "details",
        status: "success",
      })
    }

    if (mission.status === "Failed") {
      const startDeadlineExceeded = !mission.startedAt && now > new Date(mission.startTime).getTime() + 5 * 60 * 1000
      const failedCheck = mission.checks.final === "Missed" ? "Checkpoint 3" : mission.checks.mid === "Missed" ? "Checkpoint 2" : "Checkpoint 1"

      addIfMissing({
        id: `mission-failed-${mission.id}`,
        type: "mission",
        category: "Mission",
        title: "Mission Failed",
        description: startDeadlineExceeded
          ? "You did not start the mission within 5 minutes. Your pledge has been charged."
          : "You did not complete the mission.",
        missionId: mission.id,
        missionName,
        amount: mission.pledgeAmount,
        amountLabel: toMoney(mission.pledgeAmount),
        reason: startDeadlineExceeded ? "Start deadline missed" : `${failedCheck} was missed`,
        destination: mission.failedMissionDest === "donate-to-foundation"
          ? mission.foundationRecipient ?? "Foundation"
          : mission.failedMissionDest === "return-to-friends"
            ? mission.friendRecipient ?? "Friend"
            : "Selected Support Destination",
        dateTime: mission.endTime,
        unread: true,
        action: "view",
        status: "failed",
      })

      if (mission.failedMissionDest === "return-to-friends") {
        addIfMissing({
          id: `pledge-sent-friend-${mission.id}`,
          type: "payment",
          category: "Payment",
          title: "Pledge Sent",
          description: `Your mission pledge was sent to ${mission.friendRecipient ?? "your friend"}.`,
          missionId: mission.id,
          missionName,
          amount: mission.pledgeAmount,
          amountLabel: `-${toMoney(mission.pledgeAmount)}`,
          from: "GO Wallet",
          to: mission.friendRecipient ?? "Friend",
          destination: mission.friendRecipient ?? "Friend",
          reason: "Mission Failed",
          dateTime: mission.endTime,
          unread: true,
          action: "details",
          status: "failed",
        })
      }

      if (mission.failedMissionDest === "donate-to-foundation") {
        addIfMissing({
          id: `foundation-donation-${mission.id}`,
          type: "payment",
          category: "Payment",
          title: "Donation Sent",
          description: `Your pledge was donated to ${mission.foundationRecipient ?? "Foundation"} because the mission was not completed.`,
          missionId: mission.id,
          missionName,
          amount: mission.pledgeAmount,
          amountLabel: `-${toMoney(mission.pledgeAmount)}`,
          from: "GO Wallet",
          destination: mission.foundationRecipient ?? "Foundation",
          reason: "Mission Failed",
          dateTime: mission.endTime,
          unread: true,
          action: "details",
          status: "failed",
        })
      }
    }

    if (mission.missionType === "Group") {
      mission.groupMembers?.forEach((member) => {
        if (member.status === "Pending") {
          addIfMissing({
            id: `group-waiting-${mission.id}-${member.memberId}`,
            type: "group",
            category: "Group Mission",
            title: "🔵 Waiting for Response",
            description: `${member.name} has not responded to the group mission invitation.`,
            missionId: mission.id,
            missionName,
            userId: member.memberId,
            personName: member.name,
            dateTime: mission.createdAt,
            unread: true,
            action: "details",
            status: "info",
          })
        }

        if (member.paymentStatus === "Paid") {
          addIfMissing({
            id: `group-mission-payment-${mission.id}-${member.memberId}`,
            type: "group",
            category: "Payment",
            title: "🟠 Money Deducted",
            description: `Your pledge of ${toMoney(member.pledgeAmount)} has been deducted for ${missionName}.`,
            missionId: mission.id,
            missionName,
            amount: member.pledgeAmount,
            amountLabel: `-${toMoney(member.pledgeAmount)}`,
            from: "GO Wallet",
            destination: "Group Mission Pool",
            reason: `Member: ${member.name}`,
            userId: member.memberId,
            personName: member.name,
            dateTime: member.acceptedAt ?? mission.createdAt,
            unread: true,
            action: "details",
            status: "warning",
          })
        }
      })
    }
  })

  writeStoredNotifications(nextNotifications)
  return nextNotifications
}

export const getMissionNotifications = (missions: Mission[]): MissionNotification[] => {
  const notifications = syncNotificationsFromMissions(missions)

  return notifications.sort((a, b) => {
    const left = new Date(a.dateTime).getTime()
    const right = new Date(b.dateTime).getTime()
    return right - left
  })
}

export const getStoredNotifications = (): MissionNotification[] => {
  const stored = readStoredNotifications()
  return stored.length ? stored.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()) : []
}

export const markNotificationAsRead = (notificationId: string) => {
  const notifications = readStoredNotifications()
  const nextNotifications = notifications.map((notification) =>
    notification.id === notificationId ? { ...notification, unread: false } : notification,
  )

  writeStoredNotifications(nextNotifications)
  return nextNotifications
}

export const markAllNotificationsAsRead = () => {
  const notifications = readStoredNotifications()
  const nextNotifications = notifications.map((notification) => ({ ...notification, unread: false }))

  writeStoredNotifications(nextNotifications)
  return nextNotifications
}

export const getUnreadNotificationCount = () => {
  return getStoredNotifications().filter((notification) => notification.unread).length
}

export const getStoredMissions = (): Mission[] => readStoredMissions()

export const saveMission = (mission: Mission) => {
  const missions = readStoredMissions()
  const nextMission = normalizeMission(mission)
  const existingIndex = missions.findIndex((item) => item.id === nextMission.id)

  const nextMissions = [...missions]

  if (existingIndex >= 0) {
    nextMissions[existingIndex] = nextMission
  } else {
    nextMissions.unshift(nextMission)
  }

  writeStoredMissions(nextMissions)

  if (typeof window !== "undefined") {
    writeStorageValue(ACTIVE_MISSION_STORAGE_KEY, JSON.stringify(nextMission))
  }

  return nextMissions
}

export const updateMission = (missionId: string, updater: (mission: Mission) => Mission) => {
  const missions = readStoredMissions()
  const index = missions.findIndex((mission) => mission.id === missionId)

  if (index === -1) return null

  const updatedMission = normalizeMission(updater(missions[index]))
  const nextMissions = [...missions]
  nextMissions[index] = updatedMission

  writeStoredMissions(nextMissions)

  if (typeof window !== "undefined") {
    writeStorageValue(ACTIVE_MISSION_STORAGE_KEY, JSON.stringify(updatedMission))
  }

  return updatedMission
}

export const respondToGroupInvitation = (missionId: string, memberId: string, response: "accept" | "decline") => {
  const mission = getMissionById(missionId)
  if (!mission || mission.missionType !== "Group") return null

  let changedMember: GroupMember | null = null
  let activated = false
  let cancelled = false
  const updatedMission = updateMission(missionId, (currentMission) => {
    const nextMembers = currentMission.groupMembers?.map((member) => {
      if (member.memberId !== memberId || member.status !== "Pending") return member
      const accepted = response === "accept"
      changedMember = {
        ...member,
        status: accepted ? "Accepted" : "Declined",
        paymentStatus: "Pending",
        acceptedAt: accepted ? new Date().toISOString() : undefined,
      }
      return changedMember
    }) ?? []
    const hasDeclined = nextMembers.some((member) => member.status === "Declined")
    const everyoneAccepted = nextMembers.length > 0 && nextMembers.every((member) => member.status === "Accepted")
    activated = everyoneAccepted && !hasDeclined
    cancelled = hasDeclined

    return {
      ...currentMission,
      groupMembers: nextMembers.map((member) => activated
        ? { ...member, paymentStatus: "Paid" as const }
        : member),
      groupMissionLifecycle: cancelled ? "Cancelled" : activated ? "Created" : "Waiting for Members",
    }
  })

  const updatedMember = updatedMission?.groupMembers?.find((member) => member.memberId === memberId)
  return updatedMission && updatedMember ? { mission: updatedMission, member: updatedMember, activated, cancelled } : null
}

export const getMissionById = (missionId: string) => {
  const missions = readStoredMissions()
  const mission = missions.find((item) => item.id === missionId)
  return mission ? normalizeMission(mission) : null
}

export const getLatestMission = () => {
  const missions = readStoredMissions()
  return missions.length ? normalizeMission(missions[0]) : null
}
