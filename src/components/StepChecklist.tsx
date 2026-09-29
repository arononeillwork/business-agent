"use client";

import { Check, ExternalLink } from "lucide-react";
import type { Step } from "@/lib/types";
import { toggleStep, useProgress } from "@/lib/progress";

export function StepChecklist({ slug, steps }: { slug: string; steps: Step[] }) {
  const done = new Set(useProgress()[slug] ?? []);
  const pct = Math.round((done.size / steps.length) * 100);

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-medium text-muted">
          {done.size}/{steps.length} done
        </span>
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => {
          const isDone = done.has(i);
          return (
            <li key={step.title} className={`card flex gap-4 transition-opacity ${isDone ? "opacity-60" : ""}`}>
              <button
                onClick={() => toggleStep(slug, i)}
                aria-label={isDone ? "Mark as not done" : "Mark as done"}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition-colors ${
                  isDone ? "border-accent bg-accent text-white" : "border-line text-muted hover:border-accent"
                }`}
              >
                {isDone ? <Check size={16} /> : i + 1}
              </button>
              <div>
                <h3 className={`font-semibold ${isDone ? "line-through" : ""}`}>{step.title}</h3>
                <p className="mt-1 text-muted">{step.detail}</p>
                {step.link && (
                  <a href={step.link.url} target="_blank" rel="noreferrer" className="link mt-2 inline-flex items-center gap-1 text-sm">
                    {step.link.label} <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
