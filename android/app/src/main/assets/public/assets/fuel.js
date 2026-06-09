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
function updateMap() {
  const query = mapsQuery();
  const url = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  const frame = $("fuelMapFrame");
  if (frame) frame.src = url;
  const open = $("openFuelMap");
  if (open) open.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const q = $("fuelQuery");
  if (q) q.textContent = query;
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
  if (!navigator.geolocation) {
    setStatus("This device/browser does not support location services.", "error");
    return;
  }
  setStatus("Requesting the driver’s location...", "saving");
  navigator.geolocation.getCurrentPosition(storePosition, (err) => {
    setStatus(err?.message || "Location permission was denied.", "error");
    updateMap();
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
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
    select.addEventListener("change", updateMap);
  }
  $("locateDriver")?.addEventListener("click", requestLocation);
  $("watchLocation")?.addEventListener("click", watchLocation);
  loadStoredPosition();
  updateMap();
  loadUser();
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init, { once: true }) : init();
