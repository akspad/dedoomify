import test from "node:test";
import assert from "node:assert/strict";
import { rewriteCss, resourceUrl } from "../lib/page-css.js";

const base = "https://example.com/css/main.css";
const proxy = (url) => "/api/image?asset=1&url=" + encodeURIComponent(url);

test("CSS retains responsive layout, custom properties and nested rules", () => {
  const css = rewriteCss(':root{--color:#123;--bg:url(bg.png)}@layer layout{@media(min-width:768px){.story[data-scope]{display:grid;grid-template-columns:2fr 1fr;color:var(--color);background:var(--bg)}}}', base);
  assert.match(css, /--color:#123/);
  assert.match(css, /grid-template-columns:2fr 1fr/);
  assert.match(css, /@layer layout/);
  assert.match(css, /@media/);
  assert.ok(css.includes(proxy("https://example.com/css/bg.png")));
});

test("CSS proxies imports, image sets, font functions and escaped resource identifiers", () => {
  const inputs = [
    '@import "extra.css" screen;',
    String.raw`@\69mport 'extra.css';`,
    String.raw`p{background:u\72l('extra.css')}`,
    String.raw`p{background:image-s\65t('extra.css' 1x)}`,
    '@font-face{font-family:News;src:src("extra.css")}',
    'p{background:image("extra.css",red)}',
    'p{background:-webkit-image-set("extra.css" 1x)}',
  ];
  for (const source of inputs) assert.ok(rewriteCss(source, base).includes(proxy("https://example.com/css/extra.css")), source);
});

test("unsafe schemes and credentials cannot become browser resource destinations", () => {
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,active", "https://name:secret@example.com/a"]) {
    assert.equal(resourceUrl(url, base), "");
    const css = rewriteCss('p{background:url("' + url + '")}', base);
    assert.ok(!css.includes(url), css);
  }
  assert.equal(resourceUrl("#icon", base), "#icon");
  assert.equal(resourceUrl("data:image/png;base64,iVBORw0KGgo=", base), "data:image/png;base64,iVBORw0KGgo=");
});

test("style element serialization cannot introduce HTML tags", () => {
  const css = rewriteCss('p::before{content:"</style><script>alert(1)</script>"}', base);
  assert.ok(!css.includes("<"));
  assert.ok(css.includes("\\3c "));
});
