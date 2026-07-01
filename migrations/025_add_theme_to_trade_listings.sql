-- Adds the card theme selected when creating a trade listing.
-- Previously the create UI let users pick a theme but it was never persisted,
-- so every listing rendered as 'default'. This makes the picker functional.
ALTER TABLE trade_listings ADD COLUMN theme TEXT DEFAULT 'default';
