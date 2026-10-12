import test from "node:test";
import assert from "node:assert/strict";
import { attachUrlInput } from "../public/url-input.js";

function browser({ top = 600, height = 800, offsetTop = 0, visual = true, value = "https://example.com/article" } = {}) {
  const frames = new Map(), timers = new Map(), scrolls = [];
  let next = 0, now = 0, selections = 0;
  const view = new EventTarget();
  view.document = { activeElement: null };
  view.innerHeight = height;
  if (visual) view.visualViewport = Object.assign(new EventTarget(), { height, offsetTop });
  view.requestAnimationFrame = (callback) => { frames.set(++next, callback); return next; };
  view.cancelAnimationFrame = (id) => frames.delete(id);
  view.setTimeout = (callback, delay) => { timers.set(++next, { callback, at: now + delay }); return next; };
  view.clearTimeout = (id) => timers.delete(id);
  view.scrollBy = (options) => { scrolls.push(options); top -= options.top; };
  const input = new EventTarget();
  input.value = value;
  input.selectionStart = input.selectionEnd = 0;
  input.select = () => { selections++; input.selectionStart = 0; input.selectionEnd = input.value.length; };
  input.getBoundingClientRect = () => ({ top, bottom: top + 50 });
  attachUrlInput(input, view);
  const emit = (type) => input.dispatchEvent(new Event(type));
  const focus = () => { view.document.activeElement = input; emit("focus"); };
  const blur = () => { view.document.activeElement = null; emit("blur"); };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); };
  const advance = (ms) => {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
    flush();
  };
  const finishKeyboard = () => advance(400);
  const resize = (newHeight) => {
    const target = view.visualViewport || view;
    if (view.visualViewport) target.height = newHeight;
    else view.innerHeight = newHeight;
    target.dispatchEvent(new Event("resize"));
    flush();
  };
  return { input, view, emit, focus, blur, flush, advance, finishKeyboard, resize, scrolls,
    selections: () => selections, nativeScroll: (delta) => { top -= delta; } };
}

test("a keyboard covering the selected URL scrolls it fully above the keyboard", () => {
  const b = browser();
  b.focus(); b.emit("click"); b.flush();
  assert.equal(b.scrolls.length, 0);
  b.resize(400);
  b.finishKeyboard();
  assert.equal(b.scrolls[0].top, 266);
  assert.equal(b.input.getBoundingClientRect().bottom, 384);
  assert.equal(b.input.selectionStart, 0);
  assert.equal(b.input.selectionEnd, b.input.value.length);
  b.resize(350);
  b.finishKeyboard();
  assert.equal(b.input.getBoundingClientRect().bottom, 334);
});

test("native focus runs before selection, and later caret editing stays intact", () => {
  const b = browser({ top: 100 });
  b.focus();
  assert.equal(b.input.selectionEnd, 0);
  b.flush();
  assert.equal(b.input.selectionEnd, b.input.value.length);
  b.emit("click");
  // The browser places the caret on the next click into the focused input.
  b.input.selectionStart = b.input.selectionEnd = 8;
  b.emit("click"); b.emit("keydown");
  b.resize(200); b.finishKeyboard();
  assert.equal(b.input.selectionStart, 8);
  assert.equal(b.input.selectionEnd, 8);
  assert.equal(b.scrolls.length, 0);
});

test("a panned visual viewport uses its top offset rather than layout height", () => {
  const b = browser({ top: 480, height: 350, offsetTop: 100 });
  b.focus(); b.emit("click"); b.flush(); b.finishKeyboard();
  assert.equal(b.input.getBoundingClientRect().bottom, 434);
  assert.equal(b.scrolls[0].top, 96);
  const above = browser({ top: 50, height: 350, offsetTop: 100 });
  above.focus(); above.flush(); above.finishKeyboard();
  assert.equal(above.input.getBoundingClientRect().top, 116);
});

test("the delayed check handles keyboard geometry arriving without a resize event", () => {
  const b = browser();
  b.focus(); b.emit("click"); b.flush();
  b.view.visualViewport.height = 400;
  b.finishKeyboard();
  assert.equal(b.input.getBoundingClientRect().bottom, 384);
});

test("blur cancels pending work and user scrolling does not trigger correction", () => {
  const b = browser({ height: 400 });
  b.focus(); b.blur(); b.flush(); b.finishKeyboard(); b.resize(300);
  assert.equal(b.scrolls.length, 0);
  const focused = browser();
  focused.focus(); focused.emit("click"); focused.flush();
  focused.view.visualViewport.dispatchEvent(new Event("scroll")); focused.flush();
  assert.equal(focused.scrolls.length, 0);
});

test("empty inputs and browsers without visualViewport retain normal focus", () => {
  const b = browser({ visual: false, value: "" });
  b.focus(); b.flush(); b.resize(400); b.finishKeyboard();
  assert.equal(b.input.getBoundingClientRect().bottom, 384);
  assert.equal(b.input.selectionStart, 0);
  assert.equal(b.input.selectionEnd, 0);
});

test("keyboard animation produces one correction after the last viewport resize", () => {
  const b = browser();
  b.focus(); b.emit("click"); b.flush();
  b.resize(600); b.advance(100);
  b.resize(500); b.advance(100);
  b.resize(400);
  // Some browsers also emit a window resize for the same viewport change.
  b.view.dispatchEvent(new Event("resize"));
  b.advance(149);
  assert.equal(b.scrolls.length, 0);
  b.advance(1);
  assert.deepEqual(b.scrolls, [{ top: 266, behavior: "instant" }]);
  b.advance(400);
  assert.equal(b.scrolls.length, 1);
  assert.equal(b.selections(), 1);
});

test("native keyboard scrolling that reveals the field needs no extra nudge", () => {
  const b = browser();
  b.focus(); b.emit("click"); b.flush();
  b.resize(400);
  // Native focus places the field just above the keyboard, inside the old gap.
  b.nativeScroll(255);
  b.finishKeyboard();
  assert.equal(b.input.getBoundingClientRect().bottom, 395);
  assert.equal(b.scrolls.length, 0);
});

test("viewport changes do not reselect text after keyboard focus", () => {
  const b = browser({ top: 100 });
  b.focus(); b.flush();
  assert.equal(b.selections(), 1);
  b.resize(400); b.finishKeyboard();
  b.resize(350); b.finishKeyboard();
  assert.equal(b.selections(), 1);
  assert.equal(b.input.selectionEnd, b.input.value.length);
});
