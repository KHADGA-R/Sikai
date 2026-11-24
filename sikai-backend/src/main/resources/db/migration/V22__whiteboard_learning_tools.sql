ALTER TABLE live_board_note ADD COLUMN kind VARCHAR(12) DEFAULT 'sticky' NOT NULL
    CHECK (kind IN ('sticky', 'table', 'graph', 'flowchart'));
