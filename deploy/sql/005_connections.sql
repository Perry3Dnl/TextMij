-- Additive: existing accounts, credentials and messages are retained.
CREATE TABLE IF NOT EXISTS business_profiles (
  account_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  industry_id VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NULL,
  profile_json JSON NULL,
  PRIMARY KEY (account_id),
  CONSTRAINT fk_profile_account FOREIGN KEY (account_id) REFERENCES accounts(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS connections (
  business_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  customer_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  customer_alias VARCHAR(60) NOT NULL DEFAULT '',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (business_id, customer_id),
  KEY idx_customer_connections (customer_id),
  CONSTRAINT fk_connection_business FOREIGN KEY (business_id) REFERENCES accounts(id),
  CONSTRAINT fk_connection_customer FOREIGN KEY (customer_id) REFERENCES accounts(id)
) ENGINE=InnoDB;
