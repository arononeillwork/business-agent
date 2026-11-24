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
  (`Cache-Control: public, max-age=60`); a change on the Menu page, or in Square when the menu comes from
  it, is on a website within a few minutes (Easy Beans' keeps it five).
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
With the menu read from Square, the app's price and Square's are kept the same both ways: a change in
Square is read within seconds (Square's catalog webhook; at the business's refresh rate if one is
missed, and straight away with **Read from Square now** on the Menu page), and a price changed in the
app is changed in Square within a minute. With the menu kept in the app (custom), the app doesn't change
Square's prices, so the till and an online order would charge Square's. A website should show the price
it will actually charge. Easy Beans' menu is read from Square, so the two are the same: its website shows the
app's price, and notes in its logs any moment the two differ (Square still charges its own).

## Newsletter sign-ups

Someone who signs up for the newsletter on the website goes onto Customers in the app straight away: a
lead from the website (or the customer they already were) with a yes to marketing, and the topics they
ticked as tags, so the business's campaigns can go to just the people interested in each one. Each
business turns it on and sets it up on Website & SEO → **Newsletter sign-ups**: its own topics (each with
a key that stays put, and its words in Spanish and English), and whether the form asks for a name or a
phone. Off, or a number that's no business, every address below is `404` with the same answer.

Each sign-up also shows on **Leads & enquiries** as a "Newsletter sign-up" from the website, with the
topics they ticked (worded as on the form) kept on it, whether they're new or already a customer; signing
up again adds any new topics to the open one. From there an admin can **Move to Customers**, which makes
the person a customer and takes the enquiry off the list (their topics stay on Customers as tags). A
list brought in makes no enquiries.

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

**From the website's server**, with no set-up: the business's number in the address is all it needs.

- Send the same `POST` as above, and add `X-Visitor-IP: <the visitor's address>` (their address, not the
  server's), so the limit of five an hour counts each visitor on their own. On top of that a business
  takes at most 200 keyless sign-ups an hour, whatever addresses are said.
- `POST /api/site/<business>/unsubscribe` with `{ "email": "…" }` takes back someone's yes when they
  unsubscribe on the website, so the business's campaigns leave them out: `200 { "ok": true }`. It never
  says whether they were on the list, and at most 200 an hour are taken without the key.

**With the business's website key** (optional; made on Website & SEO, shown once, only its hash kept; sent
as `Authorization: Bearer nl_…`, never in the website's pages), a server also:

- skips the limits on sign-ups (they all come from the server's address), and may carry
  `"signed_up_at"` (a date or a time), for people who signed up before: they're kept as from a list;
- hears whether an unsubscribed address was on the list: `200 { "ok": true, "found": true }` (`false`:
  they weren't on Customers).

A wrong key is `401`. (Website accounts below do need the key.)

Easy Beans' topics here have its website's keys (`coffee`, `spanish`, `english`, `menu`, `events`,
`offers`), so its `/api/signup` can send each sign-up on from its server, before it copies
the person to Square (so they're on Customers as from the website, not from Square), and its unsubscribe
link can send unsubscribes (a change in the website's own repository). A list from before also comes in
on Website & SEO from a CSV (another newsletter service's export, or the website's own: only people
still subscribed).

## Accounts & rewards

Someone who signs in on the business's website is a customer here, and the website's account page reads
what they have from the app rather than from Square or its own copy: their **points** (Square Loyalty, read
by the app), their **credit** (the reps ledger, the same balance their rep page shows), how a post about the
café **earns cashback**, and their **code** if they're a rep. Deleting their account on the website
**erases** them here. Each business turns it on on Website & SEO → **Accounts & rewards on your website**
(`settings.website_accounts`, off until then). `shared/siteAccount.ts` has the types; `worker/siteAccount.ts`
the routes; the `site_accounts` migration the work.

```
POST https://businesssagent.com/api/site/<business>/account/sync
POST https://businesssagent.com/api/site/<business>/account/summary
POST https://businesssagent.com/api/site/<business>/account/erase
Authorization: Bearer nl_…            // the website key, as for the newsletter
Content-Type: application/json
```

For every one of them:

- **Only the website's server.** The website key is required: no key, or a wrong one (another business's
  included), is `401`; there's no keyless way in. No CORS headers on any answer, and `OPTIONS` (or anything
  but `POST`) is `405`: a browser must never call these. Nothing is kept by a cache (`no-store`).
- **The email is only in the body**, trimmed and lowercased, at most 254 characters; never in the address.
  The app logs what happened, never who: no address in its logs or in the errors kept for HQ.
- **`"email_verified": true`** says the website checked the address itself (its own sign-in). Missing or
  false is `403`.
- Off, or a number that's no business, is `404` (the same answer either way, as for the menu).
- Amounts are plain numbers in the business's currency; dates are `YYYY-MM-DD`.
- 120 calls a minute per business (counted with its key), then `429` with `Retry-After: 60`.
- Only the named person's rows: never other customers, never their crew members' names.

| Status | When |
| ------ | ---- |
| 400 | a body that isn't one (`{ "error", "fields": [...] }`) |
| 401 | no website key, or the wrong one |
| 403 | `email_verified` isn't `true` |
| 404 | the business doesn't share accounts with a website (off, or no such business) |
| 429 | over the limit |
| 503 | the database or Square couldn't be read just then |

### Sync: on first sign-in and each profile edit

```jsonc
{ "email": "ana@example.com", "email_verified": true,
  "name": "Ana García",                 // or "first_name" and "last_name"
  "phone": "+34 600 000 000",           // without a country code, the business's country's
  "square_customer_id": "CBASEN…",      // their Square customer, when the website knows it
  "lang": "es",
  "rep_code": "NATASH15" }              // the rep's code they signed up with, if any
```

`200 { "customer_id": "…", "created": true, "is_rep": false, "ignored": [] }`

- Found as Square's own customers are (`worker/squareCustomers.ts`): by Square id, then email, then phone,
  never a customer with another email. Someone new is a customer **from the website**. What's typed in the
  app wins: only empty fields are filled (the Square id too, when it's free). Saying the same again changes
  nothing (`created: false`).
- **Marketing consent is never touched**: signing in isn't a yes. The newsletter is still `/signup`.
- `rep_code`: someone new who signed up with an active rep's code is noted as introduced by that rep, and
  the business's admins are told, to log the rep's reward once they've come in (nothing is credited by
  itself). An unknown code is ignored without saying so.
- `ignored` lists what was sent but not kept: `"phone"` (not a phone number), `"square_customer_id"` (on
  someone else already, or they're linked to another).

### Summary: the account page

`{ "email": "…", "email_verified": true }` →

```jsonc
{
  "customer": { "id": "…", "first_name": "Ana" },
  "points": {                                  // null: Square isn't the till, no programme, or not a member
    "program": { "one": "Bean", "other": "Beans", "tiers": [{ "id": "…", "name": "Free coffee", "points": 10 }] },
    "balance": 7, "lifetime": 23
  },
  "credit": {                                  // null: not a rep (no ledger)
    "balance": 1.25,                           // what's approved: the same as their rep page
    "pending": 0.4,                            // waiting for an admin
    "gift_card_linked": true,                  // spent at the till with the gift card on file
    "lines": [{ "date": "2026-07-11", "label": "Cashback for a post", "amount": 0.47, "status": "approved",
                "note": "863 views · 20 likes" }]   // the last 20, newest first; spent and paid out as negatives
  },
  "cashback": { "on": true, "per_1000_views": 0.5, "per_100_likes": 0.2, "per_follower": 0.1, "max": 15 },  // null: off
  "rep": {                                     // null unless an active rep with the business's OK
    "code": "NATASH15", "kind": "customer", "earns": "credit",
    "reach": 0, "reach_step": "Local voice", "reach_step_id": "local", "multiplier": 1,
    "crew": { "leads": false, "members": 0 }, "this_month": 0.47
  }
}
```

- `{ "customer": null }` alone: the email isn't on Customers (call sync).
- Points are read from Square for that one customer and kept 15 minutes (the programme 30); goodwill points
  given on the Loyalty page show straight away. Square failing is `503`, so the website hides the card
  rather than show no points. Joining the programme stays at the till.
- A line's `note` is only the app's own (a post's views and likes, a spend at the till), never the team's;
  a crew bonus says "Crew bonus" without the crew member's name. Never their rep page's link.

**The coffee club.** When the business has one (Sales → Coffee club), the summary also has `club`: what it is,
how to join, and the person's pass, which they can hold up at the counter so the team finds them by name
(`SiteClub` in `shared/siteAccount.ts`; worker/coffeeClub.ts). No club, no `club` key.

```jsonc
"club": {
  "name": "Coffee club", "price": 10, "currency": "EUR", "coffees_per_week": 1,
  "join_url": null,                        // Square's checkout page to join; null for a member, or while not taking members
  "pass": {                                // null: not a member (or it has ended)
    "standing": "active",                  // active, ending (cancelled, still running), pending, paused, payment_failed
    "used_this_week": 0, "left_this_week": 1,   // left: 0 unless active and paid
    "week_start": "2026-11-23",            // a new week's coffees from this Monday
    "started_on": "2026-11-01", "ends_on": null
  }
}
```

A good pass shows the name large, the club's name and this week's coffee ("ready" or "had, next one Monday"),
and `join_url` as a button for someone who isn't a member yet.

### Erase: deleting the account on the website

`{ "email": "…", "email_verified": true }` → `200 { "erased": true, "kept": "ledger" | null, "found": true }`

- No ledger lines: they're deleted (with their newsletter record, and a customer rep row with nothing on it).
  `kept: null`.
- Ledger lines (accounting): the row stays, blanked: name, email, phone, birthday, notes, Instagram, company,
  tags and Square id gone, no yes to marketing (unsubscribed), their newsletter record gone; their customer
  rep row switched off and blanked the same way, its link gone. Ids, ledger lines and amounts stay.
  `kept: "ledger"`. Customers shows the row as *Erased*. Someone on the team or an ambassador linked to them
  is only unlinked.
- Their details are taken out of the audit log's copies too, and the erasing is logged there as done via the
  website, without them. Their kept points go.
- `found: false`: nobody with that email (it's still `200`: they aren't here).
- Square's own customer directory isn't changed: the till's record is the business's to delete there.

## The business's details and opening hours

```
GET https://businesssagent.com/api/site/<business>/details
```

Where the business is, how to reach it, its social accounts and when it's open, with the days it's
closed on its Calendar: what the Business and Opening hours pages say. Change them there and the website
shows it within a few minutes, the same as Google Maps, which is sent the same hours and closures. As the
menu: no sign-in, any site may read it (CORS is open), kept a minute (`Cache-Control: public, max-age=60`),
`404` until an admin turns on **Share your details with the website** on Website & SEO
(`settings.website_details`) and for a number that's no business, `503` when it can't be read just then
(keep showing the last you had).

What comes back (`SiteDetailsFeed` in `shared/websiteDetails.ts`):

```jsonc
{
  "version": 1,
  "business": { "id": 1, "name": "Easy Beans Coffee" },
  "address": "C. Pizarro, 8, 29670 San Pedro de Alcántara, Málaga",
  "address_lines": ["C. Pizarro, 8", "29670 San Pedro de Alcántara", "Málaga"],  // between commas, the house number with its street
  "maps_url": "https://www.google.com/maps/search/?api=1&query=…",
  "phone": "+34 952 000 000",
  "whatsapp": "+34 695 415 335", "whatsapp_url": "https://wa.me/34695415335",
  "email": "easybeanscafe@gmail.com",
  "website": "https://www.easybeanscoffee.com",
  "social": {
    "instagram": { "handle": "easy.beans.coffee", "url": "https://www.instagram.com/easy.beans.coffee" },
    "tiktok": { "handle": "easybeanscoffee", "url": "https://www.tiktok.com/@easybeanscoffee" }
  },
  "timezone": "Europe/Madrid",                     // the hours and dates are the business's
  "hours": {                                       // the usual week, Monday first; null: closed that day
    "mon": { "open": "08:00", "close": "15:00" }, "tue": { … }, "wed": { … }, "thu": { … }, "fri": { … },
    "sat": { "open": "09:00", "close": "15:00" }, "sun": null
  },
  "closures": [                                    // from today, up to 120 days ahead
    { "from": "2026-12-24", "to": "2026-12-25", "reason": "Closed for Christmas" }
  ],
  "days": [                                        // the next 14 days, closures applied: for "open now" and ordering
    { "date": "2026-12-24", "day": "thu", "open": null, "close": null, "closed_reason": "Closed for Christmas" }
  ],
  "generated_at": "2026-12-21T09:00:00Z"
}
```

- A field the business hasn't filled in is `null` (or `[]`): the website leaves that line out.
- `closures` are the Calendar's business events that close it ("Closed…", "Cerrado…"), and public holidays when
  the Opening hours page says it closes on them: what Google Maps gets (`shared/closures.ts`).
- WhatsApp and TikTok are on the Business page (Contact), next to the phone and Instagram.
- A day that closes in between (09:00–14:00 and 17:00–20:00) has `"break": { "from": "14:00", "to": "17:00" }` in
  `hours` and in `days`, with `open` and `close` still the first opening and last closing; no `break` otherwise.
- Easy Beans' details were filled in from what its website showed before, where the app had none.

## The Google rating and reviews

```
GET https://businesssagent.com/api/site/<business>/reviews
```

The business's Google rating and its reviews, as the Reviews page keeps them: the app reads Google (the
business's own profile on Connections → Google Maps every hour, or the public listing every 3 hours), and the
website reads what's kept here, so it needs no Google key of its own and asking often costs no look-up at
Google. As the menu: no sign-in, CORS open, kept a minute, `404` until an admin turns on **Share your reviews
with the website** on Website & SEO (`settings.website_reviews`) and for a number that's no business, `503`
when it can't be read just then.

What comes back (`SiteReviewsFeed` in `shared/websiteReviews.ts`):

```jsonc
{
  "version": 1,
  "business": { "id": 1, "name": "Easy Beans Coffee" },
  "source": "business_profile",          // "places" (the public listing: its 5 newest), or null: neither yet
  "rating": 4.7, "count": 27,            // Google's average, one decimal, and how many reviews; null: none yet
  "maps_url": "https://maps.google.com/maps?cid=…",
  "write_review_url": "https://search.google.com/local/writereview?placeid=…",
  "reviews": [                           // with words, from someone named, newest first, at most 50
    { "id": "accounts/…/reviews/…", "rating": 5, "text": "Best flat white in San Pedro", "reviewer": "Ana",
      "created_at": "2026-11-10T10:00:00Z", "language": "en",
      "reply": "Thank you Ana!",         // the business's public reply on Google, or null
      "url": null,                       // Google Maps' page for it (Places only)
      "photos": [{ "url": "https://lh3.googleusercontent.com/…", "thumb": "https://…" }] }
  ],
  "checked_at": "2026-11-15T09:00:00Z",   // when Google was last read
  "generated_at": "2026-11-15T09:05:00Z"
}
```

- From the business's own profile, which gives every review, the rating is worked out from them all (star-only
  ones included, as Google does); from the public listing it's Google's own.
- Every rating is there, low ones too, as on Google: the website picks which to show (Easy Beans' shows the
  newest of the best).
- A new review is here within the hour (the hourly job), the same as the notification admins get.

## The latest posts

```
GET https://businesssagent.com/api/site/<business>/posts
```

The business's latest posts from the Instagram connected on Connections (or its Facebook Page while Instagram
isn't), so the website needs no Instagram token of its own: a business that reconnects Instagram does it once,
here. The app asks Instagram at most every 15 minutes for each business, however often websites ask; while
Instagram can't be read, the posts last read (up to two days). As the menu: no sign-in, CORS open, kept a
minute, `404` until an admin turns on **Share your posts with the website** on Website & SEO
(`settings.website_posts`), `503` when nothing can be read just then.

What comes back (`SitePostsFeed` in `shared/websitePosts.ts`):

```jsonc
{
  "version": 1,
  "business": { "id": 1, "name": "Easy Beans Coffee" },
  "source": "instagram",                 // "facebook", or null: neither connected (posts is [])
  "account": { "handle": "easy.beans.coffee", "url": "https://www.instagram.com/easy.beans.coffee" },
  "posts": [                             // newest first, at most 12, only those with a picture and a link
    { "id": "1802", "permalink": "https://www.instagram.com/reel/…/", "image_url": "https://…cdninstagram.com/…",
      "caption": "Ube latte", "posted_at": "2026-11-15T08:00:00.000Z", "video": true }   // a video's picture is its cover
  ],
  "fetched_at": "2026-11-15T10:00:00.000Z",  // when Instagram was last asked
  "generated_at": "2026-11-15T10:01:00.000Z"
}
```

- `image_url` is Instagram's own address for the picture, which runs out after a few days: show it from the
  feed rather than keep it (or copy the picture).

## A new business's website

Everything here is per business: its number is in each address (`/api/site/<business>/…`), and each
business turns on what its website uses, with its own website key. A new business needs nothing from
Business Agent itself, only its owner or a shop manager on **Website & SEO**:

1. **The menu:** turn on **Share the menu with the website**.
2. **Its details and opening hours:** fill in the Business page's Contact (address, phone, WhatsApp, email,
   Instagram, TikTok) and the Opening hours page, then turn on **Share your details with the website**.
   Closures go on the Calendar ("Closed for…"), and Google Maps gets the same if it's connected; its
   listing's own Maps link is the one the website gets.
3. **Newsletter sign-ups:** turn them on and set the topics. Its website's server needs no key for them
   (a **website key** is optional).
4. **Accounts & rewards:** turn on **Website accounts** (it uses the same website key).
5. **Google rating and reviews:** connect Google Maps on Connections (its own profile), then turn on **Share
   your reviews with the website**.
6. **Instagram posts:** connect Instagram (or the Facebook Page) on Connections, then turn on **Share your posts
   with the website**.

Its website then reads `GET /api/site/<business>/menu`, `/details`, `/reviews` and `/posts` (from its pages or its server), and
its server sends sign-ups (no key needed) and accounts (with the key). Each address on Website & SEO already has the
business's number in it. Easy Beans' website (its own repository) reads its number from one setting,
`BUSINESS_AGENT_BUSINESS`, so a site built from it for another business changes only that.

## Next

The same way, as they're needed: today's offers (Offers & specials) and the menu's allergens in full.

Easy Beans' website reads its menu and prices, details and opening hours, Google rating and reviews, and
Instagram posts from here. Only what's sold out (Square's catalog) and checkout and payment stay with Square.
