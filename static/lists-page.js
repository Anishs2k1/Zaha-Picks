const FALLBACK_CENTER = [
  window.ZAHA_PICKS.fallbackLat,
  window.ZAHA_PICKS.fallbackLng,
];

let map;

const wantList = document.getElementById("want-list");
const visitedList = document.getElementById("visited-list");
const wantCount = document.getElementById("want-count");
const visitedCount = document.getElementById("visited-count");

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

function renderList(container, items, emptyMessage, listType) {
  if (items.length === 0) {
    container.innerHTML = `<li class="empty-state">${emptyMessage}</li>`;
    return;
  }

  container.innerHTML = items
    .map(
      (place) => `
      <li class="saved-list-item" data-id="${place.id}" data-list="${listType}">
        <div class="saved-list-content">
          <p class="restaurant-name">${place.name}</p>
          <p class="restaurant-detail">${place.cuisine.replace(/;/g, ", ")}</p>
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
      const place = items.find((entry) => entry.id === item.dataset.id);
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

function fitMapToSavedPlaces(wantToVisit, visited) {
  const all = [...wantToVisit, ...visited];
  window.ZahaSavedMarkers.renderSavedMarkers(map);

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
  const { wantToVisit, visited } = await window.ZahaLists.loadLists();
  wantCount.textContent = String(wantToVisit.length);
  visitedCount.textContent = String(visited.length);

  renderList(
    wantList,
    wantToVisit,
    "No restaurants saved yet. Add some from the home page.",
    "want"
  );
  renderList(
    visitedList,
    visited,
    "Mark restaurants as visited while browsing on the home page.",
    "visited"
  );

  fitMapToSavedPlaces(wantToVisit, visited);
}

initMap();

(async function bootstrap() {
  try {
    await window.ZahaLists.ensureReady();
    await refreshPage();
  } catch (error) {
    wantList.innerHTML = `<li class="empty-state">${error.message || "Could not load saved lists."}</li>`;
    visitedList.innerHTML = `<li class="empty-state">${error.message || "Could not load saved lists."}</li>`;
  }
})();

window.addEventListener("zaha-lists-updated", () => {
  refreshPage();
});
