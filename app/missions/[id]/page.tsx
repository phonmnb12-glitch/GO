"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import { useAuth } from "@/components/auth-provider"
import { type Mission } from "@/lib/missions"
import { supabase } from "@/lib/supabase"
import { mapWorkTeamMission } from "@/lib/work-team-client"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

const checkLabels = {
  first: "Checkpoint 1",
  mid: "Checkpoint 2",
  final: "Checkpoint 3",
} as const

const photoCheckpointLabels = {
  first: "First Check",
  mid: "Mid Check",
  final: "Final Check",
} as const

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  })

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })

const formatFailedDestination = (value: string) => {
  if (value === "return-to-friends") return "Return to Friends"
  if (value === "donate-to-foundation") return "Donate to Foundation"
  return value
}

const formatCountdown = (ms: number) => {
  if (ms <= 0) return "Mission is live"

  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / (60 * 60 * 24))
  const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60))
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60)
  const seconds = totalSeconds % 60

  return `${days}d ${hours}h ${minutes}m ${seconds}s`
}

const formatTimeRemaining = (ms: number) => {
  if (ms <= 0) return "Time is up"

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / (60 * 60))
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60)
  const seconds = totalSeconds % 60

  return `${hours}h ${minutes}m ${seconds}s`
}

const formatTimerClock = (ms: number) => {
  if (ms <= 0) return "00:00:00"

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / (60 * 60))
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":")
}

const formatWindowRange = (value?: { start: string; end: string }) => {
  if (!value) return "—"

  const start = new Date(value.start)
  const end = new Date(value.end)

  return `${start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
}

type Coordinates = { latitude: number; longitude: number }

type MissionEventRow = {
  id: string
  event_type: string
  payload?: {
    checkpoint?: string
    passed?: boolean
    reason?: string
    issues?: string[]
    confidence?: number
    photo?: string
  }
  created_at: string
}

const distanceBetween = (first: Coordinates, second: Coordinates) => {
  const earthRadius = 6371000
  const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180
  const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180
  const latitudeOne = first.latitude * Math.PI / 180
  const latitudeTwo = second.latitude * Math.PI / 180
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

const missionStatusConfig = {
  Upcoming: {
    pill: "border-[#121212]/10 bg-white text-[#121212]",
    ring: "bg-[#121212]",
    subtitle: "Mission starts in",
    accent: "border-[#121212]/10 bg-white",
  },
  "In Progress": {
    pill: "border-[#121212]/10 bg-[#121212] text-white",
    ring: "bg-[#121212]",
    subtitle: "Mission active",
    accent: "border-[#121212]/10 bg-[#f3f4f6]",
  },
  Completed: {
    pill: "border-green-200 bg-green-100 text-green-800",
    ring: "bg-green-500",
    subtitle: "Mission completed",
    accent: "border-green-200 bg-green-50",
  },
  Failed: {
    pill: "border-red-200 bg-red-100 text-red-800",
    ring: "bg-red-500",
    subtitle: "Mission failed",
    accent: "border-red-200 bg-red-50",
  },
  Cancelled: {
    pill: "border-gray-200 bg-gray-100 text-gray-700",
    ring: "bg-gray-500",
    subtitle: "Mission cancelled",
    accent: "border-gray-200 bg-gray-50",
  },
} as const

export default function MissionDetail() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id
  const { session, isLoading: authLoading } = useAuth()
  const [mission, setMission] = useState<Mission | null>(null)
  const [missionEvents, setMissionEvents] = useState<MissionEventRow[]>([])
  const [now, setNow] = useState(0)
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null)
  const [isSubmittingGpsOutcome, setIsSubmittingGpsOutcome] = useState(false)
  // Guards against submitting a second, conflicting outcome (e.g. a
  // deadline-expired "Failed" landing right after a within-radius
  // "Completed" already went out) while the locally-cached `mission.status`
  // hasn't caught up to the first PATCH yet -- unlike isSubmittingGpsOutcome,
  // this never resets, so at most one outcome is ever sent per page load.
  const hasSubmittedGpsOutcomeRef = useRef(false)

  useEffect(() => {
    if (!mission || mission.verificationType !== "GPS Check" || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (position) => setCurrentLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setCurrentLocation(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [mission])

  // Real GPS check-in decision, wired to the actual API (unlike the
  // standalone /gps-mission/[id] page, which only ever wrote to
  // localStorage and was never reachable from the real mission-creation
  // flow). Auto-fails once the mission window closes without a successful
  // check-in, auto-completes the moment the live position is within 10m of
  // the destination. PATCHing status to Completed/Failed here is also what
  // triggers the pledge hold's release/capture server-side.
  useEffect(() => {
    if (!mission || !session) return
    if (mission.verificationType !== "GPS Check") return
    if (mission.status === "Completed" || mission.status === "Failed" || mission.status === "Cancelled") return
    if (mission.gpsLatitude === undefined || mission.gpsLongitude === undefined) return
    if (isSubmittingGpsOutcome || hasSubmittedGpsOutcomeRef.current) return

    const nowMs = Date.now()
    const startMs = new Date(mission.startTime).getTime()
    const endMs = new Date(mission.endTime).getTime()
    if (nowMs < startMs) return

    const submitOutcome = async (payload: Record<string, unknown>) => {
      hasSubmittedGpsOutcomeRef.current = true
      setIsSubmittingGpsOutcome(true)
      try {
        await fetch(`/api/missions?id=${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify(payload),
        })
      } catch (error) {
        console.error("[GPS Check] Failed to submit outcome", error)
      } finally {
        setIsSubmittingGpsOutcome(false)
      }
    }

    if (nowMs > endMs) {
      void submitOutcome({
        status: "Failed",
        gpsVerificationStatus: "Failed",
        gpsFailureReason: "Check-in time expired before reaching the destination.",
      })
      return
    }

    if (!currentLocation) return
    const distance = distanceBetween(currentLocation, { latitude: mission.gpsLatitude, longitude: mission.gpsLongitude })
    if (distance > 10) return

    void submitOutcome({
      status: "Completed",
      gpsCheckInAt: new Date(nowMs).toISOString(),
      gpsCheckInLatitude: currentLocation.latitude,
      gpsCheckInLongitude: currentLocation.longitude,
      gpsCheckInDistance: distance,
      gpsVerificationStatus: "Passed",
    })
  }, [mission, currentLocation, session, id, isSubmittingGpsOutcome])

  useEffect(() => {
    if (!session || authLoading) return

    const syncMission = async () => {
      const response = await fetch(`/api/missions?id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await response.json() as { mission?: Parameters<typeof mapWorkTeamMission>[0] }
      setMission(response.ok && result.mission ? mapWorkTeamMission(result.mission) : null)

      const { data: events, error } = await supabase
        .from("mission_events")
        .select("*")
        .eq("mission_id", id)
        .order("created_at", { ascending: true })

      if (!error) {
        setMissionEvents(events ?? [])
      }
    }

    void syncMission()
    const timer = window.setInterval(() => void syncMission(), 5000)
    return () => window.clearInterval(timer)
  }, [authLoading, id, session])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const countdown = useMemo(() => {
    if (!mission || mission.status !== "Upcoming") return null
    const startTime = new Date(mission.startTime).getTime()
    return formatCountdown(startTime - now)
  }, [mission, now])

  const timeRemaining = useMemo(() => {
    if (!mission || mission.status !== "In Progress") return null

    const endTime = new Date(mission.endTime).getTime()
    return formatTimeRemaining(endTime - now)
  }, [mission, now])

  const progressValue = useMemo(() => {
    if (!mission) return 0

    const completed = Object.values(mission.checks).filter((item) => item === "Completed").length
    return Math.round((completed / 3) * 100)
  }, [mission])

  const gpsDistance = useMemo(() => {
    if (!mission || mission.gpsLatitude === undefined || mission.gpsLongitude === undefined || !currentLocation) return undefined
    return distanceBetween(currentLocation, { latitude: mission.gpsLatitude, longitude: mission.gpsLongitude })
  }, [currentLocation, mission])

  const gpsStatusMessage = useMemo(() => {
    if (!mission) return ""
    if (mission.gpsVerificationStatus === "Passed") return "Destination reached"
    if (mission.gpsVerificationStatus === "Failed") return mission.gpsFailureReason ?? "GPS verification failed"
    if (!currentLocation) return "Waiting for Location"
    if (now < new Date(mission.startTime).getTime()) return "Waiting for Check-in Time"
    if (now > new Date(mission.endTime).getTime()) return "Mission time has expired."
    if ((gpsDistance ?? Infinity) > 10) return `${Math.round(gpsDistance ?? 0)} m away. Move closer to the destination.`
    return "Destination reached. Verifying automatically..."
  }, [currentLocation, gpsDistance, mission, now])

  const continueMission = () => {
    if (!mission) return

    if (mission.verificationType === "Photo AI") {
      router.push(`/photo-ai-mission/${mission.id}`)
      return
    }

    if (mission.verificationType === "Timelapse Video") {
      router.push(`/timelapse-mission/${mission.id}`)
      return
    }

    router.push(`/gps-mission/${mission.id}`)
  }

  const photoAiResults = useMemo(() => {
    if (!mission) return {} as Record<string, MissionEventRow["payload"]>

    return missionEvents
      .filter((event) => event.event_type === "photo_ai_verified")
      .reduce<Record<string, MissionEventRow["payload"]>>((accumulator, event) => {
        const checkpoint = event.payload?.checkpoint ?? ""
        if (checkpoint) {
          accumulator[checkpoint] = event.payload
        }
        return accumulator
      }, {})
  }, [mission, missionEvents])

  const renderPhotoAiSections = () => {
    if (!mission || mission.verificationType !== "Photo AI") return null

    return (
      <section className="mt-6 rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
        <div className="space-y-4">
          {(Object.entries(photoCheckpointLabels) as Array<[keyof typeof photoCheckpointLabels, string]>).map(([key, label]) => {
            const status = mission.checks[key]
            const photo = mission.photos?.[key]
            const aiResult = photoAiResults[key]
            const statusTone = status === "Completed" ? "border-green-200 bg-green-50 text-green-700" : status === "Missed" ? "border-red-200 bg-red-50 text-red-700" : status === "Ready" ? "border-[#AFFF00]/70 bg-[#f1ffc9] text-[#111111]" : "border-[#111111]/10 bg-[#f5f5f3] text-[#111111]"

            return (
              <div key={key} className="rounded-[24px] border border-[#111111]/5 bg-[#f7f7f5] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">{label}</div>
                    <div className="mt-1 text-sm font-semibold text-[#111111]">{formatWindowRange(mission.checkWindows?.[key])}</div>
                  </div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusTone}`}>
                    {status}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[18px] border border-[#111111]/5 bg-white p-3">
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">ภาพ</div>
                    {photo ? (
                      <img src={photo} alt={`${label} capture`} className="mt-3 h-52 w-full rounded-2xl object-cover" />
                    ) : (
                      <div className="mt-3 rounded-2xl border border-dashed border-[#111111]/15 bg-[#f5f5f3] p-4 text-sm text-[#5d5d5d]">
                        No photo submitted yet.
                      </div>
                    )}
                  </div>

                  <div className="rounded-[18px] border border-[#111111]/5 bg-white p-3">
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">ผล AI</div>
                    {aiResult ? (
                      <>
                        <div className="mt-2 text-sm font-semibold text-[#111111]">{aiResult.passed ? "ผ่าน" : "ไม่ผ่าน"}</div>
                        <div className="mt-2 text-sm text-[#5d5d5d]">{aiResult.reason ?? "ไม่มีคำอธิบาย"}</div>
                        {Array.isArray(aiResult.issues) && aiResult.issues.length > 0 && (
                          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[#5d5d5d]">
                            {aiResult.issues.map((issue) => <li key={issue}>{issue}</li>)}
                          </ul>
                        )}
                      </>
                    ) : (
                      <div className="mt-3 text-sm text-[#5d5d5d]">ยังไม่มีผลยืนยันจาก AI</div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  const renderTimelapseSection = () => {
    if (!mission || mission.verificationType !== "Timelapse Video") return null

    const recordingStatus = mission.recordingStatus ?? (mission.videoUrl ? "Video uploaded" : mission.status === "Completed" ? "Recorded" : "Waiting")

    return (
      <section className="mt-6 rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black tracking-[-0.06em] text-[#111111]">การบันทึก Timelapse</h2>
          <div className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#111111]">
            {recordingStatus}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[22px] border border-[#111111]/5 bg-[#f7f7f5] p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">เริ่มบันทึก</div>
            <div className="mt-2 text-base font-bold text-[#111111]">{mission.startedAt ? formatDate(mission.startedAt) : "—"}</div>
            <div className="mt-1 text-sm text-[#5d5d5d]">{mission.startedAt ? formatTime(mission.startedAt) : "No recording started yet."}</div>
          </div>

          <div className="rounded-[22px] border border-[#111111]/5 bg-[#f7f7f5] p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">หยุดชั่วคราว / ดำเนินต่อ</div>
            <div className="mt-2 text-base font-bold text-[#111111]">{mission.recordingPausedAt ? formatDate(mission.recordingPausedAt) : "—"}</div>
            <div className="mt-1 text-sm text-[#5d5d5d]">{mission.recordingPausedAt ? formatTime(mission.recordingPausedAt) : "No pause recorded."}</div>
          </div>

          <div className="rounded-[22px] border border-[#111111]/5 bg-[#f7f7f5] p-4 md:col-span-2">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">การส่งวิดีโอ</div>
            <div className="mt-2 text-base font-bold text-[#111111]">{mission.videoSubmittedAt ? formatDate(mission.videoSubmittedAt) : "Not submitted yet"}</div>
            <div className="mt-1 text-sm text-[#5d5d5d]">{mission.videoSubmittedAt ? formatTime(mission.videoSubmittedAt) : "Waiting for the video upload."}</div>
            {mission.videoUrl ? (
              <a href={mission.videoUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-[#111111] underline">
                Open submitted video
              </a>
            ) : null}
          </div>
        </div>
      </section>
    )
  }

  const renderWorkTeamSection = () => {
    if (!mission || mission.verificationType !== "Work Team") return null

    const totalMembers = mission.groupMembers?.length ?? 0
    const completedMembers = mission.groupMembers?.filter((member) => member.status === "Completed").length ?? 0

    return (
      <section className="mt-6 rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black tracking-[-0.06em] text-[#111111]">ทีมงาน</h2>
          <div className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#111111]">
            Completed {completedMembers} / {totalMembers}
          </div>
        </div>

        {(!mission.groupMembers || mission.groupMembers.length === 0) ? (
          <div className="rounded-[22px] border border-dashed border-[#111111]/15 bg-[#f7f7f5] p-6 text-sm text-[#5d5d5d]">
            No members for this mission yet.
          </div>
        ) : (
          <div className="space-y-3">
            {mission.groupMembers.map((member) => (
              <div key={member.memberId} className="flex items-center justify-between gap-3 rounded-[22px] border border-[#111111]/5 bg-[#f7f7f5] p-4">
                <div>
                  <div className="text-sm font-semibold text-[#111111]">{member.name}</div>
                  <div className="mt-1 text-xs text-[#6b6b6b]">{member.status}</div>
                </div>
                <span className="rounded-full border border-[#111111]/10 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#111111]">
                  {member.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  const renderGroupGpsSection = () => {
    if (!mission || mission.verificationType !== "GPS Check" || mission.missionType !== "Group") return null

    return (
      <section className="mt-6 rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black tracking-[-0.06em] text-[#111111]">ตรวจสอบ GPS กลุ่ม</h2>
          <div className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#111111]">
            Radius 10m
          </div>
        </div>

        <div className="rounded-[22px] border border-[#AFFF00]/50 bg-[#f1ffc9] p-4">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">Destination</div>
          <div className="mt-2 text-base font-bold text-[#111111]">{mission.gpsDestinationName ?? "—"}</div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-[#6b6b6b]">Coordinates</span><div className="mt-1 font-semibold">{mission.gpsLatitude ?? "—"}, {mission.gpsLongitude ?? "—"}</div></div>
            <div><span className="text-[#6b6b6b]">End Time</span><div className="mt-1 font-semibold">{formatTime(mission.endTime)}</div></div>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {(!mission.groupMembers || mission.groupMembers.length === 0) ? (
            <div className="rounded-[22px] border border-dashed border-[#111111]/15 bg-[#f7f7f5] p-6 text-sm text-[#5d5d5d]">
              No members in this mission yet.
            </div>
          ) : mission.groupMembers.map((member) => (
            <div key={member.memberId} className="flex items-center justify-between gap-3 rounded-[22px] border border-[#111111]/5 bg-[#f7f7f5] p-4">
              <div>
                <div className="text-sm font-semibold text-[#111111]">{member.name}</div>
                <div className="mt-1 text-xs text-[#6b6b6b]">{member.status}</div>
              </div>
              <span className="rounded-full border border-[#111111]/10 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#111111]">
                {member.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    )
  }

  const renderMissionSpecificSections = () => {
    if (!mission) return null

    if (mission.verificationType === "Photo AI") return renderPhotoAiSections()
    if (mission.verificationType === "Timelapse Video") return renderTimelapseSection()
    if (mission.verificationType === "Work Team") return renderWorkTeamSection()
    if (mission.verificationType === "GPS Check") {
      return mission.missionType === "Group" ? renderGroupGpsSection() : (
        <>
          <section className="mt-6 rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black tracking-[-0.06em] text-[#111111]">ตรวจสอบแผนที่</h2>
              <div className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#111111]">
                GPS
              </div>
            </div>

            <div className="rounded-[22px] border border-[#AFFF00]/50 bg-[#f1ffc9] p-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">Destination</div>
              <div className="mt-2 text-base font-bold text-[#111111]">{mission.gpsDestinationName ?? "—"}</div>
              <div className="mt-1 text-sm text-[#5d5d5d]">{mission.gpsDestinationAddress ?? "ไม่มีที่อยู่ปลายทาง"}</div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><span className="text-[#6b6b6b]">ระยะทาง</span><div className="mt-1 font-semibold">{gpsDistance === undefined ? "กำลังรอพิกัด" : `${Math.round(gpsDistance)} ม.`}</div></div>
                <div><span className="text-[#6b6b6b]">รัศมีที่ต้องใช้</span><div className="mt-1 font-semibold">10 เมตร</div></div>
                <div><span className="text-[#6b6b6b]">สถานะเช็กอิน</span><div className="mt-1 font-semibold">{mission.gpsVerificationStatus ?? "รอดำเนินการ"}</div></div>
                <div><span className="text-[#6b6b6b]">เวลาสิ้นสุดที่กำหนด</span><div className="mt-1 font-semibold">{formatTime(mission.endTime)}</div></div>
                <div><span className="text-[#6b6b6b]">พิกัดปลายทาง</span><div className="mt-1 font-semibold">{mission.gpsLatitude ?? "—"}, {mission.gpsLongitude ?? "—"}</div></div>
                <div><span className="text-[#6b6b6b]">เวลาเช็กอินจริง</span><div className="mt-1 font-semibold">{mission.gpsCheckInAt ? `${formatDate(mission.gpsCheckInAt)} · ${formatTime(mission.gpsCheckInAt)}` : "—"}</div></div>
                <div><span className="text-[#6b6b6b]">ตำแหน่งที่เช็กอิน</span><div className="mt-1 font-semibold">{mission.gpsCheckInLatitude ?? "—"}, {mission.gpsCheckInLongitude ?? "—"}</div></div>
                <div><span className="text-[#6b6b6b]">ระยะห่างตอนเช็กอิน</span><div className="mt-1 font-semibold">{mission.gpsCheckInDistance === undefined ? "—" : `${Math.round(mission.gpsCheckInDistance)} ม.`}</div></div>
              </div>
              {mission.gpsFailureReason && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{mission.gpsFailureReason}</div>}
            </div>
          </section>

          <section className="mt-6 rounded-[30px] border border-[#111111]/5 bg-[#f7f7f5] p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#AFFF00]" />
              <h2 className="text-xl font-bold text-[#111111]">สถานะเช็กอินอัตโนมัติ</h2>
            </div>
            <p className="mt-3 text-sm font-semibold text-[#111111]">{gpsStatusMessage}</p>
            <p className="mt-2 text-sm text-[#5d5d5d]">เช็กอินจะถูกยืนยันอัตโนมัติในเวลาที่กำหนด</p>
          </section>
        </>
      )
    }

    return null
  }

  if (!mission) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
        <DashboardNav />

        <div className="mx-auto max-w-4xl px-6 py-16">
          <h1 className="text-2xl font-bold">รายละเอียดภารกิจ</h1>
          <p className="mt-2 text-sm text-gray-600">ไม่พบรหัสภารกิจ: {id}</p>
          <button type="button" onClick={() => router.push("/missions")} className="mt-6 inline-flex text-sm font-medium text-[#121212] underline">
            ← กลับไปยังภารกิจ
          </button>
        </div>
      </main>
    )
  }

  const statusConfig = missionStatusConfig[mission.status] ?? missionStatusConfig.Upcoming

  const startTime = new Date(mission.startTime).getTime()
  const endTime = new Date(mission.endTime).getTime()
  const timerValue =
    mission.status === "In Progress"
      ? formatTimerClock(Math.max(endTime - now, 0))
      : mission.status === "Upcoming"
        ? formatTimerClock(Math.max(startTime - now, 0))
        : mission.status === "Completed"
          ? "Completed"
          : mission.status === "Failed"
            ? "Failed"
            : "—"

  const timerLabel =
    mission.status === "In Progress"
      ? "MISSION IN PROGRESS"
      : mission.status === "Upcoming"
        ? "MISSION STARTS IN"
        : mission.status === "Completed"
          ? "MISSION COMPLETED"
          : mission.status === "Failed"
            ? "MISSION FAILED"
            : "MISSION STATUS"

  return (
    <main className="min-h-screen bg-[#f5f5f3] text-[#111111]">
      <DashboardNav />

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 md:px-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#5d5d5d] transition hover:text-[#111111]"
          >
            <span aria-hidden="true">←</span>
            Back to Home
          </button>

          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusConfig.pill}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${statusConfig.ring}`} />
            {mission.status}
          </div>
        </div>

        <section className="rounded-[30px] border border-[#111111]/5 bg-white p-4 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_260px] lg:items-end">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">
                Mission ID • {mission.id}
              </p>

              <h1 className="mt-3 max-w-xl text-3xl font-black tracking-[-0.08em] text-[#111111] md:text-[3.5rem]">
                {mission.missionName}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[#111111]">
                <span className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1">
                  {mission.missionType}
                </span>
                <span className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1">
                  {mission.verificationType}
                </span>
                <span className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1">
                  {mission.category}
                </span>
              </div>
            </div>

            <div className="lg:justify-self-end">
              <div className="rounded-[24px] border border-[#111111]/10 bg-[#f6f6f4] p-4 sm:p-5">
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">
                  Active pledge
                </div>
                <div className="mt-2 text-3xl font-black tracking-[-0.08em] text-[#111111]">
                  ฿{mission.pledgeAmount}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[30px] border border-[#111111]/5 bg-[#f7f7f5] p-5 md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6b6b6b]">
                {timerLabel}
              </p>
              <div className="mt-3 text-[2.8rem] font-black tracking-[-0.08em] text-[#111111] md:text-[5rem]">
                {timerValue}
              </div>
            </div>

            <div className="text-sm font-medium text-[#5d5d5d]">
              {mission.status === "In Progress" ? `${progressValue}% Complete` : mission.status === "Upcoming" ? "Awaiting start" : mission.status === "Completed" ? "100% Complete" : mission.status === "Failed" ? "Mission outcome recorded" : "—"}
            </div>
          </div>

          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#111111]/6">
            <div
              className="h-full rounded-full bg-[#b7ff28] transition-all duration-500 ease-out"
              style={{ width: `${progressValue}%` }}
            />
          </div>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-[24px] border border-[#111111]/5 bg-white p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">เริ่ม</div>
            <div className="mt-2 text-base font-bold text-[#111111]">{formatDate(mission.startTime)}</div>
            <div className="mt-1 text-sm text-[#5d5d5d]">{formatTime(mission.startTime)}</div>
          </div>

          <div className="rounded-[24px] border border-[#111111]/5 bg-white p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">สิ้นสุด</div>
            <div className="mt-2 text-base font-bold text-[#111111]">{formatDate(mission.endTime)}</div>
            <div className="mt-1 text-sm text-[#5d5d5d]">{formatTime(mission.endTime)}</div>
          </div>

          <div className="rounded-[24px] border border-[#111111]/5 bg-white p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">ระยะเวลา</div>
            <div className="mt-2 text-base font-bold text-[#111111]">{mission.durationLabel}</div>
            <div className="mt-1 text-sm text-[#5d5d5d]">{mission.durationMinutes} Minutes</div>
          </div>
        </section>

        {mission.missionType === "Group" && mission.verificationType === "GPS Check" && mission.groupMembers && mission.groupMembers.length > 0 && (
          <section className="mt-6 rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">กำลังจะเกิดขึ้น</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.06em] text-[#111111]">กำลังจะเกิดขึ้น</h2>
                <p className="mt-1 text-sm text-[#5d5d5d]">สถานะการตอบรับสมาชิก Group GPS</p>
              </div>
              <div className="rounded-full border border-[#AFFF00]/60 bg-[#f1ffc9] px-3 py-1.5 text-xs font-semibold text-[#111111]">
                {mission.groupMembers.filter((member) => member.status === "Accepted" || member.status === "In Progress" || member.status === "Completed").length}/{mission.groupMembers.length} Accepted
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {mission.groupMembers.map((member) => {
                const isAccepted = member.status === "Accepted" || member.status === "In Progress" || member.status === "Completed"
                const isDeclined = member.status === "Declined" || member.status === "Failed"
                const statusLabel = isAccepted ? "ยอมรับ" : isDeclined ? "ไม่ยอมรับ" : "รอตอบรับ"
                const statusClass = isAccepted
                  ? "border-green-200 bg-green-50 text-green-700"
                  : isDeclined
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-blue-200 bg-blue-50 text-blue-700"

                return (
                  <div key={member.memberId} className="flex items-center justify-between gap-3 rounded-2xl border border-[#111111]/10 bg-[#f7f7f5] p-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#111111]">{member.name}</div>
                      <div className="mt-1 text-xs text-[#6b6b6b]">Member ID: {member.memberId}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-6">
            <section className="rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="text-2xl font-black tracking-[-0.06em] text-[#111111]">Verification</h2>
                <div className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#111111]">
                  {progressValue}%
                </div>
              </div>

              <div className="space-y-3">
                {mission.verificationType === "Timelapse Video" ? (
                  <>
                    <div className="rounded-[22px] border border-[#111111]/5 bg-[#f7f7f5] p-4">
                      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">
                        Verification
                      </div>
                      <div className="mt-2 text-base font-bold text-[#111111]">
                        Start Mission within 5 minutes of the scheduled start time
                      </div>
                      <div className="mt-1 text-sm text-[#5d5d5d]">
                        Open the live camera, record continuously until the mission ends, then submit the video once.
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-[#111111]/5 bg-[#f7f7f5] p-4">
                      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">
                        Mission flow
                      </div>
                      <div className="mt-2 text-sm font-medium text-[#111111]">
                        1. Start Mission on time<br />
                        2. Live camera opens immediately<br />
                        3. Continuous timelapse recording until mission end<br />
                        4. Submit one video
                      </div>
                    </div>
                  </>
                ) : mission.verificationType === "GPS Check" ? (
                  <div className="rounded-[22px] border border-[#AFFF00]/50 bg-[#f1ffc9] p-4">
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">ตรวจสอบแผนที่</div>
                      <div className="mt-2 text-base font-bold text-[#111111]">Map Verification · GPS Check</div>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div><span className="text-[#6b6b6b]">จุดหมาย</span><div className="mt-1 font-semibold">{mission.gpsDestinationName ?? "—"}</div></div>
                      <div><span className="text-[#6b6b6b]">ระยะทาง</span><div className="mt-1 font-semibold">{currentLocation && mission.gpsLatitude !== undefined && mission.gpsLongitude !== undefined ? `${Math.round(distanceBetween(currentLocation, { latitude: mission.gpsLatitude, longitude: mission.gpsLongitude }))} ม.` : "กำลังรอพิกัด"}</div></div>
                      <div><span className="text-[#6b6b6b]">รัศมีที่ต้องใช้</span><div className="mt-1 font-semibold">10 เมตร</div></div>
                      <div><span className="text-[#6b6b6b]">เช็กอิน</span><div className="mt-1 font-semibold">อัตโนมัติ</div></div>
                    </div>
                  </div>
                ) : (
                  (
                    Object.entries(checkLabels) as Array<
                      [keyof typeof checkLabels, (typeof checkLabels)[keyof typeof checkLabels]]
                    >
                  ).map(([key, label], index) => {
                    const status = mission.checks[key]
                    const isReady = status === "Ready"
                    const isCompleted = status === "Completed"
                    const isFailed = status === "Missed"

                    const toneClass = isCompleted
                      ? "border-[#87d62f]/40 bg-[#dfffa9]/20"
                      : isReady
                        ? "border-[#b7ff28] bg-[#f1ffc9]"
                        : isFailed
                          ? "border-red-200 bg-red-50"
                          : "border-[#111111]/5 bg-[#f7f7f5]"

                    const badgeClass = isCompleted
                      ? "bg-[#dfffa9] text-[#111111]"
                      : isReady
                        ? "bg-[#b7ff28] text-[#111111]"
                        : isFailed
                          ? "bg-red-100 text-red-700"
                          : "bg-[#111111]/6 text-[#111111]"

                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-4 rounded-[22px] border p-3 transition-all duration-200 hover:border-[#111111]/10 ${toneClass}`}
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-[#111111]/10 bg-white text-lg font-black text-[#111111]">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">
                            {label}
                          </div>
                          <div className="mt-1 text-sm font-medium text-[#111111]">
                            {formatWindowRange(mission.checkWindows?.[key])}
                          </div>
                        </div>

                        <div className={`flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${badgeClass}`}>
                          {isCompleted ? (
                            <span className="flex items-center gap-1">
                              <span aria-hidden="true">✓</span>
                              COMPLETE
                            </span>
                          ) : isReady ? (
                            <span className="flex items-center gap-1">
                              <span aria-hidden="true">●</span>
                              READY
                            </span>
                          ) : isFailed ? (
                            "FAILED"
                          ) : (
                            "WAITING"
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            {renderMissionSpecificSections()}
          </div>

          <aside className="rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
            <h2 className="text-2xl font-black tracking-[-0.06em] text-[#111111]">สรุปภารกิจ</h2>

            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-4 border-b border-[#111111]/5 pb-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">หมวดหมู่</span>
                <span className="text-sm font-semibold text-[#111111]">{mission.category}</span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-[#111111]/5 pb-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">การยืนยัน</span>
                <span className="text-sm font-semibold text-[#111111]">{mission.verificationType}</span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-[#111111]/5 pb-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">จุดหมาย</span>
                <span className="text-right text-sm font-semibold text-[#111111]">
                  {mission.verificationType === "GPS Check" ? mission.gpsDestinationName ?? "—" : formatFailedDestination(mission.failedMissionDest)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-[#111111]/5 pb-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">สถานะ</span>
                <span className="text-sm font-semibold text-[#111111]">{mission.status}</span>
              </div>
            </div>

          </aside>
        </div>

        {mission.status === "In Progress" && (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={continueMission}
              className="rounded-full bg-[#111111] px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2f2f2f]"
            >
              Continue mission
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
