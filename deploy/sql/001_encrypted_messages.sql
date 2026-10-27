-- Schema is additive and stores opaque E2EE envelopes, never plaintext.
-- Apply only after backups, staging verification, and database credentials setup.
CREATE TABLE IF NOT EXISTS encrypted_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sender_business_id VARBINARY(64) NOT NULL,
  recipient_device_id VARBINARY(64) NOT NULL,
  message_type ENUM('title-text','title-text-image') NOT NULL,
  ciphertext VARBINARY(8192) NOT NULL,
  nonce VARBINARY(12) NOT NULL,
  image_ciphertext VARBINARY(1040) NULL,
  image_nonce VARBINARY(12) NULL,
  wrapped_key VARBINARY(1024) NOT NULL,
  key_version SMALLINT UNSIGNED NOT NULL,
  tier_at_acceptance ENUM('standard','premium') NOT NULL,
  status ENUM('queued','dispatched','failed') NOT NULL DEFAULT 'queued',
  queued_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  dispatched_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_dispatch (status, tier_at_acceptance, id),
  KEY idx_recipient (recipient_device_id, id)
) ENGINE=InnoDB;
