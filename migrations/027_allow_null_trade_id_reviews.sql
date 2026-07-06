-- Allow profile reviews (reviews not tied to a completed trade).
--
-- trade_reviews.trade_id was declared NOT NULL, but profile reviews
-- (POST /api/profile/:userId/review) insert a NULL trade_id because they are
-- not attached to any completed trade. That NOT NULL violation threw a SQL
-- error and surfaced to users as "Internal server error" — so writing a review
-- on someone's profile never worked (the table was empty).
--
-- SQLite cannot drop a column constraint in place, so we recreate the table
-- with a nullable trade_id and copy any existing rows over. The UNIQUE and
-- FOREIGN KEY definitions are preserved unchanged. Note that in SQLite NULLs
-- are distinct in a UNIQUE index, so UNIQUE(trade_id, reviewer_id) no longer
-- dedupes profile reviews; that is handled in application code
-- (functions/api/profile/[[path]].js checks for an existing NULL-trade review
-- per reviewer/reviewed pair).

PRAGMA foreign_keys=OFF;

CREATE TABLE trade_reviews_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id INTEGER,                          -- nullable: NULL for profile reviews
    reviewer_id TEXT NOT NULL,
    reviewed_user_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(trade_id, reviewer_id),
    FOREIGN KEY (trade_id) REFERENCES completed_trades(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

INSERT INTO trade_reviews_new (id, trade_id, reviewer_id, reviewed_user_id, rating, comment, created_at)
    SELECT id, trade_id, reviewer_id, reviewed_user_id, rating, comment, created_at FROM trade_reviews;

DROP TABLE trade_reviews;

ALTER TABLE trade_reviews_new RENAME TO trade_reviews;

CREATE INDEX IF NOT EXISTS idx_trade_reviews_reviewed ON trade_reviews(reviewed_user_id);

PRAGMA foreign_keys=ON;
