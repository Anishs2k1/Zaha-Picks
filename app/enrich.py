from app.filters import format_address, infer_cuisine
from app.geocode import reverse_geocode

MISSING_ADDRESS = "Address not listed"
MISSING_CUISINE = "Unspecified"


async def enrich_restaurant(place: dict) -> dict:
    tags = place.get("tags") or {}
    name = (place.get("name") or "").strip()
    if not name:
        raise ValueError("Restaurant name is required.")

    cuisine = infer_cuisine(tags, name, place.get("cuisine"))
    address = format_address(tags)
    if address == MISSING_ADDRESS:
        address = place.get("address") or MISSING_ADDRESS
    if address == MISSING_ADDRESS:
        resolved = await reverse_geocode(float(place["lat"]), float(place["lng"]))
        if resolved:
            address = resolved

    enriched = {
        "id": place["id"],
        "name": name,
        "lat": float(place["lat"]),
        "lng": float(place["lng"]),
        "cuisine": cuisine,
        "address": address,
    }

    for key in ("distance", "distance_label", "opening_hours", "yelp_url", "yelp_direct", "tags"):
        if key in place and place[key] is not None:
            enriched[key] = place[key]

    return enriched
