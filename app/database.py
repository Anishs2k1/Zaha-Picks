import sqlite3
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "zaha_picks.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS saved_restaurants (
                osm_id TEXT PRIMARY KEY,
                list_type TEXT NOT NULL CHECK(list_type IN ('want', 'visited')),
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                cuisine TEXT NOT NULL,
                address TEXT NOT NULL,
                saved_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_saved_restaurants_list_type
            ON saved_restaurants(list_type);

            CREATE TABLE IF NOT EXISTS geocode_cache (
                cache_key TEXT PRIMARY KEY,
                address TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )


def _row_to_place(row: sqlite3.Row) -> dict:
    return {
        "id": row["osm_id"],
        "name": row["name"],
        "lat": row["lat"],
        "lng": row["lng"],
        "cuisine": row["cuisine"],
        "address": row["address"],
        "savedAt": row["saved_at"],
    }


def get_lists() -> dict:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT osm_id, list_type, name, lat, lng, cuisine, address, saved_at
            FROM saved_restaurants
            ORDER BY saved_at DESC
            """
        ).fetchall()

    want_to_visit = []
    visited = []
    for row in rows:
        place = _row_to_place(row)
        if row["list_type"] == "want":
            want_to_visit.append(place)
        else:
            visited.append(place)

    return {"wantToVisit": want_to_visit, "visited": visited}


def save_place(place: dict, list_type: str) -> dict:
    saved_at = datetime.now(timezone.utc).isoformat()
    with _connect() as connection:
        connection.execute("DELETE FROM saved_restaurants WHERE osm_id = ?", (place["id"],))
        connection.execute(
            """
            INSERT INTO saved_restaurants
            (osm_id, list_type, name, lat, lng, cuisine, address, saved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                place["id"],
                list_type,
                place["name"],
                place["lat"],
                place["lng"],
                place["cuisine"],
                place["address"],
                saved_at,
            ),
        )

    saved = dict(place)
    saved["savedAt"] = saved_at
    return saved


def remove_place(osm_id: str, list_type: str) -> bool:
    with _connect() as connection:
        cursor = connection.execute(
            """
            DELETE FROM saved_restaurants
            WHERE osm_id = ? AND list_type = ?
            """,
            (osm_id, list_type),
        )
        return cursor.rowcount > 0


def is_in_list(osm_id: str, list_type: str) -> bool:
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT 1
            FROM saved_restaurants
            WHERE osm_id = ? AND list_type = ?
            LIMIT 1
            """,
            (osm_id, list_type),
        ).fetchone()
    return row is not None


def get_geocode_cache(cache_key: str) -> str | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT address FROM geocode_cache WHERE cache_key = ?",
            (cache_key,),
        ).fetchone()
    return row["address"] if row else None


def set_geocode_cache(cache_key: str, address: str) -> None:
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO geocode_cache (cache_key, address, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                address = excluded.address,
                created_at = excluded.created_at
            """,
            (cache_key, address, datetime.now(timezone.utc).isoformat()),
        )
