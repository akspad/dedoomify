// Injected into the current tab by the popup, after dedoom-core.js.
// Rewrites text nodes in place, marks each change, and returns
// { added, total }: phrases changed this time and on the page so far.
(function () {
  "use strict";
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1, SVG: 1, MATH: 1 };
  var root = document.body;
  if (!root || !window.Dedoom) return { added: 0, total: 0 };
  var added = 0;

  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      var parent = node.parentElement;
      if (!parent || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[contenteditable=''], [contenteditable='true'], mark.dedoomify, .dedoomify-tip")) return NodeFilter.FILTER_REJECT;
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
        added++;
      }
    });
    node.parentNode.replaceChild(frag, node);
  });

  document.documentElement.classList.add("dedoomify-show");

  // The hover card with the original words, like the one on dedoomify.com.
  // Added once per page.
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

    var active = null;
    var find = function (target) {
      return target && target.closest ? target.closest("mark.dedoomify") : null;
    };
    var hide = function () {
      if (active) active.classList.remove("dedoomify-active");
      active = null;
      tip.style.display = "none";
    };
    var show = function (mark) {
      if (active === mark) return;
      hide();
      if (!document.documentElement.classList.contains("dedoomify-show")) return;
      active = mark;
      mark.classList.add("dedoomify-active");
      text.textContent = "“" + mark.getAttribute("data-was").replace(/\s+/g, " ").trim() + "”";
      tip.style.display = "block";
      // The first line box, so a highlight that wraps gets the card by its start.
      var r = mark.getClientRects()[0] || mark.getBoundingClientRect();
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var center = r.left + r.width / 2;
      var left = Math.min(Math.max(center - w / 2, 8), window.innerWidth - w - 8);
      var top = r.top - h - 10;
      var place = "above";
      if (top < 8) {
        top = r.bottom + 10;
        place = "below";
      }
      tip.setAttribute("data-place", place);
      tip.style.left = left + "px";
      tip.style.top = top + "px";
      tip.style.setProperty("--dedoomify-arrow-x", Math.min(Math.max(center - left, 14), w - 14) + "px");
    };
    document.addEventListener("mouseover", function (e) {
      var mark = find(e.target);
      if (mark) show(mark);
    });
    document.addEventListener("mouseout", function (e) {
      var mark = find(e.target);
      if (mark && mark === active && !mark.contains(e.relatedTarget)) hide();
    });
    // Touch screens have no hover, so a tap shows it too.
    document.addEventListener("click", function (e) {
      var mark = find(e.target);
      if (mark) show(mark);
      else hide();
    });
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("resize", hide, { passive: true });
  }

  return { added: added, total: document.querySelectorAll("mark.dedoomify").length };
})();
