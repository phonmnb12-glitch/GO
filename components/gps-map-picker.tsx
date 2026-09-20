"use client"

import { Circle, MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import { useEffect, useState } from "react"

export type GPSMapDestination = {
  name: string
  address?: string
  latitude: number
  longitude: number
}

type GPSMapPickerProps = {
  destination: GPSMapDestination | null
  onSelect: (destination: GPSMapDestination) => void
}

const defaultCenter: [number, number] = [13.7563, 100.5018]

const modernPin = L.divIcon({
  className: "gps-modern-pin",
  html: '<span class="gps-modern-pin__shadow"></span><span class="gps-modern-pin__head"><span class="gps-modern-pin__point"></span></span>',
  iconSize: [40, 48],
  iconAnchor: [20, 44],
})

const currentLocationIcon = L.divIcon({
  className: "gps-current-location",
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

function MapInteraction({ onSelect }: { onSelect: GPSMapPickerProps["onSelect"] }) {
  useMapEvents({
    click(event) {
      const latitude = event.latlng.lat
      const longitude = event.latlng.lng
      onSelect({ name: "กำลังค้นหาชื่อสถานที่...", latitude, longitude })

      void fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, {
        headers: { Accept: "application/json" },
      }).then(async (response) => {
        if (!response.ok) throw new Error("Reverse geocoding failed")
        const result = await response.json() as { display_name?: string }
        onSelect({ name: result.display_name ?? "สถานที่ที่ปักหมุด", address: result.display_name, latitude, longitude })
      }).catch(() => {
        onSelect({ name: "สถานที่ที่ปักหมุด", latitude, longitude })
      })
    },
  })

  return null
}

function MapViewport({ destination }: { destination: GPSMapDestination | null }) {
  const map = useMap()

  useEffect(() => {
    if (!destination) return
    map.flyTo([destination.latitude, destination.longitude], Math.max(map.getZoom(), 16), { duration: 0.7 })
  }, [destination, map])

  return null
}

function CurrentLocationLayer() {
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    let watchId: number | null = null
    let cancelled = false
    const options: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    const updateLocation = (position: GeolocationPosition) => {
      if (!cancelled) setCurrentLocation([position.coords.latitude, position.coords.longitude])
    }
    const handleError = (error: GeolocationPositionError) => {
      console.error("[GPS] Unable to access the user's location.", error)
    }

    navigator.geolocation.getCurrentPosition((position) => {
      updateLocation(position)
      if (!cancelled) watchId = navigator.geolocation.watchPosition(updateLocation, handleError, options)
    }, handleError, options)

    return () => {
      cancelled = true
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  if (!currentLocation) return null
  return <><Circle center={currentLocation} radius={28} pathOptions={{ color: "#2f80ed", fillColor: "#2f80ed", fillOpacity: 0.14, weight: 1.5 }} /><Marker position={currentLocation} icon={currentLocationIcon} /></>
}

function MapControls() {
  const map = useMap()

  useEffect(() => {
    const control = new L.Control({ position: "topright" })
    control.onAdd = () => {
      const container = L.DomUtil.create("div", "leaflet-control leaflet-bar gps-current-control")
      const button = L.DomUtil.create("button", "", container)
      button.type = "button"
      button.title = "ใช้ตำแหน่งปัจจุบัน"
      button.setAttribute("aria-label", "ใช้ตำแหน่งปัจจุบัน")
      button.textContent = "◎"
      L.DomEvent.disableClickPropagation(button)
      L.DomEvent.on(button, "click", () => {
        if (!navigator.geolocation) return
        navigator.geolocation.getCurrentPosition(
          (position) => map.flyTo([position.coords.latitude, position.coords.longitude], Math.max(map.getZoom(), 16), { duration: 0.7 }),
          () => undefined,
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
        )
      })
      return container
    }
    map.addControl(control)
    return () => {
      map.removeControl(control)
    }
  }, [map])

  return null
}

export default function GPSMapPicker({ destination, onSelect }: GPSMapPickerProps) {
  const center: [number, number] = destination
    ? [destination.latitude, destination.longitude]
    : defaultCenter

  return (
    <div className="gps-map-picker relative h-[400px] w-full min-w-0 overflow-hidden rounded-2xl border border-[#121212]/10">
      <MapContainer center={center} zoom={destination ? 16 : 13} minZoom={3} maxZoom={19} scrollWheelZoom dragging doubleClickZoom touchZoom zoomControl={false} className="h-full w-full">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapInteraction onSelect={onSelect} />
        <MapViewport destination={destination} />
        <CurrentLocationLayer />
        <ZoomControl position="topright" />
        <MapControls />
        {destination && (
          <>
            <Marker position={[destination.latitude, destination.longitude]} icon={modernPin}>
              <Popup closeButton><div className="gps-destination-popup"><strong>{destination.name}</strong>{destination.address && <span>{destination.address}</span>}</div></Popup>
            </Marker>
          </>
        )}
      </MapContainer>
    </div>
  )
}
