-- Bulletin notes shown publicly on the homepage bulletin board.
-- Content supports **bold** and [text](url) markdown; everything else is escaped.
CREATE TABLE IF NOT EXISTS bulletin_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    author TEXT,
    created_at INTEGER NOT NULL
);

INSERT INTO bulletin_notes (content, author, created_at) VALUES
    ('Prices on the wiki are the **average** of what an item actually trades for — not a fixed price tag.', 'xnite', strftime('%s','now') * 1000),
    ('One or two overpays **don''t** raise a value! It takes many consistent trades before a price moves.', 'xnite', strftime('%s','now') * 1000),
    ('Lots of factors shape a value: **demand**, **rarity**, availability & recent trade history.', 'xnite', strftime('%s','now') * 1000),
    ('Values are reviewed & updated regularly as new trades roll in. 📈', 'xnite', strftime('%s','now') * 1000),
    ('Think a price is off? Bring trade proof to [our Discord](https://discord.gg/WZwRgZuEyQ) — one screenshot won''t cut it! 😉', 'xnite', strftime('%s','now') * 1000);
