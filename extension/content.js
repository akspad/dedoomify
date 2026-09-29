// Injected into the current tab by the popup, after dedoom-core.js.
// Rewrites text nodes in place and returns how many phrases changed.
(function () {
  "use strict";
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1, SVG: 1, MATH: 1 };
  var count = 0;
  var root = document.body;
  if (!root || !window.Dedoom) return 0;

  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      var parent = node.parentElement;
      if (!parent || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[contenteditable=''], [contenteditable='true'], mark.dedoomify")) return NodeFilter.FILTER_REJECT;
      for (var el = parent; el; el = el.parentElement) {
        if (SKIP[el.tagName.toUpperCase()]) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  var nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(function (node) {
    var segments = window.Dedoom.dedoomSegments(node.nodeValue);
    if (!segments.some(function (s) { return s.original !== undefined; })) return;
    var frag = document.createDocumentFragment();
    segments.forEach(function (seg) {
      if (seg.original === undefined) {
        frag.appendChild(document.createTextNode(seg.text));
      } else {
        var mark = document.createElement("mark");
        mark.className = "dedoomify";
        mark.setAttribute("data-was", seg.original);
        mark.textContent = seg.text;
        frag.appendChild(mark);
        count++;
      }
    });
    node.parentNode.replaceChild(frag, node);
  });

  // A hover card with the original words, added once per page.
  if (!window.__dedoomifyTip) {
    var tip = document.createElement("div");
    tip.className = "dedoomify-tip";
    tip.setAttribute("role", "tooltip");
    var label = document.createElement("span");
    label.className = "dedoomify-tip-label";
    label.textContent = "Original text";
    var text = document.createElement("span");
    text.className = "dedoomify-tip-text";
    tip.appendChild(label);
    tip.appendChild(text);
    document.documentElement.appendChild(tip);
    window.__dedoomifyTip = tip;
    var hide = function () { tip.style.display = "none"; };
    document.addEventListener("mouseover", function (e) {
      var mark = e.target.closest && e.target.closest("mark.dedoomify");
      if (!mark) return;
      text.textContent = "\u201c" + mark.getAttribute("data-was").replace(/\s+/g, " ").trim() + "\u201d";
      tip.style.display = "block";
      var r = mark.getClientRects()[0] || mark.getBoundingClientRect();
      var left = Math.min(Math.max(r.left + r.width / 2 - tip.offsetWidth / 2, 8), window.innerWidth - tip.offsetWidth - 8);
      var top = r.top - tip.offsetHeight - 10;
      if (top < 8) top = r.bottom + 10;
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    });
    document.addEventListener("mouseout", function (e) {
      var mark = e.target.closest && e.target.closest("mark.dedoomify");
      if (mark && !mark.contains(e.relatedTarget)) hide();
    });
    window.addEventListener("scroll", hide, { passive: true });
  }

  return count;
})();
