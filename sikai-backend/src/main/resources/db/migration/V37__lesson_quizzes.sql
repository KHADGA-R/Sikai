ALTER TABLE lesson ADD COLUMN quiz TEXT;
CREATE TABLE lesson_quiz_attempt (
 id VARCHAR(36) PRIMARY KEY, lesson_id BIGINT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 correct_count INTEGER NOT NULL, question_count INTEGER NOT NULL,
 passed BOOLEAN NOT NULL, submitted_at BIGINT NOT NULL
);
CREATE INDEX lesson_quiz_attempt_pass_idx ON lesson_quiz_attempt(user_id, lesson_id, passed);
