# dedoomify

**AI news, minus the doom**

Paste a link to an article about AI and
[dedoomify.com](https://dedoomify.com) rewrites the doom framing into the plain
language an engineer would use about software with defects:

| Before | After |
| --- | --- |
| The model **is misaligned** | The model **has a bug** |
| AI poses **an existential risk** | AI poses **a product risk** |
| A **rogue AI** could emerge | A **malfunctioning AI** could emerge |
| Labs are racing toward **superintelligence** | Labs are racing toward **very capable software** |
| What's your **p(doom)**? | What's your **estimated failure rate**? |

Designed to preserve names, numbers and factual claims while changing the
framing. Direct quotations are left untouched. Single-quoted passages use the outermost plausible pair to preserve speech across possessives, nested fragments and whitespace padding. Intervening prose may also stay unchanged. Page view keeps publisher layout, styles, fonts and images, with every change highlighted in
place; hover a highlight to see the original words. A reader view shows just the text.

You can also [add dedoomify to Chrome](https://chromewebstore.google.com/detail/dedoomify/kgdgnbjfeodgpjmdmngljnffkpnffanl) to de-doom the page you're reading with one click.

[![dedoomify on a TechCrunch story about rogue AI: the link is pasted, 8 doom phrases are highlighted in place, and hovering one shows the original words](docs/demo.gif)](public/demo.mp4)

*dedoomify on TechCrunch's [OpenAI still doesn't seem to have a handle on all
of its rogue AI activity](https://techcrunch.com/2026/09/28/openai-still-doesnt-seem-to-have-a-handle-on-all-of-its-rogue-ai-activity/)
(Sept 28, 2026), with the quick phrase rules. The same clip plays on the
homepage; click it for the [MP4](public/demo.mp4).*

Built by [@akspad](https://x.com/akspad)

## How it works

```
browser ──► /api/page?url=…   ──► fetch page ──► sanitize + proxy images ──► phrase rules ──► HTML in a sandboxed frame
                                   (public hosts                    (marked in place)
browser ──► /api/dedoom?url=… ──►  only)      ──► extract article ──► phrase rules ──► JSON (reader view)
   │
   └─► optional: rewrite the doom-y paragraphs with a small model in the browser
```

Visitors pick an engine from the **Rewrite with** menu:

- **Quick phrase rules** (the first option): instant, and runs on the server
  for free.
- **On-device AI**: [Qwen2.5 0.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct)
  (about 300 MB, Apache 2.0) runs in the visitor's browser on WebGPU through
  [WebLLM](https://github.com/mlc-ai/web-llm). No text is sent to an external
  LLM API: the page or pasted text still goes through our server for the
  phrase-rules pass, and model inference happens locally in the browser, so it
  costs nothing per request. The model downloads once and the
  browser caches it; the phrase-rules version shows straight away while it
  loads. Only paragraphs with doom framing go to the model, one at a time, and
  a rewrite that changes a number, a quotation or the paragraph's shape is
  thrown away in favour of the phrase-rules version. Browsers without WebGPU
  get the phrase rules.

The menu remembers the last choice. No link handy? **Try it on a real
article** picks one of a list of real AI doom stories. Every result has a share
link (`dedoomify.com/?url=…&mode=…`) that opens the same article with the same
engine; on phones the Share button opens the system share sheet.

Files:

- **`public/`** is the static site: `index.html`, `app.js`, `styles.css`,
  `diff.js` (highlights what changed), `tooltip.js` (the hover card with the
  original words), `local-ai.js` and `llm-worker.js` for the on-device model,
  `privacy.html`, and the homepage demo clip (`demo.mp4`, with `demo.webm` for
  browsers without H.264, and `demo-poster.jpg`). `npm run build` copies the
  shared scripts and WebLLM into `public/vendor/`.
- **`api/page.js`** retains publisher CSS, scoped attributes and static SVG artwork,
  with active media, scripts, frames and event handlers removed and the phrase rules applied in place
  (`lib/page.js`, `shared/page-dedoom.js`). It is only served into
  dedoomify's own sandboxed frame, under a policy that allows only the hash-pinned tooltip script;
  opening it directly redirects to the site.
- **`api/image.js`** serves images and, with `asset=1`, stylesheets, fonts and SVG
  artwork through the same public-only, DNS-pinned fetch path, checking every
  redirect and limiting each resource to 2 MB. `lib/page-css.js` parses CSS and
  proxies nested imports, fonts and background images against the final stylesheet
  URL. The frame cannot fetch third-party resources directly or execute publisher
  scripts. Publisher CSS can hide or reposition content inside the frame; the
  disclosure banner remains outside it. Source markup cannot forge generated
  highlights or tooltip IDs.
- **`lib/rate-limit.js`** throttles article requests to 30 per minute per client
  and images to 120, before fetching or calling a model. Local servers trust the
  socket address; Vercel trusts its overwritten forwarding header. Counters are
  bounded and never evict active quotas. These process-local counters supplement
  a Vercel WAF rule covering all three fetch endpoints: 180 requests per minute
  per IP per edge region, enforced before functions run. Cached responses also
  count at the edge. The single combined rule fits the current hosting plan.
- **`api/dedoom.js`** extracts the article text for reader view. `GET ?url=` fetches and
  rewrites an article (responses are cacheable at the CDN for a day);
  `POST {text}` rewrites pasted text.
- **`lib/fetch-article.js`** fetches the page, refusing private and internal
  addresses (including on redirects), with size and time limits, and extracts
  the article with Mozilla Readability.
- **`shared/dedoom-core.js`** holds the phrase rules, and
  **`shared/dedoom-prompt.js`** the style guide models follow. Both are shared
  by the server, the browser and (for the rules) the extension. Add or tune
  rules there.
- **`lib/llm.js`** is an optional server-side Claude rewrite. The website no
  longer uses it; it only runs if `ANTHROPIC_API_KEY` is set and a caller asks
  the API for `mode=claude`.
- **`extension/`** is the Manifest V3 browser extension that rewrites the
  page you're reading, using the phrase rules only (see below).

## Browser extension

**[Install dedoomify from the Chrome Web Store](https://chromewebstore.google.com/detail/dedoomify/kgdgnbjfeodgpjmdmngljnffkpnffanl).** It works
in Chrome, Edge, Brave and other Chromium browsers.

[![The dedoomify extension on a news article: the toolbar popup's "De-doom this page" button rewrites 12 doom phrases in place, and hovering a highlight shows the original words](docs/extension-demo.gif)](docs/extension-demo.mp4)

*The extension on a sample article. Click it for the
[MP4](docs/extension-demo.mp4).*

Click the dedoomify button on any page and it is rewritten in place. Changes
are highlighted like on the site, with the same hover card showing the
original words; the popup can hide the highlights or undo them. It uses the
phrase rules, needs no account or API key and sends nothing anywhere. It asks
only for `activeTab` and `scripting`, so it can touch a page only after you
click. For the on-device AI rewrite, the popup links to the same page on
dedoomify.com.

Turn on **De-doom automatically** in the popup to rewrite articles about AI
doom as they load. This asks for access to all sites (an optional
permission). `background.js` then registers `auto.js` for every page;
`auto.js` first checks the page's title, description and the start of its
text for a mention of AI and any phrase the rules would change (a few
milliseconds at most, since each rule is skipped unless its key word is in
the text), so pages without AI doom are left alone.

## Contributing

Rule ideas are the easiest contribution: add a phrase pair to
`shared/dedoom-core.js`, add a test case in `test/rules.test.js`, run
`npm run build:extension && npm test`, and open a pull request. Put longer
phrases before shorter ones they contain, and handle `a`/`an` when a
replacement changes the article.

Found a phrase that slipped through or got mangled? [Send feedback](https://github.com/akspad/dedoomify/issues/new?template=feedback.yml)
or reach out to [@akspad](https://x.com/akspad).

dedoomify reframes articles; it doesn't fact-check them. Always read the
original too.

## License

MIT
