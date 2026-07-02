#!/usr/bin/env python3
"""Seed one test trade listing into the LOCAL wrangler/miniflare D1 database.

Local-development helper only -- never run against production data.

Why this exists: emwiki has no wrangler config, so `env.DBA` is only bound
locally when you start the dev server with an explicit D1 flag:

    npx wrangler pages dev . --d1 DBA=DBA --compatibility-date=2026-01-23

That command persists D1 to the miniflare sqlite file referenced by DB_PATH
below (the hash is derived from the `--d1 DBA=DBA` id, so keep that id).

Usage:
    1. Start the dev server once with the command above (creates the sqlite file),
       then stop it (Ctrl+C) so this script can get a write lock.
    2. python scripts/seed-test-trade.py
    3. Start the dev server again and open http://127.0.0.1:8787/trading
       (or whatever port you used).

Re-running is safe: it upserts the test user and replaces any prior '[TEST]'
listing from that user, so you always end up with exactly one test trade.
"""
import os
import sqlite3
import json
import time

# Local miniflare D1 file for `--d1 DBA=DBA`. Relative to the emwiki/ dir.
DB_PATH = os.path.join(
    ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject",
    "6a49384260a1a6a690ff37596673f730cd3245a8c57f36ab153aba4e8bef06c7.sqlite",
)

USER_ID = "99999001"
TOKEN = "test-local-token-0000-0000-000000000001"
CDN = "https://imagedelivery.net/I2Jsf9fuZwSztWJZaX0DJA/"

now = int(time.time() * 1000)
expires = now + 30 * 24 * 60 * 60 * 1000

if not os.path.exists(DB_PATH):
    raise SystemExit(
        "Local D1 file not found:\n  " + DB_PATH + "\n"
        "Start the dev server once first:\n"
        "  npx wrangler pages dev . --d1 DBA=DBA --compatibility-date=2026-01-23\n"
        "then stop it and re-run this script."
    )

con = sqlite3.connect(DB_PATH)
cur = con.cursor()

# Schema is created idempotently so a brand-new local DB works out of the box.
# Columns mirror the ones the trades/auth code actually reads.
cur.executescript("""
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY, username TEXT, display_name TEXT, avatar_url TEXT,
    avatar_cached_at INTEGER, created_at INTEGER, last_online INTEGER,
    role TEXT DEFAULT '["user"]'
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, title TEXT NOT NULL,
    description TEXT, category TEXT DEFAULT 'other', status TEXT NOT NULL DEFAULT 'active',
    offering_items TEXT NOT NULL, seeking_items TEXT, created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, expires_at INTEGER, views INTEGER DEFAULT 0,
    theme TEXT DEFAULT 'default'
);
CREATE TABLE IF NOT EXISTS trade_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL,
    from_user_id TEXT NOT NULL, to_user_id TEXT NOT NULL, offered_items TEXT NOT NULL,
    message TEXT, status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER, offer_id INTEGER,
    from_user_id TEXT NOT NULL, to_user_id TEXT NOT NULL, message TEXT NOT NULL,
    read INTEGER DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, type TEXT NOT NULL,
    title TEXT NOT NULL, message TEXT NOT NULL, link TEXT, read INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT, trade_id INTEGER NOT NULL, reviewer_id TEXT NOT NULL,
    reviewed_user_id TEXT NOT NULL, rating INTEGER NOT NULL, comment TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS completed_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL, offer_id INTEGER NOT NULL,
    seller_id TEXT NOT NULL, buyer_id TEXT NOT NULL, seller_items TEXT NOT NULL,
    buyer_items TEXT NOT NULL, completed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_trade_stats (
    user_id TEXT PRIMARY KEY, total_trades INTEGER DEFAULT 0, successful_trades INTEGER DEFAULT 0,
    average_rating REAL DEFAULT 0, total_reviews INTEGER DEFAULT 0, last_trade_at INTEGER
);
""")

cur.execute("""
INSERT INTO users (user_id, username, display_name, avatar_url, avatar_cached_at, created_at, last_online, role)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET
    username=excluded.username, display_name=excluded.display_name,
    avatar_url=excluded.avatar_url, last_online=excluded.last_online
""", (USER_ID, "TestTrader", "Test Trader",
      "https://tr.rbxcdn.com/30DAY-AvatarHeadshot-placeholder/150/150/AvatarHeadshot/Png",
      now, now, now, '["user"]'))

# Long-lived session token so you can optionally act as the test user by running
# `localStorage.setItem('auth_token', '<TOKEN>')` in the browser console.
cur.execute("DELETE FROM sessions WHERE token = ?", (TOKEN,))
cur.execute("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (TOKEN, USER_ID, now, expires))

cur.execute("""
INSERT INTO user_trade_stats (user_id, total_trades, successful_trades, average_rating, total_reviews, last_trade_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET
    total_trades=excluded.total_trades, successful_trades=excluded.successful_trades,
    average_rating=excluded.average_rating, total_reviews=excluded.total_reviews,
    last_trade_at=excluded.last_trade_at
""", (USER_ID, 7, 7, 4.8, 5, now))

offering = [
    {"type": "game-item", "item_name": "8-Bit Phoenix",  "item_image": CDN + "78b6cf58-1624-404b-147d-cf44902bda00/public", "category": "pets"},
    {"type": "game-item", "item_name": "2025 Fireworks", "item_image": CDN + "0d306086-980c-4180-0c20-d371e04a0d00/public", "category": "gears"},
]
seeking = [
    {"type": "game-item", "item_name": "8-Bit Fairy", "item_image": CDN + "747eca04-18ef-4ff9-0ae7-98662116bc00/public", "category": "pets"},
    {"type": "robux", "amount": 500},
]

cur.execute("DELETE FROM trade_listings WHERE user_id = ? AND title LIKE '[TEST]%'", (USER_ID,))
cur.execute("""
INSERT INTO trade_listings
(user_id, title, description, category, status, offering_items, seeking_items, created_at, updated_at, expires_at, views, theme)
VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
""", (USER_ID, "[TEST] Trading 8-Bit Phoenix + 2025 Fireworks",
      "Seeded test listing for local development. Safe to delete.",
      "pets", json.dumps(offering), json.dumps(seeking),
      now, now, expires, 12, "ocean"))

con.commit()
listing_id = cur.lastrowid
active = cur.execute("SELECT COUNT(*) FROM trade_listings WHERE status='active'").fetchone()[0]
con.close()

print(f"Seeded listing id={listing_id}  (active listings now: {active})")
print(f"Test user_id: {USER_ID}")
print(f"Session token: {TOKEN}")
