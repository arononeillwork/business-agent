import { ExternalLink } from "lucide-react";
import type { Link } from "@/lib/types";

export function LinkList({ links }: { links: Link[] }) {
  return (
    <ul className="space-y-2">
      {links.map((l) => (
        <li key={l.url}>
          <a href={l.url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
            {l.label} <ExternalLink size={14} />
          </a>
          {l.note && <span className="text-sm text-muted"> · {l.note}</span>}
        </li>
      ))}
    </ul>
  );
}

export function PageHeader({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <div className="mb-10 max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-4 text-lg text-muted">{intro}</p>
    </div>
  );
}
