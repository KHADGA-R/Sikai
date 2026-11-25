CREATE TABLE live_activity_run (
    id VARCHAR(36) PRIMARY KEY,
    slot_id VARCHAR(36) NOT NULL REFERENCES live_slot(id) ON DELETE CASCADE,
    assignment_id VARCHAR(36) NOT NULL REFERENCES course_assignment(id) ON DELETE CASCADE,
    started_at BIGINT NOT NULL,
    ended_at BIGINT,
    revealed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX live_activity_run_slot ON live_activity_run(slot_id, started_at);

CREATE TABLE activity_attempt (
    assignment_id VARCHAR(36) NOT NULL REFERENCES course_assignment(id) ON DELETE CASCADE,
    scope_id VARCHAR(36) NOT NULL,
    live_run_id VARCHAR(36) REFERENCES live_activity_run(id) ON DELETE CASCADE,
    student_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    placements TEXT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1,
    finished_at BIGINT,
    PRIMARY KEY (scope_id, student_id),
    CHECK (live_run_id IS NULL OR live_run_id = scope_id)
);
