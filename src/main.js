import L from "leaflet";
import "leaflet/dist/leaflet.css";

const FALLBACK_CENTER = [40.4259, -86.9081];
const METERS_PER_MILE = 1609.34;

const state = {
  meal: "lunch",
  cuisine: "any",
  radiusMeters: 1609,
  openNowOnly: true,
  userLat: null,
  userLng: null,
  restaurants: [],
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

function mealWindow(meal) {
  if (meal === "lunch") {
    return { start: 11 * 60, end: 15 * 60 };
  }
  return { start: 17 * 60, end: 22 * 60 };
}

function parseTimeToMinutes(value) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isOpenForMeal(openingHours, meal) {
  if (!openingHours || openingHours.toLowerCase() === "24/7") {
    return true;
  }

  const now = new Date();
  const dayIndex = now.getDay();
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const today = dayNames[dayIndex];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const { start, end } = mealWindow(meal);

  const segments = openingHours.split(";").map((part) => part.trim()).filter(Boolean);

  for (const segment of segments) {
    const dayMatch = segment.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?/);
    if (!dayMatch) continue;

    const startDay = dayMatch[1];
    const endDay = dayMatch[2] || startDay;
    const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    const startIdx = days.indexOf(startDay);
    const endIdx = days.indexOf(endDay);
    const todayIdx = days.indexOf(today === "Su" ? "Su" : today);

    let dayMatches = false;
    if (startIdx <= endIdx) {
      dayMatches = todayIdx >= startIdx && todayIdx <= endIdx;
    } else {
      dayMatches = todayIdx >= startIdx || todayIdx <= endIdx;
    }

    if (!dayMatches) continue;

    const timePart = segment.replace(/^(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*/, "");
    const ranges = timePart.split(",").map((range) => range.trim()).filter(Boolean);

    for (const range of ranges) {
      const [openStr, closeStr] = range.split("-").map((part) => part.trim());
      const openMinutes = parseTimeToMinutes(openStr);
      const closeMinutes = parseTimeToMinutes(closeStr);
      if (openMinutes == null || closeMinutes == null) continue;

      const overlapsMeal =
        Math.max(openMinutes, start) < Math.min(closeMinutes, end);

      if (overlapsMeal && currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
        return true;
      }
    }
  }

  return false;
}

function matchesCuisine(tags, cuisineFilter) {
  if (cuisineFilter === "any") return true;

  const cuisine = (tags.cuisine || "").toLowerCase();
  const name = (tags.name || "").toLowerCase();

  const aliases = {
    american: ["american", "burger", "bbq", "barbecue"],
    asian: ["asian", "pan-asian"],
    chinese: ["chinese", "dim_sum"],
    indian: ["indian", "curry"],
    italian: ["italian", "pasta"],
    japanese: ["japanese", "sushi", "ramen"],
    mexican: ["mexican", "tex-mex", "taco"],
    pizza: ["pizza", "pizzeria"],
    seafood: ["seafood", "fish", "sushi"],
    thai: ["thai"],
    vietnamese: ["vietnamese", "pho"],
  };

  const terms = aliases[cuisineFilter] || [cuisineFilter];
  return terms.some((term) => cuisine.includes(term) || name.includes(term));
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
  const miles = meters / METERS_PER_MILE;
  return miles < 0.1 ? "< 0.1 mi" : `${miles.toFixed(1)} mi`;
}

function formatAddress(tags) {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
  ].filter(Boolean);
  return parts.join(" ") || "Address not listed";
}

function normalizeRestaurant(element) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (lat == null || lng == null) return null;

  const tags = element.tags || {};
  if (!tags.name) return null;

  return {
    id: `${element.type}/${element.id}`,
    name: tags.name,
    lat,
    lng,
    tags,
    cuisine: tags.cuisine || "unspecified",
    openingHours: tags.opening_hours || tags["opening_hours:covid19"] || null,
    distance: distanceMeters(state.userLat, state.userLng, lat, lng),
  };
}

function applyStandardFilters(places) {
  return places
    .filter((place) => place.distance <= state.radiusMeters)
    .filter((place) => matchesCuisine(place.tags, state.cuisine))
    .filter((place) => {
      if (!state.openNowOnly) return true;
      if (place.isOpen === false) return false;
      if (!place.openingHours) return true;
      return isOpenForMeal(place.openingHours, state.meal);
    })
    .sort((a, b) => a.distance - b.distance);
}

async function fetchRestaurants() {
  if (state.userLat == null || state.userLng == null) return [];

  const radius = Math.round(state.radiusMeters);
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"~"restaurant|fast_food|cafe"](around:${radius},${state.userLat},${state.userLng});
      way["amenity"~"restaurant|fast_food|cafe"](around:${radius},${state.userLat},${state.userLng});
    );
    out center tags;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });

  if (!response.ok) {
    throw new Error("Could not load nearby restaurants.");
  }

  const data = await response.json();
  const places = (data.elements || []).map(normalizeRestaurant).filter(Boolean);

  return applyStandardFilters(places);
}

function clearRestaurantMarkers() {
  restaurantMarkers.forEach((marker) => marker.remove());
  restaurantMarkers = [];
}

function renderMapMarkers() {
  clearRestaurantMarkers();

  state.restaurants.forEach((place) => {
    const marker = L.circleMarker([place.lat, place.lng], {
      radius: state.selected?.id === place.id ? 8 : 5,
      color: state.selected?.id === place.id ? "#1a1a1a" : "#888",
      fillColor: state.selected?.id === place.id ? "#1a1a1a" : "#bbb",
      fillOpacity: 0.9,
      weight: 1,
    })
      .addTo(map)
      .bindPopup(`<strong>${place.name}</strong><br>${formatDistance(place.distance)} away`);

    marker.on("click", () => selectRestaurant(place));
    restaurantMarkers.push(marker);
  });
}

function renderRestaurantList(scrollIntoView = false) {
  matchCount.textContent = String(state.restaurants.length);

  if (state.restaurants.length === 0) {
    restaurantList.innerHTML =
      '<li class="empty-state">No matches found. Try expanding the radius or changing cuisine.</li>';
    return;
  }

  restaurantList.innerHTML = state.restaurants
    .map(
      (place) => `
      <li class="restaurant-item" data-id="${place.id}">
        <p class="restaurant-name">${place.name}</p>
        <p class="restaurant-detail">${formatDistance(place.distance)} · ${place.cuisine.replace(/;/g, ", ")}</p>
        <p class="restaurant-detail">${formatAddress(place.tags)}</p>
      </li>
    `
    )
    .join("");

  restaurantList.querySelectorAll(".restaurant-item").forEach((item) => {
    item.addEventListener("click", () => {
      const place = state.restaurants.find((entry) => entry.id === item.dataset.id);
      if (place) selectRestaurant(place);
    });
  });

  if (scrollIntoView) {
    restaurantList.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function selectRestaurant(place) {
  state.selected = place;
  resultCard.hidden = false;
  resultName.textContent = place.name;
  resultMeta.textContent = `${state.meal === "lunch" ? "Lunch" : "Dinner"} · ${formatDistance(place.distance)} · ${place.cuisine.replace(/;/g, ", ")}`;
  resultAddress.textContent = formatAddress(place.tags);
  resultDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;

  map.panTo([place.lat, place.lng], { animate: true });
  renderMapMarkers();
}

function pickRandomRestaurant() {
  if (state.restaurants.length === 0) {
    setStatus("No restaurants match your filters yet.");
    return;
  }
  const index = Math.floor(Math.random() * state.restaurants.length);
  selectRestaurant(state.restaurants[index]);
  setStatus(`Picked randomly from ${state.restaurants.length} open spots within your radius.`);
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
  setStatus("Searching nearby restaurants…");

  try {
    state.restaurants = await fetchRestaurants();
    state.selected = null;
    resultCard.hidden = true;
    renderRestaurantList();
    renderMapMarkers();
    updateRadiusCircle(true);

    const radiusMiles = (state.radiusMeters / METERS_PER_MILE).toFixed(1);
    setStatus(
      state.restaurants.length
        ? `Found ${state.restaurants.length} spots within ${radiusMiles} mi for ${state.meal}.`
        : `No spots found within ${radiusMiles} mi. Try a wider radius.`
    );
  } catch (error) {
    setStatus(error.message || "Something went wrong while searching.");
  }
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
    setStatus(`Browsing ${state.restaurants.length} matches — tap one to select.`);
  });
}

initMap();
bindControls();
locateUser();
