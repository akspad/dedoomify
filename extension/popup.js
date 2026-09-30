// The toolbar popup. Rewriting only happens when the button is pressed, using
// the activeTab permission that opening the popup grants for the current tab.
(function () {
  "use strict";
  var api = typeof browser !== "undefined" && browser.scripting ? browser : chrome;
  var run = document.getElementById("run");
  var result = document.getElementById("result");
  var summary = document.getElementById("summary");
  var show = document.getElementById("show");
  var undo = document.getElementById("undo");
  var status = document.getElementById("status");
  var site = document.getElementById("site");
  var auto = document.getElementById("auto");
  var ALL_SITES = { origins: ["<all_urls>"] };
  var tabId = null;

  // Automatic mode is on while the extension has access to all sites;
  // background.js registers the page script when access is granted.
  api.permissions.contains(ALL_SITES).then(function (on) { auto.checked = on; });
  auto.addEventListener("change", function () {
    var change = auto.checked ? api.permissions.request(ALL_SITES) : api.permissions.remove(ALL_SITES).then(function () { return false; });
    change.then(function (on) {
      auto.checked = !!on;
      status.textContent = on ? "Articles about AI doom will be rewritten as they load." : "";
    }, function () {
      auto.checked = false;
    });
  });

  api.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    var tab = tabs[0];
    if (!tab) return;
    tabId = tab.id;
    if (/^https?:/.test(tab.url || "")) {
      site.href = "https://dedoomify.com/?url=" + encodeURIComponent(tab.url);
    }
    // If this page was de-doomed earlier, show where it stands.
    inPage(function () {
      var total = document.querySelectorAll("mark.dedoomify").length;
      return total ? { total: total, shown: document.documentElement.classList.contains("dedoomify-show") } : null;
    }).then(function (state) {
      if (state) render(state.total, state.shown);
    }, function () {
      cannot();
    });
  });

  run.addEventListener("click", function () {
    if (tabId === null) return cannot();
    run.disabled = true;
    status.textContent = "Working…";
    api.scripting.insertCSS({ target: { tabId: tabId }, files: ["content.css"] })
      .then(function () {
        return api.scripting.executeScript({ target: { tabId: tabId }, files: ["dedoom-core.js", "dedoomify-page.js", "content.js"] });
      })
      .then(function (results) {
        var last = results && results[results.length - 1];
        var counts = (last && last.result) || { added: 0, total: 0 };
        run.disabled = false;
        status.textContent = "";
        if (!counts.total) {
          status.textContent = "No doom found on this page.";
          return;
        }
        render(counts.total, true);
        if (!counts.added) status.textContent = "Nothing new to rewrite.";
      })
      .catch(cannot);
  });

  show.addEventListener("change", function () {
    inPage(function (on) {
      document.documentElement.classList.toggle("dedoomify-show", on);
    }, [show.checked]);
  });

  undo.addEventListener("click", function () {
    inPage(function () {
      document.querySelectorAll("mark.dedoomify").forEach(function (mark) {
        var parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.getAttribute("data-was")), mark);
        parent.normalize();
      });
      document.documentElement.classList.remove("dedoomify-show");
    }).then(function () {
      result.hidden = true;
      run.hidden = false;
      status.textContent = "Restored the original text.";
    });
  });

  function inPage(func, args) {
    return api.scripting.executeScript({ target: { tabId: tabId }, func: func, args: args || [] })
      .then(function (results) { return results && results[0] ? results[0].result : null; });
  }

  function render(total, shown) {
    summary.textContent = "Rewrote " + total + (total === 1 ? " phrase" : " phrases") + " on this page.";
    show.checked = shown;
    result.hidden = false;
    run.hidden = true;
  }

  function cannot() {
    run.disabled = true;
    status.textContent = "This page can't be changed by extensions. Try it on an article.";
  }
})();
