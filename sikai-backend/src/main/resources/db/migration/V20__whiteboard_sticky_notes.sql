CREATE TABLE live_board_note (
    id VARCHAR(36) PRIMARY KEY,
    slot_id VARCHAR(36) NOT NULL REFERENCES live_slot(id) ON DELETE CASCADE,
    slide_id VARCHAR(36) NOT NULL,
    author_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
    color VARCHAR(8) NOT NULL CHECK (color IN ('yellow', 'pink')),
    note_text VARCHAR(1500) NOT NULL,
    left_pos INTEGER NOT NULL,
    top_pos INTEGER NOT NULL,
    note_width INTEGER NOT NULL,
    note_height INTEGER NOT NULL,
    revision BIGINT NOT NULL,
    CHECK (left_pos >= 0 AND top_pos >= 0 AND note_width >= 120 AND note_height >= 140
        AND left_pos + note_width <= 1000 AND top_pos + note_height <= 1000)
);
CREATE INDEX live_board_note_slide_idx ON live_board_note(slot_id, slide_id, revision);
