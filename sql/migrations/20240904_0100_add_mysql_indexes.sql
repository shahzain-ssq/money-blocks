ALTER TABLE stock_prices
    ADD INDEX idx_stock_prices_stock_created (stock_id, created_at);

ALTER TABLE short_positions
    ADD INDEX idx_short_positions_portfolio_stock_closed (portfolio_id, stock_id, closed),
    ADD INDEX idx_short_positions_closed_expires (closed, expires_at);

ALTER TABLE trades
    ADD INDEX idx_trades_portfolio_created (portfolio_id, created_at);

ALTER TABLE crisis_scenarios
    ADD INDEX idx_crisis_institution_status_starts (institution_id, status, starts_at);
