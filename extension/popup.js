(function () {
  "use strict";
  var button = document.getElementById("run");
  var status = document.getElementById("status");
  var site = document.getElementById("site");

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (tab && /^https?:/.test(tab.url || "")) {
      site.href = "https://dedoomify.com/?url=" + encodeURIComponent(tab.url);
    }
  });

  button.addEventListener("click", function () {
    button.disabled = true;
    status.textContent = "Working…";
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab) return done("No page to de-doom.");
      chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] })
        .then(function () {
          return chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["dedoom-core.js", "content.js"] });
        })
        .then(function (results) {
          var count = results && results[results.length - 1] ? results[results.length - 1].result : 0;
          done(count ? "Rewrote " + count + (count === 1 ? " phrase." : " phrases.") : "No doom found on this page.");
        })
        .catch(function () {
          done("This page can't be changed by extensions.");
        });
    });
  });

  function done(message) {
    status.textContent = message;
    button.disabled = false;
  }
})();
