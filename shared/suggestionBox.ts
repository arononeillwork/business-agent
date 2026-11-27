// The suggestion box: a page customers open from the Suggestion box QR code (QR codes page) to send the
// business an idea, no sign-in (/api/site/<business>/suggest, worker/suggestionBox.ts). What they send is
// on the Suggestions page straight away, not sorted yet, heard "Suggestion box" (shared/suggestions.ts),
// with their name when they give it. Its words are the customer's language (BOX_TEXT), and everything
// that's the business's or the customer's is escaped.
import { SUGGESTION_LIMITS } from './suggestions'
import { inkOn } from './newsletterForm'
import type { FormLanguage } from './newsletter'

/** The page's address, for the QR code: https://businesssagent.com/api/site/1/suggest. */
export const suggestionBoxUrl = (origin: string, business: number) => `${origin.replace(/\/+$/, '')}/api/site/${business}/suggest`

/** Where the page sends an idea. */
export const suggestionBoxPostPath = (business: number) => `/api/site/${business}/suggestion`

/** What can go wrong with an idea; the page says it in the customer's language. */
export type BoxProblem = 'empty' | 'tooLong' | 'nameTooLong'

/** An idea as sent, tidied: the words, and who sent it when they said. */
export interface BoxIdea { text: string; customer: string | null }

const tidy = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** What the page (or a plain form post) sent, checked the way the database does (the `customer_suggestions` migration). */
export function readIdea(body: Record<string, unknown>): { idea: BoxIdea } | { problem: BoxProblem } {
  const text = tidy(body.idea ?? body.text)
  const customer = tidy(body.name ?? body.customer)
  if (!text) return { problem: 'empty' }
  if (text.length > SUGGESTION_LIMITS.text) return { problem: 'tooLong' }
  if (customer.length > SUGGESTION_LIMITS.customer) return { problem: 'nameTooLong' }
  return { idea: { text, customer: customer || null } }
}

/** The page's words. */
export const BOX_TEXT: Record<FormLanguage, Record<'heading' | 'intro' | 'idea' | 'placeholder' | 'name' | 'button' | 'sending' | 'done' | 'another'
  | 'private' | BoxProblem | 'failed' | 'tooMany' | 'off', string>> = {
  en: {
    heading: 'Got an idea for us?',
    intro: 'Tell {business} what would make your visit even better: a drink, a dish, the music, the hours. The team reads every one.',
    idea: 'Your idea',
    placeholder: 'e.g. Oat milk at no extra cost',
    name: 'Your name (optional)',
    button: 'Send',
    sending: 'Sending…',
    done: 'Thank you! Your idea is with the team.',
    another: 'Send another idea',
    private: 'Only the team at {business} reads it. Leave your name out if you’d rather.',
    empty: 'Write your idea first.',
    tooLong: 'Keep your idea to 1,000 characters.',
    nameTooLong: 'Keep your name to 120 characters.',
    failed: 'It couldn’t be sent just now. Try again in a minute.',
    tooMany: 'That’s a lot of ideas at once! Try again in a while.',
    off: 'This suggestion box isn’t here.',
  },
  es: {
    heading: '¿Tienes una idea para nosotros?',
    intro: 'Cuéntale a {business} qué haría tu visita aún mejor: una bebida, un plato, la música, el horario. El equipo las lee todas.',
    idea: 'Tu idea',
    placeholder: 'p. ej. Leche de avena sin coste extra',
    name: 'Tu nombre (opcional)',
    button: 'Enviar',
    sending: 'Enviando…',
    done: '¡Gracias! Tu idea ya la tiene el equipo.',
    another: 'Enviar otra idea',
    private: 'Solo la lee el equipo de {business}. Si lo prefieres, no pongas tu nombre.',
    empty: 'Escribe primero tu idea.',
    tooLong: 'Tu idea, como mucho 1.000 caracteres.',
    nameTooLong: 'Tu nombre, como mucho 120 caracteres.',
    failed: 'No se ha podido enviar ahora. Inténtalo de nuevo en un minuto.',
    tooMany: '¡Cuántas ideas a la vez! Vuelve a intentarlo dentro de un rato.',
    off: 'Este buzón de sugerencias no existe.',
  },
}

const words = (lang: FormLanguage, key: keyof (typeof BOX_TEXT)['en'], business: string) =>
  BOX_TEXT[lang][key].replace('{business}', business || (lang === 'es' ? 'el negocio' : 'the business'))

const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

const STYLE = `*{box-sizing:border-box}html,body{margin:0;background:#faf8f5}
body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1f1f1f}
main{max-width:480px;margin:0 auto;padding:24px 16px}
.biz{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b;margin:0 0 .5rem}
h1{font-size:1.45rem;line-height:1.25;margin:0 0 .5rem}
p{margin:0 0 .75rem;color:#4a4a4a}
label.f{display:block;font-weight:600;font-size:.9rem;margin:.9rem 0 .25rem}
.t{width:100%;padding:.65rem .75rem;border:1px solid #bdbdbd;border-radius:10px;font:inherit;background:#fff;color:inherit}
textarea.t{min-height:8.5rem;resize:vertical}
.t:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button{margin-top:1rem;width:100%;padding:.8rem;border:0;border-radius:10px;background:var(--accent);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}
button[disabled]{opacity:.65;cursor:default}
.small{font-size:.8rem;color:#616161;margin:.9rem 0 0}
.msg{margin:.75rem 0 0;padding:.6rem .75rem;border-radius:10px;font-weight:500}
.msg.error{background:#fdecea;color:#8a1c12}.msg.done{background:#e8f5e9;color:#1b5e20}
a{color:inherit;font-weight:600}
.hp{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}
[hidden]{display:none!important}`

function page(lang: FormLanguage, title: string, colour: string | null, inner: string, script = '') {
  const accent = colour && /^#[0-9a-f]{6}$/i.test(colour) ? colour : '#1f1f1f'
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>:root{--accent:${accent};--ink:${inkOn(accent)}}${STYLE}</style></head>
<body><main>${inner}</main>${script}</body></html>`
}

/** A page that only says something: a number that's no business, or the box unavailable. */
export function boxMessagePage(lang: FormLanguage, which: 'off' | 'failed', name = '') {
  const text = words(lang, which, name)
  return page(lang, text, null, `<p>${esc(text)}</p>`)
}

/**
 * The page: the business's name, a box for the idea and one for a name (optional). `said`: how a plain
 * form post (no JavaScript) went, with what was typed kept when it needs fixing.
 */
export function suggestionBoxPage(o: { business: number; name: string; colour: string | null; lang: FormLanguage
  said?: BoxProblem | 'failed' | 'tooMany' | 'done'; typed?: { idea?: string; name?: string } }) {
  const { lang, name } = o
  const w = (k: keyof (typeof BOX_TEXT)['en']) => words(lang, k, name)
  const head = `${name ? `<p class="biz">${esc(name)}</p>` : ''}<h1>${esc(w('heading'))}</h1>`
  const again = `<p class="small"><a href="/api/site/${o.business}/suggest?lang=${lang}">${esc(w('another'))}</a></p>`
  if (o.said === 'done') return page(lang, w('heading'), o.colour, `${head}<div class="msg done" role="status">${esc(w('done'))}</div>${again}`)
  const error = o.said ? `<div class="msg error" role="alert">${esc(w(o.said))}</div>` : ''
  const form = `${head}<p>${esc(w('intro'))}</p>
<form method="post" action="${suggestionBoxPostPath(o.business)}" novalidate>
<input type="hidden" name="lang" value="${lang}">
<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<label class="f" for="sb-idea">${esc(w('idea'))}</label>
<textarea class="t" id="sb-idea" name="idea" required maxlength="${SUGGESTION_LIMITS.text}" placeholder="${esc(w('placeholder'))}">${esc(o.typed?.idea ?? '')}</textarea>
<label class="f" for="sb-name">${esc(w('name'))}</label>
<input class="t" id="sb-name" name="name" type="text" autocomplete="given-name" maxlength="${SUGGESTION_LIMITS.customer}" value="${esc(o.typed?.name ?? '')}">
<button type="submit">${esc(w('button'))}</button>
${error}<div class="msg" role="status" aria-live="polite" hidden></div>
<p class="small">${esc(w('private'))}</p>
</form>
<div id="done" hidden><div class="msg done" role="status">${esc(w('done'))}</div>${again}</div>`
  const said = Object.fromEntries((['sending', 'button', 'empty', 'tooLong', 'nameTooLong', 'failed', 'tooMany'] as const).map(k => [k, w(k)]))
  // JSON in a script: "<" written as < so the text can't close the script.
  const script = `<script>(function(){var T=${JSON.stringify(said).replace(/</g, '\\u003c')};
var f=document.querySelector("form"),m=f.querySelector(".msg[role=status]"),b=f.querySelector("button");
function say(t,k){m.textContent=t;m.className="msg "+k;m.hidden=!t;var e=f.querySelector(".msg.error[role=alert]");if(e)e.remove()}
function ready(){b.disabled=false;b.textContent=T.button}
f.addEventListener("submit",function(e){e.preventDefault();var d=new FormData(f),idea=String(d.get("idea")||"").trim();
if(!idea){say(T.empty,"error");f.idea.focus();return}
b.disabled=true;b.textContent=T.sending;say("","");
var body={idea:idea,name:d.get("name")||undefined,lang:d.get("lang"),website:d.get("website")||undefined};
fetch(f.action,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})
.then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(r.ok){f.hidden=true;document.getElementById("done").hidden=false}else{say(T[j.problem]||T.failed,"error");ready()}})})
.catch(function(){say(T.failed,"error");ready()})})})()</script>`
  return page(lang, w('heading'), o.colour, form, script)
}
