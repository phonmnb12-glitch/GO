"use client"

import { DashboardNav } from "@/components/dashboard-nav"
import { useState } from "react"

type ChatMessage = { id: string; sender: "user" | "ai"; text: string }

const SUGGESTED_QUESTIONS = [
  "GO ทำงานยังไง",
  "ถ้าทำภารกิจไม่สำเร็จเงินไปไหน",
  "Work Team ต้องทำยังไงบ้าง",
  "หา Friend ID ได้ที่ไหน",
]

export default function HelpPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", sender: "ai", text: "สวัสดีค่ะ ถามอะไรก็ได้เกี่ยวกับวิธีใช้งานเว็บ GO เลยค่ะ เช่น วิธีสร้างภารกิจ, ระบบเงินมัดจำทำงานยังไง, หรือหาเพื่อนได้ที่ไหน" },
  ])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    const userMessage: ChatMessage = { id: `user-${Date.now()}`, sender: "user", text: trimmed }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput("")
    setIsSending(true)

    try {
      const response = await fetch("/api/ai/help-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: nextMessages.map(({ sender, text: messageText }) => ({ sender, text: messageText })) }),
      })
      const result = await response.json() as { text?: string; error?: string }
      setMessages((current) => [...current, { id: `ai-${Date.now()}`, sender: "ai", text: result.text ?? result.error ?? "ขอโทษค่ะ ระบบขัดข้องชั่วคราว" }])
    } catch {
      setMessages((current) => [...current, { id: `ai-error-${Date.now()}`, sender: "ai", text: "ขอโทษค่ะ ไม่สามารถเชื่อมต่อ AI ได้ในตอนนี้" }])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f3] text-[#111111]">
      <DashboardNav />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-black tracking-[-0.06em]">ช่วยเหลือ</h1>
        <p className="mt-2 text-sm text-gray-600">ถามผู้ช่วย AI เกี่ยวกับวิธีใช้งานเว็บ GO ได้ทุกเรื่อง</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => void send(question)}
              disabled={isSending}
              className="rounded-full border border-[#111111]/10 bg-white px-3 py-2 text-xs font-semibold text-[#111111] transition hover:border-[#AFFF00] disabled:opacity-50"
            >
              {question}
            </button>
          ))}
        </div>

        <div className="mt-6 flex h-[60vh] flex-col rounded-[28px] border border-[#111111]/10 bg-white shadow-[0_20px_60px_rgba(18,18,18,0.06)]">
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm ${message.sender === "user" ? "ml-auto bg-[#AFFF00] text-[#121212]" : "bg-[#f2f4f6] text-[#121212]"}`}
              >
                {message.text}
              </div>
            ))}
            {isSending && <div className="max-w-[85%] rounded-2xl bg-[#f2f4f6] px-4 py-2.5 text-sm text-gray-500">กำลังพิมพ์...</div>}
          </div>

          <div className="flex items-center gap-2 border-t border-[#111111]/10 p-4">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void send(input)
              }}
              placeholder="พิมพ์คำถามของคุณ..."
              className="flex-1 rounded-full border border-[#111111]/10 bg-[#f9f9f8] px-4 py-3 text-sm outline-none focus:border-[#AFFF00]"
            />
            <button
              type="button"
              disabled={isSending}
              onClick={() => void send(input)}
              className="rounded-full bg-[#121212] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              ส่ง
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
