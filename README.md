# dedoomify

**Read AI news without the doom.** Paste a link to an article about AI and
[dedoomify.com](https://dedoomify.com) rewrites the doom framing into the plain
language an engineer would use about software with defects:

| Before | After |
| --- | --- |
| The model **is misaligned** | The model **has a bug** |
| AI poses **an existential risk** | AI poses **a product risk** |
| A **rogue AI** could emerge | A **malfunctioning AI** could emerge |
| Labs are racing toward **superintelligence** | Labs are racing toward **very capable software** |
| What's your **p(doom)**? | What's your **estimated failure rate**? |

Facts, names and numbers stay the same; only the framing changes. The article
keeps its original look, with every change highlighted in place; hover a
highlight to see the original words. A reader view shows just the text.

![dedoomify rewriting an article](docs/screenshot.png)

## How it works

```
browser ──► /api/page?url=…   ──► fetch page ──► strip scripts ──► phrase rules ──► HTML in a sandboxed frame
                                   (public hosts                    (marked in place)
browser ──► /api/dedoom?url=… ──►  only)      ──► extract article ──► phrase rules ──► JSON (reader view)
   │
   └─► optional: rewrite the doom-y paragraphs with a small model in the browser
```

Visitors pick one of two engines:

- **Quick phrase rules** (default): instant, and runs on the server for free.
- **On-device AI**: [Qwen2.5 0.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct)
  (Apache 2.0) runs in the visitor's browser through
  [WebLLM](https://github.com/mlc-ai/web-llm) and WebGPU. The model downloads
  once (about 300 MB, from Hugging Face, so around 10 seconds on a fast home
  connection) and the browser caches it. The phrase-rules version shows
  straight away while it loads. Only
  paragraphs with doom framing go to the model, one at a time, and a rewrite
  that changes a number or the paragraph's shape is thrown away in favour of
  the phrase-rules version. Nothing is sent to our server, and it costs
  nothing per request. Browsers without WebGPU get the phrase rules.

Files:

- **`public/`** is the static site: `index.html`, `app.js`, `styles.css`,
  `diff.js` (highlights what changed), `tooltip.js` (the hover card with the
  original words), `local-ai.js` and `llm-worker.js` (the
  on-device model).
- **`api/page.js`** returns the original page with its scripts, frames and
  event handlers removed and the phrase rules applied in place
  (`lib/page.js`, `shared/page-dedoom.js`). It is only served into
  dedoomify's own sandboxed frame, under a policy that allows no scripts;
  opening it directly redirects to the site.
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
- **`extension/`** is a Manifest V3 browser extension that rewrites the page
  you're reading, using the phrase rules only.

## Run it locally

Needs Node 20 or newer.

```sh
npm install
npm test
npm run dev            # http://localhost:3000
```

`npm run dev` (and Vercel's build) runs `npm run build`, which copies the
shared scripts and the WebLLM library into `public/vendor/` so the site serves
them itself. The on-device model needs a browser with WebGPU, such as current
Chrome, Edge or Safari.

The optional Claude API mode:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Allows `GET /api/dedoom?url=…&mode=claude`. The website doesn't call it. |
| `DEDOOMIFY_MODEL` | `claude-opus-5-5` | Which Claude model that mode uses. |
| `DEDOOMIFY_LLM` | on | Set to `off` to disable that mode without removing the key. |

## Deploy to dedoomify.com (Vercel)

The repo deploys to Vercel as is: `npm run build`, then static files from
`public/` and the function in `api/` (both set in `vercel.json`).

1. Sign in at [vercel.com](https://vercel.com) with GitHub and choose
   **Add New → Project**, then import `akspad/dedoomify`. Leave the framework
   preset as **Other**.
2. No environment variables are needed.
3. Deploy. You'll get a `*.vercel.app` URL to check.
4. Under **Settings → Domains**, add `dedoomify.com` and `www.dedoomify.com`.
   Vercel shows the DNS records to create at your registrar. Usually that's an
   `A` record for `@` pointing to Vercel's IP and a `CNAME` for `www` pointing
   to Vercel, or you can switch the domain's nameservers to Vercel. Use the
   exact values Vercel shows. HTTPS is issued automatically once DNS resolves.

Every push to `main` then deploys to production, and every pull request gets
a preview URL. The live project is connected this way, so merging to `main` is
all it takes to ship; no local `vercel deploy` is needed.

## Browser extension

The extension rewrites the page you're on, in place, when you click its
button. It needs no API key and sends nothing anywhere; it asks only for
`activeTab` and `scripting`, so it can touch a page only after you click.

To try it in Chrome, Edge or Brave:

1. Run `npm run build:extension` (copies the latest rules into `extension/`).
2. Open `chrome://extensions`, turn on **Developer mode**, click
   **Load unpacked**, and pick the `extension/` folder.
3. Open an article about AI and click the dedoomify button.

To publish it, zip the `extension/` folder and upload it to the
[Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole)
(one-time $5 registration fee).

## Contributing

Rule ideas are the easiest contribution: add a phrase pair to
`shared/dedoom-core.js`, add a test case in `test/rules.test.js`, run
`npm run build:extension && npm test`, and open a pull request. Put longer
phrases before shorter ones they contain, and handle `a`/`an` when a
replacement changes the article.

dedoomify reframes articles; it doesn't fact-check them. Always read the
original too.

## License

MIT
