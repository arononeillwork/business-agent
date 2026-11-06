# The business's website and the app

A business's website shouldn't keep its own copy of what the app already knows. When it does, the
two drift: a price changed on the Menu page is still the old one on the website. So the website
reads from the app, the way Google Maps, the screens and the printed menus already do, and the
business changes things in one place.

The first thing it reads is **the menu**. Easy Beans' website (`easybeanscoffee.com`, its own
repository) is the first to use it; any business's website can, the same way.

## The menu

```
GET https://businesssagent.com/api/site/<business>/menu
```

- `<business>` is the business's number (Easy Beans is 1). It's on Website & SEO, in the address shown
  under **The menu on your website**.
- No sign-in. It answers only once an admin turns on **Share the menu with the website** on Website &
  SEO (`settings.website_menu`). Off, or a number that's no business, it's `404` with the same answer,
  so the numbers can't be used to list who's here.
- Any site may read it from a browser (CORS is open). It may be kept for a minute
  (`Cache-Control: public, max-age=60`); a change on the Menu page is on a website within a few minutes (Easy Beans'
  keeps it five).
- `503` when the database can't be read just then: keep showing the last menu you had.

What comes back (`SiteMenuFeed` in `shared/websiteFeed.ts`):

```jsonc
{
  "version": 1,
  "business": { "id": 1, "name": "Easy Beans Coffee", "currency": "EUR" },
  "source": "square",                 // the Menu page's source: "custom" (kept in the app) or "square"
  "synced_at": "2026-11-05T08:16:58Z", // last read from Square (null for custom)
  "generated_at": "2026-11-05T09:00:00Z",
  "sections": [                       // the menu's order, as arranged on the Menu page
    {
      "name": "Classics",
      "extras": false,                // true for the extras read from Square's modifier lists (Milk, Syrup…)
      "items": [
        {
          "id": "6f1c…",              // the app's id: stays while the item exists
          "name": "Flat White",
          "description": null,
          "photo_url": "https://…",
          "featured": false,
          "price": 3.8,               // tax included; null: not priced yet
          "price_label": "Hot",       // what `price` is for when it's sold more than one way
          "variants": [{ "name": "Iced", "price": 4.8 }],  // whole prices, not the difference
          "square_id": "ABCD…",       // its Square item, when the menu is read from Square
          "allergens": { "contains": ["milk"], "may_contain": [], "vegan": false, "vegetarian": true }
        }
      ]
    }
  ]
}
```

- Only what's on the menu: an item taken **off the menu** on the Menu page isn't in it, so the website
  stops listing it.
- `allergens` is `null` until everything in the item is known on Menu costing and the Allergens page
  (never a guess). The names are the Allergens page's (`gluten`, `milk`, `nuts`…).
- The contract only grows: fields are added, never renamed or removed. If one ever has to change,
  `version` does.

## Taking orders on the website

A website that takes orders through Square (Easy Beans' does) joins each item to Square by
`square_id` and still lets Square charge: the app decides what's listed, Square takes the money.
With the menu read from Square, the app's price is Square's (read every hour, and straight away
with **Read from Square now** on the Menu page). With the menu kept in the app (custom), the app
doesn't change Square's prices, so the till and an online order would charge Square's. A website
should show the price it will actually charge: Easy Beans' shows Square's when the two differ (for
the hour until the app reads Square again) and notes the difference in its logs.

## Newsletter sign-ups

Someone who signs up for the newsletter on the website goes onto Customers in the app straight away: a
lead from the website (or the customer they already were) with a yes to marketing, and the topics they
ticked as tags, so the business's campaigns can go to just the people interested in each one. Each
business turns it on and sets it up on Website & SEO → **Newsletter sign-ups**: its own topics (each with
a key that stays put, and its words in Spanish and English), and whether the form asks for a name or a
phone. Off, or a number that's no business, every address below is `404` with the same answer.

A website takes sign-ups in one of three ways:

1. **The app's form, as a link** (`GET https://businesssagent.com/api/site/<business>/newsletter`), for an
   Instagram bio or a QR code. `?lang=es|en` picks its language; without it, the visitor's browser does.
   `?place=…` says where the link was (it's kept with each sign-up).
2. **The app's form inside the website**: the snippet on Website & SEO, pasted into any website builder's
   HTML block. It's that page in a frame that fits itself to the form (the page tells the website its
   height with `postMessage({ type: "business-agent:newsletter-height", height })`).
3. **The website's own form**, sending each sign-up here:

```
POST https://businesssagent.com/api/site/<business>/signup
Content-Type: application/json

{
  "email": "lucia@example.com",          // the only one needed
  "interests": ["english", "offers"],    // topics' keys, or their words ("Aprender inglés"); others are said back, not kept
  "phone": "+34 600 111 222",            // optional; a phone that isn't one is refused
  "name": "Lucía García",                // optional (or "first_name" and "last_name")
  "lang": "es",                          // optional: the language they signed up in
  "place": "first_visit_popup"           // optional: where on the website ("source" works too)
}
```

- `200 { "ok": true, "interests": ["english", "offers"], "ignored": [] }`: they're on Customers.
  Signing up again adds the new topics and is a new yes after an unsubscribe.
- `400 { "error", "problem": "invalidEmail" | "invalidPhone" }`, `429 { "problem": "tooMany" }`
  (five an hour from one address without the key), `503` when it can't be saved just then: try again.
- Any site may call it from a browser (CORS is open). A field called `website` must stay empty: it's
  the form's trap for robots, which are told it worked while nothing is saved.

**From the website's server**, with the business's **website key** (made on Website & SEO, shown once;
only its hash is kept) as `Authorization: Bearer nl_…`. Never put it in the website's pages.

- Sign-ups skip the limit on one address (they all come from the server's), and may carry
  `"signed_up_at"` (a date or a time), for people who signed up before: they're kept as from a list.
- `POST /api/site/<business>/unsubscribe` with `{ "email": "…" }` takes back someone's yes when they
  unsubscribe on the website, so the business's campaigns leave them out:
  `200 { "ok": true, "found": true }` (`false`: they weren't on Customers).
- A wrong key is `401`.

Easy Beans' topics here have its website's keys (`coffee`, `spanish`, `english`, `menu`, `events`,
`offers`), so its `/api/signup` can send each sign-up on from its server with the key, before it copies
the person to Square (so they're on Customers as from the website, not from Square), and its unsubscribe
link can send unsubscribes (a change in the website's own repository). A list from before also comes in
on Website & SEO from a CSV (another newsletter service's export, or the website's own: only people
still subscribed).

## Next

The same way, as they're needed: opening hours, the business's details, today's offers (Last day
offers) and the menu's allergens in full.
