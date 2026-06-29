const FALLBACK_CENTER = [
  window.ZAHA_PICKS.fallbackLat,
  window.ZAHA_PICKS.fallbackLng,
];

let map;

const wantList = document.getElementById("want-list");
const visitedList = document.getElementById("visited-list");
const wantCount = document.getElementById("want-count");
const visitedCount = document.getElementById("visited-count");

const EMPTY_WANT_MESSAGE = "No restaurants saved yet. Add some from the home page.";
const EMPTY_VISITED_MESSAGE =
  "Mark restaurants as visited while browsing on the home page.";

function initMap() {
  map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
  }).setView(FALLBACK_CENTER, 13);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);
}

function formatCuisine(cuisine) {
  return (cuisine || "Unspecified").replace(/;/g, ", ");
}

function renderList(container, items, emptyMessage, listType) {
  const safeItems = Array.isArray(items) ? items : [];

  if (safeItems.length === 0) {
    container.innerHTML = `<li class="empty-state">${emptyMessage}</li>`;
    return;
  }

  container.innerHTML = safeItems
    .map(
      (place) => `
      <li class="saved-list-item" data-id="${place.id}" data-list="${listType}">
        <div class="saved-list-content">
          <p class="restaurant-name">${place.name}</p>
          <p class="restaurant-detail">${formatCuisine(place.cuisine)}</p>
          <p class="restaurant-detail">${place.address || "Address not listed"}</p>
        </div>
        <button type="button" class="btn-remove" data-id="${place.id}" data-list="${listType}" aria-label="Remove ${place.name}">
          Remove
        </button>
      </li>
    `
    )
    .join("");

  container.querySelectorAll(".saved-list-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (event.target.classList.contains("btn-remove")) return;
      const place = safeItems.find((entry) => entry.id === item.dataset.id);
      if (place) {
        map.panTo([place.lat, place.lng], { animate: true });
        map.setZoom(Math.max(map.getZoom(), 15));
      }
    });
  });

  container.querySelectorAll(".btn-remove").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        if (button.dataset.list === "want") {
          await window.ZahaLists.removeWantToVisit(button.dataset.id);
        } else {
          await window.ZahaLists.removeVisited(button.dataset.id);
        }
        await refreshPage();
      } catch (error) {
        console.error(error);
      }
    });
  });
}

function fitMapToSavedPlaces(lists) {
  const wantToVisit = Array.isArray(lists.wantToVisit) ? lists.wantToVisit : [];
  const visited = Array.isArray(lists.visited) ? lists.visited : [];
  const all = [...wantToVisit, ...visited];

  window.ZahaSavedMarkers.renderSavedMarkers(map, { wantToVisit, visited });

  if (all.length === 0) {
    map.setView(FALLBACK_CENTER, 13);
    return;
  }

  if (all.length === 1) {
    map.setView([all[0].lat, all[0].lng], 15);
    return;
  }

  const bounds = L.latLngBounds(all.map((place) => [place.lat, place.lng]));
  map.fitBounds(bounds, { padding: [48, 48] });
}

async function refreshPage() {
  const lists = await window.ZahaLists.loadLists();
  const wantToVisit = lists.wantToVisit || [];
  const visited = lists.visited || [];

  wantCount.textContent = String(wantToVisit.length);
  visitedCount.textContent = String(visited.length);

  renderList(wantList, wantToVisit, EMPTY_WANT_MESSAGE, "want");
  renderList(visitedList, visited, EMPTY_VISITED_MESSAGE, "visited");
  fitMapToSavedPlaces({ wantToVisit, visited });
}

initMap();

(async function bootstrap() {
  await window.ZahaLists.ensureReady();
  await refreshPage();
})();

window.addEventListener("zaha-lists-updated", () => {
  refreshPage();
});
