-- Apply after 001 and 002, in staging first. No existing message rows are removed.
CREATE TABLE IF NOT EXISTS accounts (
  id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind ENUM('personal','business') NOT NULL,
  public_code CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NULL,
  public_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  credential_hash BINARY(32) NOT NULL,
  tier ENUM('standard','premium') NOT NULL DEFAULT 'standard',
  key_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_account_code (public_code),
  UNIQUE KEY uniq_credential (credential_hash)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dispatch_clock (
  singleton_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  last_dispatch DATETIME(6) NULL,
  CONSTRAINT chk_singleton CHECK (singleton_id = 1)
) ENGINE=InnoDB;
INSERT IGNORE INTO dispatch_clock(singleton_id, last_dispatch) VALUES (1, NULL);
