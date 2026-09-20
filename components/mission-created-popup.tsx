"use client"

import { Check } from "lucide-react"
import { motion } from "framer-motion"
import { useEffect, useRef } from "react"

type MissionCreatedPopupProps = {
  missionType: string
  onComplete: () => void
}

export default function MissionCreatedPopup({ missionType, onComplete }: MissionCreatedPopupProps) {
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    const audioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (audioContextClass) {
      const audioContext = new audioContextClass()
      const playBellTone = (frequency: number, startOffset: number) => {
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()
        const startAt = audioContext.currentTime + startOffset

        oscillator.type = "sine"
        oscillator.frequency.setValueAtTime(frequency, startAt)
        gainNode.gain.setValueAtTime(0.0001, startAt)
        gainNode.gain.exponentialRampToValueAtTime(0.16, startAt + 0.015)
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.5)
        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)
        oscillator.start(startAt)
        oscillator.stop(startAt + 0.52)
      }

      void audioContext.resume().then(() => {
        playBellTone(1760, 0)
        window.setTimeout(() => void audioContext.close(), 800)
      }).catch(() => undefined)
    }

    const timer = window.setTimeout(() => onCompleteRef.current(), 1200)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#121212]/30 p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 18 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm rounded-[28px] bg-white p-7 text-center shadow-2xl"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
          <Check className="h-7 w-7" strokeWidth={3} />
        </div>
        <h2 className="mt-4 text-2xl font-black">Mission Created</h2>
        <p className="mt-2 text-sm text-gray-600">{missionType} Mission ถูกสร้างเรียบร้อยแล้ว</p>
      </motion.div>
    </motion.div>
  )
}
