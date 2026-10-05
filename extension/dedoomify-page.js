// The page rewriter, shared by the popup's button (content.js) and automatic
// mode (auto.js). Runs in the extension's isolated world after dedoom-core.js.
(function (root) {
  "use strict";

  // Automatic mode's check: does this text talk about AI, and would the
  // phrase rules change it? The rules skip any phrase whose key word isn't in
  // the text, so a page is judged in a few milliseconds at most. The short
  // forms of "AI" must be capitalised, since "ai" turns up inside ordinary words.
  var AI_SHORT = /\b(?:AI|AGI|LLMs?)\b|\bA\.I\.(?=\s|$|[,:;]|-(?:powered|driven|based|enabled|controlled)\b)/;
  var AI_LONG = /artificial[ -]+intelligence|chatbot|language model|superintelligen|machine learning|neural net|\bGPT|OpenAI|Anthropic|DeepMind/i;

  function looksDoomy(text) {
    if (!text || (!AI_SHORT.test(text) && !AI_LONG.test(text))) return false;
    return root.Dedoom.hasDoom(text);
  }

  // Title, description and the start of the article: enough to judge a page
  // without reading all of it. textContent doesn't trigger layout.
  function pageSample(doc) {
    var meta = doc.querySelector('meta[name="description"], meta[property="og:description"]');
    var main = doc.querySelector("article, main, [role=main]") || doc.body;
    var text = main ? main.textContent : "";
    return (doc.title || "") + "\n" + (meta ? meta.getAttribute("content") || "" : "") + "\n" + text.slice(0, 30000);
  }

  // Rewrites text nodes in place and marks each change. Returns
  // { added, total }: phrases changed this time and on the page so far.
  function run() {
    var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1, TEMPLATE: 1, SVG: 1, MATH: 1, Q: 1, BLOCKQUOTE: 1 };
    var blockSelector = "address, article, aside, blockquote, button, caption, dd, details, dialog, div, dl, dt, fieldset, figcaption, figure, footer, form, h1, h2, h3, h4, h5, h6, header, hgroup, hr, label, legend, li, main, menu, nav, ol, p, pre, section, summary, table, tbody, td, tfoot, th, thead, tr, ul";
    function protectedElement(node) {
      return node.nodeType === 1 && (SKIP[node.tagName.toUpperCase()] || node.matches("[contenteditable=''], [contenteditable='true'], mark.dedoomify, .dedoomify-tip"));
    }
    var body = document.body;
    if (!body || !root.Dedoom) return { added: 0, total: 0 };
    var added = 0;
    // Read computed styles once, before any DOM writes. Display-hidden
    // ancestors suppress their whole subtree; visibility can be overridden by
    // a visible descendant, so check it on each text node's own parent.
    var styles = new WeakMap(), displayStates = new WeakMap();
    function styleOf(el) {
      if (!styles.has(el)) styles.set(el, window.getComputedStyle ? window.getComputedStyle(el) : el.style);
      return styles.get(el);
    }
    function displayHidden(el) {
      var path = [], current = el;
      while (current && !displayStates.has(current)) { path.push(current); current = current.parentElement; }
      var hidden = current ? displayStates.get(current) : false;
      for (var i = path.length - 1; i >= 0; i--) {
        var node = path[i], style = styleOf(node);
        hidden = hidden || node.hasAttribute("hidden") || style.display === "none" || style.contentVisibility === "hidden";
        displayStates.set(node, hidden);
      }
      return !!displayStates.get(el);
    }
    function visibilityHidden(el) { return /^(hidden|collapse)$/.test(styleOf(el).visibility); }
    function cssBlock(el) { return /^(?:block(?:\s|$)|flow-root$|list-item$|flex$|grid$|table(?:$|-))/.test(styleOf(el).display); }
    function flowOwner(el) {
      while (el && el !== body) {
        if (el.matches(blockSelector) || cssBlock(el)) return el;
        el = el.parentElement;
      }
      return body;
    }
    function renderedText(el) {
      var stack = [el], text = [];
      while (stack.length) {
        var node = stack.pop();
        if (node.renderedBreak) { text.push("\u2029"); continue; }
        if (node.nodeType === 3) {
          if (!displayHidden(node.parentElement) && !visibilityHidden(node.parentElement)) text.push(node.nodeValue);
        } else if (node.nodeType === 1 && !displayHidden(node)) {
          if (node.tagName.toUpperCase() === "BR") { text.push("\u2029"); continue; }
          var block = node !== el && (node.matches(blockSelector) || cssBlock(node));
          if (block) { text.push("\u2029"); stack.push({ renderedBreak: true }); }
          for (var child = node.lastChild; child; child = child.previousSibling) stack.push(child);
        }
      }
      return text.join("");
    }

    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (node) {
        var element = node.nodeType === 1 ? node : node.parentElement;
        if (displayHidden(element) || (node.nodeType === 3 && visibilityHidden(element))) return NodeFilter.FILTER_REJECT;
        if (node.nodeType === 1 && node.tagName.toUpperCase() !== "BR" && !node.matches(blockSelector) && !cssBlock(node) && !protectedElement(node)) return NodeFilter.FILTER_SKIP;
        var parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // Whitespace-only nodes separate inline words and count toward quote
        // offsets, even though they never produce a rewrite themselves.
        if (parent.closest("[hidden], [contenteditable=''], [contenteditable='true'], mark.dedoomify, .dedoomify-tip")) return NodeFilter.FILTER_REJECT;
        for (var el = parent; el; el = el.parentElement) {
          if (SKIP[el.tagName.toUpperCase()]) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    var nodes = [], groups = [], previousOwner = null, previousFlowOwner = null, breakPending = false, currentGroup;
    while (walker.nextNode()) {
      var node = walker.currentNode;
      // Entering a rendered block ends the preceding text run, including
      // empty blocks. Do not merge runs that revisit the same parent later.
      var protectedNode = protectedElement(node);
      // Invisible script/style/template contents supply no rendered context.
      if (protectedNode && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(node.tagName.toUpperCase())) continue;
      if (node.nodeType === 1 && node.tagName.toUpperCase() !== "BR" && !protectedNode) {
        if (node.matches(blockSelector)) { previousOwner = null; previousFlowOwner = null; }
        else if (cssBlock(node)) breakPending = true;
        continue;
      }
      var owner = protectedNode && node.matches(blockSelector) ? node : node.parentElement.closest(blockSelector) || body;
      var flow = protectedNode && cssBlock(node) ? node : flowOwner(node.parentElement);
      if (owner !== previousOwner) {
        currentGroup = [];
        groups.push(currentGroup);
        previousOwner = owner;
      } else if (breakPending || flow !== previousFlowOwner) {
        // Keep CSS-induced breaks within the logical paragraph so quotations
        // spanning a styled block retain their opening and closing delimiters.
        currentGroup.push({ node: null, text: "\u2029" });
      }
      breakPending = false;
      previousFlowOwner = flow;
      // A br is a rendered separator without a text node. Keep a virtual
      // paragraph separator, with its own offset but no DOM rewrite target.
      var textNode = node.nodeType === 3;
      if (textNode) nodes.push(node);
      // Keep skipped rendered content as virtual, immutable context. Its
      // punctuation and quotes must still delimit the neighboring prose.
      var contextText = textNode ? node.nodeValue : protectedNode ? renderedText(node) : "\u2029";
      if (protectedNode && node.tagName.toUpperCase() === "Q") contextText = "“" + contextText + "”";
      currentGroup.push({ node: textNode ? node : null, text: contextText });
    }

    // Quote marks and explicit human actors can sit in adjacent inline nodes.
    // Compute protected spans over the whole paragraph before rewriting any
    // node; otherwise <em>is misaligned</em> inside speech lost its quotes.
    var protectedParts = new WeakMap();
    groups.forEach(function (group) {
      var raw = group.map(function (part) { return part.text; }).join("");
      var ranges = [], offset = 0;
      root.Dedoom.dedoomSegments(raw).forEach(function (seg) {
        var length = seg.original === undefined ? seg.text.length : seg.original.length;
        if (seg.protected) ranges.push({ start: offset, end: offset + length });
        offset += length;
      });
      var start = 0, rangeIndex = 0;
      group.forEach(function (part) {
        var end = start + part.text.length, parts = [], at = 0;
        if (!part.node) { start = end; return; }
        var node = part.node;
        while (rangeIndex < ranges.length && ranges[rangeIndex].end <= start) rangeIndex++;
        for (var i = rangeIndex; i < ranges.length && ranges[i].start < end; i++) {
          var lo = Math.max(start, ranges[i].start) - start;
          var hi = Math.min(end, ranges[i].end) - start;
          if (lo > at) parts.push({ text: node.nodeValue.slice(at, lo) });
          parts.push({ text: node.nodeValue.slice(lo, hi), protected: true });
          at = hi;
        }
        if (at < node.nodeValue.length) parts.push({ text: node.nodeValue.slice(at) });
        protectedParts.set(node, parts);
        start = end;
      });
    });

    nodes.forEach(function (node) {
      var segments = [];
      protectedParts.get(node).forEach(function (part) {
        if (part.protected) segments.push(part);
        else root.Dedoom.dedoomSegments(part.text).forEach(function (seg) { segments.push(seg); });
      });
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

    if (!document.querySelector("mark.dedoomify")) return { added: 0, total: 0 };
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
  }

  root.DedoomifyPage = { looksDoomy: looksDoomy, pageSample: pageSample, run: run };
})(typeof globalThis !== "undefined" ? globalThis : this);
