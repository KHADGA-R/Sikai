CREATE TABLE cart_item (
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 course_id BIGINT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,course_id)
);
CREATE TABLE checkout_order_item (
 order_id VARCHAR(36) NOT NULL REFERENCES checkout_order(id) ON DELETE CASCADE,
 course_id BIGINT NOT NULL,
 course_title VARCHAR(160) NOT NULL,
 amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
 PRIMARY KEY(order_id,course_id)
);
INSERT INTO checkout_order_item(order_id,course_id,course_title,amount)
 SELECT id,course_id,course_title,amount FROM checkout_order;
ALTER TABLE checkout_order ADD COLUMN basket_key VARCHAR(1600);
UPDATE checkout_order SET basket_key=CONCAT('courses:',CAST(course_id AS VARCHAR));
ALTER TABLE checkout_order ALTER COLUMN basket_key SET NOT NULL;
ALTER TABLE checkout_order ADD CONSTRAINT checkout_order_basket_unique UNIQUE(user_id,basket_key);
