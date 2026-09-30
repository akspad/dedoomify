// Keeps automatic mode in step with site access. The popup's setting asks for
// access to all sites; while it is granted, auto.js runs on every page.
// Removing access (from the popup or the browser's own menu) turns it off.
var api = typeof browser !== "undefined" && browser.scripting ? browser : chrome;
var ALL_SITES = { origins: ["<all_urls>"] };
var SCRIPT = {
  id: "dedoomify-auto",
  matches: ["<all_urls>"],
  excludeMatches: ["*://dedoomify.com/*", "*://*.dedoomify.com/*"],
  js: ["dedoom-core.js", "dedoomify-page.js", "auto.js"],
  css: ["content.css"],
  runAt: "document_idle",
};

function sync() {
  return Promise.all([api.permissions.contains(ALL_SITES), api.scripting.getRegisteredContentScripts({ ids: [SCRIPT.id] })])
    .then(function (state) {
      var granted = state[0], registered = state[1].length > 0;
      if (granted && !registered) return api.scripting.registerContentScripts([SCRIPT]);
      if (!granted && registered) return api.scripting.unregisterContentScripts({ ids: [SCRIPT.id] });
    })
    .catch(function (err) { console.error("dedoomify: couldn't update automatic mode", err); });
}

api.permissions.onAdded.addListener(sync);
api.permissions.onRemoved.addListener(sync);
api.runtime.onInstalled.addListener(sync);
api.runtime.onStartup.addListener(sync);
