ALTER TABLE course_assignment ALTER COLUMN asset_id DROP NOT NULL;
ALTER TABLE course_assignment ADD COLUMN activity_definition TEXT;
ALTER TABLE course_assignment ADD CONSTRAINT course_assignment_content CHECK (
    (asset_id IS NOT NULL AND activity_definition IS NULL)
    OR (asset_id IS NULL AND activity_definition IS NOT NULL)
);
