-- One mutable rating per personal account and connected business.
CREATE TABLE IF NOT EXISTS business_ratings (
  business_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  rater_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  stars TINYINT UNSIGNED NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (business_id,rater_id),
  CONSTRAINT fk_rating_business FOREIGN KEY (business_id) REFERENCES accounts(id),
  CONSTRAINT fk_rating_rater FOREIGN KEY (rater_id) REFERENCES accounts(id),
  CONSTRAINT chk_rating_stars CHECK (stars BETWEEN 1 AND 5)
) ENGINE=InnoDB;
