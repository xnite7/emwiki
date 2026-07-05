-- Normalize user ids stored in the trading tables.
--
-- The trade tables store user ids as TEXT while users.user_id is INTEGER.
-- Ids that were read from D1 as numbers and re-inserted into a TEXT column
-- picked up a float artifact ("137377499.0" instead of "137377499"), which
-- broke every exact-match lookup: My Trades came back empty, message threads
-- lost their history, unread counts stayed at zero and messages could never
-- be marked read.
--
-- User ids are digit strings, so the only '.0' a legacy value can contain is
-- the trailing float artifact — CAST to INTEGER and back strips it safely.

UPDATE trade_listings
SET user_id = CAST(CAST(user_id AS INTEGER) AS TEXT)
WHERE user_id LIKE '%.0';

UPDATE trade_offers
SET from_user_id = CAST(CAST(from_user_id AS INTEGER) AS TEXT)
WHERE from_user_id LIKE '%.0';

UPDATE trade_offers
SET to_user_id = CAST(CAST(to_user_id AS INTEGER) AS TEXT)
WHERE to_user_id LIKE '%.0';

UPDATE trade_messages
SET from_user_id = CAST(CAST(from_user_id AS INTEGER) AS TEXT)
WHERE from_user_id LIKE '%.0';

UPDATE trade_messages
SET to_user_id = CAST(CAST(to_user_id AS INTEGER) AS TEXT)
WHERE to_user_id LIKE '%.0';

UPDATE trade_notifications
SET user_id = CAST(CAST(user_id AS INTEGER) AS TEXT)
WHERE user_id LIKE '%.0';

UPDATE trade_reviews
SET reviewer_id = CAST(CAST(reviewer_id AS INTEGER) AS TEXT)
WHERE reviewer_id LIKE '%.0';

UPDATE trade_reviews
SET reviewed_user_id = CAST(CAST(reviewed_user_id AS INTEGER) AS TEXT)
WHERE reviewed_user_id LIKE '%.0';

UPDATE completed_trades
SET seller_id = CAST(CAST(seller_id AS INTEGER) AS TEXT)
WHERE seller_id LIKE '%.0';

UPDATE completed_trades
SET buyer_id = CAST(CAST(buyer_id AS INTEGER) AS TEXT)
WHERE buyer_id LIKE '%.0';

-- user_trade_stats has user_id as its primary key: a user may have rows under
-- both encodings. Drop the '.0' duplicate where a clean row already exists,
-- then rename the remainder.
DELETE FROM user_trade_stats
WHERE user_id LIKE '%.0'
  AND CAST(CAST(user_id AS INTEGER) AS TEXT) IN (SELECT user_id FROM user_trade_stats);

UPDATE user_trade_stats
SET user_id = CAST(CAST(user_id AS INTEGER) AS TEXT)
WHERE user_id LIKE '%.0';
