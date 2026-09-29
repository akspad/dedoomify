// The hover card that shows what a highlighted phrase said before dedoomify
// changed it. One card serves the reader view and the page frame: the frame's
// document is same-origin, so its events are handled here and the card is
// drawn on top of it, where the frame can't clip it.

const SELECTOR = "mark.dd, del.dd";
const tip = document.createElement("div");
tip.className = "dd-tip";
tip.setAttribute("role", "tooltip");
tip.hidden = true;
const label = document.createElement("span");
label.className = "dd-tip-label";
const text = document.createElement("span");
text.className = "dd-tip-text";
tip.append(label, text);
document.body.appendChild(tip);

let active = null;

function describe(change) {
  const was = (change.getAttribute("data-was") || "").replace(/\s+/g, " ").trim();
  if (change.tagName.toUpperCase() === "DEL") return ["Removed by dedoomify", was];
  if (!was) return ["Added by dedoomify", change.textContent.trim()];
  return ["Original text", was];
}

export function hide() {
  if (active) active.classList.remove("dd-active");
  active = null;
  tip.hidden = true;
}

export function show(change, frame) {
  if (active === change) return;
  hide();
  const [heading, body] = describe(change);
  label.textContent = heading;
  text.textContent = `“${body}”`;
  active = change;
  change.classList.add("dd-active");
  tip.hidden = false;

  // The first line box, so a highlight that wraps gets the card by its start.
  const r = change.getClientRects()[0] || change.getBoundingClientRect();
  let ox = 0, oy = 0;
  if (frame) {
    const fr = frame.getBoundingClientRect();
    ox = fr.left + frame.clientLeft;
    oy = fr.top + frame.clientTop;
  }
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const center = ox + r.left + r.width / 2;
  const left = Math.min(Math.max(center - w / 2, 8), window.innerWidth - w - 8);
  let top = oy + r.top - h - 10;
  let place = "above";
  if (top < 8) {
    top = oy + r.bottom + 10;
    place = "below";
  }
  tip.dataset.place = place;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.setProperty("--arrow-x", `${Math.min(Math.max(center - left, 14), w - 14)}px`);
}

// Show the card for changes in `doc` (the page, or the frame's document).
// `enabled()` says whether highlights are currently on.
export function attach(doc, { frame = null, enabled = () => true } = {}) {
  const find = (target) => (target && target.closest ? target.closest(SELECTOR) : null);
  doc.addEventListener("mouseover", (e) => {
    const change = find(e.target);
    if (change && enabled()) show(change, frame);
  });
  doc.addEventListener("mouseout", (e) => {
    const change = find(e.target);
    if (change && change === active && !change.contains(e.relatedTarget)) hide();
  });
  // Touch screens have no hover, so a tap shows it too.
  doc.addEventListener("click", (e) => {
    const change = find(e.target);
    if (change && enabled()) show(change, frame);
    else hide();
  });
  doc.addEventListener("scroll", hide, { capture: true, passive: true });
}

window.addEventListener("scroll", hide, { passive: true });
window.addEventListener("resize", hide);
