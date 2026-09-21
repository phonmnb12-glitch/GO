"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import MissionCreatedPopup from "@/components/mission-created-popup"
import dynamic from "next/dynamic"
import { defaultChecks, type Mission } from "@/lib/missions"
import { createMissionInSupabase } from "@/lib/mission-data"
import { recordMissionEventInSupabase, updateMissionInSupabase } from "@/lib/mission-data"
import { addNotification } from "@/lib/event-store"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Crosshair, MapPin, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react"

type Destination = {
  name: string
  address?: string
  subdistrict?: string
  district?: string
  province?: string
  latitude: number
  longitude: number
}

type SearchResult = {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string
    housenumber?: string
    street?: string
    suburb?: string
    district?: string
    county?: string
    city?: string
    state?: string
    country?: string
    postcode?: string
  }
}

const GPSMapPicker = dynamic(() => import("@/components/gps-map-picker"), { ssr: false })

type Friend = { user_id: string; name?: string; friend_id?: string }

const pledgeOptions = [10, 50, 100]

const toDateInputValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

const toTimeInputValue = (date: Date) => date.toTimeString().slice(0, 5)

const formatCoordinate = (value: number) => value.toFixed(6)

const getWheelWindow = (value: number, maximum: number) => [
  value === 0 ? maximum : value - 1,
  value,
  value === maximum ? 0 : value + 1,
]

const moveWheelValue = (value: number, delta: number, maximum: number) => {
  const nextValue = value + delta
  if (nextValue < 0) return maximum
  if (nextValue > maximum) return 0
  return nextValue
}

export default function GPSCheckMissionPage() {
  const router = useRouter()
  const [isGroupMission, setIsGroupMission] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const creationTime = useMemo(() => new Date(), [])
  const [missionName, setMissionName] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [searchMessage, setSearchMessage] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [destination, setDestination] = useState<Destination | null>(null)
  const [endDate, setEndDate] = useState(toDateInputValue(new Date(creationTime.getTime() + 30 * 60000)))
  const [endTime, setEndTime] = useState(toTimeInputValue(new Date(creationTime.getTime() + 30 * 60000)))
  const [pledgeAmount, setPledgeAmount] = useState(10)
  const [customPledge, setCustomPledge] = useState("10")
  const [failedDestination, setFailedDestination] = useState("return-to-friends")
  const [friendRecipient, setFriendRecipient] = useState("")
  const [invitedFriends, setInvitedFriends] = useState<string[]>([])
  const [foundationRecipient, setFoundationRecipient] = useState("มูลนิธิ A")
  const [supportRecipient, setSupportRecipient] = useState("GO Support Fund")
  const [errors, setErrors] = useState<string[]>([])
  const [isCreated, setIsCreated] = useState(false)
  const [isPaying, setIsPaying] = useState(false)
  const wheelTouchStart = useRef<{ part: "hour" | "minute"; y: number } | null>(null)

  useEffect(() => {
    setIsGroupMission(new URLSearchParams(window.location.search).get("mode") === "group")
  }, [])

  useEffect(() => {
    const loadFriends = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const response = await fetch("/api/work-team", { headers: { Authorization: `Bearer ${session.access_token}` } })
      const result = await response.json() as { friends?: Friend[] }
      setFriends(result.friends ?? [])
      setFriendRecipient((current) => current || result.friends?.[0]?.user_id || "")
    }
    void loadFriends()
  }, [])

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("stripe_session_id")
    const pendingMission = window.sessionStorage.getItem("go-pending-paid-mission")
    if (!sessionId || !pendingMission) return

    const completePaidMission = async () => {
      setIsPaying(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error("Authentication is required")
        const response = await fetch("/api/stripe/verify-session", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ sessionId }),
        })
        const result = await response.json() as { paid?: boolean; error?: string }
        if (!response.ok || !result.paid) throw new Error(result.error ?? "Payment was not completed")
        const mission = JSON.parse(pendingMission) as Mission
        window.sessionStorage.removeItem("go-pending-paid-mission")
        window.history.replaceState({}, "", "/gps-check-mission")
        finalizeMission(mission)
      } catch (error) {
        console.error("[Stripe] Mission payment verification failed", error)
        setErrors(["Payment was not completed. Mission was not created."])
      } finally {
        setIsPaying(false)
      }
    }
    void completePaidMission()
  }, [router])

  const startDateTime = creationTime
  const endDateTime = useMemo(() => {
    const nextEndTime = new Date(`${endDate}T${endTime}:00`)
    if (Number.isNaN(nextEndTime.getTime())) return new Date(Number.NaN)
    const [hours, minutes] = endTime.split(":").map(Number)
    nextEndTime.setHours(hours, minutes, 0, 0)
    return nextEndTime
  }, [endDate, endTime])
  const isEndTimeInvalid = !endDate || !endTime || Number.isNaN(endDateTime.getTime()) || endDateTime.getTime() <= creationTime.getTime()
  const selectedDuration = Math.max(0, Math.round((endDateTime.getTime() - creationTime.getTime()) / 60000))
  const selectedPledge = pledgeAmount === -1 ? Math.max(10, Number(customPledge) || 0) : pledgeAmount
  const endHour = Number(endTime.split(":")[0]) || 0
  const endMinute = Number(endTime.split(":")[1]) || 0
  const hourWheelWindow = getWheelWindow(endHour, 23)
  const minuteWheelWindow = getWheelWindow(endMinute, 59)

  const setDestinationFromCoordinates = (nextDestination: Destination) => {
    setDestination(nextDestination)
    setSearchResults([])
    setSearchMessage("")
  }

  const getSearchResultDetails = (result: SearchResult) => {
    const properties = result.properties
    const address = [properties.housenumber, properties.street, properties.suburb, properties.district, properties.county, properties.city, properties.state, properties.postcode, properties.country]
      .filter(Boolean)
      .filter((part, index, parts) => parts.indexOf(part) === index)
      .join(", ")
    return {
      name: properties.name ?? properties.street ?? "สถานที่ที่เลือก",
      address,
      subdistrict: properties.suburb,
      district: properties.district ?? properties.county,
      province: properties.state,
      latitude: result.geometry.coordinates[1],
      longitude: result.geometry.coordinates[0],
    }
  }

  const searchLocation = async () => {
    const query = searchInput.trim()
    if (!query) {
      setSearchMessage("กรุณาค้นหาสถานที่")
      return
    }

    setIsSearching(true)
    setSearchMessage("")
    setSearchResults([])
    try {
      const response = await fetch(`https://photon.komoot.io/api/?limit=8&q=${encodeURIComponent(query)}`, {
        headers: { Accept: "application/json" },
      })
      if (!response.ok) throw new Error("Search failed")
      const payload = await response.json() as { features?: SearchResult[] }
      const results = payload.features ?? []
      if (results.length === 0) {
        setSearchMessage("ไม่พบสถานที่นี้")
        return
      }
      setSearchResults(results)
    } catch (error) {
      console.error("[OpenStreetMap] Place search failed.", error)
      setSearchMessage("ไม่สามารถค้นหาสถานที่ได้ กรุณาลองอีกครั้ง")
    } finally {
      setIsSearching(false)
    }
  }

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setSearchMessage("Unable to access your current location. เบราว์เซอร์หรือบริการตำแหน่งไม่พร้อมใช้งาน")
      return
    }

    // Desktops have no GPS chip, so a high-accuracy-only request can never
    // resolve there -- it just times out and (before this fix) retried the
    // same impossible request forever. Give a couple of attempts a real GPS
    // fix (for phones), then fall back to coarser network/WiFi-based
    // positioning, which is what desktops actually rely on.
    let attempt = 0
    const requestLocation = () => {
      attempt += 1
      const options: PositionOptions = { enableHighAccuracy: attempt <= 2, maximumAge: 0, timeout: 20000 }
      setSearchMessage("Getting your current location…")
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.debug("Location detected", { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy })
          setDestinationFromCoordinates({
            name: "ตำแหน่งปัจจุบันของฉัน",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
        },
        (error) => {
          console.error("[GPS] Geolocation error", { code: error.code, message: error.message, error })
          if (error.code === error.PERMISSION_DENIED) {
            setSearchMessage("Location permission is blocked for this site.")
          } else if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
            if (attempt < 4) {
              setSearchMessage("Location detection timed out. Trying again…")
              window.setTimeout(requestLocation, 1500)
            } else {
              setSearchMessage("Unable to detect your location. Please search for it instead.")
            }
          } else {
            setSearchMessage("Unable to access your current location.")
          }
        },
        options,
      )
    }

    if (navigator.permissions?.query) {
      void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
        console.debug("Location permission:", permission.state)
        if (permission.state === "denied") {
          setSearchMessage("Location permission is blocked for this site.")
          return
        }
        requestLocation()
      }).catch(() => requestLocation())
      return
    }
    requestLocation()
  }

  const validate = () => {
    const nextErrors: string[] = []
    if (!missionName.trim()) nextErrors.push("กรุณากรอกชื่อภารกิจ")
    if (!destination) nextErrors.push("กรุณาเลือก Destination")
    if (isEndTimeInvalid) {
      nextErrors.push("เวลาสิ้นสุดไม่ถูกต้อง")
      nextErrors.push("กรุณาเลือกเวลาที่มากกว่าเวลาปัจจุบัน")
    }
    if (selectedPledge < 10) nextErrors.push("Pledge Amount ต้องไม่น้อยกว่า ฿10")
    if (failedDestination === "return-to-friends" && !friends.some((friend) => friend.user_id === friendRecipient)) nextErrors.push("ไม่มีเพื่อนสำหรับส่งเงิน")
    if (failedDestination === "support" && !supportRecipient.trim()) nextErrors.push("กรุณาเลือกปลายทาง Support")
    setErrors(nextErrors)
    return nextErrors.length === 0
  }

  const createMission = async () => {
    if (!validate() || !destination) return

    const mission: Mission = {
      id: "",
      missionName: missionName.trim(),
      category: "GPS Check",
      missionType: isGroupMission ? "Group" : "Solo",
      verificationType: "GPS Check",
      durationLabel: `${selectedDuration} นาที`,
      durationMinutes: selectedDuration,
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      pledgeAmount: selectedPledge,
      failedMissionDest: failedDestination,
      friendRecipient: failedDestination === "return-to-friends" ? friendRecipient : undefined,
      foundationRecipient: failedDestination === "donate-to-foundation" ? foundationRecipient : undefined,
      supportRecipient: failedDestination === "support" ? supportRecipient : undefined,
      gpsDestinationName: destination.name,
      gpsDestinationAddress: destination.address,
      gpsLatitude: destination.latitude,
      gpsLongitude: destination.longitude,
      invitedFriends: isGroupMission ? invitedFriends : undefined,
      groupMembers: isGroupMission ? invitedFriends.map((friendId) => {
        const friend = friends.find((candidate) => candidate.user_id === friendId)
        return {
          memberId: friendId,
          missionId: "",
          name: friend?.name ?? friendId,
          status: "Pending" as const,
          pledgeAmount: selectedPledge,
          paymentStatus: "Pending" as const,
          completionStatus: "Pending" as const,
        }
      }) : undefined,
      groupMissionLifecycle: isGroupMission ? "Waiting for Members" : undefined,
      gpsVerificationStatus: "Pending",
      status: "Upcoming",
      checks: { ...defaultChecks },
      createdAt: new Date().toISOString(),
    }

    setIsPaying(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Authentication is required")
      const createdMission = await createMissionInSupabase(mission)
      if (!createdMission?.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(createdMission.id)) {
        throw new Error("Mission was not created successfully. No valid mission ID was returned.")
      }
      const paymentMissionName = missionName.trim()
      if (!paymentMissionName) throw new Error("Mission name is required before payment.")
      window.sessionStorage.setItem("go-pending-paid-mission", JSON.stringify(createdMission))
      const response = await fetch("/api/stripe/charge-mission-pledge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ missionId: createdMission.id, missionName: paymentMissionName, amount: selectedPledge }),
      })
      const result = await response.json() as { paid?: boolean; error?: string; code?: string; type?: string; param?: string }
      if (!response.ok || !result.paid) {
        throw new Error(result.error ?? "Payment confirmation is required before this mission can be marked paid.")
      }

      const paymentMission = {
        ...createdMission,
        missionName: paymentMissionName,
        pledgeAmount: selectedPledge,
      }
      finalizeMission(paymentMission)
      return
    } catch (error) {
      console.error("[Stripe] Mission payment setup failed", error)
      try {
        const createdMission = JSON.parse(window.sessionStorage.getItem("go-pending-paid-mission") ?? "null") as Mission | null
        if (createdMission?.id) await updateMissionInSupabase(createdMission.id, { status: "Failed" })
      } catch (cleanupError) {
        console.error("[Stripe] Failed to mark unpaid mission", cleanupError)
      }
      window.sessionStorage.removeItem("go-pending-paid-mission")
      setErrors(["Unable to start payment. Mission was not created."])
      setIsPaying(false)
      return
    }
  }

  const finalizeMission = (mission: Mission) => {
    const paymentTimestamp = new Date().toISOString()
    void recordMissionEventInSupabase({ missionId: mission.id, eventType: "money_deducted", payload: { mission_name: mission.missionName, amount: mission.pledgeAmount, created_at: paymentTimestamp } })
    addNotification({
      type: "payment",
      category: "Payment",
      title: "🟢 Payment Successful",
      description: `฿${mission.pledgeAmount} pledge payment completed for ${mission.missionName}.`,
      missionId: mission.id,
      missionName: mission.missionName,
      amount: mission.pledgeAmount,
      amountLabel: `฿${mission.pledgeAmount}`,
      dateTime: paymentTimestamp,
      unread: true,
      status: "success",
      action: "view",
      eventType: `payment_success_${mission.id}`,
    })
    if (isGroupMission) {
      const invitedAt = new Date().toISOString()
      invitedFriends.forEach((friendId) => {
        const friend = friends.find((candidate) => candidate.user_id === friendId)
        if (!friend) return
        void recordMissionEventInSupabase({ missionId: mission.id, eventType: "group_invitation", payload: { mission_name: missionName.trim(), user_id: friend.user_id, person_name: friend.name, created_at: invitedAt } })
        addNotification({ type: "group", category: "Group Mission", title: "🔵 Group Mission Invitation", description: `${missionName.trim()} is waiting for your response.`, missionId: mission.id, missionName: missionName.trim(), userId: friend.user_id, personName: friend.name, amount: selectedPledge, amountLabel: `฿${selectedPledge}`, dateTime: invitedAt, unread: true, action: "accept", status: "info", eventType: `group_invitation_${mission.id}_${friend.user_id}` })
      })
    }
    if (isGroupMission) {
      router.push("/dashboard")
      return
    }

    setIsCreated(true)
    window.setTimeout(() => router.push("/dashboard"), 1200)
  }

  const changeEndTime = (part: "hour" | "minute", delta: number) => {
    const nextHour = part === "hour" ? moveWheelValue(endHour, delta, 23) : endHour
    const nextMinute = part === "minute" ? moveWheelValue(endMinute, delta, 59) : endMinute
    setEndTime(`${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`)
  }

  const handleWheelTouchStart = (part: "hour" | "minute", event: TouchEvent<HTMLDivElement>) => {
    wheelTouchStart.current = { part, y: event.touches[0]?.clientY ?? 0 }
  }

  const handleWheelTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const touch = wheelTouchStart.current
    if (!touch) return

    const deltaY = (event.changedTouches[0]?.clientY ?? touch.y) - touch.y
    if (Math.abs(deltaY) > 12) changeEndTime(touch.part, deltaY > 0 ? -1 : 1)
    wheelTouchStart.current = null
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(175,255,0,0.12),_transparent_30%),linear-gradient(180deg,#f7f7f5_0%,#f2f4f6_100%)] text-[#121212]">
      <DashboardNav />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <button type="button" onClick={() => router.push(isGroupMission ? "/group-mission" : "/solo-mission")} className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#121212]"><ArrowLeft className="h-4 w-4" /> Back</button>
        <div className="mt-6 max-w-2xl">
          <h1 className="text-4xl font-black tracking-[-0.06em]">{isGroupMission ? "Group GPS Check Mission" : "GPS Check Mission"}</h1>
          <p className="mt-2 text-sm text-gray-600">Set your destination and check in at the right time</p>
        </div>

        {errors.length > 0 && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><ul className="list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="space-y-6">
            <section className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
              <h2 className="text-xl font-bold">1. Mission Name</h2>
              <input value={missionName} onChange={(event) => setMissionName(event.target.value)} placeholder="ชื่อภารกิจ" className="mt-4 w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 text-sm outline-none focus:border-[#AFFF00]" />
            </section>

            {isGroupMission && <section className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl"><h2 className="text-xl font-bold">Invite Friends</h2><p className="mt-1 text-sm text-gray-600">เชิญเพื่อนเข้าร่วมภารกิจ GPS นี้</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{friends.map((friend) => <button key={friend.user_id} type="button" onClick={() => setInvitedFriends((current) => current.includes(friend.user_id) ? current.filter((id) => id !== friend.user_id) : [...current, friend.user_id])} className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${invitedFriends.includes(friend.user_id) ? "border-[#AFFF00] bg-[#AFFF00]/15" : "border-[#121212]/10 bg-[#f9f9f8] hover:border-[#AFFF00]/40"}`}><span><span className="block text-sm font-semibold">{friend.name ?? "Unnamed friend"}</span><span className="text-xs text-gray-500">{friend.friend_id ?? friend.user_id}</span></span>{invitedFriends.includes(friend.user_id) && <span className="font-bold text-green-700">✓</span>}</button>)}</div></section>}

            <section className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">2. Destination</h2><MapPin className="h-5 w-5 text-[#8bbf00]" /></div>
              <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] p-3 sm:flex-row">
                <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchLocation() }} placeholder="Search location" className="w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#AFFF00]" /></div>
                <button type="button" onClick={() => void searchLocation()} disabled={isSearching} className="rounded-2xl bg-[#121212] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{isSearching ? "Searching..." : "ค้นหา"}</button>
                <button type="button" onClick={useCurrentLocation} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#121212]/10 bg-[#AFFF00] px-4 py-3 text-sm font-semibold"><Crosshair className="h-4 w-4" /> Use Current Location</button>
              </div>
              {searchMessage && <p className="mt-3 text-sm text-red-600">{searchMessage}</p>}
              {searchResults.length > 0 && <div className="mt-3 space-y-2" aria-label="ผลการค้นหาสถานที่">{searchResults.map((result, index) => {
                const details = getSearchResultDetails(result)
                return <button key={`${details.latitude}-${details.longitude}-${index}`} type="button" onClick={() => setDestinationFromCoordinates(details)} className="w-full rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] p-4 text-left transition hover:border-[#AFFF00]">
                  <div className="font-semibold">{details.name}</div>
                  <div className="mt-1 text-xs text-gray-600">{details.address || "ไม่พบรายละเอียดที่อยู่"}</div>
                  <div className="mt-2 grid gap-1 text-xs text-gray-500 sm:grid-cols-3"><span>ตำบล: {details.subdistrict || "ไม่ระบุ"}</span><span>อำเภอ: {details.district || "ไม่ระบุ"}</span><span>จังหวัด: {details.province || "ไม่ระบุ"}</span></div>
                  <div className="mt-1 text-xs text-gray-500">Latitude: {formatCoordinate(details.latitude)} · Longitude: {formatCoordinate(details.longitude)}</div>
                </button>
              })}</div>}
              <div className="mt-5 w-full min-w-0">
                <GPSMapPicker destination={destination} onSelect={setDestinationFromCoordinates} />
              </div>
              <p className="mt-2 text-xs text-gray-500">คลิกบนพื้นที่แผนที่เพื่อปักหมุดสถานที่</p>
              {destination && <div className="mt-4 grid gap-2 rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] p-4 text-sm"><div className="font-semibold">{destination.name}</div>{destination.address && <div className="text-gray-600">{destination.address}</div>}<div className="text-gray-600">Latitude: {formatCoordinate(destination.latitude)}</div><div className="text-gray-600">Longitude: {formatCoordinate(destination.longitude)}</div></div>}
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
              <h2 className="text-xl font-bold">3. End Date / End Time</h2>
              <p className="mt-1 text-xs text-gray-600">Start Time ถูกบันทึกอัตโนมัติเมื่อเปิดหน้านี้</p>
              <div className="mt-4 grid items-stretch gap-4 sm:grid-cols-2">
                <div className="flex h-[184px] w-full flex-col justify-center text-sm font-medium">
                  <div>วันที่สิ้นสุดภารกิจ (End Date)</div>
                  <div className="mt-2 flex w-full flex-1 items-center rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-2 outline-none transition duration-300 hover:border-[#AFFF00]">
                    <input type="date" aria-label="วันที่สิ้นสุดภารกิจ" value={endDate} min={toDateInputValue(creationTime)} onChange={(event) => setEndDate(event.target.value)} className="w-full rounded-xl border border-[#121212]/10 bg-white px-3 py-3 text-sm font-semibold outline-none transition focus:border-[#AFFF00] focus:ring-2 focus:ring-[#AFFF00]/20" />
                  </div>
                </div>
                <div className="flex h-[184px] w-full flex-col justify-center text-sm font-medium"><div>เวลาสิ้นสุดภารกิจ (End Time)</div><div className="mt-2 flex w-full flex-1 overscroll-contain items-center justify-center gap-5 rounded-2xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-2 outline-none transition duration-300 hover:border-[#AFFF00]" aria-label="เลือกเวลาสิ้นสุดภารกิจ" onWheel={(event) => { event.preventDefault(); event.stopPropagation() }}><div className="flex select-none touch-none flex-col items-center leading-none" onWheel={(event) => { event.preventDefault(); event.stopPropagation(); changeEndTime("hour", event.deltaY > 0 ? 1 : -1) }} onTouchStart={(event) => handleWheelTouchStart("hour", event)} onTouchEnd={handleWheelTouchEnd}>{hourWheelWindow.map((hour, index) => <button key={`${hour}-${index}`} type="button" onClick={() => changeEndTime("hour", index - 1)} className={`flex h-7 w-12 items-center justify-center text-xl transition-all duration-300 ease-out ${index === 1 ? "scale-105 font-bold text-[#121212]" : "text-gray-300"}`}>{String(hour).padStart(2, "0")}</button>)}</div><span className="text-xl font-bold text-[#121212]">:</span><div className="flex select-none touch-none flex-col items-center leading-none" onWheel={(event) => { event.preventDefault(); event.stopPropagation(); changeEndTime("minute", event.deltaY > 0 ? 1 : -1) }} onTouchStart={(event) => handleWheelTouchStart("minute", event)} onTouchEnd={handleWheelTouchEnd}>{minuteWheelWindow.map((minute, index) => <button key={`${minute}-${index}`} type="button" onClick={() => changeEndTime("minute", index - 1)} className={`flex h-7 w-12 items-center justify-center text-xl transition-all duration-300 ease-out ${index === 1 ? "scale-105 font-bold text-[#121212]" : "text-gray-300"}`}>{String(minute).padStart(2, "0")}</button>)}</div></div></div>
              </div>
              {isEndTimeInvalid && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><div>เวลาสิ้นสุดไม่ถูกต้อง</div><div>กรุณาเลือกเวลาที่มากกว่าเวลาปัจจุบัน</div></div>}
              {!isEndTimeInvalid && <div className="mt-4 rounded-xl border border-[#AFFF00]/30 bg-[#AFFF00]/10 p-3 text-sm">Duration: <strong>{selectedDuration} นาที</strong> · End Time: <strong>{endDateTime.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</strong></div>}
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
              <label className="block text-sm font-semibold text-[#121212]">4. จำนวนเงินมัดจำ <span className="text-red-500">*</span></label>
              <p className="mt-1 text-xs text-gray-600">ขั้นต่ำ: ฿10</p>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">{pledgeOptions.map((amount) => <button key={amount} type="button" onClick={() => setPledgeAmount(amount)} className={`rounded-xl border-2 px-4 py-3 text-sm font-medium transition ${pledgeAmount === amount ? "border-[#AFFF00] bg-[#AFFF00]/10 text-[#121212]" : "border-[#121212]/10 bg-[#f9f9f8] text-gray-600 hover:border-[#AFFF00]/40"}`}>฿{amount}</button>)}<button type="button" onClick={() => setPledgeAmount(-1)} className={`rounded-xl border-2 px-4 py-3 text-sm font-medium transition ${pledgeAmount === -1 ? "border-[#AFFF00] bg-[#AFFF00]/10 text-[#121212]" : "border-[#121212]/10 bg-[#f9f9f8] text-gray-600 hover:border-[#AFFF00]/40"}`}>Custom Amount</button></div>
              <input type="number" min="10" value={pledgeAmount === -1 ? customPledge : pledgeAmount} onChange={(event) => { setPledgeAmount(-1); setCustomPledge(event.target.value) }} placeholder="จำนวนเงินที่กำหนดเอง" className="mt-3 w-full rounded-xl border border-[#121212]/10 bg-[#f9f9f8] px-4 py-3 text-sm focus:border-[#AFFF00] focus:outline-none focus:ring-2 focus:ring-[#AFFF00]/20" />
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)] backdrop-blur-xl">
              <label className="block text-sm font-semibold text-[#121212]">5. หากภารกิจล้มเหลว <span className="text-red-500">*</span></label>
              <p className="mt-1 text-xs text-gray-600">เลือกปลายทาง</p>
              <div className="mt-3 space-y-3">{[["return-to-friends", "คืนให้เพื่อน"], ["donate-to-foundation", "บริจาคมูลนิธิ"], ["support", "สนับสนุน go."]].map(([value, label]) => <div key={value} className={`rounded-xl border-2 bg-[#f9f9f8] p-3 transition ${failedDestination === value ? "border-[#AFFF00] bg-[#AFFF00]/10" : "border-[#121212]/10 hover:border-[#AFFF00]/40"}`}>
                <label className="flex cursor-pointer items-center gap-3"><input type="radio" name="failed-destination" checked={failedDestination === value} onChange={() => setFailedDestination(value)} className="h-4 w-4" /><span className="text-sm font-medium text-[#121212]">{label}</span></label>
                {failedDestination === "return-to-friends" && value === "return-to-friends" && <div className="mt-3 space-y-2 border-t border-[#121212]/10 pt-3">{friends.length > 0 ? friends.map((friend) => <button key={friend.user_id} type="button" onClick={() => setFriendRecipient(friend.user_id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${friendRecipient === friend.user_id ? "border-[#AFFF00] bg-[#AFFF00]/15" : "border-[#121212]/10 bg-white hover:border-[#AFFF00]/40"}`}><div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#121212] to-[#555] text-xs font-bold text-white">{(friend.name ?? "?").slice(0, 2).toUpperCase()}</div><div><div className="text-sm font-semibold text-[#121212]">{friend.name ?? "Unnamed friend"}</div><div className="text-xs text-gray-500">{friend.friend_id ?? friend.user_id}</div></div></button>) : <p className="text-sm text-red-600">ไม่มีเพื่อนสำหรับส่งเงิน</p>}</div>}
                {failedDestination === "donate-to-foundation" && value === "donate-to-foundation" && <div className="mt-3 space-y-2 border-t border-[#121212]/10 pt-3">{["มูลนิธิ A", "มูลนิธิ B", "มูลนิธิ C"].map((foundation) => <button key={foundation} type="button" onClick={() => setFoundationRecipient(foundation)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${foundationRecipient === foundation ? "border-[#AFFF00] bg-[#AFFF00]/15" : "border-[#121212]/10 bg-white hover:border-[#AFFF00]/40"}`}><span className="text-sm font-medium text-[#121212]">{foundation}</span><span className="text-xs text-gray-500">฿{selectedPledge}</span></button>)}</div>}
                {failedDestination === "support" && value === "support" && <div className="mt-3 space-y-2 border-t border-[#121212]/10 pt-3">{["GO Support Fund", "GO Community Support"].map((support) => <button key={support} type="button" onClick={() => setSupportRecipient(support)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${supportRecipient === support ? "border-[#AFFF00] bg-[#AFFF00]/15" : "border-[#121212]/10 bg-white hover:border-[#AFFF00]/40"}`}><span className="text-sm font-medium text-[#121212]">{support}</span><span className="text-xs text-gray-500">Support</span></button>)}</div>}
              </div>)}</div>
            </section>

            <section className="rounded-[28px] border border-[#AFFF00]/50 bg-[#f4f9e9] p-6"><h2 className="text-xl font-bold">7. GPS Verification</h2><p className="mt-3 text-sm text-gray-700">You must be within 10 meters of the destination at the required time.</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><div className="text-xs text-gray-500">Required Distance</div><strong>10 meters</strong></div><div><div className="text-xs text-gray-500">Required Time</div><strong>{startDateTime.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</strong></div></div></section>

            <section className="rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(18,18,18,0.08)]"><h2 className="text-xl font-bold">6. Mission Summary</h2><div className="mt-4 space-y-2 text-sm">{[["Mission Name", missionName || "—"], ["Destination", destination?.name || "—"], ["End Date", endDateTime.toLocaleDateString("th-TH")], ["End Time", endDateTime.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })], ["Verification", "GPS Check"], ["Pledge Amount", `฿${selectedPledge}`], ["Failed Mission Destination", failedDestination]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-[#121212]/5 pb-2"><span className="text-gray-500">{label}</span><span className="max-w-[60%] text-right font-semibold">{value}</span></div>)}</div></section>
            <button type="button" onClick={() => void createMission()} disabled={isPaying} className="w-full rounded-2xl bg-[#AFFF00] px-5 py-4 text-base font-bold text-[#121212] shadow-[0_18px_30px_rgba(175,255,0,0.25)] transition hover:bg-[#baff36] disabled:cursor-wait disabled:opacity-60">{isPaying ? "Processing payment..." : "Create Mission"}</button>
          </div>
        </div>
      </div>
      {isCreated && <MissionCreatedPopup missionType={isGroupMission ? "Group GPS Check" : "GPS Check"} onComplete={() => router.push("/dashboard?refresh=1")} />}
    </main>
  )
}
