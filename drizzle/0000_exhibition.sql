CREATE TABLE ballots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL UNIQUE,
    student_id TEXT NOT NULL,
    choices TEXT NOT NULL,
    submitted_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE exhibition_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    voting_open INTEGER NOT NULL CHECK (voting_open IN (0, 1))
);
