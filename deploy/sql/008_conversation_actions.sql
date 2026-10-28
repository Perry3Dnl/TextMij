-- Additive conversation controls; existing accounts and encrypted history are retained.
CREATE TABLE IF NOT EXISTS account_blocks (
  blocker_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  blocked_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (blocker_id, blocked_id),
  KEY idx_blocked_account (blocked_id),
  CONSTRAINT fk_blocker_account FOREIGN KEY (blocker_id) REFERENCES accounts(id),
  CONSTRAINT fk_blocked_account FOREIGN KEY (blocked_id) REFERENCES accounts(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_reports (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reporter_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_name VARCHAR(80) NOT NULL,
  reason VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  details TEXT NOT NULL,
  status ENUM('open','reviewed','resolved','dismissed') NOT NULL DEFAULT 'open',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_user_report_retry (reporter_id,request_id),
  KEY idx_user_reports_queue (status,created_at),
  KEY idx_user_reporter_budget (reporter_id,created_at),
  CONSTRAINT fk_user_reporter_account FOREIGN KEY (reporter_id) REFERENCES accounts(id),
  CONSTRAINT fk_report_user FOREIGN KEY (user_id) REFERENCES accounts(id)
) ENGINE=InnoDB;
