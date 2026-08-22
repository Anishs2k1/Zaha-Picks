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
  locationLabel: "",
  mapMode: null,
  customDraftLat: null,
  customDraftLng: null,
  nearbyRestaurants: [],
  searchResults: null,
  activeSearchQuery: "",
  selected: null,
};

let map;
let radiusCircle;
let userMarker;
let customDraftMarker;
let restaurantMarkers = [];
let loadingCount = 0;

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
const btnSearch = document.getElementById("btn-search");
const resultsTitle = document.getElementById("results-title");
const searchValidation = document.getElementById("search-validation");
const searchResultsPanel = document.getElementById("search-results-panel");
const loadingBar = document.getElementById("loading-bar");
const loadingBarLabel = document.getElementById("loading-bar-label");
const locationLabel = document.getElementById("location-label");
const locationAddress = document.getElementById("location-address");
const locationValidation = document.getElementById("location-validation");
const btnSetAddress = document.getElementById("btn-set-address");
const btnPickLocation = document.getElementById("btn-pick-location");
const btnUseGps = document.getElementById("btn-use-gps");
const locationLoading = document.getElementById("location-loading");
const locationLoadingLabel = document.getElementById("location-loading-label");
const locationInputHint = document.getElementById("location-input-hint");
const locationCard = document.getElementById("location-card");
const btnSetAddressSpinner = btnSetAddress?.querySelector(".btn-spinner");
const btnSetAddressLabel = btnSetAddress?.querySelector(".btn-label");
const customName = document.getElementById("custom-name");
const customCuisine = document.getElementById("custom-cuisine");
const customAddress = document.getElementById("custom-address");
const customCoords = document.getElementById("custom-coords");
const customValidation = document.getElementById("custom-validation");
const btnPlaceCustom = document.getElementById("btn-place-custom");
const btnSaveCustom = document.getElementById("btn-save-custom");
const mapFrame = document.querySelector(".map-frame");

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

  map.on("click", handleMapClick);
}

function setStatus(message) {
  mapStatus.textContent = message;
}

function showLoading(label = "Searching…") {
  loadingCount += 1;
  if (loadingBarLabel) {
    loadingBarLabel.textContent = label;
  }
  if (loadingBar) {
    loadingBar.hidden = false;
  }
}

function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0 && loadingBar) {
    loadingBar.hidden = true;
  }
}

async function withLoading(label, task) {
  showLoading(label);
  try {
    return await task();
  } finally {
    hideLoading();
  }
}

function setLocationValidation(message = "") {
  if (!locationValidation) return;
  if (!message) {
    locationValidation.hidden = true;
    locationValidation.textContent = "";
    return;
  }
  locationValidation.hidden = false;
  locationValidation.textContent = message;
}

function setAddressLoading(isLoading, label = "Looking up address…") {
  if (btnSetAddress) {
    btnSetAddress.disabled = isLoading;
    btnSetAddress.classList.toggle("is-loading", isLoading);
  }
  if (btnSetAddressSpinner) {
    btnSetAddressSpinner.hidden = !isLoading;
  }
  if (btnSetAddressLabel) {
    btnSetAddressLabel.textContent = isLoading ? "Setting…" : "Set location";
  }
  if (btnPickLocation) {
    btnPickLocation.disabled = isLoading;
  }
  if (btnUseGps) {
    btnUseGps.disabled = isLoading;
  }
  if (locationAddress) {
    locationAddress.disabled = isLoading;
    locationAddress.classList.toggle("is-loading", isLoading);
  }
  if (locationCard) {
    locationCard.classList.toggle("is-loading", isLoading);
  }
  if (locationLoading) {
    locationLoading.classList.toggle("is-visible", isLoading);
  }
  if (locationLoadingLabel) {
    locationLoadingLabel.textContent = label;
  }
  if (locationInputHint) {
    locationInputHint.hidden = isLoading;
  }
  if (locationLabel && isLoading) {
    locationLabel.textContent = label;
  }
  if (mapStatus && isLoading) {
    mapStatus.textContent = label;
  }
}

function updateLocationInputHint() {
  if (!locationInputHint || !locationAddress) return;
  if (locationAddress.disabled) return;

  const query = locationAddress.value.trim();
  if (query.length >= 2) {
    locationInputHint.textContent = "Press Enter or click Set location to search.";
  } else {
    locationInputHint.textContent = "Type an address, then press Enter or Set location.";
  }
}

function setCustomValidation(message = "") {
  if (!customValidation) return;
  if (!message) {
    customValidation.hidden = true;
    customValidation.textContent = "";
    return;
  }
  customValidation.hidden = false;
  customValidation.textContent = message;
}

function updateLocationLabel(label) {
  state.locationLabel = label;
  if (locationLabel) {
    locationLabel.textContent = label;
  }
}

function setMapMode(mode) {
  state.mapMode = mode;
  if (mapFrame) {
    mapFrame.classList.toggle("is-picking", Boolean(mode));
  }
  if (btnPickLocation) {
    btnPickLocation.classList.toggle("active", mode === "set-location");
  }
  if (btnPlaceCustom) {
    btnPlaceCustom.classList.toggle("active", mode === "add-restaurant");
  }
}

function updateCustomCoordsDisplay() {
  if (!customCoords) return;
  if (state.customDraftLat == null || state.customDraftLng == null) {
    customCoords.textContent = "Click the map to place this spot.";
    return;
  }
  customCoords.textContent = `Placed at ${state.customDraftLat.toFixed(5)}, ${state.customDraftLng.toFixed(5)}`;
}

function renderCustomDraftMarker() {
  if (customDraftMarker) {
    customDraftMarker.remove();
    customDraftMarker = null;
  }
  if (state.customDraftLat == null || state.customDraftLng == null || !map) {
    return;
  }

  customDraftMarker = L.marker([state.customDraftLat, state.customDraftLng], {
    icon: L.divIcon({
      className: "custom-draft-marker",
      html: "<span class=\"custom-marker\" aria-hidden=\"true\"></span>",
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    }),
    zIndexOffset: 1300,
  })
    .addTo(map)
    .bindPopup("New place");
}

async function persistLocation(lat, lng, label, source) {
  try {
    const response = await fetch("/api/location", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, label, source }),
    });
    if (!response.ok) {
      throw new Error("Could not save location.");
    }
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}

function setSearchValidation(message = "") {
  if (!searchValidation) return;
  if (!message) {
    searchValidation.hidden = true;
    searchValidation.textContent = "";
    return;
  }
  searchValidation.hidden = false;
  searchValidation.textContent = message;
}

function validateSearchQuery(raw) {
  const query = raw.trim();
  if (!query) {
    return { ok: true, clear: true };
  }
  if (query.length < 2) {
    return { ok: false, message: "Enter at least 2 characters to search." };
  }
  if (query.length > 80) {
    return { ok: false, message: "Search is too long. Try a shorter phrase." };
  }
  return { ok: true, query };
}

function isSearchMode() {
  return state.searchResults !== null;
}

function getDisplayRestaurants() {
  if (isSearchMode()) {
    return state.searchResults;
  }
  return state.nearbyRestaurants;
}

function setResultsMode(mode) {
  if (!resultsTitle) return;
  resultsTitle.textContent = mode === "search" ? "Search results" : "Nearby spots";
}

function updateResultsPanelVisibility() {
  if (!searchResultsPanel) return;
  searchResultsPanel.hidden = !isSearchMode();
}

function clearSearchMode() {
  state.searchResults = null;
  state.activeSearchQuery = "";
  setSearchValidation("");
  updateResultsPanelVisibility();
  if (restaurantSearch) {
    restaurantSearch.value = "";
  }
}

function filterParams() {
  return new URLSearchParams({
    lat: String(state.userLat),
    lng: String(state.userLng),
    radius_meters: String(state.radiusMeters),
    cuisine: state.cuisine,
    meal: state.meal,
    open_now: String(state.openNowOnly),
  });
}

function getMapRestaurants() {
  const visible = getDisplayRestaurants();
  if (!state.selected) {
    return visible;
  }
  if (visible.some((place) => place.id === state.selected.id)) {
    return visible;
  }
  return [...visible, state.selected];
}

function fitMapToRestaurants(places) {
  if (!map || places.length === 0) return;

  if (places.length === 1) {
    map.setView([places[0].lat, places[0].lng], 15);
    return;
  }

  const bounds = L.latLngBounds(places.map((place) => [place.lat, place.lng]));
  map.fitBounds(bounds, { padding: [48, 48] });
}

function clearRestaurantMarkers() {
  restaurantMarkers.forEach((marker) => marker.remove());
  restaurantMarkers = [];
}

function renderMapMarkers() {
  clearRestaurantMarkers();

  getMapRestaurants().forEach((place) => {
    const isSelected = state.selected?.id === place.id;
    const isCustom = Boolean(place.custom);
    const markerOptions = isCustom
      ? {
          radius: isSelected ? 9 : 7,
          color: "#2f6f4f",
          fillColor: isSelected ? "#2f6f4f" : "#6fae8d",
          fillOpacity: 0.95,
          weight: 2,
        }
      : {
          radius: isSelected ? 8 : 5,
          color: isSelected ? "#1a1a1a" : "#888",
          fillColor: isSelected ? "#1a1a1a" : "#bbb",
          fillOpacity: 0.9,
          weight: 1,
        };

    const marker = L.circleMarker([place.lat, place.lng], markerOptions)
      .addTo(map)
      .bindPopup(
        `<strong>${place.name}</strong><br>${place.distance_label} away${isCustom ? "<br><em>Your place</em>" : ""}`
      );

    marker.on("click", () => selectRestaurant(place));
    restaurantMarkers.push(marker);
  });

  window.ZahaSavedMarkers.renderSavedMarkers(map, window.ZahaLists.getCachedLists());
}

function renderRestaurantList(scrollIntoView = false) {
  updateResultsPanelVisibility();

  if (!isSearchMode()) {
    if (restaurantList) {
      restaurantList.innerHTML = "";
    }
    if (matchCount) {
      matchCount.textContent = "0";
    }
    return;
  }

  const display = getDisplayRestaurants();
  matchCount.textContent = String(display.length);

  if (display.length === 0) {
    restaurantList.innerHTML = `<li class="empty-state">No restaurants match "${state.activeSearchQuery}". Try another search.</li>`;
    return;
  }

  restaurantList.innerHTML = display
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
      const place = display.find((entry) => entry.id === item.dataset.id);
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

  const index = state.nearbyRestaurants.findIndex((entry) => entry.id === place.id);
  if (index >= 0) {
    state.nearbyRestaurants[index] = { ...state.nearbyRestaurants[index], ...enriched };
  }

  const searchIndex =
    state.searchResults?.findIndex((entry) => entry.id === place.id) ?? -1;
  if (searchIndex >= 0) {
    state.searchResults[searchIndex] = { ...state.searchResults[searchIndex], ...enriched };
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
  if (state.userLat == null || state.userLng == null) return;

  clearSearchMode();
  setResultsMode("nearby");

  try {
    await withLoading("Picking a random spot…", async () => {
      const response = await fetch(`/api/pick?${filterParams()}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "No restaurants match your filters yet.");
      }
      await selectRestaurant(payload.restaurant);
      setStatus(payload.status);
    });
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

  try {
    await withLoading("Loading nearby restaurants…", async () => {
      const response = await fetch(`/api/restaurants?${filterParams()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Could not load nearby restaurants.");
      }
      const payload = await response.json();
      state.nearbyRestaurants = payload.restaurants;

      if (!isSearchMode()) {
        state.selected = null;
        resultCard.hidden = true;
        renderRestaurantList();
        renderMapMarkers();
        updateRadiusCircle(true);
        setStatus(payload.status);
        return;
      }

      renderRestaurantList();
      renderMapMarkers();
      updateRadiusCircle(false);
    });
  } catch (error) {
    setStatus(error.message || "Something went wrong while searching.");
  }
}

async function executeSearch() {
  if (!restaurantSearch) return;

  const validation = validateSearchQuery(restaurantSearch.value);
  setSearchValidation("");

  if (!validation.ok) {
    setSearchValidation(validation.message);
    restaurantSearch.focus();
    return;
  }

  if (validation.clear) {
    clearSearchMode();
    state.selected = null;
    resultCard.hidden = true;
    renderRestaurantList();
    renderMapMarkers();
    updateRadiusCircle(false);
    setStatus("Enter a search to see matching restaurants.");
    return;
  }

  if (state.userLat == null || state.userLng == null) {
    setSearchValidation("Waiting for your location before searching.");
    return;
  }

  try {
    await withLoading("Searching restaurants…", async () => {
      const params = new URLSearchParams({
        lat: String(state.userLat),
        lng: String(state.userLng),
        q: validation.query,
      });
      const response = await fetch(`/api/search?${params}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "Search could not be completed.");
      }

      state.activeSearchQuery = validation.query;
      state.searchResults = payload.restaurants;
      state.selected = null;
      resultCard.hidden = true;
      setResultsMode("search");
      updateResultsPanelVisibility();
      renderRestaurantList(true);
      renderMapMarkers();
      fitMapToRestaurants(state.searchResults);
      setStatus(payload.status);
    });
  } catch (error) {
    console.error(error);
    setSearchValidation("Search could not be completed. Please try again.");
  }
}

function showNearbyMatches(scrollIntoView = false) {
  clearSearchMode();
  state.selected = null;
  resultCard.hidden = true;
  renderRestaurantList();
  renderMapMarkers();
  updateRadiusCircle(false);
  setStatus(
    `${state.nearbyRestaurants.length} matches within your radius — tap a pin on the map to select.`
  );
  if (scrollIntoView && restaurantSearch) {
    restaurantSearch.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

async function setUserLocation(lat, lng, label, source = "manual", refresh = true) {
  state.userLat = lat;
  state.userLng = lng;
  updateLocationLabel(label);
  setLocationValidation("");

  if (userMarker) userMarker.remove();
  userMarker = L.circleMarker([lat, lng], {
    radius: 7,
    color: "#1a1a1a",
    fillColor: "#ffffff",
    fillOpacity: 1,
    weight: 2,
  })
    .addTo(map)
    .bindPopup(label || "Your location");

  map.setView([lat, lng], 14);
  updateRadiusCircle(false);
  setStatus(label ? `Location set: ${label}` : "Location updated.");
  persistLocation(lat, lng, label, source);

  if (refresh) {
    await refreshRestaurants();
  }
}

async function loadSavedLocation() {
  try {
    const response = await fetch("/api/location");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error("Could not load saved location.");
    }
    await setUserLocation(
      payload.lat,
      payload.lng,
      payload.label,
      payload.source || "manual",
      true
    );
  } catch (error) {
    await setUserLocation(
      FALLBACK_CENTER[0],
      FALLBACK_CENTER[1],
      window.ZAHA_PICKS.defaultLocationLabel || "San Francisco (default)",
      "default",
      true
    );
  }
}

function locateUser() {
  if (!navigator.geolocation) {
    setLocationValidation("Geolocation is not available in this browser.");
    return;
  }

  setStatus("Requesting GPS location…");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setUserLocation(
        position.coords.latitude,
        position.coords.longitude,
        "Current GPS location",
        "gps"
      );
    },
    () => {
      setLocationValidation("GPS access was blocked. Set your location manually instead.");
      setStatus("GPS blocked — set your location with an address or by clicking the map.");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function setLocationFromAddress() {
  if (!locationAddress) return;

  const query = locationAddress.value.trim();
  setLocationValidation("");
  if (query.length < 2) {
    setLocationValidation("Enter at least 2 characters to search for a location.");
    locationAddress.focus();
    return;
  }

  setAddressLoading(true, "Looking up address…");

  try {
    await withLoading("Looking up address…", async () => {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/geocode?${params}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "No locations found for that search.");
      }

      setAddressLoading(true, "Updating map and nearby spots…");
      if (loadingBarLabel) {
        loadingBarLabel.textContent = "Updating map and nearby spots…";
      }

      const match = payload.results[0];
      await setUserLocation(match.lat, match.lng, match.label, "address");
      setMapMode(null);
    });
  } catch (error) {
    setLocationValidation(error.message);
  } finally {
    setAddressLoading(false);
  }
}

function handleMapClick(event) {
  if (!state.mapMode) return;

  const { lat, lng } = event.latlng;

  if (state.mapMode === "set-location") {
    void (async () => {
      setAddressLoading(true, "Updating map and nearby spots…");
      try {
        await withLoading("Updating map and nearby spots…", async () => {
          await setUserLocation(lat, lng, "Map location", "map");
          setMapMode(null);
        });
      } finally {
        setAddressLoading(false);
      }
    })();
    return;
  }

  if (state.mapMode === "add-restaurant") {
    state.customDraftLat = lat;
    state.customDraftLng = lng;
    updateCustomCoordsDisplay();
    renderCustomDraftMarker();
    setMapMode(null);
    setStatus("Place marker set. Fill in the name and save.");
  }
}

async function saveCustomRestaurant() {
  setCustomValidation("");

  const name = customName?.value.trim() || "";
  if (!name) {
    setCustomValidation("Enter a name for this place.");
    customName?.focus();
    return;
  }
  if (state.customDraftLat == null || state.customDraftLng == null) {
    setCustomValidation("Click the map to place this restaurant first.");
    return;
  }

  try {
    await withLoading("Saving your place…", async () => {
      const response = await fetch("/api/custom-restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          lat: state.customDraftLat,
          lng: state.customDraftLng,
          cuisine: customCuisine?.value.trim() || "",
          address: customAddress?.value.trim() || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "Could not save this place.");
      }

      if (customName) customName.value = "";
      if (customCuisine) customCuisine.value = "";
      if (customAddress) customAddress.value = "";
      state.customDraftLat = null;
      state.customDraftLng = null;
      updateCustomCoordsDisplay();
      renderCustomDraftMarker();
      await refreshRestaurants();
      if (payload.place) {
        await selectRestaurant(payload.place);
      }
      setStatus(`Saved ${name} to your local database.`);
    });
  } catch (error) {
    setCustomValidation(error.message);
  }
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
    showNearbyMatches(true);
  });

  if (btnSearch) {
    btnSearch.addEventListener("click", executeSearch);
  }

  if (restaurantSearch) {
    restaurantSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        executeSearch();
      }
    });

    restaurantSearch.addEventListener("input", () => {
      if (!restaurantSearch.value.trim() && isSearchMode()) {
        clearSearchMode();
        state.selected = null;
        resultCard.hidden = true;
        renderRestaurantList();
        renderMapMarkers();
        updateRadiusCircle(false);
        setStatus("Enter a search to see matching restaurants.");
      }
    });
  }

  btnWantVisit.addEventListener("click", handleWantToVisit);
  btnMarkVisited.addEventListener("click", handleMarkVisited);

  if (btnSetAddress) {
    btnSetAddress.addEventListener("click", setLocationFromAddress);
  }
  if (locationAddress) {
    locationAddress.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        setLocationFromAddress();
      }
    });
    locationAddress.addEventListener("input", updateLocationInputHint);
  }
  if (btnPickLocation) {
    btnPickLocation.addEventListener("click", () => {
      const nextMode = state.mapMode === "set-location" ? null : "set-location";
      setMapMode(nextMode);
      setStatus(
        nextMode
          ? "Click anywhere on the map to set your location."
          : "Location picking cancelled."
      );
    });
  }
  if (btnUseGps) {
    btnUseGps.addEventListener("click", locateUser);
  }
  if (btnPlaceCustom) {
    btnPlaceCustom.addEventListener("click", () => {
      const nextMode = state.mapMode === "add-restaurant" ? null : "add-restaurant";
      setMapMode(nextMode);
      setStatus(
        nextMode
          ? "Click the map where this place should go."
          : "Place picking cancelled."
      );
    });
  }
  if (btnSaveCustom) {
    btnSaveCustom.addEventListener("click", saveCustomRestaurant);
  }

  window.addEventListener("zaha-lists-updated", () => {
    window.ZahaSavedMarkers.renderSavedMarkers(map, window.ZahaLists.getCachedLists());
    if (state.selected) updateSaveButtons(state.selected);
  });
}

initMap();
bindControls();

(async function bootstrap() {
  await window.ZahaLists.ensureReady();
  updateResultsPanelVisibility();
  updateLocationInputHint();
  window.ZahaSavedMarkers.renderSavedMarkers(map, window.ZahaLists.getCachedLists());
  await loadSavedLocation();
})();
