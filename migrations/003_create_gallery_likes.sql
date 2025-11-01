-- Gallery likes table for tracking likes on gallery items
CREATE TABLE IF NOT EXISTS gallery_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  gallery_item_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, gallery_item_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (gallery_item_id) REFERENCES gallery_items(id) ON DELETE CASCADE
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_gallery_likes_user_id ON gallery_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_gallery_likes_gallery_item_id ON gallery_likes(gallery_item_id);
CREATE INDEX IF NOT EXISTS idx_gallery_likes_created_at ON gallery_likes(created_at DESC);
