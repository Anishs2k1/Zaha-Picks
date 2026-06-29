import random
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.constants import FALLBACK_LAT, FALLBACK_LNG, METERS_PER_MILE
from app.overpass import fetch_restaurants

BASE_DIR = Path(__file__).resolve().parent.parent

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
    return {
        "restaurant": choice,
        "status": f"Picked randomly from {len(places)} open spots within your radius.",
    }
