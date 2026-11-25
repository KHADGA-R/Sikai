CREATE TABLE course_assignment (
    id VARCHAR(36) PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
    lesson_id BIGINT REFERENCES lesson(id) ON DELETE SET NULL,
    kind VARCHAR(12) NOT NULL CHECK (kind IN ('homework', 'classwork')),
    title VARCHAR(160) NOT NULL,
    instructions VARCHAR(4000) NOT NULL,
    due_at BIGINT,
    published_at BIGINT NOT NULL,
    asset_id VARCHAR(36) NOT NULL REFERENCES course_asset(id)
);
CREATE INDEX course_assignment_course_idx ON course_assignment (course_id, published_at);
