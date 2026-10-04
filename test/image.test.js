import test from "node:test";
import assert from "node:assert/strict";
import { fetchImage } from "../lib/fetch-article.js";
import handler from "../api/image.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=", "base64");

test("image fetch rejects private, encoded loopback and tunnel destinations", async () => {
  for (const url of ["http://127.1/a", "http://2130706433/a", "http://0x7f000001/a", "http://[::ffff:7f00:1]/a", "http://[64:ff9b::7f00:1]/a", "http://localhost/a"]) {
    await assert.rejects(fetchImage(url, () => { throw new Error("must not connect"); }), /publicly reachable/, url);
  }
});

test("image fetch checks each redirect and never serves SVG, HTML or huge images", async () => {
  await assert.rejects(fetchImage("http://93.184.216.34/a", async () => new Response(null, { status: 302, headers: { location: "http://192.168.1.1/admin" } })), /publicly reachable/);
  for (const type of ["image/svg+xml", "text/html", "application/xml", "image/png-junk"]) {
    await assert.rejects(fetchImage("http://93.184.216.34/a", async () => new Response("<svg></svg>", { headers: { "content-type": type } })), /supported image/);
  }
  await assert.rejects(fetchImage("http://93.184.216.34/a", async () => new Response(Buffer.alloc(2 * 1024 * 1024 + 1), { headers: { "content-type": "image/png" } })), /too big/);
  const result = await fetchImage("http://93.184.216.34/a", async () => new Response(png, { headers: { "content-type": "image/png" } }));
  assert.deepEqual(result.body, png);
});

test("image endpoint sends inert cached bytes and no redirects to third parties", async () => {
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
  await handler({ method: "GET", url: "/api/image?url=https://example.com/a" }, response, { fetchImage: async () => ({ body: png, contentType: "image/png" }) });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "image/png");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.match(response.headers["content-security-policy"], /sandbox/);
  assert.deepEqual(response.body, png);
});

test("image fetch advertises the supported image representations", async () => {
  await fetchImage("http://93.184.216.34/a", async (_url, options) => {
    assert.match(options.headers.accept, /image\/png/);
    assert.doesNotMatch(options.headers.accept, /text\/html/);
    return new Response(png, { headers: { "content-type": "image/png" } });
  });
});

test("image proxy rejects special-purpose literals and redirects before connecting", async () => {
  for (const url of ["http://192.0.0.1/x", "http://192.88.99.1/x", "http://[2001:db8::1]/x", "http://[3fff::1]/x"]) {
    await assert.rejects(fetchImage(url, () => { throw new Error("must not connect"); }), /publicly reachable/);
    await assert.rejects(fetchImage("http://93.184.216.34/a", async () => new Response(null, { status: 302, headers: { location: url } })), /publicly reachable/);
  }
});
