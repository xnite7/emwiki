-- Create table for item demand ratings
CREATE TABLE IF NOT EXISTS item_demand (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL,
    demand INTEGER NOT NULL DEFAULT 0 CHECK(demand >= 0 AND demand <= 5),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_name, category)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_item_demand_category ON item_demand(category);
CREATE INDEX IF NOT EXISTS idx_item_demand_name ON item_demand(item_name);

-- Create trigger to auto-update timestamp
CREATE TRIGGER IF NOT EXISTS update_item_demand_timestamp
AFTER UPDATE ON item_demand
BEGIN
    UPDATE item_demand SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
