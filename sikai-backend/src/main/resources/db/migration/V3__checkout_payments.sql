CREATE TABLE checkout_payment (
 id VARCHAR(36) PRIMARY KEY,
 order_id VARCHAR(36) NOT NULL REFERENCES checkout_order(id) ON DELETE CASCADE,
 course_id BIGINT NOT NULL REFERENCES course(id),
 provider VARCHAR(10) NOT NULL CHECK (provider IN ('esewa','khalti')),
 amount DECIMAL(16,2) NOT NULL CHECK (amount > 0),
 currency VARCHAR(3) NOT NULL CHECK (currency = 'NPR'),
 reference VARCHAR(160),
 transaction_id VARCHAR(160),
 status VARCHAR(24) NOT NULL CHECK (status IN ('creating','pending','completed','failed')),
 redirect_json TEXT,
 created_at BIGINT NOT NULL,
 UNIQUE(provider, reference),
 UNIQUE(provider, transaction_id)
);
CREATE INDEX checkout_payment_order_idx ON checkout_payment(order_id);
