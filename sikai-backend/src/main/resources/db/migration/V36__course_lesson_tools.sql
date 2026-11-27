CREATE TABLE lesson_question (
 id VARCHAR(36) PRIMARY KEY, lesson_id BIGINT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
 author_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 body VARCHAR(3000) NOT NULL, seconds INTEGER, created_at BIGINT NOT NULL, answer VARCHAR(3000)
);
CREATE INDEX lesson_question_lesson_idx ON lesson_question(lesson_id, created_at);

CREATE TABLE lesson_note (
 id VARCHAR(36) PRIMARY KEY, lesson_id BIGINT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 body VARCHAR(3000) NOT NULL, seconds INTEGER, created_at BIGINT NOT NULL
);
CREATE INDEX lesson_note_user_idx ON lesson_note(user_id, lesson_id);

CREATE TABLE course_announcement (
 id VARCHAR(36) PRIMARY KEY, course_id BIGINT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
 title VARCHAR(160) NOT NULL, body VARCHAR(3000) NOT NULL, created_at BIGINT NOT NULL
);
CREATE INDEX course_announcement_course_idx ON course_announcement(course_id, created_at);

CREATE TABLE course_announcement_read (
 announcement_id VARCHAR(36) NOT NULL REFERENCES course_announcement(id) ON DELETE CASCADE,
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 PRIMARY KEY (announcement_id, user_id)
);
