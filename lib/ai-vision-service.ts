import OpenAI from "openai"

export type AiMonitoringState = "normal" | "warning" | "away" | "paused" | "unknown"

export type AiVisionResult = {
  state: AiMonitoringState
  confidence: number
  reason: string
  should_message: boolean
}

const fallbackResult = (reason: string): AiVisionResult => ({
  state: "unknown",
  confidence: 0,
  reason,
  should_message: false,
})

const parseResult = (content: string): AiVisionResult => {
  try {
    const parsed = JSON.parse(content) as Partial<AiVisionResult>
    const state = parsed.state
    if (state !== "normal" && state !== "warning" && state !== "away" && state !== "paused" && state !== "unknown") {
      return fallbackResult("Vision model returned an invalid monitoring state.")
    }

    return {
      state,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
      reason: typeof parsed.reason === "string" ? parsed.reason : "No reason was provided.",
      should_message: parsed.should_message === true,
    }
  } catch {
    return fallbackResult("Vision model returned an unreadable response.")
  }
}

export async function analyzeMissionSnapshot(input: {
  imageDataUrl: string
  missionName: string
  missionDescription: string
  missionCategory: string
  remainingTime: string
  recordingStatus: string
  monitoringState: AiMonitoringState
  warningCount: number
}) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("AI provider is unavailable because OPENAI_API_KEY is not configured.")

  const openai = new OpenAI({ apiKey })
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the GO mission monitoring supervisor. Judge only whether the visible activity appears consistent with the supplied mission context. Do not invent requirements. A single unclear or negative frame must be unknown or warning, never an immediate failure. Use away only when the person is clearly absent or not observable. Return JSON only with exactly: state (normal|warning|away|paused|unknown), confidence (0 to 1), reason (short), should_message (boolean). Mission name: ${input.missionName}. Mission description: ${input.missionDescription || "No description provided."}. Mission category: ${input.missionCategory}. Remaining time: ${input.remainingTime}. Recording status: ${input.recordingStatus}. Previous monitoring state: ${input.monitoringState}. Previous warning count: ${input.warningCount}.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this current mission snapshot." },
          { type: "image_url", image_url: { url: input.imageDataUrl, detail: "low" } },
        ],
      },
    ],
  })

  return parseResult(response.choices[0]?.message.content ?? "")
}
