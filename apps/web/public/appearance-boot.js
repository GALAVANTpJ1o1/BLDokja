// Applies the saved theme and palette before first paint, so a chosen theme doesn't flash. It reads the
// mirror SettingsProvider keeps in localStorage (the real settings live in IndexedDB, which can't be read
// synchronously). The layout writes it inline in <head>; the build's CSP step allows it by hash.
try {
  var a = JSON.parse(localStorage.getItem("bld.appearance") || "{}"),
    r = document.documentElement;
  if (a.theme === "dark" || a.theme === "light") r.dataset.theme = a.theme;
  if (a.palette === "high-contrast" || a.palette === "deuteranopia") r.dataset.palette = a.palette;
  if (["slate", "jade", "coral", "cotton", "ocean", "forest"].indexOf(a.colourway) !== -1) r.dataset.colourway = a.colourway;
  if (["none", "galaxy", "rain", "snow", "forest", "ocean"].indexOf(a.environment) !== -1) r.dataset.environment = a.environment;
  if (typeof a.compactLayout === "boolean") r.dataset.density = a.compactLayout ? "compact" : "comfortable";
} catch (e) {}
