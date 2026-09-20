"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { DashboardNav } from "@/components/dashboard-nav"
import { type Mission } from "@/lib/missions"
import { getMissionFromSupabase, updateMissionInSupabase } from "@/lib/mission-data"
import { supabase } from "@/lib/supabase"

const checkpointConfig = [
  { key: "first", label: "Checkpoint 1", hint: "First 5 minutes" },
  { key: "mid", label: "Checkpoint 2", hint: "Mid mission" },
  { key: "final", label: "Checkpoint 3", hint: "Final 5 minutes" },
] as const

type CheckKey = (typeof checkpointConfig)[number]["key"]
type ToastTone = "success" | "warning" | "error" | "info"

type ToastItem = {
  id: string
  title: string
  message: string
  tone: ToastTone
}

const formatWindowRange = (value?: { start: string; end: string }) => {
  if (!value) return "—"

  const start = new Date(value.start)
  const end = new Date(value.end)

  return `${start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
}

const formatDateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })

const formatTimeLabel = (value: string) =>
  new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })

const formatClock = (ms: number) => {
  if (ms <= 0) return "00:00:00"

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / (60 * 60))
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((item) => String(item).padStart(2, "0")).join(":")
}

const formatCountdownLabel = (ms: number) => {
  if (ms <= 0) return "Now available"
  return formatClock(ms)
}

const formatMissionStatus = (status: Mission["status"] | null | undefined) => {
  switch (status) {
    case "Upcoming":
      return "UPCOMING"
    case "In Progress":
      return "IN PROGRESS"
    case "Completed":
      return "COMPLETED"
    case "Failed":
      return "FAILED"
    default:
      return "MISSION STATUS"
  }
}

export default function PhotoAIMissionPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const previousMissionRef = useRef<Mission | null>(null)
  const activeCheckpointRef = useRef<CheckKey | null>(null)

  const [mission, setMission] = useState<Mission | null>(null)
  const [now, setNow] = useState(0)
  const [cameraState, setCameraState] = useState<"idle" | "opening" | "preview" | "captured">("idle")
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("environment")
  const [activeCheckpoint, setActiveCheckpoint] = useState<CheckKey | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<{ passed: boolean; reason: string; confidence: number } | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const pushToast = (title: string, message: string, tone: ToastTone = "info") => {
    setToasts((current) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        title,
        message,
        tone,
      },
      ...current,
    ].slice(0, 3))
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  useEffect(() => {
    const syncMission = async () => setMission(await getMissionFromSupabase(id))

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

    const messageMap = {
      upcoming: "Your mission will start in 5 minutes",
      started: "Mission started",
      checkpointReady: "Checkpoint is ready. Take and submit your photo.",
      checkpointReminder: "Don't forget to submit your photo",
      photoSubmitted: "Photo submitted successfully",
      waitingAI: "Waiting for AI verification",
      completed: "Mission completed successfully",
      failed: "Mission failed",
    }

    const startTime = new Date(mission.startTime).getTime()
    const endTime = new Date(mission.endTime).getTime()
    const prevMission = previousMissionRef.current

    if (mission.status === "Upcoming" && now >= startTime - 5 * 60 * 1000 && now < startTime && !prevMission) {
      pushToast("Mission reminder", messageMap.upcoming, "warning")
    }

    if (prevMission && prevMission.status !== "In Progress" && mission.status === "In Progress") {
      pushToast("Mission started", messageMap.started, "success")
    }

    checkpointConfig.forEach(({ key, label }) => {
      const prevState = prevMission?.checks?.[key]
      const currentState = mission.checks[key]

      if (prevMission && prevState !== "Ready" && currentState === "Ready") {
        pushToast(`${label} is ready`, messageMap.checkpointReady, "success")
      }

      if (prevMission && prevState !== "Completed" && currentState === "Completed") {
        pushToast("Photo submitted successfully", `${label} was submitted successfully.`, "success")
      }

      if (prevMission && prevState !== "Missed" && currentState === "Missed") {
        pushToast("Checkpoint missed", `You missed ${label}.`, "error")
      }

      if (prevMission && currentState === "Ready") {
        const checkpointWindow = mission.checkWindows?.[key]
        if (checkpointWindow) {
          const checkpointEnd = new Date(checkpointWindow.end).getTime()
          const reminderThreshold = checkpointEnd - 5 * 60 * 1000
          if (now >= reminderThreshold && now < checkpointEnd && prevMission.checks[key] !== "Ready") {
            pushToast("Reminder", messageMap.checkpointReminder, "warning")
          }
        }
      }
    })

    if (prevMission && prevMission.status !== "Completed" && mission.status === "Completed") {
      pushToast("Mission completed", messageMap.completed, "success")
    }

    if (prevMission && prevMission.status !== "Failed" && mission.status === "Failed") {
      pushToast("Mission failed", messageMap.failed, "error")
    }

    if (mission.status === "Completed" && now > endTime) {
      pushToast("AI verification", messageMap.waitingAI, "info")
    }

    previousMissionRef.current = mission
  }, [mission, now])

  useEffect(() => {
    if (toasts.length === 0) return

    const timer = window.setTimeout(() => {
      setToasts((current) => current.slice(0, -1))
    }, 3600)

    return () => window.clearTimeout(timer)
  }, [toasts])

  useEffect(() => {
    return () => stopCamera()
  }, [])

  useEffect(() => {
    if (cameraState !== "preview" || !videoRef.current || !streamRef.current) {
      return
    }

    console.debug("[Photo AI Camera] videoElementReady", {
      videoReady: !!videoRef.current,
      streamReady: !!streamRef.current,
      cameraState,
    })
    videoRef.current.srcObject = streamRef.current
    console.debug("[Photo AI Camera] videoSrcObjectAssigned", {
      hasSrcObject: !!videoRef.current.srcObject,
      streamTracks: streamRef.current?.getTracks().length ?? 0,
    })
    videoRef.current.muted = true
    videoRef.current.autoplay = true
    videoRef.current.playsInline = true

    void videoRef.current.play().then(() => {
      console.debug("[Photo AI Camera] videoPlayStarted", {
        readyState: videoRef.current?.readyState,
        paused: videoRef.current?.paused,
      })
    }).catch(() => {
      setCameraError("Unable to start camera preview. Please try again.")
    })
  }, [cameraState, mission?.id])

  useEffect(() => {
    if (!mission || mission.status === "Completed" || mission.status === "Failed") return

    const nextChecks = { ...mission.checks }
    let expiredCheckpoint: CheckKey | null = null

    for (const item of checkpointConfig) {
      const state = mission.checks[item.key]
      const windowRange = mission.checkWindows?.[item.key]
      if (!windowRange || state === "Completed" || state === "Missed") continue

      const scheduledAt = new Date(windowRange.start).getTime()
      const deadlineAt = scheduledAt + 5 * 60 * 1000
      if (now > deadlineAt) {
        nextChecks[item.key] = "Missed"
        expiredCheckpoint = item.key
      }
    }

    if (!expiredCheckpoint) return

    const failedMission = {
      ...mission,
      checks: nextChecks,
      status: "Failed" as const,
    }

    void updateMissionInSupabase(mission.id, {
      status: "Failed",
      checks: nextChecks,
    })

    setMission(failedMission)
    setCameraError("หมดเวลาส่งภายใน 5 นาที ภารกิจไม่สำเร็จ")
    setCameraState("idle")
    stopCamera()
    pushToast("Checkpoint expired", "หมดเวลาส่งภายใน 5 นาที ภารกิจไม่สำเร็จ", "error")
  }, [mission, now])

  const checkpointDetails = useMemo(() => {
    if (!mission) return []

    return checkpointConfig.map(({ key, label, hint }) => {
      const state = mission.checks[key]
      const windowRange = mission.checkWindows?.[key]
      const scheduledAt = windowRange ? new Date(windowRange.start).getTime() : 0
      const deadlineAt = windowRange ? new Date(windowRange.start).getTime() + 5 * 60 * 1000 : 0
      const isReady = state === "Ready"
      const isCompleted = state === "Completed"
      const isMissed = state === "Missed"
      const hasStarted = now >= scheduledAt
      const hasEnded = now >= deadlineAt
      const timeUntilStart = Math.max(scheduledAt - now, 0)
      const timeUntilEnd = Math.max(deadlineAt - now, 0)

      return {
        key,
        label,
        hint,
        state,
        isReady,
        isCompleted,
        isMissed,
        hasStarted,
        hasEnded,
        timeUntilStart,
        timeUntilEnd,
        windowRange,
        deadlineAt,
      }
    })
  }, [mission, now])

  const currentCheckpoint = useMemo(
    () => checkpointDetails.find((item) => item.isReady) ?? null,
    [checkpointDetails],
  )

  const nextPendingCheckpoint = useMemo(
    () => checkpointDetails.find((item) => item.state === "Waiting") ?? null,
    [checkpointDetails],
  )

  const completedCount = useMemo(() => {
    if (!mission) return 0
    return Object.values(mission.checks).filter((item) => item === "Completed").length
  }, [mission])

  const progressPercent = mission ? Math.round((completedCount / 3) * 100) : 0

  const missionStartTime = mission ? new Date(mission.startTime).getTime() : 0
  const missionEndTime = mission ? new Date(mission.endTime).getTime() : 0

  const timerLabel = mission
    ? mission.status === "Upcoming"
      ? "MISSION STARTS IN"
      : mission.status === "In Progress"
        ? "MISSION IN PROGRESS"
        : mission.status === "Completed"
          ? "MISSION COMPLETED"
          : mission.status === "Failed"
            ? "MISSION FAILED"
            : "MISSION STATUS"
    : "MISSION STATUS"

  const timerDisplay = mission
    ? mission.status === "Upcoming"
      ? formatClock(Math.max(missionStartTime - now, 0))
      : mission.status === "In Progress"
        ? formatClock(Math.max(missionEndTime - now, 0))
        : mission.status === "Completed"
          ? "COMPLETED"
          : mission.status === "Failed"
            ? "FAILED"
            : "—"
    : "—"

  const nextAvailableCta = currentCheckpoint
    ? {
        label: "Take Photo",
        disabled: false,
      }
    : {
        label: "Photo submission is not available yet",
        disabled: true,
      }

  const handleCameraFacingChange = async (nextFacing: "user" | "environment") => {
    setCameraFacing(nextFacing)

    if (cameraState === "preview" || cameraState === "captured") {
      stopCamera()
      setCapturedImage(null)
      setCameraState("idle")

      if (currentCheckpoint) {
        await openCamera(currentCheckpoint.key, nextFacing)
      }
    }
  }

  const openCamera = async (target: CheckKey, requestedFacing: "user" | "environment" = cameraFacing) => {
    if (!mission || mission.status === "Completed" || mission.status === "Failed") return

    const targetWindow = mission.checkWindows?.[target]
    if (!targetWindow) return

    const start = new Date(targetWindow.start).getTime()
    if (now < start) {
      setCameraError("ยังไม่ถึงเวลาส่งรูปสำหรับรอบนี้")
      return
    }

    if (mission.checks[target] === "Completed") {
      setCameraError("รอบนี้ส่งรูปแล้ว")
      return
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const unsupportedMessage = "เบราว์เซอร์นี้ไม่รองรับการใช้งานกล้อง"
      setCameraError(unsupportedMessage)
      console.error("[Photo AI Camera] navigator.mediaDevices.getUserMedia is unavailable")
      return
    }

    const isSecureContext = window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    if (!isSecureContext) {
      const secureContextMessage = "กรุณาใช้งานผ่าน localhost หรือ HTTPS เพื่อเปิดกล้อง"
      setCameraError(secureContextMessage)
      console.error("[Photo AI Camera] browser security context blocked camera access")
      return
    }

    console.debug("[Photo AI Camera] cameraSupported", {
      supported: true,
      hostname: window.location.hostname,
      secureContext: window.isSecureContext,
      mediaDevicesAvailable: !!navigator.mediaDevices,
      getUserMediaAvailable: !!navigator.mediaDevices?.getUserMedia,
    })
    console.debug("[Photo AI Camera] permissionRequestStarted", {
      target,
      requestedFacing,
      permissionState: navigator.permissions ? "available" : "unsupported",
    })

    setCameraError(null)
    setCameraState("opening")
    setActiveCheckpoint(target)
    activeCheckpointRef.current = target

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      })

      console.debug("[Photo AI Camera] permission result", {
        streamTracks: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length,
      })

      streamRef.current = stream
      setCameraState("preview")
    } catch (error) {
      const cameraErrorName = error instanceof DOMException ? error.name : ""
      const cameraErrorMessage = cameraErrorName === "NotAllowedError"
        ? "ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้องใน Browser"
        : cameraErrorName === "NotFoundError"
          ? "ไม่พบกล้องในอุปกรณ์นี้"
          : cameraErrorName === "NotReadableError"
            ? "กล้องกำลังถูกใช้งานโดยโปรแกรมอื่น"
            : cameraErrorName === "SecurityError"
              ? "การเข้าถึงกล้องถูกปิดกั้นด้วยความปลอดภัยของเบราว์เซอร์"
              : "ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้องใน Browser"

      console.error("[Photo AI Camera] permission denied or unavailable", {
        name: cameraErrorName || "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      })

      setCameraState("idle")
      setCameraError(cameraErrorMessage)
      stopCamera()
    }
  }

  const capturePhoto = () => {
    if (!videoRef.current || !activeCheckpointRef.current) return

    const checkpointKey = activeCheckpointRef.current
    const checkpointWindow = mission?.checkWindows?.[checkpointKey]
    if (!checkpointWindow || !mission) return

    const scheduledAt = new Date(checkpointWindow.start).getTime()
    const deadlineAt = scheduledAt + 5 * 60 * 1000
    if (Date.now() > deadlineAt) {
      setCameraError("หมดเวลาส่งภายใน 5 นาที ภารกิจไม่สำเร็จ")
      setCameraState("idle")
      stopCamera()
      return
    }

    const video = videoRef.current
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720

    const context = canvas.getContext("2d")
    if (!context) return

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const photo = canvas.toDataURL("image/jpeg", 0.92)

    setCapturedImage(photo)
    setCameraState("captured")
    stopCamera()
  }

  const submitPhoto = async () => {
    if (!mission || !activeCheckpointRef.current || !capturedImage) return

    const checkpointKey = activeCheckpointRef.current
    const checkpointWindow = mission.checkWindows?.[checkpointKey]
    if (!checkpointWindow) return

    const scheduledAt = new Date(checkpointWindow.start).getTime()
    const deadlineAt = scheduledAt + 5 * 60 * 1000
    const submittedAt = new Date().toISOString()

    if (Date.now() > deadlineAt) {
      const expiredChecks = { ...mission.checks, [checkpointKey]: "Missed" as const }
      const failedMission = { ...mission, checks: expiredChecks, status: "Failed" as const }
      void updateMissionInSupabase(mission.id, { status: "Failed", checks: expiredChecks })
      setMission(failedMission)
      setCameraError("หมดเวลาส่งภายใน 5 นาที ภารกิจไม่สำเร็จ")
      setCameraState("idle")
      stopCamera()
      return
    }

    setIsVerifying(true)
    setCameraError(null)
    setVerificationResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error("Authentication is required.")
      }

      const formData = new FormData()
      formData.append("missionId", mission.id)
      formData.append("checkpoint", checkpointKey)
      formData.append("submittedAt", submittedAt)
      formData.append("image", await (await fetch(capturedImage)).blob())

      const response = await fetch("/api/photo-ai/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      })
      const payload = await response.json() as { error?: string; result?: { passed: boolean; reason: string; confidence: number } }

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "Photo verification failed.")
      }

      const nextMission = {
        ...mission,
        checks: {
          ...mission.checks,
          [checkpointKey]: payload.result.passed ? "Completed" : "Missed",
        },
        photos: {
          ...(mission.photos ?? {}),
          [checkpointKey]: capturedImage,
        },
        status: mission.status === "Upcoming" ? "In Progress" : mission.status,
      } as Mission

      if (Object.values(nextMission.checks).every((value) => value === "Completed")) {
        nextMission.status = "Completed"
      }

      setMission(nextMission)
      setVerificationResult(payload.result)
      pushToast(payload.result.passed ? "Photo approved" : "Photo rejected", payload.result.reason, payload.result.passed ? "success" : "warning")
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "AI verification could not be completed.")
      pushToast("Verification failed", error instanceof Error ? error.message : "AI verification could not be completed.", "error")
    } finally {
      setIsVerifying(false)
      setCapturedImage(null)
      setCameraState("idle")
      setActiveCheckpoint(null)
      activeCheckpointRef.current = null
    }
  }

  const markFailed = () => {
    if (!mission) return

    const updatedMission = {
      ...mission,
      status: "Failed" as const,
    }

    void updateMissionInSupabase(mission.id, { status: "Failed" })
    setMission(updatedMission)
  }

  if (!mission) {
    return (
      <main className="min-h-screen bg-[#f5f5f3] text-[#111111]">
        <DashboardNav />

        <div className="mx-auto max-w-4xl px-6 py-16">
          <h1 className="text-2xl font-bold">ภารกิจ Photo AI</h1>
          <p className="mt-2 text-sm text-gray-600">ไม่พบ Mission ID: {id}</p>
          <Link href="/missions" className="mt-6 inline-flex text-sm font-medium text-[#111111] underline">
            ← กลับไปยังภารกิจ
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f5f3] text-[#111111]">
      <DashboardNav />

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 md:px-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <Link href={`/missions/${mission.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-[#5d5d5d] transition hover:text-[#111111]">
            <span aria-hidden="true">←</span>
            กลับไปยังภารกิจ
          </Link>

          <div className="inline-flex items-center gap-2 rounded-full border border-[#111111]/10 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#111111]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#b7ff28]" />
            {formatMissionStatus(mission.status)}
          </div>
        </div>

        <section className="rounded-[30px] border border-[#111111]/5 bg-white p-4 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_240px] lg:items-end">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">
                Mission ID • {mission.id}
              </p>

              <h1 className="mt-3 text-3xl font-black tracking-[-0.08em] text-[#111111] md:text-[3.5rem]">
                {mission.missionName}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1 text-[#111111]">
                  {mission.missionType}
                </span>
                <span className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1 text-[#111111]">
                  {mission.verificationType}
                </span>
                <span className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1 text-[#111111]">
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
                {timerDisplay}
              </div>
            </div>

            <div className="text-sm font-medium text-[#5d5d5d]">
              {mission.status === "In Progress" || mission.status === "Upcoming"
                ? `${progressPercent}% Complete`
                : mission.status === "Completed"
                  ? "100% Complete"
                  : mission.status === "Failed"
                    ? "Mission outcome recorded"
                    : "—"}
            </div>
          </div>

          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#111111]/6">
            <div
              className="h-full rounded-full bg-[#b7ff28] transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-[24px] border border-[#111111]/5 bg-white p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">เริ่ม</div>
            <div className="mt-2 text-base font-bold text-[#111111]">{formatDateLabel(mission.startTime)}</div>
            <div className="mt-1 text-sm text-[#5d5d5d]">{formatTimeLabel(mission.startTime)}</div>
          </div>

          <div className="rounded-[24px] border border-[#111111]/5 bg-white p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">สิ้นสุด</div>
            <div className="mt-2 text-base font-bold text-[#111111]">{formatDateLabel(mission.endTime)}</div>
            <div className="mt-1 text-sm text-[#5d5d5d]">{formatTimeLabel(mission.endTime)}</div>
          </div>

          <div className="rounded-[24px] border border-[#111111]/5 bg-white p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">ระยะเวลา</div>
            <div className="mt-2 text-base font-bold text-[#111111]">{mission.durationLabel}</div>
            <div className="mt-1 text-sm text-[#5d5d5d]">{mission.durationMinutes} Minutes</div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black tracking-[-0.06em] text-[#111111]">กล้อง</h2>
              <div className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#111111]">
                {currentCheckpoint ? `Checkpoint ${checkpointConfig.findIndex((item) => item.key === currentCheckpoint.key) + 1} of 3` : "Waiting"}
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleCameraFacingChange("environment")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  cameraFacing === "environment"
                    ? "bg-[#111111] text-white"
                    : "border border-[#111111]/10 bg-[#f7f7f5] text-[#111111]"
                }`}
              >
                กล้องหลัง
              </button>

              <button
                type="button"
                onClick={() => void handleCameraFacingChange("user")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  cameraFacing === "user"
                    ? "bg-[#111111] text-white"
                    : "border border-[#111111]/10 bg-[#f7f7f5] text-[#111111]"
                }`}
              >
                กล้องหน้า
              </button>
            </div>

            {cameraState === "preview" || cameraState === "captured" ? (
              <div className="overflow-hidden rounded-[24px] border border-[#111111]/5 bg-[#0d1117]">
                <div className="relative">
                  {cameraState === "preview" ? (
                    <video ref={videoRef} className="aspect-video w-full object-cover" autoPlay playsInline muted />
                  ) : (
                    <img src={capturedImage ?? ""} alt="Captured mission proof" className="aspect-video w-full object-cover" />
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />

                  <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                    <span className="h-2 w-2 rounded-full bg-[#b7ff28]" />
                    {mission.missionName}
                  </div>

                  <div className="absolute left-4 bottom-4 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                    {activeCheckpoint ? `Checkpoint ${checkpointConfig.findIndex((item) => item.key === activeCheckpoint) + 1} of 3` : "Capture"}
                  </div>

                  <div className="absolute right-4 bottom-4 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                    {currentCheckpoint ? `Time remaining: ${formatCountdownLabel(currentCheckpoint.timeUntilEnd)}` : "Time locked"}
                  </div>
                </div>

                {cameraState === "captured" && (
                  <div className="flex flex-wrap gap-3 border-t border-white/10 bg-[#0d1117] p-4">
                    <button
                      type="button"
                      onClick={() => {
                        setCapturedImage(null)
                        setCameraState("idle")
                        if (activeCheckpoint) {
                          void openCamera(activeCheckpoint)
                        }
                      }}
                      className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      กลับกล้อง
                    </button>

                    <button
                      type="button"
                      onClick={submitPhoto}
                      className="rounded-full bg-[#b7ff28] px-4 py-2 text-sm font-semibold text-[#111111] transition hover:bg-[#c8ff4e]"
                    >
                      Submit Photo
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-[24px] border border-[#111111]/5 bg-[#f7f7f5] p-6">
                <div className="flex min-h-[340px] flex-col items-center justify-center rounded-[20px] border border-dashed border-[#111111]/15 bg-white px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#dfffa9] text-2xl text-[#111111]">
                    ✓
                  </div>

                  <h3 className="mt-5 text-xl font-black tracking-[-0.04em] text-[#111111]">
                    {currentCheckpoint ? "Checkpoint ready" : "Photo submission is not available yet"}
                  </h3>

                  <p className="mt-2 max-w-sm text-sm text-[#5d5d5d]">
                    {currentCheckpoint
                      ? `พร้อมสำหรับ ${checkpointConfig.find((item) => item.key === currentCheckpoint.key)?.label ?? "checkpoint นี้"}`
                      : nextPendingCheckpoint
                        ? `สามารถใช้งานได้ใน: ${formatCountdownLabel(nextPendingCheckpoint.timeUntilStart)}`
                        : "สถานะภารกิจถูกล็อกไว้ชั่วคราว"}
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (currentCheckpoint) {
                        void openCamera(currentCheckpoint.key)
                      }
                    }}
                    disabled={!currentCheckpoint || cameraState === "opening" || mission.status === "Completed" || mission.status === "Failed"}
                    className="mt-6 rounded-full bg-[#111111] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:bg-[#d7d7d4]"
                  >
                    {cameraState === "opening" ? "Opening camera..." : nextAvailableCta.label}
                  </button>
                </div>
              </div>
            )}

            {cameraState === "preview" && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-[20px] border border-[#111111]/5 bg-[#f7f7f5] p-3">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">
                    Camera status
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#111111]">กล้องถ่ายทอดภาพสดจากอุปกรณ์จริง</div>
                </div>

                <button
                  type="button"
                  onClick={capturePhoto}
                  className="rounded-full bg-[#b7ff28] px-4 py-2 text-sm font-semibold text-[#111111] transition hover:bg-[#c8ff4e]"
                >
                  Capture Photo
                </button>
              </div>
            )}

            {cameraError && (
              <div className="mt-4 rounded-[18px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {cameraError}
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-black tracking-[-0.06em] text-[#111111]">การยืนยัน</h2>
                <div className="rounded-full border border-[#111111]/10 bg-[#f5f5f3] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#111111]">
                  {progressPercent}%
                </div>
              </div>

              <div className="space-y-3">
                {checkpointDetails.map((item, index) => {
                  const isCurrent = item.isReady
                  const badgeTone = item.isCompleted
                    ? "bg-[#dfffa9] text-[#111111]"
                    : item.isReady
                      ? "bg-[#b7ff28] text-[#111111]"
                      : item.isMissed
                        ? "bg-red-100 text-red-700"
                        : "bg-[#111111]/6 text-[#111111]"

                  return (
                    <div
                      key={item.key}
                      className={`rounded-[22px] border p-3 transition ${
                        isCurrent ? "border-[#b7ff28] bg-[#f1ffc9]" : item.isCompleted ? "border-[#87d62f]/30 bg-[#f0ffdc]" : "border-[#111111]/5 bg-[#f7f7f5]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[#111111]/10 bg-white text-sm font-black text-[#111111]">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">
                            {item.label}
                          </div>
                          <div className="mt-1 text-sm font-medium text-[#111111]">
                            {item.windowRange ? formatWindowRange(item.windowRange) : "—"}
                          </div>
                        </div>

                        <div className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${badgeTone}`}>
                          {item.isCompleted
                            ? "✓ Submitted"
                            : item.isReady
                              ? "READY"
                              : item.isMissed
                                ? "FAILED"
                                : "WAITING"}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-[30px] border border-[#111111]/5 bg-white p-5 sm:p-6">
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
                    {mission.failedMissionDest === "return-to-friends" ? "Return to Friends" : "Donate to Foundation"}
                  </span>
                </div>

                <div className="rounded-[22px] border border-[#111111]/5 bg-[#f7f7f5] p-4">
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6b6b6b]">AI Verification API</div>
                  <div className="mt-2 text-sm font-semibold text-[#111111]">
                    {isVerifying ? "Verifying photo" : verificationResult ? (verificationResult.passed ? "Passed" : "Failed") : "Connected"}
                  </div>
                  <div className="mt-1 text-xs text-[#5d5d5d]">
                    {verificationResult ? verificationResult.reason : isVerifying ? "OpenAI is checking the uploaded image against the mission requirement." : "Server-side AI verification is enabled for this mission."}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={markFailed}
                  className="w-full rounded-full border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                >
                  Mark as Failed
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>

      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-[18px] border bg-white p-3 shadow-[0_20px_40px_rgba(17,17,17,0.16)] ${
              toast.tone === "success"
                ? "border-[#b7ff28]"
                : toast.tone === "warning"
                  ? "border-[#f4d35e]"
                  : toast.tone === "error"
                    ? "border-red-300"
                    : "border-[#111111]/10"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                  toast.tone === "success"
                    ? "bg-[#dfffa9] text-[#111111]"
                    : toast.tone === "warning"
                      ? "bg-[#f9efc7] text-[#111111]"
                      : toast.tone === "error"
                        ? "bg-red-100 text-red-700"
                        : "bg-[#d8f3ff] text-[#111111]"
                }`}
              >
                {toast.tone === "success" ? "✓" : toast.tone === "warning" ? "!" : toast.tone === "error" ? "×" : "i"}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[#111111]">{toast.title}</div>
                <div className="mt-1 text-xs text-[#5d5d5d]">{toast.message}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
