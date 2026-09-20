export type EventType =
  | "mission_created"
  | "mission_starting_soon"
  | "mission_started"
  | "mission_completed"
  | "mission_failed"
  | "photo_ready"
  | "photo_completed"
  | "photo_failed"
  | "timelapse_started"
  | "timelapse_completed"
  | "gps_started"
  | "gps_checkin_pending"
  | "gps_checkin_completed"
  | "group_invitation"
  | "friend_request"
  | "friend_accepted"
  | "money_deducted"
  | "money_returned"
  | "money_sent"
  | "money_received"

export interface AppEvent {
  id: string
  type: EventType
  missionId?: string
  missionName?: string
  userId?: string
  personName?: string
  amount?: number
  destination?: string
  reason?: string
  timestamp: string
}

export interface MissionNotification {
  id: string
  type: string
  category: string
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
  status?: "success" | "failed" | "warning" | "info" | "processing"
  eventType?: string
  activityText?: string
  userId?: string
  personName?: string
}

const EVENTS_KEY = "go-app-events"
const NOTIFICATIONS_KEY = "go-notifications"

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
    // Storage can be disabled completely by the browser.
  }
}

export const readEvents = (): AppEvent[] => {
  if (typeof window === "undefined") return []
  try {
    const raw = readStorageValue(EVENTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export const writeEvents = (events: AppEvent[]) => {
  if (typeof window === "undefined") return
  writeStorageValue(EVENTS_KEY, JSON.stringify(events))
}

export const addEvent = (event: Omit<AppEvent, "id">): AppEvent => {
  const events = readEvents()
  const newEvent: AppEvent = {
    ...event,
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }
  events.unshift(newEvent)
  writeEvents(events)
  return newEvent
}

export const readNotifications = (): MissionNotification[] => {
  if (typeof window === "undefined") return []
  try {
    const raw = readStorageValue(NOTIFICATIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export const writeNotifications = (notifications: MissionNotification[]) => {
  if (typeof window === "undefined") return
  writeStorageValue(NOTIFICATIONS_KEY, JSON.stringify(notifications))
}

export const addNotification = (notification: Omit<MissionNotification, "id">): MissionNotification => {
  const notifications = readNotifications()
  
  // Check for duplicate by eventType + missionId
  const isDuplicate = notifications.some(
    n => n.eventType === notification.eventType && n.missionId === notification.missionId
  )
  if (isDuplicate) return notifications.find(n => n.eventType === notification.eventType && n.missionId === notification.missionId)!

  const newNotification: MissionNotification = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }
  notifications.unshift(newNotification)
  writeNotifications(notifications)
  return newNotification
}

export const recordMissionEvent = (event: Omit<AppEvent, "id">, notification: Omit<MissionNotification, "id">) => {
  const existingEvent = readEvents().find((item) => item.type === event.type && item.missionId === event.missionId)
  if (!existingEvent) addEvent(event)

  return addNotification({
    ...notification,
    eventType: event.type,
  })
}

export const markNotificationAsRead = (id: string) => {
  const notifications = readNotifications()
  const notif = notifications.find(n => n.id === id)
  if (notif) {
    notif.unread = false
    writeNotifications(notifications)
  }
}

export const markAllNotificationsAsRead = (): MissionNotification[] => {
  const notifications = readNotifications()
  notifications.forEach(n => n.unread = false)
  writeNotifications(notifications)
  return notifications
}

export const getRecentActivity = (limit: number = 5): MissionNotification[] => {
  const notifications = readNotifications()
  return notifications.slice(0, limit)
}
