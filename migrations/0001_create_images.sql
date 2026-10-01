CREATE TABLE images (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    r2_key TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_images_created_at
ON images(created_at);