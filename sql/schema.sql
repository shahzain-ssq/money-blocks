CREATE TABLE institutions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    google_client_id VARCHAR(255),
    google_client_secret VARCHAR(255),
    google_allowed_domain VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    institution_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    role ENUM('student','manager','admin') DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_email (institution_id, email),
    UNIQUE KEY unique_user_username (institution_id, username),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
) ENGINE=InnoDB;

CREATE TABLE sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    session_token VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE stocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    institution_id INT NOT NULL,
    ticker VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    initial_price DECIMAL(12,2) NOT NULL,
    total_limit INT NULL,
    per_user_limit INT NULL,
    per_user_short_limit INT NULL,
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_ticker_institution (institution_id, ticker),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
) ENGINE=InnoDB;

CREATE TABLE stock_prices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stock_id INT NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_id) REFERENCES stocks(id)
) ENGINE=InnoDB;

CREATE TABLE portfolios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    cash_balance DECIMAL(14,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_portfolio (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE positions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT NOT NULL,
    stock_id INT NOT NULL,
    quantity INT NOT NULL,
    avg_price DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_position (portfolio_id, stock_id),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
    FOREIGN KEY (stock_id) REFERENCES stocks(id)
) ENGINE=InnoDB;

CREATE TABLE short_positions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT NOT NULL,
    stock_id INT NOT NULL,
    quantity INT NOT NULL,
    open_price DECIMAL(12,2) NOT NULL,
    open_at DATETIME NOT NULL,
    duration_seconds INT NOT NULL,
    expires_at DATETIME NOT NULL,
    closed TINYINT(1) DEFAULT 0,
    close_price DECIMAL(12,2) NULL,
    close_at DATETIME NULL,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
    FOREIGN KEY (stock_id) REFERENCES stocks(id)
) ENGINE=InnoDB;

CREATE TABLE trades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT NOT NULL,
    stock_id INT NOT NULL,
    type ENUM('BUY','SELL','SHORT_OPEN','SHORT_CLOSE') NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
    FOREIGN KEY (stock_id) REFERENCES stocks(id)
) ENGINE=InnoDB;

CREATE TABLE crisis_scenarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    institution_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('draft','published','archived') DEFAULT 'draft',
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
) ENGINE=InnoDB;

CREATE TABLE short_duration_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    institution_id INT NOT NULL,
    label VARCHAR(50) NOT NULL,
    duration_seconds INT NOT NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
) ENGINE=InnoDB;

CREATE TABLE rate_limit_buckets (
    rate_key VARCHAR(255) NOT NULL PRIMARY KEY,
    attempts INT NOT NULL,
    expires_at INT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE scenario_reads (
    user_id INT NOT NULL,
    scenario_id INT NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, scenario_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (scenario_id) REFERENCES crisis_scenarios(id)
) ENGINE=InnoDB;
