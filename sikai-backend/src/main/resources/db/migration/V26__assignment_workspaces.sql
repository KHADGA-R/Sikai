CREATE TABLE assignment_workspace (
    assignment_id VARCHAR(36) NOT NULL REFERENCES course_assignment(id) ON DELETE CASCADE,
    student_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    annotations TEXT NOT NULL,
    revision BIGINT NOT NULL,
    PRIMARY KEY (assignment_id, student_id)
);
