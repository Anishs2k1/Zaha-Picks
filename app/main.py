import random
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.constants import FALLBACK_LAT, FALLBACK_LNG, METERS_PER_MILE
from app.overpass import fetch_restaurants
from app.yelp import resolve_yelp_business_url

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="Zaha Picks")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


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
