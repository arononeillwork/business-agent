# Business Agent: data deletion page

`src/pages/DataDeletionPage.tsx` is the data deletion instructions page for
https://businesssagent.com/data-deletion, the URL to give Meta under
**App settings → Basic → User data deletion → Data deletion instructions URL**.

It uses the same layout helpers as the existing Terms and Privacy pages
(`LegalPage`, `H`, `P`, `Bullets`, `Mail`, `LEGAL` from `./legal`).

## Adding it to the site

1. Copy `src/pages/DataDeletionPage.tsx` next to `TermsPage.tsx` in the app's source.
2. Load it lazily, the same way as `TermsPage`, and serve it at `/data-deletion` where the app shell
   checks `pathname === '/terms'`:
   ```tsx
   if (pathname === '/data-deletion') return <DataDeletionPage />
   ```
   Allow this path for signed-out visitors, as `/terms` and `/privacy` are, because Meta's reviewer is not signed in.
3. Optional: add a `Data deletion` link to the footer in `legal.tsx` and to the privacy policy's "Your rights" section.
4. Deploy, then check that https://businesssagent.com/data-deletion opens in a private window.
