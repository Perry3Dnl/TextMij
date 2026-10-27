-- Additive migration: idempotency unique per business sender.
-- This changes no existing rows and keeps the current encrypted schema.
ALTER TABLE encrypted_messages
  ADD COLUMN idempotency_key CHAR(36) NULL,
  ADD UNIQUE KEY uniq_sender_idempotency (sender_business_id, idempotency_key);
