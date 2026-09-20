"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import { getMissionById, updateMission, type Mission } from "@/lib/missions"
import { recordMissionEventInSupabase } from "@/lib/mission-data"
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import { ArrowLeft, LocateFixed, Navigation, X } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

type Coordinates = {
  latitude: number
  longitude: number
}

type LocationStatus = "permission-required" | "getting" | "detected" | "error"

const distanceBetween = (first: Coordinates, second: Coordinates) => {
  const earthRadius = 6371000
  const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180
  const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180
  const latitudeOne = first.latitude * Math.PI / 180
  const latitudeTwo = second.latitude * Math.PI / 180
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

const formatDistance = (distance?: number) => {
  if (distance === undefined) return "—"
  return distance < 1000 ? `${Math.round(distance)} m away` : `${(distance / 1000).toFixed(2)} km away`
}

const formatDateTime = (value?: string) => value ? new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "—"

const liveLocationIcon = L.divIcon({ className: "gps-live-location", html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] })
const destinationIcon = L.divIcon({ className: "gps-destination-location", html: '<span></span>', iconSize: [30, 30], iconAnchor: [15, 15] })

function LiveMap({ destination, currentLocation }: { destination: Coordinates; currentLocation: Coordinates | null }) {
  const map = useMap()

  useEffect(() => {
    const points = [destination, ...(currentLocation ? [currentLocation] : [])].map((point) => [point.latitude, point.longitude] as [number, number])
    if (points.length > 1) map.fitBounds(points, { padding: [42, 42], maxZoom: 17 })
  }, [currentLocation, destination, map])

  return null
}

function MissionMap({ destination, currentLocation }: { destination: Coordinates; currentLocation: Coordinates | null }) {
  const center: [number, number] = [destination.latitude, destination.longitude]
  return (
    <MapContainer center={center} zoom={16} className="h-full w-full" scrollWheelZoom>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <LiveMap destination={destination} currentLocation={currentLocation} />
      <Circle center={center} radius={10} pathOptions={{ className: "gps-destination-radius", color: "#32d583", fillColor: "#54ff9a", fillOpacity: 0.24, weight: 2 }} />
      <Marker position={center} icon={destinationIcon}>
        <Popup closeButton><div className="gps-destination-popup"><strong>🟢 Destination</strong><span>Destination</span></div></Popup>
      </Marker>
      {currentLocation && <><Circle center={[currentLocation.latitude, currentLocation.longitude]} radius={28} pathOptions={{ className: "gps-current-radius", color: "#2f80ed", fillColor: "#2f80ed", fillOpacity: 0.14, weight: 1.5 }} /><Marker position={[currentLocation.latitude, currentLocation.longitude]} icon={liveLocationIcon} /><Polyline positions={[center, [currentLocation.latitude, currentLocation.longitude]]} pathOptions={{ color: "#111111", dashArray: "8 8", weight: 3 }} /></>}
    </MapContainer>
  )
}

const eventNotification = async (type: "gps_started" | "gps_checkin_pending" | "gps_checkin_completed" | "mission_completed" | "money_returned" | "mission_failed" | "money_sent", _title: string, _description: string, mission: Mission, _timestamp: string, _status: "success" | "failed" | "warning") => {
  try {
    await recordMissionEventInSupabase({
      missionId: mission.id,
      eventType: type,
      payload: {
        mission_name: mission.missionName,
        amount: mission.pledgeAmount,
        failed_destination: mission.failedMissionDest,
      },
    })
  } catch (error) {
    console.error("[Supabase] Mission event failed", error)
  }
}

export default function GPSMissionPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id
  const [mission, setMission] = useState<Mission | null>(null)
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null)
  const [locationError, setLocationError] = useState("")
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("permission-required")
  const [locationAttempt, setLocationAttempt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [popup, setPopup] = useState<"success" | "failed" | null>(null)

  const destination = mission?.gpsLatitude !== undefined && mission.gpsLongitude !== undefined
    ? { latitude: mission.gpsLatitude, longitude: mission.gpsLongitude }
    : null

  useEffect(() => {
    const syncMission = () => setMission(getMissionById(id))
    syncMission()
    const timer = window.setInterval(syncMission, 1000)
    return () => window.clearInterval(timer)
  }, [id])

  useEffect(() => {
    if (!mission) return

    if (mission.status === "Failed" && !mission.gpsCheckInAt) {
      setPopup("failed")
      eventNotification("mission_failed", "🔴 Mission Failed", `Mission '${mission.missionName}' failed because check-in time expired.`, mission, mission.endTime, "failed")
      if (mission.failedMissionDest === "return-to-friends") {
        eventNotification("money_sent", "🔴 Money Sent", `Pledge sent to ${mission.friendRecipient ?? "the selected friend"}.`, mission, mission.endTime, "failed")
      }
      return
    }

    if (mission.status === "Completed") return

    const start = new Date(mission.startTime).getTime()
    const end = new Date(mission.endTime).getTime()
    if (now >= start && !mission.startedAt) {
      const startedAt = new Date(now).toISOString()
      updateMission(mission.id, (current) => ({ ...current, status: "In Progress", startedAt }))
      eventNotification("gps_started", "🟡 Mission Started", `GPS Mission '${mission.missionName}' has started.`, mission, startedAt, "warning")
    } else if (now > end && !mission.gpsCheckInAt) {
      const failedAt = new Date(now).toISOString()
      const failedMission = updateMission(mission.id, (current) => ({ ...current, status: "Failed", gpsVerificationStatus: "Failed", gpsFailureReason: "Check-in time expired" }))
      if (failedMission) {
        setMission(failedMission)
        setPopup("failed")
        eventNotification("mission_failed", "🔴 Mission Failed", `Mission '${mission.missionName}' failed because check-in time expired.`, failedMission, failedAt, "failed")
        if (failedMission.failedMissionDest === "return-to-friends") {
          eventNotification("money_sent", "🔴 Money Sent", `Pledge sent to ${failedMission.friendRecipient ?? "the selected friend"}.`, failedMission, failedAt, "failed")
        }
      }
    }
  }, [mission, now])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!mission || mission.status === "Completed" || mission.status === "Failed" || !destination || !currentLocation) return

    const currentTime = Date.now()
    const start = new Date(mission.startTime).getTime()
    const end = new Date(mission.endTime).getTime()
    const currentDistance = distanceBetween(currentLocation, destination)

    if (currentTime < start) return
    if (currentTime > end) {
      const failedMission = updateMission(mission.id, (current) => ({ ...current, status: "Failed", gpsVerificationStatus: "Failed", gpsFailureReason: "You were not within 10 meters of the destination before the mission ended." }))
      if (failedMission) {
        setMission(failedMission)
        setPopup("failed")
        eventNotification("mission_failed", "🔴 Mission Failed", "You were not within 10 meters of the destination before the mission ended.", failedMission, new Date(currentTime).toISOString(), "failed")
        if (failedMission.failedMissionDest === "return-to-friends") eventNotification("money_sent", "🔴 Money Sent", `Pledge sent to ${failedMission.friendRecipient ?? "the selected friend"}.`, failedMission, new Date(currentTime).toISOString(), "failed")
      }
      return
    }

    if (currentDistance > 10) {
      eventNotification("gps_checkin_pending", "🟡 GPS Check-in Pending", "You are not within 10 meters of the destination.", mission, new Date(currentTime).toISOString(), "warning")
      return
    }

    const checkedAt = new Date(currentTime).toISOString()
    const completedMission = updateMission(mission.id, (current) => ({ ...current, status: "Completed", startedAt: current.startedAt ?? checkedAt, gpsCheckInAt: checkedAt, gpsCheckInLatitude: currentLocation.latitude, gpsCheckInLongitude: currentLocation.longitude, gpsCheckInDistance: currentDistance, gpsVerificationStatus: "Passed", gpsFailureReason: undefined }))
    if (completedMission) {
      setMission(completedMission)
      setPopup("success")
      eventNotification("gps_checkin_completed", "🟢 GPS Check-in Complete", "Your location was verified automatically.", completedMission, checkedAt, "success")
      eventNotification("mission_completed", "🟢 Mission Completed", `Mission '${completedMission.missionName}' was completed.`, completedMission, checkedAt, "success")
      eventNotification("money_returned", "🟢 Pledge Returned", `฿${completedMission.pledgeAmount} pledge returned.`, completedMission, checkedAt, "success")
    }
  }, [currentLocation, destination, mission, now])

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus("error")
      setLocationError("Unable to access your current location.\nYour browser or location service is unavailable.")
      return
    }

    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      setLocationStatus("error")
      setLocationError("Unable to access your current location.\nLocation access requires a secure connection (HTTPS) or localhost.")
      return
    }

    let watchId: number | null = null
    let retryTimer: number | null = null
    let cancelled = false
    let retryCount = 0
    const maxRetries = 3
    const locationOptions: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }

    const handlePosition = (position: GeolocationPosition) => {
      if (cancelled) return
      setCurrentLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      setLocationStatus("detected")
      setLocationError("")
      retryCount = 0
      console.debug("Location detected", {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      })
    }

    const handleError = (error: GeolocationPositionError) => {
      if (cancelled) return
      console.error("[GPS] Geolocation error", {
        code: error.code,
        message: error.message,
        error,
      })
      if (error.code === error.PERMISSION_DENIED) {
        setLocationStatus("error")
        setLocationError("Location permission was denied.\nPlease allow location access in your browser settings.")
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        setLocationStatus("getting")
        setLocationError("Your current location is temporarily unavailable.")
        scheduleRetry()
      } else if (error.code === error.TIMEOUT) {
        setLocationStatus("getting")
        setLocationError("Location detection timed out. Trying again…")
        scheduleRetry()
      } else {
        setLocationStatus("error")
        setLocationError("Unable to access your location")
      }
    }

    const requestCurrentLocation = () => {
      if (cancelled) return
      setLocationStatus("getting")
      setLocationError("Getting your current location…")
      navigator.geolocation.getCurrentPosition((position) => {
        handlePosition(position)
        if (!cancelled && watchId === null) {
          watchId = navigator.geolocation.watchPosition(handlePosition, handleError, locationOptions)
        }
      }, handleError, locationOptions)
    }

    function scheduleRetry() {
      if (cancelled || retryCount >= maxRetries || retryTimer !== null) return
      retryCount += 1
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        requestCurrentLocation()
      }, 1500)
    }

    const requestWithPermissionCheck = async () => {
      try {
        if (navigator.permissions?.query) {
          const permission = await navigator.permissions.query({ name: "geolocation" })
          if (cancelled) return
          console.debug("Location permission:", permission.state)
          if (permission.state === "denied") {
            setLocationStatus("error")
            setLocationError("Location permission is blocked for this site.")
            return
          }
        }
      } catch (error) {
        console.debug("Location permission status is unavailable.", error)
      }
      requestCurrentLocation()
    }

    void requestWithPermissionCheck()

    return () => {
      cancelled = true
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [locationAttempt])

  const distance = currentLocation && destination ? distanceBetween(currentLocation, destination) : undefined
  const startTime = mission ? new Date(mission.startTime).getTime() : 0
  const endTime = mission ? new Date(mission.endTime).getTime() : 0
  const isWithinMissionTime = now >= startTime && now <= endTime
  const isWithinRadius = distance !== undefined && distance <= 10
  const distanceStatus = !currentLocation
    ? "Waiting for Location"
    : isWithinRadius
      ? "Within 10 meters"
      : "Move within 10 meters"
  const statusMessage = useMemo(() => {
    if (!mission) return ""
    if (mission.gpsVerificationStatus === "Passed") return "Destination reached"
    if (mission.gpsVerificationStatus === "Failed") return mission.gpsFailureReason ?? "GPS Verification Failed"
    if (!currentLocation) return "Waiting for Location"
    if (now < startTime) return "Waiting for Check-in Time"
    if (now > endTime) return "Mission time has expired."
    if ((distance ?? Infinity) > 10) return `${Math.round(distance ?? 0)} m away. Move closer to the destination.`
    return "Destination reached. Verifying automatically..."
  }, [currentLocation, distance, isWithinMissionTime, mission, now, startTime])

  if (!mission) {
    return <main className="min-h-screen bg-[#f5f5f3] text-[#121212]"><DashboardNav /><div className="mx-auto max-w-4xl px-6 py-16"><h1 className="text-2xl font-bold">GPS Mission</h1><p className="mt-2 text-sm text-gray-600">ไม่พบภารกิจนี้</p><button type="button" onClick={() => router.push("/missions")} className="mt-6 text-sm underline">← Back to Missions</button></div></main>
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
      <DashboardNav />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <button type="button" onClick={() => router.push(`/missions/${mission.id}`)} className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#121212]"><ArrowLeft className="h-4 w-4" /> Back to Mission Detail</button>
        <div className="mt-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Mission ID: {mission.id}</p><h1 className="mt-2 text-4xl font-black tracking-[-0.06em]">{mission.missionName}</h1><p className="mt-2 text-sm text-gray-600">GPS Check Mission · {mission.status}</p></div><span className="rounded-full bg-[#AFFF00] px-3 py-1.5 text-sm font-semibold">{mission.status}</span></div>

        {locationStatus === "getting" && <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">Getting your current location...</div>}
        {locationStatus === "detected" && <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">Location detected</div>}
        {locationError && <div className="mt-6 whitespace-pre-line rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><div>{locationError}</div><button type="button" onClick={() => setLocationAttempt((attempt) => attempt + 1)} className="mt-3 rounded-xl bg-white px-3 py-2 font-semibold text-red-700 shadow-sm">Try Again</button></div>}

        <section className="mt-6 overflow-hidden rounded-[28px] border border-white/70 bg-white/75 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
          <div className="border-b border-[#121212]/5 p-5"><div className="flex items-center gap-2"><LocateFixed className="h-5 w-5" /><h2 className="text-xl font-bold">Map Verification</h2></div><p className="mt-1 text-sm text-gray-600">GPS Verification · Automatic check-in</p><div className="mt-3 rounded-xl bg-[#f5f5f3] px-3 py-2 text-sm"><span className="text-gray-500">Destination: </span><strong>{mission.gpsDestinationName ?? "Destination"}</strong></div></div>
          <div className="relative h-[420px] bg-[#e7ece8]">{destination ? <MissionMap destination={destination} currentLocation={currentLocation} /> : <div className="flex h-full items-center justify-center text-sm text-gray-600">Destination coordinates are unavailable.</div>}{currentLocation && <div className="pointer-events-none absolute right-5 top-5 rounded-full bg-white/90 px-3 py-2 text-xs font-semibold shadow">GPS signal active</div>}</div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><div><div className="text-xs uppercase tracking-[0.14em] text-gray-500">Destination</div><div className="mt-2 font-semibold">{mission.gpsDestinationName ?? "Destination"}</div></div><div><div className="text-xs uppercase tracking-[0.14em] text-gray-500">Distance</div><div className="mt-2 text-xl font-black">{distance === undefined ? "—" : `${Math.round(distance)} m`}</div><div className={`mt-1 text-xs font-semibold ${isWithinRadius ? "text-green-700" : "text-amber-700"}`}>{distanceStatus}</div></div><div><div className="text-xs uppercase tracking-[0.14em] text-gray-500">Required Distance</div><div className="mt-2 font-semibold">Within 10 meters</div></div><div><div className="text-xs uppercase tracking-[0.14em] text-gray-500">Check-in Time</div><div className="mt-2 font-semibold">{formatDateTime(mission.startTime)}</div></div></div>
        </section>

        <section className="mt-6 rounded-[28px] border border-[#AFFF00]/50 bg-[#f4f9e9] p-6"><div className="flex items-center gap-2"><Navigation className="h-5 w-5" /><h2 className="text-xl font-bold">Auto Check-in Status</h2></div><p className="mt-3 text-sm font-semibold text-gray-800">{statusMessage}</p><p className="mt-2 text-sm text-gray-700">Check-in will be verified automatically at the required time.</p></section>

        {mission.gpsVerificationStatus === "Passed" || mission.gpsVerificationStatus === "Failed" || mission.status === "Failed" ? (
          <section className={`mt-6 rounded-[28px] border p-6 ${mission.gpsVerificationStatus === "Passed" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}><h2 className="text-2xl font-black">{mission.gpsVerificationStatus === "Passed" ? "🟢 GPS Verified" : "🔴 GPS Verification Failed"}</h2><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div>Check-in Time: <strong>{formatDateTime(mission.gpsCheckInAt)}</strong></div><div>Distance from Destination: <strong>{formatDistance(mission.gpsCheckInDistance)}</strong></div><div>Location: <strong>{mission.gpsCheckInLatitude?.toFixed(6)}, {mission.gpsCheckInLongitude?.toFixed(6)}</strong></div><div>{mission.gpsVerificationStatus === "Passed" ? "Pledge Returned" : `Reason: ${mission.gpsFailureReason ?? "Check-in time expired"}`}</div></div></section>
        ) : (
          <section className="mt-6 rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)]"><div className="flex items-center gap-2"><Navigation className="h-5 w-5" /><h2 className="text-xl font-bold">Automatic GPS Check-in</h2></div><p className="mt-3 text-sm text-gray-700">{statusMessage}</p><div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#f5f5f3] p-4 text-sm"><span className="h-3 w-3 animate-pulse rounded-full bg-[#AFFF00]" /><span>GPS monitoring is active. Check-in happens automatically when you are within 10 meters at the required time.</span></div></section>
        )}
      </div>
      {popup && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121212]/40 p-6"><div className="relative w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl"><button type="button" aria-label="Close" onClick={() => setPopup(null)} className="absolute right-4 top-4 rounded-full p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button><div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl ${popup === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{popup === "success" ? "✓" : "!"}</div><h2 className="mt-4 text-center text-2xl font-black">{popup === "success" ? "Mission Completed!" : "Mission Failed"}</h2><div className="mt-5 space-y-3 rounded-2xl bg-[#f5f5f3] p-4 text-sm"><div className="flex justify-between gap-4"><span>Mission Name</span><strong className="text-right">{mission.missionName}</strong></div><div className="flex justify-between gap-4"><span>{popup === "success" ? "Check-in Time" : "Reason"}</span><strong className="text-right">{popup === "success" ? formatDateTime(mission.gpsCheckInAt) : mission.gpsFailureReason ?? "Check-in time expired"}</strong></div><div className="flex justify-between gap-4"><span>{popup === "success" ? "Distance" : "Failed Mission Destination"}</span><strong className="text-right">{popup === "success" ? formatDistance(mission.gpsCheckInDistance) : mission.failedMissionDest}</strong></div><div className="flex justify-between gap-4"><span>Pledge Amount</span><strong>฿{mission.pledgeAmount}</strong></div>{popup === "success" && <div className="pt-2 font-bold text-green-700">Pledge Returned</div>}</div><button type="button" onClick={() => router.push("/dashboard")} className="mt-5 w-full rounded-2xl bg-[#AFFF00] px-5 py-3 font-bold">Go to Home</button></div></div>}
    </main>
  )
}
