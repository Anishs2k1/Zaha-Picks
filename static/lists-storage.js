const STORAGE_KEY = "zaha-picks-lists";

let cache = { wantToVisit: [], visited: [] };
let readyPromise = null;

function emptyLists() {
  return { wantToVisit: [], visited: [] };
}

function normalizeLists(data) {
  if (!data || typeof data !== "object") {
    return emptyLists();
  }
  return {
    wantToVisit: Array.isArray(data.wantToVisit) ? data.wantToVisit : [],
    visited: Array.isArray(data.visited) ? data.visited : [],
  };
}

function dispatchUpdated() {
  window.dispatchEvent(new CustomEvent("zaha-lists-updated"));
}

function getCachedLists() {
  return {
    wantToVisit: [...cache.wantToVisit],
    visited: [...cache.visited],
  };
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

async function readListsResponse(response) {
  if (!response.ok) {
    throw new Error(`Lists API returned ${response.status}`);
  }
  const payload = await response.json();
  return normalizeLists(payload);
}

async function migrateLocalStorageIfNeeded() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    const response = await fetch("/api/lists/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wantToVisit: Array.isArray(parsed.wantToVisit) ? parsed.wantToVisit : [],
        visited: Array.isArray(parsed.visited) ? parsed.visited : [],
      }),
    });
    if (response.ok) {
      cache = await readListsResponse(response);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.error("Zaha Picks: could not migrate saved lists.", error);
  }
}

async function fetchListsFromServer() {
  const response = await fetch("/api/lists");
  cache = await readListsResponse(response);
  return cache;
}

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        await migrateLocalStorageIfNeeded();
        await fetchListsFromServer();
      } catch (error) {
        console.error("Zaha Picks: could not load saved lists.", error);
        cache = emptyLists();
      }
    })();
  }
  await readyPromise;
  return cache;
}

async function loadLists() {
  await ensureReady();
  return getCachedLists();
}

async function refreshLists() {
  try {
    await fetchListsFromServer();
  } catch (error) {
    console.error("Zaha Picks: could not refresh saved lists.", error);
    cache = emptyLists();
  }
  dispatchUpdated();
  return cache;
}

async function addWantToVisit(place) {
  const response = await fetch("/api/lists/want", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(placePayload(place)),
  });
  cache = await readListsResponse(response);
  dispatchUpdated();
  return cache.wantToVisit.find((item) => item.id === place.id);
}

async function addVisited(place) {
  const response = await fetch("/api/lists/visited", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(placePayload(place)),
  });
  cache = await readListsResponse(response);
  dispatchUpdated();
  return cache.visited.find((item) => item.id === place.id);
}

async function removeWantToVisit(id) {
  const response = await fetch(`/api/lists/want/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  cache = await readListsResponse(response);
  dispatchUpdated();
}

async function removeVisited(id) {
  const response = await fetch(`/api/lists/visited/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  cache = await readListsResponse(response);
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
  getCachedLists,
  addWantToVisit,
  addVisited,
  removeWantToVisit,
  removeVisited,
  isWantToVisit,
  isVisited,
  ensureReady,
};
