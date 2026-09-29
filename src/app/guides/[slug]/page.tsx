import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Euro, FileCheck, Lightbulb } from "lucide-react";
import { getGuide, guides } from "@/data/guides";
import { StepChecklist } from "@/components/StepChecklist";
import { LinkList } from "@/components/LinkList";

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: getGuide(slug)?.title };
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  return (
    <article>
      <Link href="/guides" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> All guides
      </Link>

      <header className="mt-6 max-w-3xl">
        <span className="chip">{guide.category}</span>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{guide.title}</h1>
        <p className="mt-4 text-lg text-muted">{guide.summary}</p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5">
            <Clock size={14} /> {guide.timeEstimate}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5">
            <Euro size={14} /> {guide.cost}
          </span>
        </div>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section>
          <h2 className="mb-4 text-2xl font-semibold">Steps</h2>
          <StepChecklist slug={guide.slug} steps={guide.steps} />
        </section>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="card">
            <h2 className="flex items-center gap-2 font-semibold">
              <FileCheck size={18} className="text-accent" /> Documents to bring
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {guide.documents.map((d) => (
                <li key={d} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> {d}
                </li>
              ))}
            </ul>
          </div>

          {guide.tips && (
            <div className="rounded-2xl bg-sea-soft p-6">
              <h2 className="flex items-center gap-2 font-semibold text-sea">
                <Lightbulb size={18} /> Local tips
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {guide.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold">Official links</h2>
            <div className="mt-3 text-sm">
              <LinkList links={guide.links} />
            </div>
          </div>

          <p className="text-xs text-muted">Last reviewed {new Date(guide.updated).toLocaleDateString("en-GB", { dateStyle: "long" })}</p>
        </aside>
      </div>
    </article>
  );
}
