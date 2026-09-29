import Link from "next/link";
import { Car, FileText, HeartPulse, Home as HomeIcon, Wrench } from "lucide-react";
import { guides } from "@/data/guides";
import { PathTimeline } from "@/components/PathTimeline";

const sections = [
  { href: "/guides", icon: FileText, title: "Paperwork walkthroughs", text: "NIE, padrón, Social Security, digital certificate, taxes." },
  { href: "/transport", icon: Car, title: "Taxis & transport", text: "PideTaxi vs Uber, Cabify and Bolt, plus airport transfers." },
  { href: "/mortgages", icon: HomeIcon, title: "Mortgages & buying", text: "Every fee in %, a calculator, and where to search." },
  { href: "/healthcare", icon: HeartPulse, title: "Healthcare", text: "Public SAS, private insurance, and cover while abroad." },
  { href: "/trades", icon: Wrench, title: "Trusted tradespeople", text: "Electricians, plumbers, painters, cleaners and more." },
];

const path = ["nie", "padron", "bank-account", "social-security", "health-card", "digital-certificate", "driving-licence"];

export default function Home() {
  const pathGuides = path.map((slug) => guides.find((g) => g.slug === slug)!);

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-[#e59a5b] px-6 py-16 text-white sm:px-12 sm:py-20">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-white/10" />
        <p className="relative text-sm font-semibold uppercase tracking-wider text-white/80">Marbella · Costa del Sol</p>
        <h1 className="relative mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-6xl">Life in Spain, step by step.</h1>
        <p className="relative mt-5 max-w-xl text-lg text-white/90">
          Clear walkthroughs, official links and trusted local contacts for everything from your NIE to finding a plumber.
        </p>
        <div className="relative mt-8 flex flex-wrap gap-3">
          <Link href="/guides/nie" className="rounded-full bg-white px-6 py-3 font-semibold text-accent shadow-sm transition hover:shadow-md">
            Start with your NIE
          </Link>
          <Link href="#path" className="rounded-full border border-white/50 px-6 py-3 font-semibold text-white transition hover:bg-white/10">
            See the full path
          </Link>
        </div>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(({ href, icon: Icon, title, text }) => (
          <Link key={href} href={href} className="card group transition hover:-translate-y-0.5 hover:border-accent">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
              <Icon size={22} />
            </span>
            <h2 className="mt-4 text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-muted">{text}</p>
          </Link>
        ))}
      </section>

      <section id="path" className="mt-20 grid gap-10 lg:grid-cols-[1fr_2fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Your path</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Moving here? Do it in this order.</h2>
          <p className="mt-3 text-muted">
            Each step unlocks the next. Tick off steps inside each guide and your progress shows here. It is saved in this browser.
          </p>
        </div>
        <PathTimeline guides={pathGuides.map(({ slug, title, summary, steps }) => ({ slug, title, summary, steps }))} />
      </section>
    </>
  );
}
