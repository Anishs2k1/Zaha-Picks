const STORAGE_KEY = "zaha-picks-lists";

let cache = { wantToVisit: [], visited: [] };
let readyPromise = null;

function emptyLists() {
  return { wantToVisit: [], visited: [] };
}

function dispatchUpdated() {
  window.dispatchEvent(new CustomEvent("zaha-lists-updated"));
}

function placePayload(place) {
  return {
    id: place.id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    cuisine: place.cuisine || "",
    address: place.address || "",
    tags: place.tags || null,
    distance: place.distance ?? null,
    distance_label: place.distance_label ?? null,
    opening_hours: place.opening_hours ?? null,
    yelp_url: place.yelp_url ?? null,
    yelp_direct: place.yelp_direct ?? null,
  };
}

async function migrateLocalStorageIfNeeded() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    await fetch("/api/lists/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wantToVisit: Array.isArray(parsed.wantToVisit) ? parsed.wantToVisit : [],
        visited: Array.isArray(parsed.visited) ? parsed.visited : [],
      }),
    });
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Keep local data if migration fails; server lists remain authoritative on next success.
  }
}

async function fetchListsFromServer() {
  const response = await fetch("/api/lists");
  if (!response.ok) {
    throw new Error("Could not load saved lists.");
  }
  cache = await response.json();
  return cache;
}

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await migrateLocalStorageIfNeeded();
      await fetchListsFromServer();
    })();
  }
  await readyPromise;
  return cache;
}

async function loadLists() {
  await ensureReady();
  return {
    wantToVisit: [...cache.wantToVisit],
    visited: [...cache.visited],
  };
}

async function refreshLists() {
  await fetchListsFromServer();
  dispatchUpdated();
  return cache;
}

async function addWantToVisit(place) {
  const response = await fetch("/api/lists/want", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(placePayload(place)),
  });
  if (!response.ok) {
    throw new Error("Could not save restaurant to Want to visit.");
  }
  cache = await response.json();
  dispatchUpdated();
  return cache.wantToVisit.find((item) => item.id === place.id);
}

async function addVisited(place) {
  const response = await fetch("/api/lists/visited", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(placePayload(place)),
  });
  if (!response.ok) {
    throw new Error("Could not save restaurant as visited.");
  }
  cache = await response.json();
  dispatchUpdated();
  return cache.visited.find((item) => item.id === place.id);
}

async function removeWantToVisit(id) {
  const response = await fetch(`/api/lists/want/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Could not remove restaurant from Want to visit.");
  }
  cache = await response.json();
  dispatchUpdated();
}

async function removeVisited(id) {
  const response = await fetch(`/api/lists/visited/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Could not remove restaurant from visited.");
  }
  cache = await response.json();
  dispatchUpdated();
}

function isWantToVisit(id) {
  return cache.wantToVisit.some((item) => item.id === id);
}

function isVisited(id) {
  return cache.visited.some((item) => item.id === id);
}

window.ZahaLists = {
  loadLists,
  refreshLists,
  addWantToVisit,
  addVisited,
  removeWantToVisit,
  removeVisited,
  isWantToVisit,
  isVisited,
  ensureReady,
};
