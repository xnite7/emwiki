-- Migration 018: Add critical indexes for session and user performance
-- This migration addresses D1 timeout errors caused by full table scans
-- on frequently queried columns.

-- =====================================================
-- SESSIONS TABLE INDEXES
-- =====================================================

-- Index on sessions.token (PRIMARY lookup field)
-- This is the most critical index - every authenticated request queries by token
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- Index on sessions.expires_at (used in WHERE clause for session validation)
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Index on sessions.user_id (used in JOINs with users table)
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Composite index for common auth query pattern
-- Optimizes: WHERE s.token = ? AND s.expires_at > ?
CREATE INDEX IF NOT EXISTS idx_sessions_token_expires ON sessions(token, expires_at);

-- =====================================================
-- USERS TABLE INDEXES
-- =====================================================

-- Index on users.user_id (ensure primary key is indexed for JOINs)
-- Note: If user_id is already PRIMARY KEY, this may be redundant but safe
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);

-- Index on users.last_online (for UPDATE operations)
CREATE INDEX IF NOT EXISTS idx_users_last_online ON users(last_online);

-- =====================================================
-- AUTH_CODES TABLE INDEXES (bonus optimization)
-- =====================================================

-- Index for code lookups (used in verify-code and check-code)
CREATE INDEX IF NOT EXISTS idx_auth_codes_code ON auth_codes(code);

-- Index for cleanup of expired codes
CREATE INDEX IF NOT EXISTS idx_auth_codes_expires ON auth_codes(expires_at);

-- =====================================================
-- USER_PREFERENCES TABLE INDEXES (bonus optimization)
-- =====================================================

-- Composite index for preference lookups
CREATE INDEX IF NOT EXISTS idx_user_prefs_lookup ON user_preferences(user_id, preference_key);

