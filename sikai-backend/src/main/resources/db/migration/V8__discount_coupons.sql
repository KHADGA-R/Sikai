CREATE TABLE discount_coupon (
 id VARCHAR(36) PRIMARY KEY,
 code VARCHAR(32) NOT NULL UNIQUE,
 discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent','fixed')),
 discount_value DECIMAL(12,2) NOT NULL CHECK (discount_value > 0),
 minimum_subtotal DECIMAL(12,2) NOT NULL CHECK (minimum_subtotal >= 0),
 starts_at BIGINT,
 expires_at BIGINT,
 active BOOLEAN NOT NULL,
 max_redemptions INTEGER CHECK (max_redemptions > 0),
 per_user_limit INTEGER NOT NULL CHECK (per_user_limit > 0),
 created_at BIGINT NOT NULL,
 CHECK (discount_type <> 'percent' OR discount_value <= 100),
 CHECK (starts_at IS NULL OR expires_at IS NULL OR starts_at < expires_at)
);
ALTER TABLE checkout_order ADD COLUMN subtotal DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE checkout_order SET subtotal=amount;
ALTER TABLE checkout_order ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE checkout_order ADD COLUMN coupon_id VARCHAR(36) REFERENCES discount_coupon(id);
ALTER TABLE checkout_order ADD COLUMN coupon_code VARCHAR(32);
ALTER TABLE checkout_order ADD CONSTRAINT checkout_order_discount_check CHECK (subtotal >= 0 AND discount_amount >= 0 AND discount_amount <= subtotal AND amount=subtotal-discount_amount);
CREATE TABLE coupon_redemption (
 order_id VARCHAR(36) PRIMARY KEY REFERENCES checkout_order(id) ON DELETE CASCADE,
 coupon_id VARCHAR(36) NOT NULL REFERENCES discount_coupon(id),
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 status VARCHAR(12) NOT NULL CHECK (status IN ('reserved','completed')),
 created_at BIGINT NOT NULL
);
CREATE INDEX coupon_redemption_usage_idx ON coupon_redemption(coupon_id,user_id,status);
