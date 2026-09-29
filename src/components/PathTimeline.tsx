"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { Guide } from "@/lib/types";
import { useProgress } from "@/lib/progress";

export function PathTimeline({ guides }: { guides: Pick<Guide, "slug" | "title" | "summary" | "steps">[] }) {
  const progress = useProgress();

  return (
    <ol className="relative space-y-4 border-l-2 border-dashed border-line pl-8">
      {guides.map((g, i) => {
        const done = progress[g.slug]?.length ?? 0;
        const complete = done === g.steps.length;
        return (
          <li key={g.slug} className="relative">
            <span
              className={`absolute -left-[45px] grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${
                complete ? "bg-accent text-white" : "border-2 border-line bg-bg text-muted"
              }`}
            >
              {complete ? <CheckCircle2 size={18} /> : i + 1}
            </span>
            <Link href={`/guides/${g.slug}`} className="card group flex items-center justify-between gap-4 transition hover:-translate-y-0.5 hover:border-accent">
              <div>
                <h3 className="font-semibold">{g.title}</h3>
                <p className="mt-1 text-sm text-muted">{g.summary}</p>
                {done > 0 && (
                  <p className="mt-2 text-xs font-medium text-accent">
                    {done}/{g.steps.length} steps done
                  </p>
                )}
              </div>
              <ArrowRight className="shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-accent" />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
