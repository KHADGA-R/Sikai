ALTER TABLE live_slot ADD COLUMN capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 50);
CREATE INDEX booking_slot_status_idx ON booking(slot_id, status);
