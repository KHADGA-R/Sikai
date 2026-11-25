ALTER TABLE course_assignment ADD COLUMN max_points INTEGER CHECK (max_points BETWEEN 1 AND 10000);

CREATE TABLE assignment_submission (
    assignment_id VARCHAR(36) NOT NULL REFERENCES course_assignment(id) ON DELETE CASCADE,
    student_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    submitted_at BIGINT NOT NULL,
    asset_id VARCHAR(36) REFERENCES course_asset(id),
    annotations TEXT,
    feedback VARCHAR(4000),
    score INTEGER CHECK (score >= 0),
    PRIMARY KEY (assignment_id, student_id),
    CHECK ((asset_id IS NULL AND annotations IS NOT NULL) OR (asset_id IS NOT NULL AND annotations IS NULL))
);
