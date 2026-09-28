(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var form = $("form"), go = $("go"), errorEl = $("error");
  var result = $("result"), articleEl = $("article"), notice = $("notice");
  var tabUrl = $("tab-url"), tabText = $("tab-text");
  var panelUrl = $("panel-url"), panelText = $("panel-text");
  var activeTab = "url";

  function selectTab(which) {
    activeTab = which;
    tabUrl.setAttribute("aria-selected", String(which === "url"));
    tabText.setAttribute("aria-selected", String(which === "text"));
    panelUrl.hidden = which !== "url";
    panelText.hidden = which !== "text";
  }
  tabUrl.addEventListener("click", function () { selectTab("url"); });
  tabText.addEventListener("click", function () { selectTab("text"); });

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function renderSegments(parent, original, rewritten) {
    DedoomDiff.diffSegments(original, rewritten).forEach(function (seg) {
      if (seg.original === undefined) {
        parent.appendChild(document.createTextNode(seg.text));
      } else if (seg.text) {
        parent.appendChild(el("mark", { class: "dd", title: seg.original ? "Was: " + seg.original : "Added" }, [seg.text]));
      } else if (seg.original) {
        parent.appendChild(el("del", { class: "dd", title: "Removed" }, [seg.original]));
      }
    });
  }

  var TAGS = { heading: "h2", paragraph: "p", item: "li", quote: "blockquote" };

  function render(data, sourceUrl) {
    articleEl.textContent = "";
    var h1 = el("h1", {}, []);
    renderSegments(h1, data.originalTitle || data.title, data.title);
    articleEl.appendChild(h1);
    var parts = [];
    if (data.siteName) parts.push(data.siteName);
    if (data.byline) parts.push(data.byline);
    if (parts.length) articleEl.appendChild(el("p", { class: "meta" }, [parts.join(" · ")]));
    var meta = el("p", { class: "meta" }, [
      "Reframed by dedoomify, not the original. " + data.changed + " of " + data.blocks.length +
      " paragraphs changed by " + (data.engine === "claude" ? "Claude" : "the phrase rules") + ". ",
    ]);
    if (sourceUrl) meta.appendChild(el("a", { href: sourceUrl, rel: "noopener noreferrer", target: "_blank" }, ["Read the original"]));
    articleEl.appendChild(meta);

    data.blocks.forEach(function (block) {
      var node = el(TAGS[block.type] || "p", {}, []);
      renderSegments(node, block.original, block.text);
      articleEl.appendChild(node);
      if (block.original !== block.text) {
        articleEl.appendChild(el("p", { class: "original" }, ["Original: " + block.original]));
      }
    });
    if (data.changed === 0) {
      articleEl.appendChild(el("p", { class: "empty" }, ["Good news: we didn't find any doom to remove."]));
    }
    notice.textContent = data.notice || "";
    notice.hidden = !data.notice;
    result.hidden = false;
    applyToggles();
  }

  function applyToggles() {
    articleEl.classList.toggle("show-changes", $("show-changes").checked);
    articleEl.classList.toggle("show-original", $("show-original").checked);
  }
  $("show-changes").addEventListener("change", applyToggles);
  $("show-original").addEventListener("change", applyToggles);

  var lastShare = null;
  $("share").addEventListener("click", function () {
    var link = lastShare || location.href;
    var btn = this;
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
      .then(function () { btn.textContent = "Link copied"; })
      .catch(function () { prompt("Copy this link:", link); })
      .then(function () { setTimeout(function () { btn.textContent = "Copy share link"; }, 2000); });
  });

  function run(request, sourceUrl) {
    showError("");
    go.disabled = true;
    go.textContent = "De-dooming…";
    return fetch(request.url, request.init)
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok) throw new Error(body.error || "Something went wrong. Please try again.");
          return body;
        });
      })
      .then(function (data) {
        render(data, data.url || sourceUrl);
        $("share").hidden = !sourceUrl;
        result.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(function (err) { showError(err.message || "Couldn't reach dedoomify. Check your connection."); })
      .then(function () { go.disabled = false; go.textContent = "De-doom it"; });
  }

  function runUrl(url, mode) {
    var qs = "url=" + encodeURIComponent(url) + (mode && mode !== "auto" ? "&mode=" + mode : "");
    lastShare = location.origin + "/?" + qs;
    history.replaceState(null, "", "/?" + qs);
    return run({ url: "/api/dedoom?" + qs, init: {} }, url);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var mode = $("mode").value;
    if (activeTab === "url") {
      var url = $("url").value.trim();
      if (!url) return showError("Add a link to an article.");
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      runUrl(url, mode);
    } else {
      var text = $("text").value;
      if (!text.trim()) return showError("Paste some text to de-doom.");
      lastShare = null;
      history.replaceState(null, "", "/");
      run({
        url: "/api/dedoom",
        init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text, mode: mode }) },
      }, null);
    }
  });

  // Shared links: dedoomify.com/?url=... runs straight away.
  var params = new URLSearchParams(location.search);
  if (params.get("url")) {
    $("url").value = params.get("url");
    if (params.get("mode") === "rules") $("mode").value = "rules";
    runUrl(params.get("url"), params.get("mode"));
  }
})();
