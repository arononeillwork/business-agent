# Business Agent's own email: hello@, sales@ and support@businesssagent.com

The website shows **hello@**, **sales@** (Enterprise: "Contact sales") and **support@**
businesssagent.com. They all arrive in one Gmail inbox, and you reply *as* those addresses from
Gmail. It costs nothing: Cloudflare Email Routing receives the mail, Gmail sends it.

## 1. A Gmail for Business Agent (5 minutes)

Create a Gmail account for the business, for example `businessagent.hq@gmail.com`
(<https://accounts.google.com/signup>). Turn on **2-Step Verification** (Google Account →
Security): Gmail needs it to send as your own addresses.

## 2. Tell the deploy where to forward (1 minute)

GitHub → the repository → Settings → Secrets and variables → Actions → **New repository secret**:
name `EMAIL_FORWARD_TO`, value the Gmail address.

## 3. Let the deploy set up Email Routing (2 minutes)

Cloudflare → My Profile → **API Tokens** → edit the token the deploy uses → add:
- **Zone → Email Routing Rules → Edit** (for businesssagent.com)
- **Account → Email Routing Addresses → Edit**

Then redeploy (or ask for one). The "Business email" step switches on Email Routing (Cloudflare adds
its MX records), creates hello@, sales@ and support@ forwarding to the Gmail, lets Google send for
the domain (SPF) and adds a DMARC policy. Its result shows in the deploy summary.

Prefer clicking? Cloudflare → businesssagent.com → **Email → Email Routing → Get started**, add
the three addresses with the Gmail as destination, and the deploy step will find them and leave
them as they are.

## 4. Confirm the Gmail (1 minute)

Cloudflare emails the Gmail once: open **"Verify email address"** and press the button. Mail to
the three addresses is delivered from then on.

## 5. Reply as hello@ from Gmail (5 minutes)

1. Google Account → Security → **App passwords** → create one called "Business Agent mail".
2. Gmail → Settings (gear) → See all settings → **Accounts and Import** → Send mail as →
   **Add another email address**: name `Business Agent`, address `hello@businesssagent.com`,
   untick "Treat as an alias".
3. SMTP server `smtp.gmail.com`, port `587`, username the full Gmail address, password the app
   password, TLS. Gmail sends a code to hello@, which arrives in the same inbox: enter it.
4. Repeat for sales@ and support@ if you want to send from those too, and pick a default.
   Tick "Reply from the same address the message was sent to".

Test: send an email to hello@businesssagent.com from another account; reply from Gmail and check
the reply shows hello@businesssagent.com as the sender.
