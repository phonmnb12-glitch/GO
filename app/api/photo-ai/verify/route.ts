import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import { NextResponse } from "next/server"
import { captureMissionPledgeHold, releaseMissionPledgeHold } from "@/lib/mission-payment"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AI_MODEL = "gpt-4o-mini"

const getAuthenticatedClient = async (request: Request) => {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!accessToken || !supabaseUrl || !supabaseKey) {
    return null
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })

  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) {
    return null
  }

  return { client, user }
}

const normalizeCheckpointKey = (value: unknown) => {
  if (value === "first" || value === "mid" || value === "final") return value
  return null
}

const parseStructuredMessage = (raw: string): { passed: boolean; confidence: number; reason: string; issues: string[] } => {
  const cleaned = raw.trim().replace(/^```json\s*|```\s*$/gi, "").trim()
  const text = cleaned.includes("{") ? cleaned.slice(cleaned.indexOf("{")) : cleaned
  try {
    const parsed = JSON.parse(text)
    const passed = Boolean(parsed.passed)
    const confidence = Number(parsed.confidence)
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((issue: unknown): issue is string => typeof issue === "string")
      : []
    return {
      passed,
      confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : passed ? 0.9 : 0.1,
      reason: typeof parsed.reason === "string" && parsed.reason.trim().length > 0 ? parsed.reason.trim() : passed ? "The image satisfies the mission requirements." : "The image does not satisfy the mission requirements.",
      issues,
    }
  } catch {
    return {
      passed: false,
      confidence: 0.1,
      reason: "AI returned an unstructured response, so the image could not be verified.",
      issues: ["AI returned an unstructured response"],
    }
  }
}

const buildMissionInstruction = (mission: Record<string, unknown>, checkpoint: string) => {
  const missionName = typeof mission.name === "string" ? mission.name : typeof mission.missionName === "string" ? mission.missionName : "Mission"
  const description = typeof mission.description === "string" ? mission.description : ""
  const category = typeof mission.category === "string" ? mission.category : "General"
  const instructions = typeof mission.instructions === "string" ? mission.instructions : ""
  const verificationType = typeof mission.verification_type === "string" ? mission.verification_type : typeof mission.verificationType === "string" ? mission.verificationType : "Photo AI"
  const checks = typeof mission.checks === "object" && mission.checks ? mission.checks : {}

  const checkSummary = checkpoint === "first"
    ? "This is the first checkpoint."
    : checkpoint === "mid"
      ? "This is the midpoint checkpoint."
      : "This is the final checkpoint."

  const details = [
    `Mission name: ${missionName}`,
    `Description: ${description || "No description provided."}`,
    `Instructions: ${instructions || "No additional instructions provided."}`,
    `Category: ${category}`,
    `Verification type: ${verificationType}`,
    `Checkpoint: ${checkpoint}`,
    `Checkpoint guidance: ${checkSummary}`,
    `Current check states: ${JSON.stringify(checks)}`,
    "Assess the image against the actual mission requirement as written above. Do not use generic photo rules unless the mission specifically requires them.",
    "Return valid JSON with keys: passed, confidence, reason, issues.",
  ]

  return details.join("\n")
}

export async function POST(request: Request) {
  try {
    const context = await getAuthenticatedClient(request)
    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
    }

    const formData = await request.formData()
    const missionId = String(formData.get("missionId") ?? "")
    const checkpoint = normalizeCheckpointKey(formData.get("checkpoint"))
    const imageFile = formData.get("image")
    const submittedAtValue = formData.get("submittedAt")
    const submittedAt = submittedAtValue ? new Date(String(submittedAtValue)) : new Date()

    if (!missionId || !checkpoint || !(imageFile instanceof File)) {
      return NextResponse.json({ error: "Mission ID, checkpoint, and photo are required." }, { status: 400 })
    }

    if (Number.isNaN(submittedAt.getTime())) {
      return NextResponse.json({ error: "Submission timestamp is invalid." }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ระบบ AI ไม่พร้อมใช้งานชั่วคราว" }, { status: 503 })
    }

    const { client: supabase, user } = context
    const { data: mission, error: missionError } = await supabase
      .from("missions")
      .select("*")
      .eq("id", missionId)
      .maybeSingle()

    if (missionError) {
      return NextResponse.json({ error: missionError.message }, { status: 400 })
    }

    if (!mission) {
      return NextResponse.json({ error: "Mission not found or access denied." }, { status: 404 })
    }

    const { data: membership, error: membershipError } = await supabase
      .from("mission_members")
      .select("user_id")
      .eq("mission_id", missionId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 })
    }

    if (!membership && mission.creator_id !== user.id) {
      return NextResponse.json({ error: "You do not have access to this mission." }, { status: 403 })
    }

    const missionStartTime = new Date(mission.start_time ?? mission.startTime ?? Date.now()).getTime()
    const missionEndTime = new Date(mission.end_time ?? mission.endTime ?? Date.now()).getTime()
    const durationMs = Math.max(missionEndTime - missionStartTime, 0)
    const checkpointStarts = {
      first: missionStartTime,
      mid: missionStartTime + durationMs / 2,
      final: Math.max(missionStartTime, missionEndTime - 5 * 60 * 1000),
    } as const
    const checkpointDeadline = checkpointStarts[checkpoint] + 5 * 60 * 1000

    if (submittedAt.getTime() > checkpointDeadline) {
      const nextChecks = {
        ...(typeof mission.checks === "object" && mission.checks ? mission.checks : { first: "Waiting", mid: "Waiting", final: "Waiting" }),
        [checkpoint]: "Missed",
      }
      const hasAnyMissed = Object.values(nextChecks).some((value) => value === "Missed")
      const nextStatus = hasAnyMissed ? "Failed" : mission.status === "Completed" ? "Completed" : mission.status
      const dbStatus = nextStatus === "Completed" ? "completed" : nextStatus === "Failed" ? "failed" : mission.status

      await supabase
        .from("missions")
        .update({
          checks: nextChecks,
          status: dbStatus,
        })
        .eq("id", missionId)

      if (dbStatus === "failed") {
        try {
          await captureMissionPledgeHold(supabase, missionId, mission.creator_id)
        } catch (pledgeError) {
          console.error("[photo-ai] Pledge capture failed (checkpoint expired)", pledgeError)
        }
      }

      return NextResponse.json({
        error: "หมดเวลาส่งภายใน 5 นาที ภารกิจไม่สำเร็จ",
        expired: true,
      }, { status: 400 })
    }

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer())
    const imageBase64 = imageBuffer.toString("base64")
    const imageData = `data:${imageFile.type || "image/jpeg"};base64,${imageBase64}`

    let rawText = ""
    try {
      const openai = new OpenAI({ apiKey })
      const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are the GO mission photo verifier. Evaluate the submitted photo strictly against the mission context provided. The mission context is the source of truth — do not invent requirements and do not apply generic photo rules the mission doesn't ask for. Return JSON only with exactly these keys: passed (boolean), confidence (number from 0 to 1), reason (string), issues (array of strings).",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Evaluate this real captured photo against the mission requirements below.\n${buildMissionInstruction(mission, checkpoint)}` },
              { type: "image_url", image_url: { url: imageData, detail: "low" } },
            ],
          },
        ],
      })
      rawText = completion.choices[0]?.message.content ?? ""
    } catch (providerError) {
      console.error("[photo-ai] OpenAI request failed", providerError)
      return NextResponse.json({ error: "ระบบ AI ไม่พร้อมใช้งานชั่วคราว" }, { status: 503 })
    }

    const structuredResult = parseStructuredMessage(rawText || JSON.stringify({ passed: false, confidence: 0.1, reason: "No AI response available.", issues: ["No AI response available"] }))

    const currentChecks = typeof mission.checks === "object" && mission.checks ? mission.checks : { first: "Waiting", mid: "Waiting", final: "Waiting" }
    const currentPhotos = typeof mission.photos === "object" && mission.photos ? mission.photos : {}
    const nextChecks = {
      ...currentChecks,
      [checkpoint]: structuredResult.passed ? "Completed" : "Missed",
    }
    const nextPhotos = {
      ...currentPhotos,
      [checkpoint]: imageData,
    }

    const hasAllCompleted = Object.values(nextChecks).every((value) => value === "Completed")
    const hasAnyMissed = Object.values(nextChecks).some((value) => value === "Missed")
    const nextStatus = hasAllCompleted ? "Completed" : hasAnyMissed ? "Failed" : mission.status === "Completed" ? "Completed" : mission.status
    // missions.status only accepts the lowercase values the DB check
    // constraint defines (completed/failed/in_progress/...) -- nextStatus
    // above stays PascalCase because that's what the API response/frontend
    // already expect, so it's translated only for the actual DB write.
    const dbStatus = nextStatus === "Completed" ? "completed" : nextStatus === "Failed" ? "failed" : mission.status

    const { error: updateError } = await supabase
      .from("missions")
      .update({
        checks: nextChecks,
        photos: nextPhotos,
        status: dbStatus,
      })
      .eq("id", missionId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    // Resolve the pledge hold exactly once the mission's final outcome is
    // known -- same release-on-success/capture-on-failure rule as GPS Check,
    // both no-ops if already resolved.
    if (dbStatus === "completed") {
      try {
        await releaseMissionPledgeHold(supabase, missionId, mission.creator_id)
      } catch (pledgeError) {
        console.error("[photo-ai] Pledge release failed", pledgeError)
      }
    } else if (dbStatus === "failed") {
      try {
        await captureMissionPledgeHold(supabase, missionId, mission.creator_id)
      } catch (pledgeError) {
        console.error("[photo-ai] Pledge capture failed", pledgeError)
      }
    }

    const { error: eventError } = await supabase.rpc("record_mission_event", {
      target_mission_id: missionId,
      target_event_type: "photo_ai_verified",
      target_payload: {
        checkpoint,
        passed: structuredResult.passed,
        confidence: structuredResult.confidence,
        reason: structuredResult.reason,
        issues: structuredResult.issues,
        photo: imageData,
      },
    })

    if (eventError) {
      console.warn("[photo-ai] Mission event persistence failed", eventError.message)
    }

    const { error: notificationError } = await supabase
      .from("notifications")
      .insert({
        user_id: user.id,
        mission_id: missionId,
        event_type: structuredResult.passed ? "checkpoint_passed" : "checkpoint_failed",
        title: structuredResult.passed ? "Checkpoint Passed" : "Checkpoint Failed",
        description: structuredResult.passed
          ? `Checkpoint ${checkpoint} passed for ${mission.name ?? mission.mission_name ?? "this mission"}.`
          : `Checkpoint ${checkpoint} failed for ${mission.name ?? mission.mission_name ?? "this mission"}.`,
        payload: {
          checkpoint,
          passed: structuredResult.passed,
          reason: structuredResult.reason,
          confidence: structuredResult.confidence,
        },
        action: "details",
      })

    if (notificationError) {
      console.warn("[photo-ai] Notification persistence failed", notificationError.message)
    }

    return NextResponse.json({
      ok: true,
      result: {
        checkpoint,
        passed: structuredResult.passed,
        confidence: structuredResult.confidence,
        reason: structuredResult.reason,
        issues: structuredResult.issues,
        photo: imageData,
        verified_at: new Date().toISOString(),
      },
      mission: {
        id: missionId,
        checks: nextChecks,
        photos: nextPhotos,
        status: nextStatus,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI verification failed."
    console.error("[photo-ai] verification failed", message)
    return NextResponse.json({ error: "ระบบ AI ไม่พร้อมใช้งานชั่วคราว" }, { status: 503 })
  }
}
