CREATE TABLE live_board_erase (
    mark_id VARCHAR(36) NOT NULL REFERENCES live_board_mark(id) ON DELETE CASCADE,
    gesture_id VARCHAR(36) NOT NULL,
    points TEXT NOT NULL,
    PRIMARY KEY (mark_id, gesture_id)
);
