// The newsletter form the app hosts (/api/site/<business>/newsletter, worker/newsletter.ts), as a page:
// a link to share, or shown inside any website in a frame that grows to fit it. The same page is the
// preview on Website & SEO. Its words are the visitor's language (FORM_TEXT), the business's own
// where it has them, and everything that's the business's is escaped.
import { FORM_TEXT, HEIGHT_MESSAGE, formText, interestText, type FormLanguage, type NewsletterSettings, type SignupProblem } from './newsletter'

/** What the form needs of the business's set-up. */
export type FormSettings = Pick<NewsletterSettings, 'interests' | 'ask_name' | 'ask_phone' | 'heading' | 'intro'>

const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

/** Dark or white writing on a colour, whichever reads better. */
export function inkOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1f1f1f' : '#ffffff'
}

const STYLE = `*{box-sizing:border-box}html,body{margin:0;background:transparent}
body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1f1f1f}
main{max-width:480px;margin:0 auto;padding:16px}
h1{font-size:1.35rem;line-height:1.25;margin:0 0 .25rem}
p{margin:0 0 .75rem;color:#4a4a4a}
label.f{display:block;font-weight:600;font-size:.9rem;margin:.75rem 0 .25rem}
input.t{width:100%;padding:.65rem .75rem;border:1px solid #bdbdbd;border-radius:10px;font:inherit;background:#fff;color:inherit}
input:focus-visible,button:focus-visible,.chip:focus-within{outline:2px solid var(--accent);outline-offset:2px}
fieldset{border:0;padding:0;margin:.9rem 0 0;min-width:0}
legend{font-weight:600;font-size:.9rem;margin:0 0 .4rem;padding:0}
.chips{display:flex;flex-wrap:wrap;gap:.4rem}
.chip{display:inline-flex;align-items:center;gap:.4rem;border:1px solid #bdbdbd;border-radius:999px;padding:.35rem .8rem;font-size:.9rem;cursor:pointer;background:#fff}
.chip input{accent-color:var(--accent);margin:0;width:1rem;height:1rem}
button{margin-top:1rem;width:100%;padding:.75rem;border:0;border-radius:10px;background:var(--accent);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}
button[disabled]{opacity:.65;cursor:default}
.small{font-size:.78rem;color:#616161;margin:.75rem 0 0}
.msg{margin:.75rem 0 0;padding:.6rem .75rem;border-radius:10px;font-weight:500}
.msg.error{background:#fdecea;color:#8a1c12}.msg.done{background:#e8f5e9;color:#1b5e20}
.hp{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}
[hidden]{display:none!important}`

function page(lang: FormLanguage, title: string, colour: string | null, inner: string, script = '') {
  const accent = colour ?? '#1f1f1f'
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>:root{--accent:${accent};--ink:${inkOn(accent)}}${STYLE}</style></head>
<body><main>${inner}</main>${script}</body></html>`
}

export function offPage(lang: FormLanguage, text: string) {
  return page(lang, text, null, `<p>${esc(text)}</p>`)
}

/** Tell the website showing the form how tall it is, so its frame fits. */
const SIZE_SCRIPT = `function size(){try{parent.postMessage({type:${JSON.stringify(HEIGHT_MESSAGE)},height:Math.ceil(document.querySelector("main").getBoundingClientRect().bottom)},"*")}catch(e){}}`

/**
 * The form: the business's topics in the visitor's language, its own words if it has them, and the yes
 * to marketing said plainly. `preview`: without its script (the app shows it where nothing can be sent).
 */
export function formPage(o: { business: number; name: string; colour: string | null; settings: FormSettings; lang: FormLanguage; place: string | null; said?: SignupProblem | 'tooMany' | 'failed' | 'done'; preview?: boolean }) {
  const { settings: s, lang, name } = o
  const words = (k: keyof (typeof FORM_TEXT)['en']) => formText(lang, k, name)
  const heading = s.heading ?? words('heading')
  const intro = s.intro ?? words('intro')
  const message = o.said && o.said !== 'done' ? `<div class="msg error" role="alert">${esc(words(o.said))}</div>` : ''
  if (o.said === 'done') {
    return page(lang, heading, o.colour, `<h1>${esc(heading)}</h1><div class="msg done" role="status">${esc(words('done'))}</div>`,
      `<script>${SIZE_SCRIPT}addEventListener("load",size);size()</script>`)
  }
  const topics = s.interests.length ? `<fieldset><legend>${esc(words('topics'))}</legend><div class="chips">
${s.interests.map(i => `<label class="chip"><input type="checkbox" name="interests" value="${esc(i.key)}"> ${esc(interestText(i, lang))}</label>`).join('\n')}
${s.interests.length > 1 ? `<label class="chip" hidden id="all-chip"><input type="checkbox" id="all"> ${esc(words('all'))}</label>` : ''}
</div></fieldset>` : ''
  const form = `<h1>${esc(heading)}</h1>${intro ? `<p>${esc(intro)}</p>` : ''}
<form method="post" action="/api/site/${o.business}/signup" novalidate>
<input type="hidden" name="lang" value="${lang}">${o.place ? `<input type="hidden" name="place" value="${esc(o.place.slice(0, 60))}">` : ''}
<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
${s.ask_name ? `<label class="f" for="nl-name">${esc(words('name'))}</label><input class="t" id="nl-name" name="name" type="text" autocomplete="name" maxlength="200">` : ''}
<label class="f" for="nl-email">${esc(words('email'))}</label><input class="t" id="nl-email" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254">
${s.ask_phone ? `<label class="f" for="nl-phone">${esc(words('phone'))}</label><input class="t" id="nl-phone" name="phone" type="tel" autocomplete="tel" maxlength="40">` : ''}
${topics}
<button type="submit">${esc(words('button'))}</button>
${message}<div class="msg" role="status" aria-live="polite" hidden></div>
<p class="small">${esc(words('consent'))}</p>
</form>
<div class="msg done" id="done" role="status" hidden>${esc(words('done'))}</div>`
  const said = Object.fromEntries((['sending', 'done', 'invalidEmail', 'invalidPhone', 'failed', 'tooMany', 'button'] as const).map(k => [k, words(k)]))
  // JSON in a script: "<" written as < so the text can't close the script.
  const script = `<script>(function(){var T=${JSON.stringify(said).replace(/</g, '\\u003c')};${SIZE_SCRIPT}
var f=document.querySelector("form"),m=f.querySelector(".msg[role=status]"),b=f.querySelector("button"),all=document.getElementById("all");
var boxes=function(){return f.querySelectorAll("input[name=interests]")};
if(all){document.getElementById("all-chip").hidden=false;all.addEventListener("change",function(){boxes().forEach(function(i){i.checked=all.checked})})}
function say(t,k){m.textContent=t;m.className="msg "+k;m.hidden=!t;var e=f.querySelector(".msg.error[role=alert]");if(e)e.remove();size()}
function ready(){b.disabled=false;b.textContent=T.button}
f.addEventListener("submit",function(e){e.preventDefault();var d=new FormData(f),email=String(d.get("email")||"").trim();
if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){say(T.invalidEmail,"error");return}
b.disabled=true;b.textContent=T.sending;say("","");
var body={email:email,lang:d.get("lang"),interests:d.getAll("interests"),name:d.get("name")||undefined,phone:d.get("phone")||undefined,place:d.get("place")||undefined,website:d.get("website")||undefined};
fetch(f.action,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})
.then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(r.ok){f.hidden=true;document.getElementById("done").hidden=false;size()}else{say(T[j.problem]||T.failed,"error");ready()}})})
.catch(function(){say(T.failed,"error");ready()})});
addEventListener("load",size);addEventListener("resize",size);size()})()</script>`
  return page(lang, heading, o.colour, form, o.preview ? '' : script)
}
