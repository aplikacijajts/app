import { api, getToken } from "./api.js";

const STATIONS = [
  { value: "fuel station", label: "All fuel stations" },
  { value: "Pilot Flying J", label: "Pilot Flying J" },
  { value: "Love's Travel Stops", label: "Love's Travel Stops" },
  { value: "TA Petro", label: "TA / Petro" },
  { value: "Shell gas station", label: "Shell" },
  { value: "Exxon gas station", label: "Exxon" },
  { value: "BP gas station", label: "BP" },
  { value: "Circle K gas station", label: "Circle K" },
  { value: "Marathon gas station", label: "Marathon" },
  { value: "Speedway gas station", label: "Speedway" },
  { value: "Makpetrol", label: "Makpetrol" },
  { value: "Lukoil gas station", label: "Lukoil" },
  { value: "OKTA gas station", label: "OKTA" },
  { value: "Detoil gas station", label: "Detoil" }
];

const $ = (id) => document.getElementById(id);
let position = null;
let watchId = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
}
function setStatus(text, state = "") {
  const el = $("fuelStatus");
  if (el) { el.textContent = text || ""; el.dataset.state = state; }
}
function mapsQuery() {
  const station = $("stationSelect")?.value || "fuel station";
  if (position) return `${station} near ${position.lat},${position.lng}`;
  return `${station} near me`;
}
function updateNearestStations() {
  const box = $("nearestStations");
  if (!box) return;
  const selected = $("stationSelect")?.value || "fuel station";
  const base = STATIONS.filter(s => s.value !== "fuel station").slice(0, 6);
  const items = [{ value: selected, label: $("stationSelect")?.selectedOptions?.[0]?.textContent || selected }, ...base.filter(x => x.value !== selected)].slice(0, 6);
  box.innerHTML = items.map((s, i) => {
    const q = position ? `${s.value} near ${position.lat},${position.lng}` : `${s.value} near me`;
    const approx = position ? (i === 0 ? "nearest" : `alternative ${i}`) : "tap Use Current Location for distance";
    return `<a class="rounded-xl border bg-white p-3 block" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}"><b>${esc(i === 0 ? "Nearest: " : "")}${esc(s.label)}</b><div class="text-xs text-slate-500 mt-1">${esc(approx)} • Google Maps will show exact miles and navigation.</div></a>`;
  }).join("");
}
function updateMap() {
  const query = mapsQuery();
  const url = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  const frame = $("fuelMapFrame");
  if (frame) frame.src = url;
  const open = $("openFuelMap");
  if (open) open.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const q = $("fuelQuery");
  if (q) q.textContent = query;
  updateNearestStations();
}
function updatePositionText() {
  const el = $("driverPosition");
  if (!el) return;
  if (!position) {
    el.innerHTML = "Location is not enabled yet.";
    return;
  }
  el.innerHTML = `<b>Current Location:</b> ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)} <span class="jts-muted-inline">Accuracy: ${Math.round(position.accuracy || 0)}m</span>`;
}
function storePosition(pos) {
  position = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy || 0, at: new Date().toISOString() };
  try { localStorage.setItem("jts-driver-position", JSON.stringify(position)); } catch {}
  updatePositionText();
  updateMap();
  updateNearestStations();
  setStatus("Location is active", "ok");
}
function loadStoredPosition() {
  try {
    const cached = JSON.parse(localStorage.getItem("jts-driver-position") || "null");
    if (cached && Number.isFinite(Number(cached.lat)) && Number.isFinite(Number(cached.lng))) position = { lat: Number(cached.lat), lng: Number(cached.lng), accuracy: Number(cached.accuracy || 0), at: cached.at || null };
  } catch {}
  updatePositionText();
}
function requestLocation() {
  if (!window.isSecureContext && location.hostname !== "localhost") {
    setStatus("iPhone requires HTTPS or installed Home Screen app for location.", "error");
  }
  if (!navigator.geolocation) {
    setStatus("This device/browser does not support location services.", "error");
    return;
  }
  setStatus("Requesting the driver’s location...", "saving");
  navigator.geolocation.getCurrentPosition(storePosition, (err) => {
    setStatus(err?.message || "Location permission was denied.", "error");
    updateMap();
  updateNearestStations();
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}
function watchLocation() {
  if (!navigator.geolocation) return;
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    $("watchLocation").textContent = "Live Location";
    setStatus("Live location has stopped", "");
    return;
  }
  watchId = navigator.geolocation.watchPosition(storePosition, (err) => {
    setStatus(err?.message || "Unable to track the location.", "error");
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  $("watchLocation").textContent = "Stop Live Location";
  setStatus("Live location is being tracked...", "saving");
}
async function loadUser() {
  if (!getToken()) location.href = "/index.html";
  try {
    const me = await api("/api/users/me");
    const el = $("fuelUser");
    if (el) el.textContent = `${me.name || me.email || "User"} • ${me.role || ""}`;
  } catch {}
}
function init() {
  const select = $("stationSelect");
  if (select) {
    select.innerHTML = STATIONS.map(s => `<option value="${esc(s.value)}">${esc(s.label)}</option>`).join("");
    select.addEventListener("change", () => { updateMap(); updateNearestStations(); });
  }
  $("locateDriver")?.addEventListener("click", requestLocation);
  $("watchLocation")?.addEventListener("click", watchLocation);
  loadStoredPosition();
  updateMap();
  updateNearestStations();
  loadUser();
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init, { once: true }) : init();
