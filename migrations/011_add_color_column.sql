-- Add color column to items table
-- Color is stored as JSON array [r, g, b] representing RGB values
ALTER TABLE items ADD COLUMN color TEXT;


