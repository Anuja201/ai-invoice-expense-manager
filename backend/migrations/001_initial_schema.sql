-- 001_initial_schema.sql
-- PostgreSQL schema for Invoice Manager (port of database/setup_expenses.sql).
-- Idempotent and non-destructive: only CREATE ... IF NOT EXISTS, no DROP TABLE,
-- no DELETE/UPDATE of existing rows. Safe to run on every deploy.

-- Keeps updated_at current on UPDATE (replaces MySQL's ON UPDATE CURRENT_TIMESTAMP)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    google_id VARCHAR(255),
    company VARCHAR(150),
    avatar_initials VARCHAR(3),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(10) DEFAULT 'both' CHECK (type IN ('expense', 'invoice', 'both')),
    color VARCHAR(20) DEFAULT '#4F46E5',
    icon VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices
-- invoice_number is unique per user (the API's duplicate check is per user).
-- status includes 'unpaid', which the API writes (routes/invoices.py sanitize_status).
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL,
    client_name VARCHAR(150) NOT NULL,
    client_email VARCHAR(150),
    amount NUMERIC(12, 2) NOT NULL,
    tax NUMERIC(12, 2) DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'paid', 'unpaid', 'overdue', 'cancelled')),
    category_id INT REFERENCES categories(id) ON DELETE SET NULL,
    description TEXT,
    due_date DATE,
    file_name VARCHAR(255),
    file_path VARCHAR(500),
    ai_category VARCHAR(100),
    ai_confidence NUMERIC(5, 2),
    ocr_raw_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT invoices_user_invoice_number_key UNIQUE (user_id, invoice_number)
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    category_id INT REFERENCES categories(id) ON DELETE SET NULL,
    ai_category VARCHAR(100),
    ai_confidence NUMERIC(5, 2),
    description TEXT,
    vendor VARCHAR(150),
    receipt_date DATE NOT NULL,
    payment_method VARCHAR(20) DEFAULT 'other'
        CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'bank_transfer', 'upi', 'other')),
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    receipt_file VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description VARCHAR(300) NOT NULL,
    quantity NUMERIC(10, 2) DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL,
    total_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI predictions log
CREATE TABLE IF NOT EXISTS ai_predictions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prediction_type VARCHAR(20) NOT NULL
        CHECK (prediction_type IN ('expense_forecast', 'anomaly', 'duplicate', 'category')),
    target_month VARCHAR(7),
    predicted_amount NUMERIC(12, 2),
    confidence_score NUMERIC(5, 2),
    actual_amount NUMERIC(12, 2),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- updated_at triggers (DROP TRIGGER only removes the trigger, never data)
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_category ON invoices(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_receipt_date ON expenses(receipt_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON ai_predictions(user_id);

-- Default categories (required: the API maps AI categories to these by name)
INSERT INTO categories (name, type, color, icon) VALUES
('Technology', 'both', '#4F46E5', 'laptop'),
('Marketing', 'both', '#7C3AED', 'megaphone'),
('Travel', 'expense', '#0891B2', 'plane'),
('Food & Dining', 'expense', '#D97706', 'utensils'),
('Office Supplies', 'expense', '#059669', 'briefcase'),
('Consulting', 'invoice', '#DC2626', 'users'),
('Software', 'both', '#7C3AED', 'code'),
('Healthcare', 'expense', '#DB2777', 'heart'),
('Utilities', 'expense', '#6B7280', 'zap'),
('Entertainment', 'expense', '#F59E0B', 'star'),
('Legal', 'both', '#374151', 'scale'),
('Design', 'invoice', '#8B5CF6', 'pen-tool')
ON CONFLICT (name) DO NOTHING;
