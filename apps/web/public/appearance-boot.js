// Applies the saved theme and palette before first paint, so a chosen theme doesn't flash. It reads the
// mirror SettingsProvider keeps in localStorage (the real settings live in IndexedDB, which can't be read
// synchronously). Loaded as a same-origin file from <head> so the strict CSP needs no hash for it.
try {
  var a = JSON.parse(localStorage.getItem("bld.appearance") || "{}"),
    r = document.documentElement;
  if (a.theme === "dark" || a.theme === "light") r.dataset.theme = a.theme;
  if (a.palette === "high-contrast" || a.palette === "deuteranopia") r.dataset.palette = a.palette;
} catch (e) {}
