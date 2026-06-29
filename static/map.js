const FALLBACK_CENTER = [
  window.ZAHA_PICKS.fallbackLat,
  window.ZAHA_PICKS.fallbackLng,
];

const state = {
  meal: "lunch",
  cuisine: "any",
  radiusMeters: 1609,
  openNowOnly: true,
  userLat: null,
  userLng: null,
  allRestaurants: [],
  searchQuery: "",
  selected: null,
};

let map;
let radiusCircle;
let userMarker;
let restaurantMarkers = [];

const cuisineSelect = document.getElementById("cuisine-select");
const radiusSelect = document.getElementById("radius-select");
const openNowCheckbox = document.getElementById("open-now");
const mapStatus = document.getElementById("map-status");
const matchCount = document.getElementById("match-count");
const restaurantList = document.getElementById("restaurant-list");
const resultCard = document.getElementById("result-card");
const resultName = document.getElementById("result-name");
const resultMeta = document.getElementById("result-meta");
const resultAddress = document.getElementById("result-address");
const resultDirections = document.getElementById("result-directions");
const resultYelp = document.getElementById("result-yelp");
const btnWantVisit = document.getElementById("btn-want-visit");
const btnMarkVisited = document.getElementById("btn-mark-visited");
const restaurantSearch = document.getElementById("restaurant-search");

function initMap() {
  map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
  }).setView(FALLBACK_CENTER, 14);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  radiusCircle = L.circle(FALLBACK_CENTER, {
    radius: state.radiusMeters,
    color: "rgba(45, 45, 45, 0.35)",
    fillColor: "rgba(45, 45, 45, 0.06)",
    fillOpacity: 1,
    weight: 2,
  }).addTo(map);
}

function setStatus(message) {
  mapStatus.textContent = message;
}

function filterParams() {
  const params = new URLSearchParams({
    lat: String(state.userLat),
    lng: String(state.userLng),
    radius_meters: String(state.radiusMeters),
    cuisine: state.cuisine,
    meal: state.meal,
    open_now: String(state.openNowOnly),
  });
  const query = state.searchQuery.trim();
  if (query) {
    params.set("q", query);
  }
  return params;
}

function matchesSearch(place, query) {
  const haystack = `${place.name} ${place.cuisine} ${place.address}`.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((term) => haystack.includes(term));
}

function getVisibleRestaurants() {
  const query = state.searchQuery.trim();
  if (!query) {
    return state.allRestaurants;
  }
  return state.allRestaurants.filter((place) => matchesSearch(place, query));
}

function getMapRestaurants() {
  const visible = getVisibleRestaurants();
  if (!state.selected) {
    return visible;
  }
  if (visible.some((place) => place.id === state.selected.id)) {
    return visible;
  }
  return [...visible, state.selected];
}

function clearRestaurantMarkers() {
  restaurantMarkers.forEach((marker) => marker.remove());
  restaurantMarkers = [];
}

function renderMapMarkers() {
  clearRestaurantMarkers();

  getMapRestaurants().forEach((place) => {
    const marker = L.circleMarker([place.lat, place.lng], {
      radius: state.selected?.id === place.id ? 8 : 5,
      color: state.selected?.id === place.id ? "#1a1a1a" : "#888",
      fillColor: state.selected?.id === place.id ? "#1a1a1a" : "#bbb",
      fillOpacity: 0.9,
      weight: 1,
    })
      .addTo(map)
      .bindPopup(`<strong>${place.name}</strong><br>${place.distance_label} away`);

    marker.on("click", () => selectRestaurant(place));
    restaurantMarkers.push(marker);
  });

  window.ZahaSavedMarkers.renderSavedMarkers(map, window.ZahaLists.getCachedLists());
}

function renderRestaurantList(scrollIntoView = false) {
  const visible = getVisibleRestaurants();
  matchCount.textContent = String(visible.length);

  if (visible.length === 0) {
    const query = state.searchQuery.trim();
    restaurantList.innerHTML = query
      ? `<li class="empty-state">No restaurants match "${query}". Try another name or clear the search.</li>`
      : '<li class="empty-state">No matches found. Try expanding the radius or changing cuisine.</li>';
    return;
  }

  restaurantList.innerHTML = visible
    .map(
      (place) => `
      <li class="restaurant-item" data-id="${place.id}">
        <p class="restaurant-name">${place.name}</p>
        <p class="restaurant-detail">${place.distance_label} · ${place.cuisine.replace(/;/g, ", ")}</p>
        <p class="restaurant-detail">${place.address}</p>
      </li>
    `
    )
    .join("");

  restaurantList.querySelectorAll(".restaurant-item").forEach((item) => {
    item.addEventListener("click", () => {
      const place = visible.find((entry) => entry.id === item.dataset.id);
      if (place) selectRestaurant(place);
    });
  });

  if (scrollIntoView) {
    restaurantList.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function needsEnrichment(place) {
  const cuisine = (place.cuisine || "").trim().toLowerCase();
  const address = (place.address || "").trim();
  return (
    !address ||
    address === "Address not listed" ||
    !cuisine ||
    cuisine === "unspecified"
  );
}

async function enrichPlace(place) {
  const response = await fetch("/api/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    return place;
  }

  const enriched = await response.json();
  Object.assign(place, enriched);

  const index = state.allRestaurants.findIndex((entry) => entry.id === place.id);
  if (index >= 0) {
    state.allRestaurants[index] = { ...state.allRestaurants[index], ...enriched };
  }

  if (state.selected?.id === place.id) {
    state.selected = place;
  }

  return place;
}

function renderSelectedRestaurant(place) {
  resultName.textContent = place.name;
  resultMeta.textContent = `${state.meal === "lunch" ? "Lunch" : "Dinner"} · ${place.distance_label} · ${place.cuisine.replace(/;/g, ", ")}`;
  resultAddress.textContent = place.address;
  resultDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  updateSaveButtons(place);
}

async function selectRestaurant(place) {
  state.selected = place;
  resultCard.hidden = false;
  renderSelectedRestaurant(place);

  if (needsEnrichment(place)) {
    setStatus(`Looking up details for ${place.name}…`);
    await enrichPlace(place);
    renderSelectedRestaurant(place);
    renderRestaurantList();
  }

  loadYelpLink(place);
  map.panTo([place.lat, place.lng], { animate: true });
  renderMapMarkers();
}

function updateSaveButtons(place) {
  if (!place || !btnWantVisit || !btnMarkVisited) return;

  btnWantVisit.classList.toggle("active", window.ZahaLists.isWantToVisit(place.id));
  btnMarkVisited.classList.toggle("active", window.ZahaLists.isVisited(place.id));
}

async function handleWantToVisit() {
  if (!state.selected) return;
  try {
    await window.ZahaLists.addWantToVisit(state.selected);
    updateSaveButtons(state.selected);
    window.ZahaSavedMarkers.renderSavedMarkers(map, window.ZahaLists.getCachedLists());
    setStatus(`Added ${state.selected.name} to Want to visit.`);
  } catch (error) {
    console.error(error);
  }
}

async function handleMarkVisited() {
  if (!state.selected) return;
  try {
    await window.ZahaLists.addVisited(state.selected);
    updateSaveButtons(state.selected);
    window.ZahaSavedMarkers.renderSavedMarkers(map, window.ZahaLists.getCachedLists());
    setStatus(`Marked ${state.selected.name} as visited.`);
  } catch (error) {
    console.error(error);
  }
}

async function loadYelpLink(place) {
  resultYelp.textContent = "Loading Yelp…";
  resultYelp.classList.add("is-loading");
  resultYelp.removeAttribute("href");

  if (place.yelp_url && place.yelp_direct) {
    resultYelp.href = place.yelp_url;
    resultYelp.textContent = "View on Yelp";
    resultYelp.classList.remove("is-loading");
    return;
  }

  const params = new URLSearchParams({
    name: place.name,
    lat: String(place.lat),
    lng: String(place.lng),
    address: place.address || "",
  });

  try {
    const response = await fetch(`/api/yelp?${params}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "Could not load Yelp link.");
    }
    place.yelp_url = payload.url;
    place.yelp_direct = payload.direct;
    resultYelp.href = payload.url;
    resultYelp.textContent = payload.direct ? "View on Yelp" : "Search on Yelp";
  } catch {
    resultYelp.href = place.yelp_url || "#";
    resultYelp.textContent = "Search on Yelp";
  }

  resultYelp.classList.remove("is-loading");
}

async function pickRandomRestaurant() {
  setStatus("Picking a random spot…");
  try {
    const response = await fetch(`/api/pick?${filterParams()}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "No restaurants match your filters yet.");
    }
    selectRestaurant(payload.restaurant);
    setStatus(payload.status);
  } catch (error) {
    setStatus(error.message);
  }
}

function updateRadiusCircle(animate = true) {
  if (!radiusCircle || state.userLat == null) return;

  radiusCircle.setLatLng([state.userLat, state.userLng]);

  if (animate) {
    animateRadius(state.radiusMeters);
  } else {
    radiusCircle.setRadius(state.radiusMeters);
    map.fitBounds(radiusCircle.getBounds(), { padding: [40, 40] });
  }
}

function animateRadius(targetRadius) {
  const startRadius = radiusCircle.getRadius();
  const duration = 450;
  const start = performance.now();

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    const current = startRadius + (targetRadius - startRadius) * eased;
    radiusCircle.setRadius(current);

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      map.fitBounds(radiusCircle.getBounds(), { padding: [40, 40] });
    }
  }

  requestAnimationFrame(frame);
}

async function refreshRestaurants() {
  if (state.userLat == null || state.userLng == null) return;

  setStatus("Searching nearby restaurants…");

  try {
    const params = new URLSearchParams({
      lat: String(state.userLat),
      lng: String(state.userLng),
      radius_meters: String(state.radiusMeters),
      cuisine: state.cuisine,
      meal: state.meal,
      open_now: String(state.openNowOnly),
    });
    const response = await fetch(`/api/restaurants?${params}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || "Could not load nearby restaurants.");
    }
    const payload = await response.json();
    state.allRestaurants = payload.restaurants;
    state.selected = null;
    resultCard.hidden = true;
    renderRestaurantList();
    renderMapMarkers();
    updateRadiusCircle(true);
    updateSearchStatus(payload.status);
  } catch (error) {
    setStatus(error.message || "Something went wrong while searching.");
  }
}

function updateSearchStatus(fallbackStatus) {
  const query = state.searchQuery.trim();
  const visible = getVisibleRestaurants();

  if (!query) {
    if (fallbackStatus) {
      setStatus(fallbackStatus);
    }
    return;
  }

  if (visible.length === 0) {
    setStatus(`No restaurants match "${query}".`);
    return;
  }

  setStatus(`${visible.length} spot${visible.length === 1 ? "" : "s"} match "${query}".`);
}

function applySearchFilter() {
  renderRestaurantList();
  renderMapMarkers();
  updateSearchStatus();
}

function setUserLocation(lat, lng, label) {
  state.userLat = lat;
  state.userLng = lng;

  if (userMarker) userMarker.remove();
  userMarker = L.circleMarker([lat, lng], {
    radius: 7,
    color: "#1a1a1a",
    fillColor: "#ffffff",
    fillOpacity: 1,
    weight: 2,
  })
    .addTo(map)
    .bindPopup("You are here");

  map.setView([lat, lng], 14);
  updateRadiusCircle(false);
  setStatus(label);
  refreshRestaurants();
}

function locateUser() {
  if (!navigator.geolocation) {
    setUserLocation(
      FALLBACK_CENTER[0],
      FALLBACK_CENTER[1],
      "Geolocation unavailable — showing West Lafayette."
    );
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setUserLocation(
        position.coords.latitude,
        position.coords.longitude,
        "Location found. Adjust filters and pick a spot."
      );
    },
    () => {
      setUserLocation(
        FALLBACK_CENTER[0],
        FALLBACK_CENTER[1],
        "Location blocked — showing West Lafayette. Enable location for best results."
      );
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function bindControls() {
  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segment").forEach((el) => el.classList.remove("active"));
      button.classList.add("active");
      state.meal = button.dataset.meal;
      refreshRestaurants();
    });
  });

  cuisineSelect.addEventListener("change", () => {
    state.cuisine = cuisineSelect.value;
    refreshRestaurants();
  });

  radiusSelect.addEventListener("change", () => {
    state.radiusMeters = Number(radiusSelect.value);
    refreshRestaurants();
  });

  openNowCheckbox.addEventListener("change", () => {
    state.openNowOnly = openNowCheckbox.checked;
    refreshRestaurants();
  });

  document.getElementById("btn-random").addEventListener("click", pickRandomRestaurant);
  document.getElementById("btn-reroll").addEventListener("click", pickRandomRestaurant);
  document.getElementById("btn-browse").addEventListener("click", () => {
    renderRestaurantList(true);
    const visible = getVisibleRestaurants();
    setStatus(`Browsing ${visible.length} matches — tap one to select.`);
  });

  if (restaurantSearch) {
    restaurantSearch.addEventListener("input", () => {
      state.searchQuery = restaurantSearch.value;
      applySearchFilter();
    });

    restaurantSearch.addEventListener("search", () => {
      state.searchQuery = restaurantSearch.value;
      applySearchFilter();
    });
  }

  btnWantVisit.addEventListener("click", handleWantToVisit);
  btnMarkVisited.addEventListener("click", handleMarkVisited);

  window.addEventListener("zaha-lists-updated", () => {
    window.ZahaSavedMarkers.renderSavedMarkers(map, window.ZahaLists.getCachedLists());
    if (state.selected) updateSaveButtons(state.selected);
  });
}

initMap();
bindControls();

(async function bootstrap() {
  await window.ZahaLists.ensureReady();
  window.ZahaSavedMarkers.renderSavedMarkers(map, window.ZahaLists.getCachedLists());
  locateUser();
})();
