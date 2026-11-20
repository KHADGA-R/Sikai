CREATE TABLE course_certificate (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 -- Issued certificates retain their original course information after catalog edits or removal.
 course_id BIGINT NOT NULL,
 recipient VARCHAR(255) NOT NULL,
 course_title VARCHAR(255) NOT NULL,
 issued_at BIGINT NOT NULL,
 shared BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE (user_id, course_id)
);
