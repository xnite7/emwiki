-- Add alias and quantity columns to items table
ALTER TABLE items ADD COLUMN alias TEXT;
ALTER TABLE items ADD COLUMN quantity TEXT;

