-- Add demand_updated_at column to items table
ALTER TABLE items ADD COLUMN demand_updated_at INTEGER;

-- Migrate demand data from item_demand table to items table
-- This will update items with demand values and set demand_updated_at from item_demand.updated_at
UPDATE items
SET 
    demand = COALESCE((
        SELECT id.demand 
        FROM item_demand id 
        WHERE id.item_name = items.name 
        AND id.category = items.category
    ), items.demand),
    demand_updated_at = (
        SELECT id.updated_at 
        FROM item_demand id 
        WHERE id.item_name = items.name 
        AND id.category = items.category
    )
WHERE EXISTS (
    SELECT 1 
    FROM item_demand id 
    WHERE id.item_name = items.name 
    AND id.category = items.category
);

-- Note: The item_demand table can be dropped after verifying migration:
-- DROP TABLE IF EXISTS item_demand;
-- DROP INDEX IF EXISTS idx_item_demand_category;
-- DROP INDEX IF EXISTS idx_item_demand_name;
-- DROP TRIGGER IF EXISTS update_item_demand_timestamp;

