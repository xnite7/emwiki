-- Migration 019: Add indexes for items table performance
-- This migration addresses slow queries when filtering items by category.
-- The items table is frequently queried with WHERE category = ? which causes
-- full table scans without proper indexes.

-- =====================================================
-- ITEMS TABLE INDEXES
-- =====================================================

-- Index on items.category for filtered queries
-- This is critical - every category page load queries by category
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);

-- Composite index for common query pattern (category + name ordering)
-- Optimizes: WHERE category = ? ORDER BY name
CREATE INDEX IF NOT EXISTS idx_items_category_name ON items(category, name);

-- Index on items.name for search queries
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

