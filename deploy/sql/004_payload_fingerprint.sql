-- Additive. Required before accepting encrypted message writes.
ALTER TABLE encrypted_messages ADD COLUMN payload_hash BINARY(32) NULL;
