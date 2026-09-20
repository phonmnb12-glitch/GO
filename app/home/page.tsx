import { Navigation } from "@/components/navigation"
import { HeroSection } from "@/components/hero-section"
import { Footer } from "@/components/footer"

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#121212]">
      <Navigation />
      <HeroSection />
      <Footer />
    </main>
  )
}
