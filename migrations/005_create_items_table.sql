-- Create items table for storing all catalog items
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('gears', 'deaths', 'titles', 'pets', 'effects')),
    img TEXT,
    svg TEXT,
    price TEXT,
    "from" TEXT,
    price_code_rarity TEXT,
    tradable INTEGER DEFAULT 1 CHECK(tradable IN (0, 1)),
    "new" INTEGER DEFAULT 0 CHECK("new" IN (0, 1)),
    weekly INTEGER DEFAULT 0 CHECK(weekly IN (0, 1)),
    weeklystar INTEGER DEFAULT 0 CHECK(weeklystar IN (0, 1)),
    retired INTEGER DEFAULT 0 CHECK(retired IN (0, 1)),
    premium INTEGER DEFAULT 0 CHECK(premium IN (0, 1)),
    removed INTEGER DEFAULT 0 CHECK(removed IN (0, 1)),
    price_history TEXT,
    demand INTEGER DEFAULT 0,
    demand_updated_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(category, name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_items_tradable ON items(tradable);
CREATE INDEX IF NOT EXISTS idx_items_category_name ON items(category, name);
CREATE INDEX IF NOT EXISTS idx_items_premium ON items(premium);
CREATE INDEX IF NOT EXISTS idx_items_retired ON items(retired);
CREATE INDEX IF NOT EXISTS idx_items_new ON items("new");

-- Create trigger to auto-update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_items_timestamp
AFTER UPDATE ON items
BEGIN
    UPDATE items SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

