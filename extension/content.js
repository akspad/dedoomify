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
        mark.title = "Was: " + seg.original;
        mark.textContent = seg.text;
        frag.appendChild(mark);
        count++;
      }
    });
    node.parentNode.replaceChild(frag, node);
  });

  return count;
})();
