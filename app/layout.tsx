import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { LenisProvider } from "@/components/lenis-provider"
import ClickSpark from "@/components/click-spark"
import { AuthProvider } from "@/components/auth-provider"
import "./globals.css"

const _inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
})

const _jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "go. | Bet On Yourself. Just Go.",
  description: "แก้นิสัยผัดวันประกันพรุ่งด้วยพลัง Loss Aversion วางเงินมัดจำ ส่งหลักฐานจริงให้ OpenAI ตรวจสอบ ทำสำเร็จรับเงินคืนทันที 100%",
  keywords: ["go", "challenge", "loss aversion", "openai", "accountability"],
    generator: 'v0.app'
}

export const viewport: Viewport = {
  themeColor: "#AFFF00",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${_inter.variable} ${_jetbrainsMono.variable} font-sans antialiased`}>
        <ClickSpark
          sparkColor="#AFFF00"
          sparkSize={12}
          sparkRadius={20}
          sparkCount={8}
          duration={400}
          easing="ease-out"
        >
          <LenisProvider>
            <AuthProvider>{children}</AuthProvider>
          </LenisProvider>
        </ClickSpark>
        <Analytics />
      </body>
    </html>
  )
}
