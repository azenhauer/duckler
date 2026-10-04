-- Initial private API schema. Local IndexedDB/Drive data is not uploaded automatically.
PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  profile_visibility TEXT NOT NULL DEFAULT 'private' CHECK (profile_visibility = 'private'),
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility = 'private'),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_user_id, id)
);
CREATE INDEX collections_owner_updated ON collections(owner_user_id, updated_at);
CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text', 'bookmark')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
  note TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility = 'private'),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_user_id, id)
);
CREATE INDEX cards_owner_updated ON cards(owner_user_id, updated_at);
CREATE TABLE card_collections (
  owner_user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  PRIMARY KEY (card_id, collection_id),
  FOREIGN KEY (owner_user_id, card_id) REFERENCES cards(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, collection_id) REFERENCES collections(owner_user_id, id) ON DELETE CASCADE
);
CREATE INDEX membership_collection ON card_collections(collection_id, owner_user_id);
CREATE INDEX membership_card ON card_collections(card_id, owner_user_id);
