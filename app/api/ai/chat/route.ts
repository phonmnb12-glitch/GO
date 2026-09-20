import OpenAI from "openai"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ChatMessage = {
  sender: "user" | "ai"
  text: string
}

type MissionContext = {
  id?: string
  missionName?: string
  missionType?: string
  verificationType?: string
  category?: string
  startTime?: string
  endTime?: string
  durationMinutes?: number
  status?: string
  remainingTime?: string
  pledgeAmount?: number
  breakStatus?: string
  breakTimeRemaining?: string
  monitoringState?: string
  warningCount?: number
  missionDescription?: string
  gpsDistance?: number
  gpsWithinRadius?: boolean
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    console.debug("[AI] Server environment check", {
      runtime: "nodejs",
      openaiKeyPresent: Boolean(apiKey),
      openaiKeyLength: apiKey?.length ?? 0,
    })
    if (!apiKey) {
      console.error("[AI] OPENAI_API_KEY is not available in the server runtime")
      return NextResponse.json({ error: "AI is temporarily unavailable. Please try again." }, { status: 503 })
    }
    const openai = new OpenAI({ apiKey })

    const body = await request.json() as { message?: string; history?: ChatMessage[]; mission?: MissionContext }
    if (!body.message?.trim()) return NextResponse.json({ error: "Message is required." }, { status: 400 })

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are GO AI Coach and real-time mission supervisor. Answer in the user's language, usually Thai. Use only the supplied mission context and conversation. Never invent mission facts, times, status, GPS coordinates, or progress. If data is missing, say it is unavailable. Explain statuses accurately: Upcoming has not started, In Progress is active, On Break is paused, Completed is finished, Failed must use the supplied reason if available. Keep answers concise and supportive. When the user asks for a break, respect the maximum of 10 minutes and the remaining break allowance. Do not approve a break longer than 10 minutes.

Current mission context (source of truth from the GO application):
${JSON.stringify(body.mission ?? {}, null, 2)}`,
        },
        ...(body.history ?? []).slice(-20).map((item) => ({ role: item.sender === "user" ? "user" as const : "assistant" as const, content: item.text })),
        { role: "user", content: body.message.trim() },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "start_break",
            description: "Request the GO app to start a mission break. Use only when the user explicitly requests a break.",
            parameters: {
              type: "object",
              properties: { minutes: { type: "number", minimum: 1, maximum: 10 } },
              required: ["minutes"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "resume_mission",
            description: "Request the GO app to resume a mission after a break. Use only when the user explicitly asks to resume.",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        },
        {
          type: "function",
          function: {
            name: "get_mission_status",
            description: "Read the supplied current mission status before answering status questions.",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        },
        {
          type: "function",
          function: {
            name: "get_remaining_time",
            description: "Read the supplied remaining mission time before answering time questions.",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        },
      ],
      tool_choice: "auto",
    })

    const choice = response.choices[0]
    const toolCall = choice?.message.tool_calls?.[0]
    if (toolCall?.type === "function" && (toolCall.function.name === "start_break" || toolCall.function.name === "resume_mission")) {
      const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) as { minutes?: number } : {}
      const action = toolCall.function.name === "start_break"
        ? { type: "start_break", minutes: Math.max(1, Math.min(10, Math.round(args.minutes ?? 10))) }
        : { type: "resume_mission" }
      const text = action.type === "start_break"
        ? `ได้เลย ฉันจะพักภารกิจให้ ${action.minutes} นาที`
        : "กลับมาทำภารกิจต่อได้เลย"
      return NextResponse.json({ text, action })
    }

    return NextResponse.json({ text: choice?.message.content?.trim() || "ฉันยังตอบคำถามนี้ไม่ได้จากข้อมูลภารกิจปัจจุบัน" })
  } catch (error) {
    const openaiError = error as { name?: string; message?: string; status?: number; code?: string; type?: string; request_id?: string }
    console.error("[AI] OpenAI request failed", {
      name: openaiError.name,
      message: openaiError.message,
      status: openaiError.status,
      code: openaiError.code,
      type: openaiError.type,
      requestId: openaiError.request_id,
    })
    return NextResponse.json({ error: "AI is temporarily unavailable. Please try again." }, { status: 503 })
  }
}
