let savedMarkers = [];

function clearSavedMarkers() {
  savedMarkers.forEach((marker) => marker.remove());
  savedMarkers = [];
}

function createStarIcon() {
  return L.divIcon({
    className: "saved-marker-star",
    html: "<span aria-hidden=\"true\">★</span>",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function renderSavedMarkers(map) {
  if (!map || !window.ZahaLists) return;

  clearSavedMarkers();
  const { wantToVisit, visited } = window.ZahaLists.loadLists();

  wantToVisit.forEach((place) => {
    const marker = L.marker([place.lat, place.lng], {
      icon: createStarIcon(),
      zIndexOffset: 1200,
    })
      .addTo(map)
      .bindPopup(`<strong>${place.name}</strong><br>Want to visit`);

    savedMarkers.push(marker);
  });

  visited.forEach((place) => {
    const marker = L.circleMarker([place.lat, place.lng], {
      radius: 9,
      color: "#1a1a1a",
      fillColor: "#1a1a1a",
      fillOpacity: 1,
      weight: 2,
      zIndexOffset: 1100,
    })
      .addTo(map)
      .bindPopup(`<strong>${place.name}</strong><br>Visited`);

    savedMarkers.push(marker);
  });
}

window.ZahaSavedMarkers = {
  renderSavedMarkers,
  clearSavedMarkers,
};
