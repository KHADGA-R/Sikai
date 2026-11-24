ALTER TABLE live_slot ADD COLUMN maths_audience VARCHAR(12) DEFAULT 'all' NOT NULL
    CHECK (maths_audience IN ('all', 'pre-k', 'elementary', 'secondary'));
ALTER TABLE live_slot ADD COLUMN maths_show_all BOOLEAN DEFAULT FALSE NOT NULL;
