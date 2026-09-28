// Word-level diff used to highlight what changed in a paragraph.
// Returns segments: { text } for unchanged text, { text, original } for edits.
(function (root) {
  "use strict";
  var MAX_TOKENS = 1500;

  function tokenize(s) {
    return s.split(/(\s+|[.,;:!?"“”‘’()])/).filter(function (t) { return t.length > 0; });
  }

  function diffSegments(before, after) {
    if (before === after) return [{ text: after }];
    var a = tokenize(before);
    var b = tokenize(after);
    if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
      return [{ text: after, original: before }];
    }
    // Longest common subsequence table, filled from the end.
    var n = a.length, m = b.length;
    var dp = new Array(n + 1);
    for (var i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1);
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var segments = [];
    var same = "", from = "", to = "";
    function flushChange() {
      if (from || to) {
        // Keep surrounding whitespace outside the highlight.
        var lead = to.match(/^\s*/)[0];
        var trail = to.slice(lead.length).match(/\s*$/)[0];
        var core = to.slice(lead.length, to.length - trail.length);
        if (lead) same += lead;
        if (same) segments.push({ text: same });
        same = "";
        segments.push({ text: core, original: from.trim() });
        same = trail;
        from = to = "";
      }
    }
    i = 0; j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        flushChange();
        same += a[i];
        i++; j++;
      } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
        to += b[j++];
      } else {
        from += a[i++];
      }
    }
    flushChange();
    if (same) segments.push({ text: same });
    return mergeNearbyChanges(segments);
  }

  // "is misaligned" -> "has a bug" diffs as two edits around a shared space;
  // show it as one edit.
  function mergeNearbyChanges(segments) {
    var out = [];
    for (var k = 0; k < segments.length; k++) {
      var seg = segments[k];
      var prev = out[out.length - 1];
      var gap = out[out.length - 2];
      if (seg.original !== undefined && prev && prev.original === undefined &&
          /^\s+$/.test(prev.text) && gap && gap.original !== undefined) {
        gap.original = [gap.original, seg.original].filter(Boolean).join(" ");
        if (!seg.text) {
          // A pure deletion: the space between the two edits is the only
          // space left before the next word, so keep it.
          continue;
        }
        out.pop();
        // If the first edit was a pure deletion, the space before it already
        // separates the new text from the previous word.
        gap.text = gap.text ? gap.text + prev.text + seg.text : seg.text;
        continue;
      }
      out.push({ text: seg.text, original: seg.original });
      if (seg.original === undefined) delete out[out.length - 1].original;
    }
    return out;
  }

  root.DedoomDiff = { diffSegments: diffSegments };
})(typeof globalThis !== "undefined" ? globalThis : this);
