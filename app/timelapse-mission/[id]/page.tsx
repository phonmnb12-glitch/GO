"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import { getTimelapseDisplayStatus, type Mission } from "@/lib/missions"
import { getMissionFromSupabase, recordMissionEventInSupabase, updateMissionInSupabase } from "@/lib/mission-data"
import { supabase } from "@/lib/supabase"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

type CameraFacing = "user" | "environment"
type StatusKind = "success" | "failed"

type MissionResultModal = {
  visible: boolean
  kind: StatusKind
}

type ChatMessage = {
  id: string
  sender: "ai" | "user"
  text: string
}

const formatClock = (ms: number) => {
  if (ms <= 0) return "00:00:00"

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / (60 * 60))
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":")
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })

const formatFailureDestination = (value: string) => {
  if (value === "donate-to-foundation") return "Foundation"
  if (value === "return-to-friends") return "Friends"
  return value
}

const formatMissionStatus = (status: Mission["status"]) => {
  switch (status) {
    case "Upcoming":
      return "Upcoming"
    case "In Progress":
      return "In Progress"
    case "Completed":
      return "Completed"
    case "Failed":
      return "Failed"
    default:
      return "Unknown"
  }
}

const pickSupportedVideoMimeType = () => {
  if (typeof MediaRecorder === "undefined") return null

  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm;codecs=h264",
    "video/webm",
    "video/mp4",
  ]

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null
}

const uploadRecordedVideoToSupabase = async (missionId: string, blob: Blob) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error("Authentication is required.")
  }

  const bucketName = "mission-videos"
  const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("webm") ? "webm" : "mp4"
  const fileName = `missions/${missionId}/timelapse-${Date.now()}.${extension}`
  const file = new File([blob], fileName, { type: blob.type || "video/webm" })

  const { data, error } = await supabase.storage.from(bucketName).upload(fileName, file, {
    upsert: true,
    contentType: file.type || "video/webm",
    cacheControl: "3600",
  })

  if (error) {
    console.error("[Timelapse] Supabase storage upload failed:", error)
    throw new Error(`การอัปโหลดวิดีโอล้มเหลว: ${error.message || "เกิดข้อผิดพลาดในการส่งไฟล์"}`)
  }

  const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(fileName)
  return publicUrlData.publicUrl || data?.path || null
}

export default function TimelapseMissionPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordedBlobRef = useRef<Blob | null>(null)
  const recordingStartedAtRef = useRef<number | null>(null)
  const monitorTimerRef = useRef<number | null>(null)
  const monitorInFlightRef = useRef(false)
  const submissionInFlightRef = useRef(false)
  const isFinalizingRef = useRef(false)
  const consecutiveAwayRef = useRef(0)
  const awaySinceRef = useRef<number | null>(null)
  const warningCountRef = useRef(0)
  const sentAiMessagesRef = useRef(new Set<string>())

  const [mission, setMission] = useState<Mission | null>(null)
  const [now, setNow] = useState(0)
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("environment")
  const [cameraState, setCameraState] = useState<"idle" | "opening" | "preview" | "recording" | "ready">("idle")
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "paused" | "ready" | "submitted">("idle")
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null)
  const [resultModal, setResultModal] = useState<MissionResultModal>({ visible: false, kind: "success" })
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-ai",
      sender: "ai" as const,
      text: "AI Coach: พร้อมช่วยคุณตลอดเวลา ถ้าต้องการพักให้พิมพ์ เช่น 'ขอเข้าห้องน้ำ 10 นาที'",
    },
  ])
  const [floatingToasts, setFloatingToasts] = useState<Array<{ id: string; text: string }>>([])
  const [isBreakActive, setIsBreakActive] = useState(false)
  const [breakRemainingMs, setBreakRemainingMs] = useState(0)
  const [breakReminderStep, setBreakReminderStep] = useState<"5m" | "2m" | null>(null)
  const [lastAiWarning, setLastAiWarning] = useState<string | null>(null)
  const [aiMonitoringState, setAiMonitoringState] = useState<"normal" | "warning" | "away" | "paused" | "unknown">("unknown")
  const [aiConfidence, setAiConfidence] = useState(0)
  const [aiWarningCount, setAiWarningCount] = useState(0)
  const [aiUnavailable, setAiUnavailable] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const videoPanelRef = useRef<HTMLDivElement | null>(null)

  const syncMission = async () => setMission(await getMissionFromSupabase(id))

  const missionStartTime = mission ? new Date(mission.startTime).getTime() : 0
  const missionEndTime = mission ? new Date(mission.endTime).getTime() : 0
  const startWindowDeadline = mission ? missionStartTime + 5 * 60 * 1000 : 0

  const totalPauseDurationMs = useMemo(() => {
    const recordedPauseMs = (mission?.timelapseState?.pauseDurationMinutes ?? 0) * 60 * 1000
    if (isBreakActive && mission?.timelapseState?.pauseStartedAt) {
      const currentPauseStarted = new Date(mission.timelapseState.pauseStartedAt).getTime()
      const currentPauseElapsed = Math.max(0, now - currentPauseStarted)
      return recordedPauseMs + currentPauseElapsed
    }
    return recordedPauseMs
  }, [mission?.timelapseState, isBreakActive, now])

  const effectiveMissionEndTime = useMemo(() => {
    if (!mission) return 0
    const originalEnd = new Date(mission.endTime).getTime()
    return originalEnd + totalPauseDurationMs
  }, [mission, totalPauseDurationMs])

  useEffect(() => {
    void syncMission()
    const timer = window.setInterval(() => void syncMission(), 5000)
    return () => window.clearInterval(timer)
  }, [id])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!mission) return

    if (mission.videoUrl) {
      setVideoPreviewUrl(mission.videoUrl)
    }

    if (mission.videoSubmittedAt) {
      setRecordingState("submitted")
    } else if (mission.videoUrl) {
      setRecordingState("ready")
    } else if (recordingState === "submitted") {
      setRecordingState("idle")
    }

    if (mission.status === "Failed" && !resultModal.visible) {
      setResultModal({ visible: true, kind: "failed" })
    }
  }, [mission, resultModal.visible])

  // Start window expiration check (5-minute rule)
  useEffect(() => {
    if (!mission || mission.startedAt || mission.status === "Failed" || mission.status === "Completed") return
    if (now >= startWindowDeadline && startWindowDeadline > 0) {
      const failedMission = { ...mission, status: "Failed" as const }
      void updateMissionInSupabase(mission.id, { status: "Failed" })
      void recordMissionEventInSupabase({ missionId: mission.id, eventType: "mission_failed", payload: { reason: "Mission expired before start", at: new Date().toISOString() } })
      setMission(failedMission)
      setResultModal({ visible: true, kind: "failed" })
    }
  }, [mission, now, startWindowDeadline])

  useEffect(() => {
    if (!mission || mission.startedAt || mission.status !== "Failed" || now < startWindowDeadline) return
    if (!resultModal.visible) {
      setResultModal({ visible: true, kind: "failed" })
    }
  }, [mission, now, resultModal.visible, startWindowDeadline])

  // Mission time expiration check with sequential finalization
  useEffect(() => {
    if (!mission || mission.status !== "In Progress" || !mission.startedAt) return
    if (mission.videoSubmittedAt || mission.videoUrl || isFinalizingRef.current) return
    if (now >= effectiveMissionEndTime && effectiveMissionEndTime > 0) {
      isFinalizingRef.current = true
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop()
      } else if (recordedBlobRef.current || recordingState === "ready") {
        void handleSubmitVideo()
      }
    }
  }, [mission, now, effectiveMissionEndTime, recordingState])

  // Automatically initialize camera preview on page load
  useEffect(() => {
    if (!mission || mission.status === "Failed" || mission.status === "Completed") return
    if (cameraState === "idle" && !streamRef.current && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices)) {
      void openCamera()
    }
  }, [mission?.id, mission?.status])

  useEffect(() => {
    if (!mission?.timelapseState) return
    setAiMonitoringState(mission.timelapseState.aiMonitoringState ?? "unknown")
    setAiWarningCount(mission.timelapseState.aiWarningCount ?? 0)
    warningCountRef.current = mission.timelapseState.aiWarningCount ?? 0
  }, [mission?.timelapseState])

  useEffect(() => {
    if (!mission || mission.status !== "In Progress") return
    if (!mission.timelapseState?.pauseStartedAt || !mission.timelapseState.currentPauseDurationMinutes) return

    const pauseStartedAt = new Date(mission.timelapseState.pauseStartedAt).getTime()
    const durationMs = Math.max(1, mission.timelapseState.currentPauseDurationMinutes ?? 1) * 60 * 1000
    const remainingMs = Math.max(durationMs - (Date.now() - pauseStartedAt), 0)
    setIsBreakActive(remainingMs > 0)
    setBreakRemainingMs(remainingMs)
    setRecordingState("paused")
    setAiMonitoringState("paused")
  }, [mission])

  useEffect(() => {
    if (!mission || mission.status !== "In Progress" || recordingState !== "recording" || isBreakActive) return

    let cancelled = false
    const monitor = async () => {
      if (cancelled || monitorInFlightRef.current || !videoRef.current || !streamRef.current) return
      monitorInFlightRef.current = true
      try {
        const video = videoRef.current
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) return
        const canvas = document.createElement("canvas")
        canvas.width = Math.min(video.videoWidth, 640)
        canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth)
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageDataUrl = canvas.toDataURL("image/jpeg", 0.7)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        const response = await fetch("/api/ai/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            missionId: mission.id,
            imageDataUrl,
            missionName: mission.missionName,
            missionDescription: mission.description ?? "",
            missionCategory: mission.category,
            remainingTime: formatClock(Math.max(missionEndTime - Date.now(), 0)),
            recordingStatus: recordingState,
            monitoringState: aiMonitoringState,
            warningCount: warningCountRef.current,
          }),
        })
        if (!response.ok) {
          setAiUnavailable(true)
          setAiMonitoringState("unknown")
          return
        }

        const result = await response.json() as { state: "normal" | "warning" | "away" | "paused" | "unknown"; confidence: number; reason: string; should_message: boolean }
        if (cancelled) return
        setAiUnavailable(false)
        setAiConfidence(result.confidence)
        if (result.state === "away" && result.confidence >= 0.7) {
          consecutiveAwayRef.current += 1
        } else if (result.state === "normal" || result.state === "unknown") {
          consecutiveAwayRef.current = 0
        }
        const confirmedState = result.state === "away" && consecutiveAwayRef.current < 2 ? "warning" : result.state
        if (confirmedState === "away") {
          awaySinceRef.current ??= Date.now()
        } else if (confirmedState === "normal" || confirmedState === "unknown") {
          awaySinceRef.current = null
          consecutiveAwayRef.current = 0
        }
        if (confirmedState === "warning" || confirmedState === "away") {
          warningCountRef.current += 1
          setAiWarningCount(warningCountRef.current)
        }
        setAiMonitoringState(confirmedState)
        setLastAiWarning(result.reason)
        void recordMissionEventInSupabase({ missionId: mission.id, eventType: "ai_observation", payload: { state: confirmedState, confidence: result.confidence, reason: result.reason, warning_count: warningCountRef.current, observed_at: new Date().toISOString() } })
        if (confirmedState === "away" && awaySinceRef.current && Date.now() - awaySinceRef.current >= 60 * 1000) {
          const failedMission = { ...mission, status: "Failed" as const }
          void updateMissionInSupabase(mission.id, { status: "Failed" })
          void recordMissionEventInSupabase({ missionId: mission.id, eventType: "mission_failed", payload: { reason: "Mission failed after confirmed absence", at: new Date().toISOString() } })
          setMission(failedMission)
          setResultModal({ visible: true, kind: "failed" })
          return
        }
        const messageKey = `${confirmedState}:${Math.floor(Date.now() / 60000)}`
        if ((confirmedState === "away" || (confirmedState === "warning" && result.should_message)) && !sentAiMessagesRef.current.has(messageKey)) {
          sentAiMessagesRef.current.add(messageKey)
          const message = confirmedState === "away"
            ? "ไม่พบคุณหน้ากล้องครับ ถ้ากำลังพัก กรุณาแจ้งผมในแชท"
            : `ดูเหมือนกิจกรรมอาจไม่ตรงกับภารกิจครับ ${result.reason}`
          setChatMessages((current) => [...current, { id: `ai-monitor-${Date.now()}`, sender: "ai", text: `AI Coach: ${message}` }])
          pushToast(`AI Coach\n“${message}”`)
        }
      } catch (error) {
        console.error("[Timelapse] AI monitoring failed", error)
        setAiUnavailable(true)
        setAiMonitoringState("unknown")
      } finally {
        monitorInFlightRef.current = false
      }
    }

    const schedule = () => {
      const interval = aiMonitoringState === "warning" || aiMonitoringState === "away" ? 5000 : 15000
      monitorTimerRef.current = window.setTimeout(async () => {
        await monitor()
        if (!cancelled) schedule()
      }, interval)
    }
    void monitor()
    schedule()
    return () => {
      cancelled = true
      if (monitorTimerRef.current !== null) window.clearTimeout(monitorTimerRef.current)
    }
  }, [aiMonitoringState, isBreakActive, mission, missionEndTime, recordingState])

  useEffect(() => {
    if (recordingState !== "recording" || !recordingStartedAtRef.current) return

    const interval = window.setInterval(() => {
      setRecordingElapsedMs(Date.now() - recordingStartedAtRef.current!)
    }, 1000)

    return () => window.clearInterval(interval)
  }, [recordingState])

  useEffect(() => {
    if (!mission || mission.status !== "In Progress" || isBreakActive) return
    const remainingMs = Math.max(missionEndTime - now, 0)
    const threshold = remainingMs <= 5 * 60 * 1000 ? "remaining-5" : remainingMs <= 10 * 60 * 1000 ? "remaining-10" : null
    if (!threshold || sentAiMessagesRef.current.has(threshold)) return
    sentAiMessagesRef.current.add(threshold)
    const minutes = threshold === "remaining-5" ? 5 : 10
    const message = `เหลือเวลาอีก ${minutes} นาทีครับ`
    setChatMessages((current) => [...current, { id: `ai-time-${Date.now()}`, sender: "ai", text: `AI Coach: ${message}` }])
    pushToast(`AI Coach\n“${message}”`)
  }, [isBreakActive, mission, missionEndTime, now])

  useEffect(() => {
    if (mission?.status === "Completed" || mission?.status === "Failed") {
      const nextKind = mission.status === "Completed" ? "success" : "failed"
      setResultModal({ visible: true, kind: nextKind })
    }
  }, [mission?.status])

  useEffect(() => {
    if (!isBreakActive) return

    if (breakRemainingMs <= 0) {
      setIsBreakActive(false)
      setBreakReminderStep(null)
      void resumeMissionAfterBreak()
      return
    }

    const reminderTimeout = window.setTimeout(() => {
      setBreakRemainingMs((current) => Math.max(0, current - 1000))
    }, 1000)

    return () => window.clearTimeout(reminderTimeout)
  }, [isBreakActive, breakRemainingMs])

  useEffect(() => {
    if (!isBreakActive || breakRemainingMs <= 0) return

    if (breakRemainingMs <= 5 * 60 * 1000 && breakReminderStep !== "5m") {
      setBreakReminderStep("5m")
      pushToast("AI Coach\n“พักได้อีก 5 นาที”")
    }

    if (breakRemainingMs <= 2 * 60 * 1000 && breakReminderStep !== "2m") {
      setBreakReminderStep("2m")
      pushToast("AI Coach\n“เหลืออีก 2 นาที เตรียมกลับมาทำต่อได้แล้ว”")
    }
  }, [breakRemainingMs, isBreakActive, breakReminderStep])

  useEffect(() => {
    if (!mission || mission.status !== "In Progress" || isBreakActive || !mission.startedAt) return

    const remainingMs = new Date(mission.endTime).getTime() - now

    if (remainingMs <= 15 * 60 * 1000 && lastAiWarning !== "15m") {
      setLastAiWarning("15m")
      pushToast("AI Coach\n“เหลือเวลาอีก 15 นาที”")
    }

    if (remainingMs <= 5 * 60 * 1000 && lastAiWarning !== "5m") {
      setLastAiWarning("5m")
      pushToast("AI Coach\n“เหลือเวลาอีก 5 นาที”")
    }

    if (recordingState === "idle" && cameraState === "preview" && lastAiWarning !== "idle") {
      setLastAiWarning("idle")
      pushToast("AI Coach\n“ดูเหมือนคุณหยุดกิจกรรมไปสักพักแล้ว”")
    }
  }, [mission, now, isBreakActive, recordingState, cameraState, lastAiWarning])

  useEffect(() => {
    if (cameraState !== "preview" && cameraState !== "recording" && cameraState !== "ready") {
      return
    }

    if (!videoRef.current || !streamRef.current) {
      return
    }

    const video = videoRef.current
    if (video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current
    }

    video.muted = true
    video.autoplay = true
    video.playsInline = true

    void video.play().catch(() => {
      setCameraError("Unable to start camera preview. Please try again.")
    })
  }, [cameraState, streamRef.current])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop()
      }
    }
  }, [])

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const canStartMission = useMemo(() => {
    if (!mission || mission.startedAt) return false
    if (mission.status === "Failed" || mission.status === "Completed" || mission.status === "Cancelled") return false

    const startTime = new Date(mission.startTime).getTime()
    const startWindowDeadlineValue = startTime + 5 * 60 * 1000

    return now >= startTime && now < startWindowDeadlineValue
  }, [mission, now])

  const isWithinStartWindow = Boolean(
    mission
    && !mission.startedAt
    && now >= new Date(mission.startTime).getTime()
    && now < startWindowDeadline
    && mission.status !== "Failed"
    && mission.status !== "Completed"
    && mission.status !== "Cancelled",
  )

  const getCameraAccessErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : "ไม่สามารถเปิดกล้องได้"

    if (error instanceof DOMException) {
      switch (error.name) {
        case "NotAllowedError":
        case "PermissionDeniedError":
          return "การเข้าถึงกล้องถูกปฏิเสธ กรุณาอนุญาตการเข้าถึงกล้องในการตั้งค่าเบราว์เซอร์แล้วลองใหม่อีกครั้ง"
        case "NotFoundError":
        case "DevicesNotFoundError":
          return "ไม่พบอุปกรณ์กล้องบนอุปกรณ์นี้ กรุณาเชื่อมต่อกล้องแล้วลองใหม่"
        case "NotReadableError":
        case "TrackStartError":
          return "กล้องกำลังถูกใช้งานโดยแอปพลิเคชันอื่น กรุณาปิดแอปอื่นแล้วลองใหม่อีกครั้ง"
        case "OverconstrainedError":
          return "กล้องไม่รองรับความละเอียดหรือมุมกล้องที่เลือก"
        case "SecurityError":
          return "การเข้าถึงกล้องถูกปฏิเสธเนื่องจากความปลอดภัย (ต้องเปิดผ่าน HTTPS หรือ localhost)"
        default:
          return message || "ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบสิทธิ์การเข้าถึงกล้อง"
      }
    }

    return message || "ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบสิทธิ์การเข้าถึงกล้อง"
  }

  const timeRemainingMs = mission
    ? mission.status === "Upcoming" && !mission.startedAt
      ? Math.max(missionStartTime - now, 0)
      : mission.status === "In Progress" || mission.startedAt
        ? Math.max(effectiveMissionEndTime - now, 0)
        : 0
    : 0

  const timerDisplay = mission
    ? mission.status === "Upcoming" && !mission.startedAt
      ? now < new Date(mission.startTime).getTime()
        ? formatClock(timeRemainingMs)
        : formatClock(Math.max(startWindowDeadline - now, 0))
      : mission.status === "In Progress" || mission.startedAt
        ? formatClock(timeRemainingMs)
        : mission.status === "Completed"
          ? "Completed"
          : mission.status === "Failed"
            ? "Failed"
            : "—"
    : "—"

  const timerLabel = mission
    ? mission.status === "Upcoming"
      ? now < new Date(mission.startTime).getTime()
        ? "MISSION STARTS IN"
        : "START WINDOW"
      : mission.status === "In Progress"
        ? "TIME REMAINING"
        : mission.status === "Completed"
          ? "MISSION COMPLETED"
          : mission.status === "Failed"
            ? "MISSION FAILED"
            : "MISSION STATUS"
    : "MISSION STATUS"

  const progressValue = useMemo(() => {
    if (!mission) return 0

    if (mission.status === "Upcoming" && !mission.startedAt) {
      const startTime = new Date(mission.startTime).getTime()
      const startWindowDeadline = startTime + 5 * 60 * 1000
      const startWindowMs = Math.max(startWindowDeadline - startTime, 0)
      const elapsedBeforeStart = Math.max(Math.min(now - startTime, startWindowMs), 0)
      return Math.min(Math.round((elapsedBeforeStart / startWindowMs) * 100), 100)
    }

    const totalMs = Math.max(new Date(mission.endTime).getTime() - new Date(mission.startTime).getTime(), 0)
    if (totalMs === 0) return 0

    const elapsedMs = Math.max(Math.min(now - new Date(mission.startTime).getTime(), totalMs), 0)
    return Math.min(Math.round((elapsedMs / totalMs) * 100), 100)
  }, [mission, now])

  const verificationMessage = useMemo(() => {
    if (!mission) return ""

    if (mission.status === "Upcoming") {
      if (now < new Date(mission.startTime).getTime()) {
        return "Start within 05:00"
      }

      if (!mission.startedAt && now <= startWindowDeadline) {
        return "Start within 05:00"
      }
    }

    if (mission.status === "Failed") {
      return "Mission Failed"
    }

    if (mission.startedAt) {
      return "Mission Started"
    }

    return ""
  }, [mission, now, startWindowDeadline])

  const summaryCards = useMemo(() => {
    if (!mission) return []

    return [
      { label: "Mission Name", value: mission.missionName },
      { label: "Category", value: mission.category },
      { label: "Start Date", value: formatDate(mission.startTime) },
      { label: "Start Time", value: formatTime(mission.startTime) },
      { label: "End Time", value: formatTime(mission.endTime) },
      { label: "Duration", value: mission.durationLabel },
      { label: "Pledge Amount", value: `฿${mission.pledgeAmount}` },
      { label: "Failed Mission Destination", value: formatFailureDestination(mission.failedMissionDest) },
    ]
  }, [mission])

  const pushToast = (text: string) => {
    const toastId = `${Date.now()}-${Math.random()}`
    setFloatingToasts((current) => [...current, { id: toastId, text }])

    window.setTimeout(() => {
      setFloatingToasts((current) => current.filter((toast) => toast.id !== toastId))
    }, 3000)
  }

  const startMissionBreak = (breakMinutes: number) => {
    if (!mission) return

    const maxPauseMs = 10 * 60 * 1000
    const usedBreakMinutes = mission.timelapseState?.pauseDurationMinutes ?? 0
    const remainingBreakMinutes = Math.max(10 - usedBreakMinutes, 0)
    if (remainingBreakMinutes <= 0) {
      const message = "คุณใช้เวลาพักครบตามที่กำหนดแล้ว ไม่สามารถพักเพิ่มได้ครับ"
      setChatMessages((current) => [...current, { id: `ai-break-limit-${Date.now()}`, sender: "ai", text: `AI Coach: ${message}` }])
      pushToast(`AI Coach\n“${message}”`)
      return
    }
    const safeBreakMinutes = Math.min(Math.max(Math.round(breakMinutes), 1), remainingBreakMinutes, 10)
    const safeBreakMs = Math.min(safeBreakMinutes * 60 * 1000, maxPauseMs)
    const pauseStartedAt = new Date().toISOString()
    setIsBreakActive(true)
    setBreakRemainingMs(safeBreakMs)
    setAiMonitoringState("paused")

    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.pause()
    }

    stopCamera()
    setCameraState("idle")
    setRecordingState("paused")
    void recordMissionEventInSupabase({ missionId: mission.id, eventType: "pause_started", payload: { pause_started_at: pauseStartedAt, pause_duration_minutes: safeBreakMinutes } })
    void recordMissionEventInSupabase({ missionId: mission.id, eventType: "recording_paused", payload: { at: pauseStartedAt, minutes: safeBreakMinutes } })
    pushToast(`AI Coach\n“พักได้อีก ${safeBreakMinutes} นาที”`)
  }

  const sendChatMessage = async () => {
    const trimmed = chatInput.trim()
    if (!trimmed) return

    const nextUserMessage = {
      id: `${Date.now()}-user`,
      sender: "user" as const,
      text: trimmed,
    }

    setChatMessages((current) => [...current, nextUserMessage])
    setChatInput("")

    const missionEnd = mission ? new Date(mission.endTime).getTime() : 0
    const missionContext = mission ? {
      id: mission.id,
      missionName: mission.missionName,
      missionType: mission.missionType,
      verificationType: mission.verificationType,
      category: mission.category,
      startTime: mission.startTime,
      endTime: mission.endTime,
      durationMinutes: mission.durationMinutes,
      status: isBreakActive ? "On Break" : mission.status,
      remainingTime: mission.status === "In Progress" ? formatClock(Math.max(0, missionEnd - now)) : undefined,
      pledgeAmount: mission.pledgeAmount,
      breakStatus: isBreakActive ? "On Break" : "Active",
      breakTimeRemaining: isBreakActive ? formatClock(breakRemainingMs) : "00:00:00",
      monitoringState: aiMonitoringState,
      warningCount: aiWarningCount,
      missionDescription: mission.description,
    } : undefined

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: chatMessages, mission: missionContext }),
      })
      const payload = await response.json() as { text?: string; error?: string; action?: { type: string; minutes?: number } }
      if (!response.ok || !payload.text) throw new Error(payload.error ?? "AI request failed")

      if (payload.action?.type === "start_break") {
        startMissionBreak(payload.action.minutes ?? 10)
      }
      if (payload.action?.type === "resume_mission") {
        await resumeMissionAfterBreak(false)
      }

      const replyMessage = `AI Coach: ${payload.text}`
      setChatMessages((current) => [...current, { id: `${Date.now()}-ai`, sender: "ai" as const, text: replyMessage }])
      pushToast(`AI Coach\n“${payload.text}”`)
    } catch (error) {
      console.error("[AI] Chat request failed", error)
      const replyMessage = "AI Coach: AI is temporarily unavailable. Please try again."
      setChatMessages((current) => [...current, { id: `${Date.now()}-ai-error`, sender: "ai" as const, text: replyMessage }])
    }
  }

  const resumeMissionAfterBreak = async (announce = true) => {
    if (!mission) return

    if (announce) {
      setChatMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-resume`,
          sender: "ai" as const,
          text: "AI Coach: หมดเวลาพักแล้ว กลับมาทำต่อได้เลย",
        },
      ])

      pushToast("AI Coach\n“หมดเวลาพักแล้ว กลับมาทำต่อได้เลย”")
    }

    try {
      setIsBreakActive(false)
      setBreakRemainingMs(0)
      setAiMonitoringState("unknown")
      setCameraState("opening")
      const cameraOpened = await openCamera()
      const resumedAt = new Date().toISOString()
      const pauseStartedAt = mission.timelapseState?.pauseStartedAt ? new Date(mission.timelapseState.pauseStartedAt).getTime() : Date.now()
      const actualPauseMinutes = Math.max(0, Math.round((Date.now() - pauseStartedAt) / 60000))
      void recordMissionEventInSupabase({ missionId: mission.id, eventType: "mission_resumed", payload: { resumed_at: resumedAt, actual_pause_minutes: actualPauseMinutes } })
      void recordMissionEventInSupabase({ missionId: mission.id, eventType: "recording_resumed", payload: { at: resumedAt } })

      if (cameraOpened && mission.status === "In Progress") {
        setTimeout(() => {
          if (mission && mission.status === "In Progress") {
            handleStartRecording()
          }
        }, 250)
      }
    } catch {
      setCameraError("ไม่สามารถเปิดกล้องต่อหลังพักได้ กรุณาลองใหม่")
    }
  }

  const toggleFullscreen = async () => {
    if (!videoPanelRef.current) return

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        setIsFullscreen(false)
      } else {
        await videoPanelRef.current.requestFullscreen()
        setIsFullscreen(true)
      }
    } catch {
      setIsFullscreen(false)
    }
  }

  const openCamera = async (nextFacing: CameraFacing = cameraFacing) => {
    const cameraSupported = !!navigator.mediaDevices?.getUserMedia
    console.log("cameraSupported", cameraSupported)

    if (!cameraSupported) {
      const unsupportedMessage = "อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการบันทึกวิดีโอ"
      setCameraError(unsupportedMessage)
      setCameraState("idle")
      console.error("Camera access unavailable: navigator.mediaDevices.getUserMedia is not supported.")
      return false
    }

    if (typeof window !== "undefined") {
      const hostname = window.location.hostname
      const isLocalhostLike = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"

      if (!window.isSecureContext && !isLocalhostLike) {
        const secureContextMessage = "ต้องเปิดใช้งาน HTTPS หรือ localhost เพื่อเข้าถึงกล้อง"
        setCameraError(secureContextMessage)
        setCameraState("idle")
        console.error("Camera access blocked because the current page is not served over HTTPS or localhost.")
        return false
      }
    }

    if (streamRef.current) {
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current
      }
      setCameraState("preview")
      setCameraError(null)
      return true
    }

    setCameraError(null)
    setCameraState("opening")
    console.log("permissionRequestStarted")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing } },
        audio: true,
      })
      console.log("streamReceived")
      streamRef.current = stream

      if (videoRef.current) {
        console.log("videoElementReady")
        videoRef.current.srcObject = stream
        console.log("videoSrcObjectAssigned")
        videoRef.current.muted = true
        videoRef.current.autoplay = true
        videoRef.current.playsInline = true
        await videoRef.current.play().catch(() => undefined)
        console.log("videoPlaybackStarted")
      }

      setCameraState("preview")
      setRecordingState("idle")
      setCameraError(null)
      return true
    } catch (error) {
      const cameraErrorMessage = getCameraAccessErrorMessage(error)
      console.error("getUserMedia failed", error)
      setCameraState("idle")
      setRecordingState("idle")
      setCameraError(cameraErrorMessage)
      stopCamera()
      return false
    }
  }

  const handleStartMission = async () => {
    if (!mission || mission.startedAt) return
    if (now >= startWindowDeadline) {
      const failedMission = { ...mission, status: "Failed" as const }
      void updateMissionInSupabase(mission.id, { status: "Failed" })
      void recordMissionEventInSupabase({ missionId: mission.id, eventType: "mission_failed", payload: { reason: "Mission expired before start", at: new Date().toISOString() } })
      setMission(failedMission)
      setResultModal({ visible: true, kind: "failed" })
      return
    }

    if (!canStartMission) return

    const startedAtIso = new Date().toISOString()
    const updatedMission = { ...mission, startedAt: startedAtIso, status: "In Progress" as const }
    try {
      await updateMissionInSupabase(id, {
        startedAt: startedAtIso,
        status: updatedMission.status,
      })
    } catch (error) {
      console.error("[Timelapse] mission start rejected", error)
      setCameraError(error instanceof Error ? error.message : "ไม่สามารถเริ่มภารกิจได้")
      return
    }
    void recordMissionEventInSupabase({ missionId: mission.id, eventType: "mission_started", payload: { started_at: startedAtIso, mission_id: mission.id } })
    setChatMessages((current) => [...current, { id: `ai-start-${Date.now()}`, sender: "ai", text: "AI Coach: เริ่มภารกิจแล้วครับ ตั้งใจทำตามเป้าหมายได้เลย" }])

    setMission(updatedMission)
    const cameraOpened = await openCamera()

    if (cameraOpened) {
      handleStartRecording()
    }
  }

  const handleStartRecording = () => {
    if (!streamRef.current || typeof MediaRecorder === "undefined") {
      setCameraError("เบราว์เซอร์นี้ไม่รองรับการบันทึกวิดีโอ")
      return
    }

    const mimeType = pickSupportedVideoMimeType() ?? "video/webm"
    console.log("mediaRecorderSupported", !!mimeType)
    const recorder = new MediaRecorder(streamRef.current, { mimeType })
    chunksRef.current = []
    recordingStartedAtRef.current = Date.now()
    recorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }

    recorder.onstop = async () => {
      if (!mission) return
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" })
      recordedBlobRef.current = blob

      if (blob.size === 0) {
        setCameraError("ไม่มีวิดีโอที่บันทึกได้ กรุณาบันทึกใหม่อีกครั้ง")
        setRecordingState("idle")
        return
      }

      try {
        recordedBlobRef.current = blob
        const localPreviewUrl = URL.createObjectURL(blob)
        setVideoPreviewUrl(localPreviewUrl)
        setRecordingState("ready")
        setCameraState("ready")
        setRecordingElapsedMs(0)
      } catch (error) {
        console.error("[Timelapse] video upload failed", error)
        setCameraError(error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอัปโหลดวิดีโอ")
      }
    }

    try {
      const startedAtIso = new Date().toISOString()
      recorder.start()
      console.log("mediaRecorderStarted")
      setRecordingState("recording")
      setCameraState("recording")
      if (mission) {
        void recordMissionEventInSupabase({ missionId: mission.id, eventType: "recording_started", payload: { started_at: startedAtIso } })
      }
    } catch (error) {
      console.error("[Timelapse] recorder start failed", error)
      setCameraError("ไม่สามารถเริ่มบันทึกวิดีโอได้ กรุณาลองใหม่")
    }
  }

  const handleFinishRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop()
    }
  }

  const handleRecordAgain = () => {
    stopCamera()
    setVideoPreviewUrl(null)
    setRecordingState("idle")
    setCameraState("idle")
    setCameraError(null)
    setRecordingElapsedMs(0)
    recorderRef.current = null

    if (mission?.status !== "Failed" && mission?.status !== "Completed") {
      void openCamera()
    }
  }

  const handleSubmitVideo = async () => {
    if (!mission || (!videoPreviewUrl && !recordedBlobRef.current)) return
    if (submissionInFlightRef.current) return
    submissionInFlightRef.current = true

    try {
      const blob = recordedBlobRef.current ?? (videoPreviewUrl ? await (await fetch(videoPreviewUrl)).blob() : null)
      if (!blob) throw new Error("ไม่พบวิดีโอที่บันทึกไว้")

      const finalVideoUrl = await uploadRecordedVideoToSupabase(mission.id, blob)
      if (!finalVideoUrl) throw new Error("ไม่พบ path ของวิดีโอหลังอัปโหลด")
      const submittedAt = new Date().toISOString()
      const updatedMission = {
        ...mission,
        videoUrl: finalVideoUrl,
        videoSubmittedAt: submittedAt,
        aiVerificationStatus: undefined,
        status: "Completed" as const,
      }

      void updateMissionInSupabase(id, {
        videoUrl: updatedMission.videoUrl,
        videoSubmittedAt: submittedAt,
        status: updatedMission.status,
      })
      void recordMissionEventInSupabase({ missionId: mission.id, eventType: "video_submitted", payload: { submitted_at: submittedAt, video_url: updatedMission.videoUrl } })
      void recordMissionEventInSupabase({ missionId: mission.id, eventType: "mission_completed", payload: { completed_at: submittedAt } })

      setMission(updatedMission)
      setRecordingState("submitted")
      setVideoPreviewUrl(updatedMission.videoUrl)
    } catch (error) {
      console.error("[Timelapse] submit failed", error)
      setCameraError(error instanceof Error ? error.message : "ไม่สามารถส่งวิดีโอได้")
    } finally {
      submissionInFlightRef.current = false
    }
  }

  if (!mission) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
        <DashboardNav />
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h1 className="text-2xl font-bold">ภารกิจวิดีโอ Timelapse</h1>
          <p className="mt-2 text-sm text-gray-600">ไม่พบ Mission ID: {id}</p>
          <button type="button" onClick={() => router.push("/missions")} className="mt-6 inline-flex text-sm font-medium text-[#121212] underline">
            ← กลับไปยังภารกิจ
          </button>
        </div>
      </main>
    )
  }

  const hasRecordedVideo = Boolean(mission.videoUrl || recordedBlobRef.current || videoPreviewUrl)
  const hasSubmittedVideo = Boolean(mission.videoSubmittedAt)

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
      <DashboardNav />

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push(`/missions/${mission.id}`)}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-[#121212]"
          >
            ← กลับ
          </button>

          <div className="rounded-full border border-[#121212]/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#121212] shadow-sm">
            {getTimelapseDisplayStatus(mission, now)}
          </div>
        </div>

        <div className="rounded-[32px] border border-white/80 bg-white/80 p-5 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-500">Mission ID • {mission.id}</p>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.06em] text-[#121212] md:text-5xl">{mission.missionName}</h1>
            </div>

            <div className="rounded-full border border-[#121212]/10 bg-[#f5f5f3] px-4 py-2 text-sm font-medium text-[#121212]">
              {mission.verificationType}
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">สถานะภารกิจ</p>
              <p className="mt-2 text-xl font-black tracking-[-0.05em] text-[#121212]">{getTimelapseDisplayStatus(mission, now)}</p>
            </div>

            <div className="rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">เวลาที่เริ่ม</p>
              <p className="mt-2 text-xl font-black tracking-[-0.05em] text-[#121212]">{formatDate(mission.startTime)} · {formatTime(mission.startTime)}</p>
            </div>

            <div className="rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">เวลาที่เหลือ</p>
              <p className="mt-2 text-xl font-black tracking-[-0.05em] text-[#121212]">{mission.status === "Upcoming" && !mission.startedAt ? formatClock(Math.max(startWindowDeadline - now, 0)) : timerDisplay}</p>
              {verificationMessage && (
                <p className="mt-2 text-[11px] font-medium text-[#121212]">{verificationMessage}</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-[32px] border border-white/80 bg-white/80 p-4 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl md:p-6">
          <div
            ref={videoPanelRef}
            className={`relative overflow-hidden border border-[#121212]/10 bg-black/95 ${isFullscreen ? "rounded-none border-none bg-black p-0" : "rounded-[28px] border-[#121212]/10 bg-[#121212] p-0"}`}
          >
            <div className={`relative overflow-hidden ${isFullscreen ? "rounded-none bg-black" : "rounded-[28px] bg-[#121212]"}`}>
              {cameraState === "preview" || cameraState === "recording" || cameraState === "ready" ? (
                <video
                  ref={videoRef}
                  className={isFullscreen ? "h-[calc(100vh-2rem)] w-full object-cover" : "h-[460px] w-full object-cover md:h-[620px]"}
                  autoPlay
                  muted
                  playsInline
                />
              ) : (
                <div className={isFullscreen ? "flex h-[calc(100vh-2rem)] items-center justify-center text-sm text-gray-300" : "flex h-[460px] items-center justify-center text-sm text-gray-300 md:h-[620px]"}>
                  Live preview will appear here once the mission starts.
                </div>
              )}
              {mission.videoUrl && cameraState === "idle" && (
                <video
                  src={mission.videoUrl}
                  controls
                  className={isFullscreen ? "h-[calc(100vh-2rem)] w-full object-contain" : "absolute inset-0 h-full w-full object-contain"}
                />
              )}
            </div>

            <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 backdrop-blur-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${recordingState === "recording" ? "bg-red-500 animate-pulse" : "bg-emerald-400"}`} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                  {recordingState === "recording" ? "REC" : isBreakActive ? "ON BREAK" : cameraState === "preview" || cameraState === "recording" || cameraState === "ready" ? "LIVE" : "LIVE"}
                </span>
              </div>

              <div className="rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
                {isBreakActive ? `Break ${formatClock(breakRemainingMs)}` : mission.status === "Upcoming" && !mission.startedAt ? `START WITHIN ${formatClock(Math.max(startWindowDeadline - now, 0))}` : `TIME REMAINING ${timerDisplay}`}
              </div>

              <div className="rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
                AI {aiUnavailable ? "UNAVAILABLE" : aiMonitoringState.toUpperCase()}
              </div>
            </div>

            {mission.status === "Upcoming" && !mission.startedAt && now >= new Date(mission.startTime).getTime() && now <= startWindowDeadline && (
              <div className="absolute inset-x-4 top-16 z-10 rounded-2xl border border-[#AFFF00]/40 bg-[#AFFF00]/10 px-3 py-2 text-sm font-medium text-[#121212] backdrop-blur-sm">
                You must start the mission within 5 minutes.
              </div>
            )}

            <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/60"
              >
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>

            {cameraError && (
              <div className="absolute inset-x-4 top-16 z-10 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow-lg">
                <div className="font-semibold">{cameraError}</div>
                {cameraError !== "Your browser does not support camera access." && cameraError !== "Camera access requires HTTPS or localhost." && (
                  <button
                    type="button"
                    onClick={() => void openCamera()}
                    className="mt-2 inline-flex rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Try Again
                  </button>
                )}
              </div>
            )}

            <div className={`absolute inset-x-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/20 bg-black/35 p-3 backdrop-blur-sm ${isFullscreen ? "bottom-2" : "bottom-4"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
onClick={() => {
                  if (mission.startedAt || !canStartMission) return
                  void handleStartMission()
                }}
                disabled={Boolean(mission.startedAt) || !canStartMission}
                aria-disabled={Boolean(mission.startedAt) || !canStartMission}
                className="relative z-20 rounded-full bg-[#AFFF00] px-4 py-2 text-sm font-semibold text-[#121212] shadow-[0_18px_30px_rgba(175,255,0,0.25)] transition hover:bg-[#baff36] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
                >
                  {mission.startedAt ? "เริ่มภารกิจแล้ว" : "เริ่มภารกิจ"}
                </button>

                {hasRecordedVideo && !hasSubmittedVideo && (
                  <button
                    type="button"
                    onClick={handleSubmitVideo}
                    className="rounded-full border border-[#AFFF00]/70 bg-[#AFFF00]/20 px-4 py-2 text-sm font-semibold text-[#AFFF00] transition hover:bg-[#AFFF00]/30"
                  >
                    ส่งวิดีโอ
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {cameraState !== "idle" && (
                  <select
                    value={cameraFacing}
                    onChange={(event) => {
                      const nextFacing = event.target.value as CameraFacing
                      setCameraFacing(nextFacing)
                      void openCamera(nextFacing)
                    }}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="environment" className="text-[#121212]">กล้องหลัง</option>
                    <option value="user" className="text-[#121212]">กล้องหน้า</option>
                  </select>
                )}
              </div>
            </div>

            {!chatOpen && (
              <div className="pointer-events-none absolute bottom-4 right-4 z-30">
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="pointer-events-auto relative z-40 inline-flex items-center gap-2 rounded-full bg-[#AFFF00] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#121212] shadow-[0_18px_30px_rgba(175,255,0,0.45)] transition hover:bg-[#c2ff4d]"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#121212] text-[9px] font-bold text-[#AFFF00]">
                    AI
                  </span>
                  Chat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {floatingToasts.length > 0 && (
        <div className="pointer-events-none fixed right-4 top-20 z-40 space-y-2">
          {floatingToasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto max-w-xs rounded-2xl border border-white/70 bg-white/90 p-3 text-sm text-[#121212] shadow-[0_24px_50px_rgba(18,18,18,0.18)] backdrop-blur-xl"
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#AFFF00] text-[10px] font-bold text-[#121212]">
                  AI
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">AI Coach</div>
                  <div className="whitespace-pre-line text-sm text-[#121212]">{toast.text}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {chatOpen && (
        <div className="fixed bottom-5 right-5 z-40 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[24px] border border-white/80 bg-white/95 shadow-[0_30px_80px_rgba(18,18,18,0.22)] backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-[#121212]/10 bg-[#f9f9f8] px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">AI Coach</p>
              <p className="text-sm font-semibold text-[#121212]">ผู้ช่วยแบบเรียลไทม์</p>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#121212]/10 bg-white text-[#121212] transition hover:bg-[#121212]/5"
            >
              ×
            </button>
          </div>

          <div className="flex h-72 flex-col gap-3 overflow-y-auto p-4">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.sender === "user" ? "ml-auto bg-[#AFFF00] text-[#121212]" : "bg-[#f2f4f6] text-[#121212]"}`}
              >
                {message.text}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-[#121212]/10 bg-white p-3">
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  sendChatMessage()
                }
              }}
              placeholder="พิมพ์ข้อความ..."
              className="flex-1 rounded-full border border-[#121212]/10 bg-[#f9f9f8] px-3 py-2 text-sm outline-none focus:border-[#AFFF00]"
            />
            <button
              type="button"
              onClick={sendChatMessage}
              className="rounded-full bg-[#AFFF00] px-4 py-2 text-sm font-semibold text-[#121212]"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {resultModal.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121212]/45 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-white/80 bg-white p-6 shadow-[0_30px_80px_rgba(18,18,18,0.25)]">
            <div className="flex items-center justify-center">
              <div className={`flex h-14 w-14 items-center justify-center rounded-full ${resultModal.kind === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {resultModal.kind === "success" ? "✓" : "!"}
              </div>
            </div>

            <h3 className="mt-4 text-center text-2xl font-black tracking-[-0.06em] text-[#121212]">
              {resultModal.kind === "success" ? "Mission Completed" : "Mission Failed"}
            </h3>

            {resultModal.kind === "failed" && mission.status === "Failed" && !mission.startedAt && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">คุณไม่ได้เริ่มภารกิจภายใน 5 นาที</p>
                <p className="mt-1">เงินมัดจำของคุณถูกเรียกเก็บแล้ว</p>
              </div>
            )}

            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[#121212]/10 bg-[#f9f9f8] p-3">
                <span className="font-medium text-[#121212]">จำนวนเงินมัดจำ</span>
                <span>฿{mission.pledgeAmount}</span>
              </div>

              {resultModal.kind === "success" ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#121212]/10 bg-[#f9f9f8] p-3">
                  <span className="font-medium text-[#121212]">คืนเงินมัดจำ</span>
                  <span>฿{mission.pledgeAmount}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#121212]/10 bg-[#f9f9f8] p-3">
                  <span className="font-medium text-[#121212]">จุดหมายภารกิจที่ล้มเหลว</span>
                  <span>{formatFailureDestination(mission.failedMissionDest)}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setResultModal({ visible: false, kind: "success" })
                router.push("/dashboard")
              }}
              className="mt-6 w-full rounded-full bg-[#AFFF00] px-4 py-3 text-sm font-semibold text-[#121212] shadow-[0_18px_30px_rgba(175,255,0,0.25)] transition hover:bg-[#baff36]"
            >
              Go to Home
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
