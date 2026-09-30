// Automatic mode: runs on every page once the user turns it on and grants
// site access. Pages that don't talk about AI doom are ruled out from a small
// sample of their text; only matching pages are rewritten.
(function () {
  "use strict";
  if (window.__dedoomifyAuto || !window.DedoomifyPage) return;
  window.__dedoomifyAuto = true;

  function check() {
    if (DedoomifyPage.looksDoomy(DedoomifyPage.pageSample(document))) DedoomifyPage.run();
  }

  check();
  // Some sites fill in the article after the page loads. If there was little
  // text to judge, look once more a moment later.
  var body = document.body;
  if (!document.querySelector("mark.dedoomify") && (!body || body.textContent.length < 2000)) {
    setTimeout(check, 2500);
  }
})();
