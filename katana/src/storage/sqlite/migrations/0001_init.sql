-- Katana storage schema v1.
-- Adapted from metis (.metis/metis.db). Simplified: no document_relationships
-- (parent stored on documents), no archive_dir mirroring, no diesel_migrations.
--
-- Connection-level pragmas (foreign_keys, journal_mode) are set in
-- openSqliteStorage at db-open time, not here. WAL mode cannot be set
-- inside a transaction, and migrations run wrapped in BEGIN/COMMIT.
--
-- The schema_migrations table is created by the migration runner.

CREATE TABLE documents (
    filepath           TEXT PRIMARY KEY NOT NULL,
    id                 TEXT NOT NULL,
    title              TEXT NOT NULL,
    document_type      TEXT NOT NULL,                 -- DocumentType enum
    short_code         TEXT NOT NULL,
    subtype            TEXT,
    phase              TEXT NOT NULL,
    parent_short_code  TEXT,                          -- nullable for product-doc
    archived           INTEGER NOT NULL DEFAULT 0,
    exit_criteria_met  INTEGER NOT NULL DEFAULT 0,
    pass               TEXT,                          -- 'high' | 'low' | NULL
    model_tier         TEXT,                          -- 'strong' | 'cheap' | 'ui' | NULL
    scaffold_task      TEXT,                          -- short_code of TH for TL
    story_id           TEXT,
    strategy_id        TEXT,
    initiative_id      TEXT,
    created_at         REAL NOT NULL,
    updated_at         REAL NOT NULL,
    file_hash          TEXT NOT NULL,
    frontmatter_json   TEXT NOT NULL,
    body               TEXT NOT NULL,
    UNIQUE(document_type, short_code),
    UNIQUE(short_code)                                -- workspace-wide
);

CREATE INDEX idx_documents_id           ON documents(id);
CREATE INDEX idx_documents_type         ON documents(document_type);
CREATE INDEX idx_documents_phase        ON documents(phase);
CREATE INDEX idx_documents_short_code   ON documents(short_code);
CREATE INDEX idx_documents_parent       ON documents(parent_short_code);
CREATE INDEX idx_documents_updated      ON documents(updated_at);
CREATE INDEX idx_documents_initiative   ON documents(initiative_id);

CREATE TABLE document_tags (
    document_filepath TEXT NOT NULL,
    tag               TEXT NOT NULL,
    PRIMARY KEY (document_filepath, tag),
    FOREIGN KEY (document_filepath) REFERENCES documents(filepath) ON DELETE CASCADE
);
CREATE INDEX idx_tags_tag ON document_tags(tag);

CREATE TABLE document_blocked_by (
    document_filepath TEXT NOT NULL,
    blocker_short_code TEXT NOT NULL,
    PRIMARY KEY (document_filepath, blocker_short_code),
    FOREIGN KEY (document_filepath) REFERENCES documents(filepath) ON DELETE CASCADE
);

-- FTS5 mirror, kept in sync via triggers.
CREATE VIRTUAL TABLE document_search USING fts5(
    document_filepath UNINDEXED,
    content,
    title,
    document_type,
    tokenize='porter unicode61'
);

CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO document_search(document_filepath, content, title, document_type)
    VALUES (new.filepath, new.body, new.title, new.document_type);
END;

CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
    UPDATE document_search
       SET content = new.body,
           title = new.title,
           document_type = new.document_type
     WHERE document_filepath = new.filepath;
END;

CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN
    DELETE FROM document_search WHERE document_filepath = old.filepath;
END;

-- Per-type short-code counter. Atomic allocation in a transaction.
CREATE TABLE short_code_counters (
    type_code TEXT PRIMARY KEY NOT NULL,    -- 'PD' | 'E' | 'US' | 'TH' | 'TL' | 'TU' | 'A'
    next_n    INTEGER NOT NULL DEFAULT 1
);

INSERT INTO short_code_counters (type_code, next_n) VALUES
    ('PD', 1), ('E', 1), ('US', 1), ('TH', 1), ('TL', 1), ('TU', 1), ('A', 1);

-- Workspace configuration (prefix, etc.).
CREATE TABLE configuration (
    key        TEXT PRIMARY KEY NOT NULL,
    value      TEXT NOT NULL,
    updated_at REAL NOT NULL DEFAULT (julianday('now'))
);

INSERT INTO schema_migrations (version) VALUES (1);
