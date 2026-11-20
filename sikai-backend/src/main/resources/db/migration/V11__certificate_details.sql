ALTER TABLE progress ADD COLUMN completed_at BIGINT;
ALTER TABLE course_certificate ADD COLUMN completed_at BIGINT;
ALTER TABLE course_certificate ADD COLUMN instructor VARCHAR(80);
ALTER TABLE course_certificate ADD COLUMN duration_hours DOUBLE PRECISION;
ALTER TABLE course_certificate ADD COLUMN course_level VARCHAR(20);

UPDATE course_certificate
SET instructor = (SELECT u.name FROM course c JOIN app_user u ON u.id=c.owner_id WHERE c.id=course_certificate.course_id),
    duration_hours = (SELECT c.duration_hours FROM course c WHERE c.id=course_certificate.course_id),
    course_level = (SELECT c.level FROM course c WHERE c.id=course_certificate.course_id);
