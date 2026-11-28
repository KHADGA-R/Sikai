CREATE TABLE lesson_question_reply (
 id VARCHAR(36) PRIMARY KEY, question_id VARCHAR(36) NOT NULL REFERENCES lesson_question(id) ON DELETE CASCADE,
 author_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 body VARCHAR(3000) NOT NULL, created_at BIGINT NOT NULL
);
CREATE INDEX lesson_question_reply_question_idx ON lesson_question_reply(question_id, created_at);

INSERT INTO lesson_question_reply(id, question_id, author_id, body, created_at)
SELECT q.id, q.id, c.owner_id, q.answer, q.created_at
FROM lesson_question q JOIN lesson l ON l.id=q.lesson_id
JOIN topic t ON t.id=l.topic_id JOIN course c ON c.id=t.course_id
WHERE q.answer IS NOT NULL;
ALTER TABLE lesson_question DROP COLUMN answer;

CREATE TABLE lesson_question_vote (
 question_id VARCHAR(36) NOT NULL REFERENCES lesson_question(id) ON DELETE CASCADE,
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 PRIMARY KEY(question_id, user_id)
);
