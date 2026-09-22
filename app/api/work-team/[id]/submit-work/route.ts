import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import { NextResponse } from "next/server"

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AI_MODEL = "gpt-4o-mini"

const getClient = async (request: Request) => {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!accessToken || !url || !key) return null
  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${accessToken}` } } })
  const { data: { user }, error } = await client.auth.getUser(accessToken)
  if (error || !user) return null
  return { client, user }
}

const parseMatchResult = (raw: string): { percent: number; reason: string } => {
  const cleaned = raw.trim().replace(/^```json\s*|```\s*$/gi, "").trim()
  const text = cleaned.includes("{") ? cleaned.slice(cleaned.indexOf("{")) : cleaned
  try {
    const parsed = JSON.parse(text) as { percent?: number; reason?: string }
    const percent = Math.round(Math.min(100, Math.max(0, Number(parsed.percent ?? 0))))
    return { percent, reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "ไม่มีคำอธิบายเพิ่มเติม" }
  } catch {
    return { percent: 0, reason: "AI ไม่สามารถประมวลผลรูปภาพนี้ได้" }
  }
}

// Work Team's spec step: a member submits photo evidence of the assigned
// work, AI scores how well it matches the assignment (mission.name/
// description/category, set by the mission creator), and that score is what
// the rest of the group is shown to decide whether to confirm it (see
// confirm-work/route.ts) -- distinct from Photo AI's own checkpoint
// verification, which judges a solo mission against itself, not group work
// against an assignment.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getClient(request)
  if (!auth) return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
  const { id: missionId } = await context.params

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: "ระบบ AI ไม่พร้อมใช้งานชั่วคราว" }, { status: 503 })

  const { data: mission, error: missionError } = await auth.client
    .from("missions")
    .select("id, name, description, category, mission_type, status")
    .eq("id", missionId)
    .maybeSingle()
  if (missionError) return NextResponse.json({ error: missionError.message }, { status: 400 })
  if (!mission || mission.mission_type !== "work_team") {
    return NextResponse.json({ error: "Mission not found." }, { status: 404 })
  }

  const { data: membership, error: membershipError } = await auth.client
    .from("mission_members")
    .select("user_id, status, assigned_task")
    .eq("mission_id", missionId)
    .eq("user_id", auth.user.id)
    .maybeSingle()
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 400 })
  if (!membership || !["accepted", "in_progress"].includes(membership.status)) {
    return NextResponse.json({ error: "You are not an active member of this mission." }, { status: 403 })
  }

  const formData = await request.formData()
  const imageFile = formData.get("image")
  if (!(imageFile instanceof File)) {
    return NextResponse.json({ error: "A photo is required." }, { status: 400 })
  }

  const imageBuffer = Buffer.from(await imageFile.arrayBuffer())
  const imageBase64 = imageBuffer.toString("base64")
  const imageData = `data:${imageFile.type || "image/jpeg"};base64,${imageBase64}`

  let percent = 0
  let reason = ""
  try {
    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are the GO Work Team submission grader. Compare the submitted photo against the assignment described below and estimate how well it demonstrates that the work was actually done. Be strict: a photo unrelated to the assignment should score low. Return JSON only with exactly these keys: percent (integer 0-100), reason (short string explaining the score).",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Assignment name: ${mission.name}\nAssignment/subject: ${mission.category}\nDescription: ${mission.description || "No additional description."}${membership.assigned_task ? `\nThis specific team member's assigned task: ${membership.assigned_task}` : ""}\n\nEvaluate this submitted photo against ${membership.assigned_task ? "this member's own assigned task above" : "the assignment above"}.` },
            { type: "image_url", image_url: { url: imageData, detail: "low" } },
          ],
        },
      ],
    })
    const result = parseMatchResult(completion.choices[0]?.message.content ?? "")
    percent = result.percent
    reason = result.reason
  } catch (aiError) {
    console.error("[work-team] Submission grading failed", aiError)
    return NextResponse.json({ error: "ระบบ AI ไม่พร้อมใช้งานชั่วคราว" }, { status: 503 })
  }

  const { error: eventError } = await auth.client.rpc("record_mission_event", {
    target_mission_id: missionId,
    target_event_type: "work_submitted",
    target_payload: { photo: imageData, percent, reason, submitted_at: new Date().toISOString() },
  })
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 400 })

  const { data: otherMembers } = await auth.client
    .from("mission_members")
    .select("user_id")
    .eq("mission_id", missionId)
    .neq("user_id", auth.user.id)
  const { data: submitterProfile } = await auth.client.from("profiles").select("name").eq("user_id", auth.user.id).maybeSingle()
  const submitterName = submitterProfile?.name ?? "เพื่อนในทีม"

  if (otherMembers?.length) {
    const admin = getSupabaseAdmin()
    await admin.from("notifications").insert(
      otherMembers.map((member) => ({
        user_id: member.user_id,
        mission_id: missionId,
        event_type: "work_submitted",
        title: "มีงานรอการยืนยัน",
        description: `${submitterName} ส่งงานแล้ว ตรงกับงานที่มอบหมาย ${percent}% กรุณายืนยัน`,
        payload: { target_member_id: auth.user.id, percent, mission_name: mission.name },
        action: "confirm_work",
      })),
    )
  }

  return NextResponse.json({ ok: true, percent, reason })
}
