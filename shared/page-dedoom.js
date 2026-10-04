/*
 * page-dedoom.js: rewrites a whole web page in place while keeping its markup,
 * so the page looks like the original with only the changed words marked.
 *
 * Like dedoom-core.js this is a plain script that attaches `DedoomPage` to the
 * global object. The server uses it (with linkedom) to apply the phrase rules,
 * and the browser uses it to apply the on-device model's rewrites.
 *
 * A page's text is split into groups: the runs of text nodes that read as one
 * paragraph, even when inline tags like <a> or <em> split them. Each edit is a
 * { start, end, text, original } range over a group's joined text, and becomes
 * <mark class="dd" data-was="original">text</mark>, or <del class="dd"> when
 * the new text is empty.
 */
(function (root) {
  "use strict";

  // Text inside these is never rewritten.
  var SKIP = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1,
    CODE: 1, PRE: 1, KBD: 1, SAMP: 1, SVG: 1, MATH: 1, TITLE: 1, IFRAME: 1,
    Q: 1, BLOCKQUOTE: 1,
  };
  // Entering or leaving one of these starts a new group.
  var BLOCK = {};
  ("ADDRESS ARTICLE ASIDE BLOCKQUOTE BODY BR BUTTON CAPTION DD DETAILS DIALOG DIV DL DT FIELDSET " +
    "FIGCAPTION FIGURE FOOTER FORM H1 H2 H3 H4 H5 H6 HEADER HGROUP HR IMG LABEL LEGEND LI MAIN MENU " +
    "NAV OL P PRE SECTION SUMMARY TABLE TBODY TD TFOOT TH THEAD TR UL")
    .split(" ")
    .forEach(function (tag) {
      BLOCK[tag] = 1;
    });

  function isChange(el) {
    return el && el.nodeType === 1 && /^(MARK|DEL)$/i.test(el.tagName) && el.hasAttribute("data-was");
  }

  // Returns an array of groups; each group is an array of text nodes.
  function collectGroups(rootEl) {
    var groups = [];
    var current = null;
    function visit(node) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3) {
          if (!current) {
            current = [];
            groups.push(current);
          }
          current.push(child);
        } else if (child.nodeType === 1) {
          var tag = String(child.tagName).toUpperCase();
          var block = BLOCK[tag];
          if (block) current = null;
          if (!SKIP[tag] && child.getAttribute("contenteditable") == null) visit(child);
          if (block) current = null;
        }
      }
    }
    if (rootEl) visit(rootEl);
    return groups.filter(function (nodes) {
      return /\S/.test(groupText(nodes));
    });
  }

  function groupText(nodes) {
    return nodes
      .map(function (n) {
        return n.nodeValue;
      })
      .join("");
  }

  // The group's text before any changes (`original`) and as shown (`current`).
  function groupStrings(nodes) {
    var original = "";
    var current = "";
    var seen = [];
    nodes.forEach(function (n) {
      var parent = n.parentNode;
      if (isChange(parent)) {
        if (seen.indexOf(parent) >= 0) return;
        seen.push(parent);
        original += parent.getAttribute("data-was");
        if (/^MARK$/i.test(parent.tagName)) current += parent.textContent;
      } else {
        original += n.nodeValue;
        current += n.nodeValue;
      }
    });
    return { original: original, current: current };
  }

  // Undo earlier changes in a group. Returns the group's new text nodes.
  function restoreGroup(nodes, doc) {
    var out = [];
    nodes.forEach(function (n) {
      var parent = n.parentNode;
      if (isChange(parent)) {
        var text = doc.createTextNode(parent.getAttribute("data-was"));
        parent.parentNode.replaceChild(text, parent);
        out.push(text);
      } else {
        out.push(n);
      }
    });
    return out;
  }

  function changeElement(doc, edit) {
    var el;
    if (edit.text) {
      el = doc.createElement("mark");
      el.textContent = edit.text;
    } else {
      el = doc.createElement("del");
      el.textContent = edit.original;
    }
    el.setAttribute("class", "dd");
    el.setAttribute("data-was", edit.original);
    return el;
  }

  // Apply non-overlapping edits (sorted by start) to a group's text nodes.
  // Working from the last edit back keeps earlier offsets valid.
  function applyEdits(nodes, edits, doc) {
    var starts = [];
    var total = 0;
    nodes.forEach(function (n) {
      starts.push(total);
      total += n.nodeValue.length;
    });
    function nodeAt(pos, preferEarlier) {
      for (var k = 0; k < nodes.length; k++) {
        var end = starts[k] + nodes[k].nodeValue.length;
        if (pos < end || (preferEarlier && pos === end)) return k;
      }
      return nodes.length - 1;
    }
    for (var e = edits.length - 1; e >= 0; e--) {
      var edit = edits[e];
      var a = nodeAt(edit.start, false);
      var b = edit.end > edit.start ? nodeAt(edit.end, true) : a;
      if (edit.start === total) a = b = nodes.length - 1;
      for (var k = a + 1; k <= b; k++) {
        nodes[k].nodeValue = nodes[k].nodeValue.slice(Math.max(0, edit.end - starts[k]));
      }
      var value = nodes[a].nodeValue;
      var before = value.slice(0, edit.start - starts[a]);
      var after = b === a ? value.slice(edit.end - starts[a]) : "";
      nodes[a].nodeValue = before;
      var el = changeElement(doc, edit);
      var parent = nodes[a].parentNode;
      parent.insertBefore(el, nodes[a].nextSibling);
      if (after) parent.insertBefore(doc.createTextNode(after), el.nextSibling);
    }
    return edits.length;
  }

  // The phrase rules as edits over `text`.
  function rulesEdits(text) {
    var edits = [];
    var pos = 0;
    root.Dedoom.dedoomSegments(text).forEach(function (seg) {
      if (seg.original === undefined) {
        pos += seg.text.length;
      } else {
        edits.push({ start: pos, end: pos + seg.original.length, text: seg.text, original: seg.original });
        pos += seg.original.length;
      }
    });
    return edits;
  }

  // Apply the phrase rules to every group under rootEl. Returns the number of
  // changes made.
  function dedoomElement(rootEl, doc) {
    var count = 0;
    collectGroups(rootEl).forEach(function (nodes) {
      var edits = rulesEdits(groupText(nodes));
      if (edits.length) count += applyEdits(nodes, edits, doc);
    });
    return count;
  }

  // Collapse whitespace the way a browser displays it, remembering where each
  // character came from: map[i] is the index in `raw` of text[i].
  function normalize(raw) {
    var text = "";
    var map = [];
    var space = -1;
    for (var i = 0; i < raw.length; i++) {
      if (/\s/.test(raw[i])) {
        if (space < 0) space = i;
        continue;
      }
      if (space >= 0 && text) {
        text += " ";
        map.push(space);
      }
      space = -1;
      text += raw[i];
      map.push(i);
    }
    return { text: text, map: map, end: map.length ? map[map.length - 1] + 1 : 0 };
  }

  // Replace a group's text with `rewritten` (whitespace-normalised), marking
  // only the words that differ from the original. `diffEdits(before, after)`
  // returns { start, end, text } edits. Returns the number of changes.
  function rewriteGroup(nodes, doc, rewritten, diffEdits) {
    nodes = restoreGroup(nodes, doc);
    var raw = groupText(nodes);
    var norm = normalize(raw);
    var edits = diffEdits(norm.text, rewritten).map(function (edit) {
      var start = edit.start < norm.map.length ? norm.map[edit.start] : norm.end;
      var end = edit.end > edit.start ? norm.map[edit.end - 1] + 1 : start;
      return { start: start, end: end, text: edit.text, original: raw.slice(start, end) };
    });
    return applyEdits(nodes, edits, doc);
  }

  root.DedoomPage = {
    collectGroups: collectGroups,
    groupText: groupText,
    groupStrings: groupStrings,
    restoreGroup: restoreGroup,
    applyEdits: applyEdits,
    rulesEdits: rulesEdits,
    dedoomElement: dedoomElement,
    normalize: normalize,
    rewriteGroup: rewriteGroup,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
