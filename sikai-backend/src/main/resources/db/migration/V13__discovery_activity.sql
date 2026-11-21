ALTER TABLE booking ADD COLUMN created_at BIGINT;
CREATE INDEX booking_recent_idx ON booking(status, created_at, slot_id);
CREATE INDEX enrollment_course_idx ON enrollment(course_id);
