CREATE TABLE checkout_order (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 course_id BIGINT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
 course_title VARCHAR(160) NOT NULL,
 amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
 currency VARCHAR(3) NOT NULL,
 status VARCHAR(24) NOT NULL CHECK (status IN ('pending','completed')),
 created_at BIGINT NOT NULL,
 completed_at BIGINT,
 UNIQUE(user_id, course_id)
);
