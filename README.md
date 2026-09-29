# Discover Spain

Step-by-step life-admin guide for the Costa del Sol: NIE, padrón, healthcare, mortgages, taxis and trusted tradespeople.

Built with Next.js (React + TypeScript) and Tailwind CSS.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Pages reload as you save.

## Where to edit things

| What                          | File                          |
| ----------------------------- | ----------------------------- |
| Colours / theme               | `src/app/globals.css` (`:root` variables) |
| Walkthrough guides & steps    | `src/data/guides.ts`          |
| Taxi / transport comparison   | `src/data/transport.ts`       |
| Mortgage fees, search sites   | `src/data/mortgages.ts`       |
| Healthcare info               | `src/data/healthcare.ts`      |
| Tradespeople                  | `src/data/trades.ts`          |
| Nav links                     | `src/components/SiteHeader.tsx` |
| Home page / "Your path" order | `src/app/page.tsx`            |

The tradespeople are **placeholders**. Replace them with real contacts and remove `placeholder: true`.

Checklist progress is saved in the browser (`localStorage`) for now.

## Next step

Move the `src/data/*` content into Supabase (Postgres) running locally in Docker. The types in `src/lib/types.ts` already match the planned tables.
