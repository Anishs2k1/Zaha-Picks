import random
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from app.constants import (
    FALLBACK_LAT,
    FALLBACK_LNG,
    MAX_SEARCH_RESULTS,
    METERS_PER_MILE,
    SEARCH_RADIUS_METERS,
)
from app.filters import filter_by_search
from app.database import get_lists, init_db, remove_place, save_place
from app.enrich import enrich_restaurant
from app.overpass import fetch_restaurants
from app.yelp import resolve_yelp_business_url

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="Zaha Picks")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


class RestaurantPayload(BaseModel):
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    lat: float
    lng: float
    cuisine: str = ""
    address: str = ""
    tags: dict | None = None
    distance: int | None = None
    distance_label: str | None = None
    opening_hours: str | None = None
    yelp_url: str | None = None
    yelp_direct: bool | None = None


class LocalListsMigration(BaseModel):
    wantToVisit: list[dict] = Field(default_factory=list)
    visited: list[dict] = Field(default_factory=list)


@app.on_event("startup")
async def startup() -> None:
    init_db()


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "fallback_lat": FALLBACK_LAT,
            "fallback_lng": FALLBACK_LNG,
        },
    )


@app.get("/lists", response_class=HTMLResponse)
async def lists_page(request: Request):
    return templates.TemplateResponse(
        request,
        "lists.html",
        {
            "fallback_lat": FALLBACK_LAT,
            "fallback_lng": FALLBACK_LNG,
        },
    )


@app.get("/api/lists")
async def lists_api():
    return get_lists()


@app.post("/api/lists/want")
async def add_want_to_visit(restaurant: RestaurantPayload):
    place = await enrich_restaurant(restaurant.model_dump())
    save_place(place, "want")
    return get_lists()


@app.post("/api/lists/visited")
async def add_visited(restaurant: RestaurantPayload):
    place = await enrich_restaurant(restaurant.model_dump())
    save_place(place, "visited")
    return get_lists()


@app.delete("/api/lists/want/{osm_id:path}")
async def delete_want(osm_id: str):
    if not remove_place(osm_id, "want"):
        raise HTTPException(status_code=404, detail="Restaurant not found in want list.")
    return get_lists()


@app.delete("/api/lists/visited/{osm_id:path}")
async def delete_visited(osm_id: str):
    if not remove_place(osm_id, "visited"):
        raise HTTPException(status_code=404, detail="Restaurant not found in visited list.")
    return get_lists()


@app.post("/api/lists/migrate")
async def migrate_local_lists(payload: LocalListsMigration):
    visited_ids = set()

    for place in payload.visited:
        enriched = await enrich_restaurant(place)
        save_place(enriched, "visited")
        visited_ids.add(enriched["id"])

    for place in payload.wantToVisit:
        place_id = place.get("id")
        if not place_id or place_id in visited_ids:
            continue
        enriched = await enrich_restaurant(place)
        save_place(enriched, "want")

    return get_lists()


@app.post("/api/enrich")
async def enrich_restaurant_api(restaurant: RestaurantPayload):
    return await enrich_restaurant(restaurant.model_dump())


@app.get("/api/restaurants")
async def restaurants(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_meters: int = Query(1609, ge=100, le=20000),
    cuisine: str = Query("any"),
    meal: str = Query("lunch", pattern="^(lunch|dinner)$"),
    open_now: bool = Query(True),
):
    try:
        places = await fetch_restaurants(
            lat=lat,
            lng=lng,
            radius_meters=radius_meters,
            cuisine=cuisine,
            meal=meal,
            open_now_only=open_now,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not load nearby restaurants.") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unexpected error while searching.") from exc

    radius_miles = radius_meters / METERS_PER_MILE
    meal_label = meal
    if places:
        status = f"Found {len(places)} spots within {radius_miles:.1f} mi for {meal_label}."
    else:
        status = f"No spots found within {radius_miles:.1f} mi. Try a wider radius."

    return {"restaurants": places, "count": len(places), "status": status}


@app.get("/api/search")
async def search_restaurants(
    lat: float = Query(...),
    lng: float = Query(...),
    q: str = Query(..., min_length=2, max_length=80),
):
    try:
        places = await fetch_restaurants(
            lat=lat,
            lng=lng,
            radius_meters=SEARCH_RADIUS_METERS,
            cuisine="any",
            meal="lunch",
            open_now_only=False,
        )
        places = filter_by_search(places, q)
        total_matches = len(places)
        places = places[:MAX_SEARCH_RESULTS]
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not search restaurants.") from exc

    search_label = q.strip()
    radius_miles = SEARCH_RADIUS_METERS / METERS_PER_MILE
    if places:
        status = f"Found {total_matches} match{'es' if total_matches != 1 else ''} for \"{search_label}\" within {radius_miles:.0f} mi."
        if total_matches > MAX_SEARCH_RESULTS:
            status += f" Showing closest {MAX_SEARCH_RESULTS}."
    else:
        status = f"No restaurants match \"{search_label}\" within {radius_miles:.0f} mi."

    return {
        "restaurants": places,
        "count": len(places),
        "total_matches": total_matches,
        "status": status,
        "search_radius_miles": round(radius_miles),
    }


@app.get("/api/pick")
async def pick_random(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_meters: int = Query(1609, ge=100, le=20000),
    cuisine: str = Query("any"),
    meal: str = Query("lunch", pattern="^(lunch|dinner)$"),
    open_now: bool = Query(True),
):
    try:
        places = await fetch_restaurants(
            lat=lat,
            lng=lng,
            radius_meters=radius_meters,
            cuisine=cuisine,
            meal=meal,
            open_now_only=open_now,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not load nearby restaurants.") from exc

    if not places:
        raise HTTPException(status_code=404, detail="No restaurants match your filters yet.")

    choice = random.choice(places)
    choice = await enrich_restaurant(choice)
    yelp = await resolve_yelp_business_url(
        choice["name"],
        choice["lat"],
        choice["lng"],
        choice.get("address", ""),
        choice.get("tags"),
    )
    choice["yelp_url"] = yelp["url"]
    choice["yelp_direct"] = yelp["direct"]
    return {
        "restaurant": choice,
        "status": f"Picked randomly from {len(places)} open spots within your radius.",
    }


@app.get("/api/yelp")
async def yelp_page(
    name: str = Query(..., min_length=1),
    lat: float = Query(...),
    lng: float = Query(...),
    address: str = Query(""),
):
    result = await resolve_yelp_business_url(name, lat, lng, address)
    return result
