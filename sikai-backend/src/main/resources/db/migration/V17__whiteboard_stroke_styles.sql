ALTER TABLE live_board_mark ADD COLUMN stroke_style VARCHAR(10) NOT NULL DEFAULT 'solid'
    CHECK (stroke_style IN ('solid', 'dashed', 'dotted'));
ALTER TABLE live_board_mark ADD COLUMN stroke_width INTEGER NOT NULL DEFAULT 4
    CHECK (stroke_width BETWEEN 2 AND 20);
UPDATE live_board_mark SET stroke_width=20 WHERE tool='highlighter';
