CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    rate_key VARCHAR(255) NOT NULL PRIMARY KEY,
    attempts INT NOT NULL,
    expires_at INT NOT NULL
) ENGINE=InnoDB;
