# Publishing the extension

Everything the Chrome Web Store, Microsoft Edge Add-ons and the Mac App Store
ask for is in this folder. The listing text is below, ready to paste.

| What | File |
| --- | --- |
| Extension zip (Chrome and Edge) | `dist/dedoomify-extension-<version>.zip`, from `npm run build:extension` |
| Screenshots, 1280×800 (all three stores) | `screenshots/1-before.png`, `2-after.png`, `3-hover.png` |
| Store icon, 128×128 (Chrome) | `icons/chrome-store-128.png` |
| Logo, 300×300 (Edge) | `icons/edge-logo-300.png` |
| App icon, 1024×1024 (Safari app) | `icons/app-icon-1024.png`, applied by `npm run build:safari` |
| Small promo tile, 440×280 (Chrome, Edge) | `promo-440x280.png` |
| Marquee, 1400×560 (Chrome, optional) | `marquee-1400x560.png` |
| Privacy policy | https://dedoomify.com/privacy.html |

`npm run store-assets` redraws the icons and images (it needs Playwright).
Before each new store upload, bump `version` in `extension/manifest.json`
and run `npm run build:extension`.

## Listing text

**Name:** dedoomify

**Summary** (Chrome, 132 characters max; also the manifest description):
Rewrites doom framing about AI on the page you're reading into plain engineering language.

**Subtitle** (App Store, 30 characters max): AI news, minus the doom

**Description:**

> Read AI news without the doom. Click the dedoomify button on any article about AI and it rewrites the doom framing into the plain language an engineer would use about software with defects:
>
> • "The model is misaligned" becomes "the model has a bug"
> • "An existential risk" becomes "a product risk"
> • "A rogue AI" becomes "a malfunctioning AI"
> • "Superintelligence" becomes "very capable software"
> • "p(doom)" becomes "estimated failure rate"
>
> Facts, names and numbers stay the same; only the framing changes. Every change is highlighted in place, and hovering a highlight shows the original words. Turn the highlights off for a clean read, or undo everything with one click.
>
> Private by design: the rewriting happens entirely in your browser with built-in phrase rules. The extension collects no data, sends nothing over the network, and only touches the page you click it on.
>
> For a fuller rewrite by a small AI model that runs on your own device, the popup links straight to the same page on dedoomify.com.
>
> dedoomify reframes articles; it doesn't fact-check them. It's open source: github.com/akspad/dedoomify

**Keywords** (App Store, 100 characters max): AI,news,doom,reader,rewrite,calm,artificial intelligence,headlines,anxiety,tech news

**Category:** Chrome: Tools. Edge: Productivity. App Store: News (secondary: Productivity).

**Website / support URL:** https://dedoomify.com (support: https://github.com/akspad/dedoomify/issues)

**Single purpose** (Chrome privacy tab):
Rewrites doom-laden framing about AI on the current web page into plain engineering language, highlighting each change so the reader can see the original words.

**Permission justifications** (Chrome privacy tab):
- `activeTab`: Lets the extension read and rewrite the text of the tab the user is on, only after the user clicks the extension's button.
- `scripting`: Injects the rewriting script and its highlight styles into that tab when the user presses "De-doom this page", and toggles or undoes the highlights from the popup.

**Remote code:** No. All code ships in the package.

**Data usage:** Collects none of the listed data types. Certify all three statements (no selling, no unrelated use, no creditworthiness use).

**Notes for reviewers** (Edge and App Store):
Open any news article about AI (for example a search for "AI existential risk"), click the dedoomify toolbar button, then press "De-doom this page". Doom phrases are rewritten and highlighted; hover one to see the original. No sign-in is needed.

## Chrome Web Store

1. Register at https://chrome.google.com/webstore/devconsole with the Google account that should own the listing, and pay the one-time $5 fee. Verify the contact email it asks for.
2. Click **New item** and upload `dist/dedoomify-extension-1.0.0.zip`.
3. **Store listing:** paste the description, pick the category and English, then upload `icons/chrome-store-128.png`, the three screenshots, `promo-440x280.png` and, optionally, `marquee-1400x560.png`. Homepage URL: https://dedoomify.com.
4. **Privacy:** paste the single purpose and the two permission justifications, answer No for remote code, tick no data types, certify the three statements, and enter https://dedoomify.com/privacy.html.
5. **Distribution:** Free, Public, all regions.
6. Click **Submit for review**. Reviews usually take a few days; you get an email when it's live.

## Microsoft Edge Add-ons

1. Register (free) at https://partner.microsoft.com/dashboard/microsoftedge/overview with a Microsoft account, as an individual.
2. Click **Create new extension** and upload the same zip.
3. **Availability:** Public, all markets.
4. **Properties:** category Productivity, privacy policy URL https://dedoomify.com/privacy.html, website https://dedoomify.com, support contact https://github.com/akspad/dedoomify/issues. Answer No to mature content.
5. **Store listings → English:** paste the description, upload `icons/edge-logo-300.png`, `promo-440x280.png` and the three screenshots. Short description: the summary above.
6. **Submit**, pasting the reviewer notes into **Notes for certification**. Reviews take up to seven business days.

## Safari (Mac App Store)

Safari extensions ship inside a small Mac app, so this needs a Mac with Xcode and a paid Apple Developer membership.

1. Join the Apple Developer Program ($99 a year) at https://developer.apple.com/programs/enroll/ and sign in to Xcode with that Apple ID (**Xcode → Settings → Accounts**).
2. In a checkout of this repo on the Mac, run `npm run build:safari`. It builds the extension, generates the Xcode project in `dist/safari/`, sets the app icon, and opens it.
3. In Xcode, select the project in the sidebar. For both the **dedoomify** and **dedoomify Extension** targets, open **Signing & Capabilities** and choose your team. On the dedoomify target's **General** tab, set **App Category** to News.
4. Try it: press Run, then in Safari open **Settings → Extensions** and turn on dedoomify. Open an article and click the button.
5. In App Store Connect (https://appstoreconnect.apple.com), choose **Apps → + → New App**: platform macOS, name dedoomify, bundle ID `com.dedoomify.dedoomify`, SKU `dedoomify`. If the bundle ID isn't in the list yet, do step 6 first; Xcode registers it.
6. Back in Xcode, choose **Product → Archive**, then **Distribute App → App Store Connect → Upload**.
7. In App Store Connect, fill in the macOS version page: the subtitle, description, keywords, support URL https://dedoomify.com, the three screenshots, and the build you uploaded. Under **App Privacy**, add https://dedoomify.com/privacy.html and choose **Data Not Collected**. Set the price to Free, complete the age rating (all answers None), paste the reviewer notes, and click **Add for Review** then **Submit**. Reviews usually take a day or two.
