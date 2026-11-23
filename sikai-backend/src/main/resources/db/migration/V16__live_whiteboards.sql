ALTER TABLE live_slot ADD COLUMN board_revision BIGINT NOT NULL DEFAULT 0;

CREATE TABLE live_board_slide (
    id VARCHAR(36) PRIMARY KEY,
    slot_id VARCHAR(36) NOT NULL REFERENCES live_slot(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title VARCHAR(100) NOT NULL,
    image_data TEXT NOT NULL,
    UNIQUE (slot_id, position)
);

CREATE TABLE live_board_mark (
    id VARCHAR(36) PRIMARY KEY,
    slot_id VARCHAR(36) NOT NULL REFERENCES live_slot(id) ON DELETE CASCADE,
    slide_id VARCHAR(36) NOT NULL,
    author_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
    tool VARCHAR(20) NOT NULL,
    color VARCHAR(7) NOT NULL,
    points TEXT NOT NULL,
    label VARCHAR(200) NOT NULL,
    revision BIGINT NOT NULL
);

CREATE INDEX live_board_marks_page_idx ON live_board_mark(slot_id, slide_id, revision);
