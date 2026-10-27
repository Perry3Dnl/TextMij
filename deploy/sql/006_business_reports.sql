-- Reports are server-readable moderation data, separate from encrypted chat contents.
CREATE TABLE IF NOT EXISTS business_reports (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reporter_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  business_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  business_name VARCHAR(80) NOT NULL,
  reason VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  details TEXT NOT NULL,
  status ENUM('open','reviewed','resolved','dismissed') NOT NULL DEFAULT 'open',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_report_retry (reporter_id,request_id),
  KEY idx_reports_queue (status,created_at),
  KEY idx_reporter_budget (reporter_id,created_at),
  CONSTRAINT fk_reporter_account FOREIGN KEY (reporter_id) REFERENCES accounts(id),
  CONSTRAINT fk_report_business FOREIGN KEY (business_id) REFERENCES accounts(id)
) ENGINE=InnoDB;
