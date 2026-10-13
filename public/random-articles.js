// Keep a cycle of the curated URLs seen in this browser, without storing
// arbitrary links pasted by a visitor. Reloads and other tabs share the cycle.
const HISTORY_KEY = "dedoomify.article-history";

export function createArticlePicker(articles, { storage, random = Math.random } = {}) {
  const urls = [...new Set(articles)];
  const allowed = new Set(urls);
  let seen = new Set();

  function refresh() {
    if (!storage) return;
    let raw;
    try {
      raw = storage.getItem(HISTORY_KEY);
    } catch {
      // Inaccessible storage falls back to this page's memory.
      storage = null;
      return;
    }
    try {
      const saved = JSON.parse(raw || "[]");
      seen = new Set(Array.isArray(saved) ? saved.filter((url) => allowed.has(url)) : []);
    } catch { seen = new Set(); }
  }

  function save() {
    if (!storage) return;
    try { storage.setItem(HISTORY_KEY, JSON.stringify([...seen])); }
    catch { storage = null; }
  }

  function remember(url) {
    if (!allowed.has(url)) return;
    refresh();
    seen.add(url);
    save();
  }

  function next(currentUrl) {
    if (!urls.length) return null;
    refresh();
    if (allowed.has(currentUrl)) seen.add(currentUrl);
    const firstVisit = seen.size === 0;
    let choices = urls.filter((url) => !seen.has(url));
    if (!choices.length) {
      seen.clear();
      // Start a new cycle without immediately repeating the current article.
      choices = urls.filter((url) => url !== currentUrl);
      if (!choices.length) choices = urls;
    }
    const url = firstVisit && choices.includes(urls[0])
      ? urls[0]
      : choices[Math.floor(random() * choices.length)];
    seen.add(url);
    save();
    return url;
  }

  return { next, remember };
}
