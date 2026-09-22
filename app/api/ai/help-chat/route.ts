import OpenAI from "openai"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ChatMessage = { sender: "user" | "ai"; text: string }

// General "how do I use GO / what does X mean" assistant -- distinct from
// /api/ai/chat, which is the per-mission live coach grounded in one
// specific mission's own data. This one is grounded in a static description
// of the whole app instead, since it answers from outside any single
// mission's context (e.g. "how does GPS Check work", "what happens if I
// fail a mission").
const APP_KNOWLEDGE = `
GO is an accountability app built on Loss Aversion: you pledge money on a mission, and you only get it back automatically if you actually complete it. If you fail, the money is charged for real and goes wherever you chose ahead of time (a friend, a foundation, or "support" -- GO records the choice but does not wire money to a third party's own bank account itself).

How payment works: when you create a mission, GO places an authorization HOLD on your saved card (via Stripe) for the pledge amount -- it does not charge you yet. If you succeed, the hold is released and you are never charged. If you fail, the hold is captured (charged for real).

Mission types:
- Solo > Photo AI: you're asked to submit a photo 3 times during the mission window (near the start, the middle, and near the end). Each photo is checked by AI against what the mission says you should be doing. Missing a checkpoint's 5-minute window counts as a fail for that checkpoint.
- Solo > Timelapse Video: you record continuously during the mission. An AI Coach chat (bottom-right "Chat" button on the mission page) monitors your activity and can grant short breaks (max 10 minutes) if you ask for one in the chat.
- Solo > GPS Check: you pick a destination on a map when creating the mission, then must physically arrive within 20 meters of it before the mission's end time. Location is checked automatically in the background while the mission page is open.
- Group > Work Team: you invite friends to a shared assignment. Nobody is charged until EVERY invited friend accepts -- then everyone's pledge is held at once. Any member can submit a photo of their finished work; AI scores how well it matches the assignment (0-100%), and the team leader (the mission's creator) confirms or rejects it -- confirming releases that member's pledge, rejecting asks them to resubmit. If a member fails, their pledge can be set to split equally among the teammates who completed their part, donated to a foundation, or sent to support GO.
- Group > GPS Check: same idea as Solo GPS Check, but for an invited group -- everyone's pledge is held together once all invites are accepted, and the required radius is 20 meters.

Friends: found via the "Friend ID" (a short code shown on your Profile page) instead of email/username, for privacy. Send a request by entering someone's Friend ID; they must accept before you can invite each other to group missions.

Notifications cover: a reminder 5 minutes before a mission starts, mission invitations (with accept/decline buttons), friend requests, payment holds/releases/charges, and group mission updates.

Account settings (Profile > Settings): change display name, change password, manage your saved card, sign out.

Answer only from the facts above and the ongoing conversation. If asked something this description doesn't cover, say you're not sure and suggest checking the relevant page in the app rather than guessing.
`.trim()

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: "AI is temporarily unavailable. Please try again." }, { status: 503 })

    const body = await request.json() as { message?: string; history?: ChatMessage[] }
    if (!body.message?.trim()) return NextResponse.json({ error: "Message is required." }, { status: 400 })

    const openai = new OpenAI({ apiKey })
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are the GO Help Assistant. Answer in the user's language, usually Thai. Explain how to use the GO app and what its features mean, using only the reference below -- never invent a feature, screen, or rule that isn't described here.\n\n${APP_KNOWLEDGE}`,
        },
        ...(body.history ?? []).slice(-20).map((item) => ({ role: item.sender === "user" ? "user" as const : "assistant" as const, content: item.text })),
        { role: "user", content: body.message.trim() },
      ],
    })

    return NextResponse.json({ text: response.choices[0]?.message.content?.trim() || "ขอโทษค่ะ ตอบคำถามนี้ไม่ได้จากข้อมูลที่มี" })
  } catch (error) {
    console.error("[AI] Help chat request failed", error)
    return NextResponse.json({ error: "AI is temporarily unavailable. Please try again." }, { status: 503 })
  }
}
