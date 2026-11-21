CREATE TABLE live_class_reminder (
    booking_id VARCHAR(36) NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
    lead_minutes INTEGER NOT NULL CHECK (lead_minutes IN (1440, 15)),
    sent_at BIGINT NOT NULL,
    PRIMARY KEY (booking_id, lead_minutes)
);

CREATE INDEX live_slot_start_idx ON live_slot(start_at);
