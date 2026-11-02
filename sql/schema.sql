PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    account TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ingreso', 'gasto')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);

