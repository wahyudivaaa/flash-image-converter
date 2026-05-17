import Converter from "@/components/Converter";
import { Footer } from "@/components/Footer";
import { Hero, TopBar } from "@/components/Hero";

export default function Home() {
  return (
    <main className="min-h-screen">
      <TopBar />
      <Hero />

      {/* App */}
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <Converter />
      </section>

      <Footer />
    </main>
  );
}
