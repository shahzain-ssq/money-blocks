-- Just adding the reads table. crisis_scenarios already has correct columns in schema.sql.
CREATE TABLE IF NOT EXISTS scenario_reads (
    user_id INT NOT NULL,
    scenario_id INT NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, scenario_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (scenario_id) REFERENCES crisis_scenarios(id)
) ENGINE=InnoDB;
