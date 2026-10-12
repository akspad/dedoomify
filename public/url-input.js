// Keep URL selection separate from native focus/keyboard scrolling on phones.
export function attachUrlInput(input, view = window) {
  let selectOnClick = false;
  let frame = null;
  let keyboardTimer = null;

  function update() {
    frame = null;
    if (view.document.activeElement !== input) return;
    // Let the browser's focus action run before selecting for keyboard users.
    if (selectOnClick) input.select();
    const viewport = view.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const height = viewport?.height ?? view.innerHeight;
    if (height <= 0) return;
    const bottom = top + height;
    const box = input.getBoundingClientRect();
    const gap = 16;
    if (box.bottom > bottom - gap) {
      view.scrollBy({ top: box.bottom - bottom + gap, behavior: "instant" });
    } else if (box.top < top + gap) {
      view.scrollBy({ top: box.top - top - gap, behavior: "instant" });
    }
  }

  function queueUpdate() {
    if (frame === null) frame = view.requestAnimationFrame(update);
  }

  input.addEventListener("focus", () => {
    selectOnClick = true;
    queueUpdate();
    // Recheck after the keyboard animation, including browsers with late
    // visual-viewport updates. The callback never refocuses the input.
    view.clearTimeout(keyboardTimer);
    keyboardTimer = view.setTimeout(queueUpdate, 350);
  });
  input.addEventListener("click", () => {
    if (!selectOnClick) return;
    selectOnClick = false;
    input.select();
    queueUpdate();
  });
  for (const type of ["keydown", "input"]) {
    input.addEventListener(type, () => { selectOnClick = false; });
  }
  input.addEventListener("blur", () => {
    selectOnClick = false;
    view.clearTimeout(keyboardTimer);
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
  });
  // Only react to resizing, so ordinary user scrolling is never pulled back.
  view.visualViewport?.addEventListener("resize", queueUpdate);
  view.addEventListener("resize", queueUpdate);
}
