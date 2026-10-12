// Keep URL selection separate from native focus/keyboard scrolling on phones.
export function attachUrlInput(input, view = window) {
  let selectOnClick = false;
  let frame = null;
  let keyboardTimer = null;

  function updateVisibility() {
    keyboardTimer = null;
    if (view.document.activeElement !== input) return;
    const viewport = view.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const height = viewport?.height ?? view.innerHeight;
    if (height <= 0) return;
    const bottom = top + height;
    const box = input.getBoundingClientRect();
    const gap = 16;
    // Leave native keyboard scrolling alone when it already reveals the field,
    // even if it places the field close to the viewport edge.
    if (box.bottom > bottom) {
      view.scrollBy({ top: box.bottom - bottom + gap, behavior: "instant" });
    } else if (box.top < top) {
      view.scrollBy({ top: box.top - top - gap, behavior: "instant" });
    }
  }

  function queueVisibility(delay = 150) {
    if (view.document.activeElement !== input) return;
    view.clearTimeout(keyboardTimer);
    keyboardTimer = view.setTimeout(updateVisibility, delay);
  }

  input.addEventListener("focus", () => {
    selectOnClick = true;
    // Select after native focus, separately from keyboard visibility updates.
    frame = view.requestAnimationFrame(() => {
      frame = null;
      if (selectOnClick && view.document.activeElement === input) input.select();
    });
    // Give native scrolling time to finish. Resizes restart this single check,
    // avoiding incremental corrections throughout the keyboard animation.
    queueVisibility(350);
  });
  input.addEventListener("click", () => {
    if (!selectOnClick) return;
    selectOnClick = false;
    input.select();
  });
  for (const type of ["keydown", "input"]) {
    input.addEventListener(type, () => { selectOnClick = false; });
  }
  input.addEventListener("blur", () => {
    selectOnClick = false;
    view.clearTimeout(keyboardTimer);
    keyboardTimer = null;
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
  });
  // Only react to resizing, so ordinary user scrolling is never pulled back.
  view.visualViewport?.addEventListener("resize", () => queueVisibility());
  view.addEventListener("resize", () => queueVisibility());
}
