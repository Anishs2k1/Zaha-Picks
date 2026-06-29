const STORAGE_KEY = "zaha-picks-lists";

function emptyLists() {
  return { wantToVisit: [], visited: [] };
}

function loadLists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLists();
    const data = JSON.parse(raw);
    return {
      wantToVisit: Array.isArray(data.wantToVisit) ? data.wantToVisit : [],
      visited: Array.isArray(data.visited) ? data.visited : [],
    };
  } catch {
    return emptyLists();
  }
}

function saveLists(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent("zaha-lists-updated"));
}

function normalizePlace(place) {
  return {
    id: place.id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    cuisine: place.cuisine || "unspecified",
    address: place.address || "",
    savedAt: new Date().toISOString(),
  };
}

function addWantToVisit(place) {
  const data = loadLists();
  const entry = normalizePlace(place);
  data.visited = data.visited.filter((item) => item.id !== entry.id);
  const exists = data.wantToVisit.some((item) => item.id === entry.id);
  if (!exists) {
    data.wantToVisit.push(entry);
  }
  saveLists(data);
  return entry;
}

function addVisited(place) {
  const data = loadLists();
  const entry = normalizePlace(place);
  data.wantToVisit = data.wantToVisit.filter((item) => item.id !== entry.id);
  const exists = data.visited.some((item) => item.id === entry.id);
  if (!exists) {
    data.visited.push(entry);
  }
  saveLists(data);
  return entry;
}

function removeWantToVisit(id) {
  const data = loadLists();
  data.wantToVisit = data.wantToVisit.filter((item) => item.id !== id);
  saveLists(data);
}

function removeVisited(id) {
  const data = loadLists();
  data.visited = data.visited.filter((item) => item.id !== id);
  saveLists(data);
}

function isWantToVisit(id) {
  return loadLists().wantToVisit.some((item) => item.id === id);
}

function isVisited(id) {
  return loadLists().visited.some((item) => item.id === id);
}

window.ZahaLists = {
  loadLists,
  addWantToVisit,
  addVisited,
  removeWantToVisit,
  removeVisited,
  isWantToVisit,
  isVisited,
};
