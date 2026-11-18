CREATE TABLE app_notification (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 type VARCHAR(40) NOT NULL,
 title VARCHAR(160) NOT NULL,
 body VARCHAR(600) NOT NULL,
 target VARCHAR(300) NOT NULL,
 event_key VARCHAR(180) NOT NULL,
 group_key VARCHAR(100),
 created_at BIGINT NOT NULL,
 read_at BIGINT,
 UNIQUE(user_id,event_key)
);
CREATE INDEX app_notification_user_idx ON app_notification(user_id,created_at,id);
CREATE INDEX app_notification_unread_idx ON app_notification(user_id,read_at,group_key);
