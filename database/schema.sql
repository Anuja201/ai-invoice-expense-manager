-- ============================================================
-- AI Invoice & Expense Manager - MySQL Database Schema v2
-- ============================================================

CREATE DATABASE IF NOT EXISTS invoice_manager;
USE invoice_manager;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    google_id VARCHAR(255),
    company VARCHAR(150),
    avatar_initials VARCHAR(3),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type ENUM('expense', 'invoice', 'both') DEFAULT 'both',
    color VARCHAR(20) DEFAULT '#4F46E5',
    icon VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    client_name VARCHAR(150) NOT NULL,
    client_email VARCHAR(150),
    amount DECIMAL(12, 2) NOT NULL,
    tax DECIMAL(12, 2) DEFAULT 0.00,
    total_amount DECIMAL(12, 2) NOT NULL,
    status ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled') DEFAULT 'draft',
    category_id INT,
    description TEXT,
    due_date DATE,
    file_name VARCHAR(255),
    file_path VARCHAR(500),
    ai_category VARCHAR(100),
    ai_confidence DECIMAL(5, 2),
    ocr_raw_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON SET NULL
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    category_id INT,
    ai_category VARCHAR(100),
    ai_confidence DECIMAL(5, 2),
    description TEXT,
    vendor VARCHAR(150),
    receipt_date DATE NOT NULL,
    payment_method ENUM('cash', 'credit_card', 'debit_card', 'bank_transfer', 'upi', 'other') DEFAULT 'other',
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    receipt_file VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON SET NULL
);

-- Invoice line items table
CREATE TABLE IF NOT EXISTS invoice_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    description VARCHAR(300) NOT NULL,
    quantity DECIMAL(10, 2) DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL,
    total_price DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- AI Predictions log
CREATE TABLE IF NOT EXISTS ai_predictions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    prediction_type ENUM('expense_forecast', 'anomaly', 'duplicate', 'category') NOT NULL,
    target_month VARCHAR(7),
    predicted_amount DECIMAL(12, 2),
    confidence_score DECIMAL(5, 2),
    actual_amount DECIMAL(12, 2),
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Seed default categories
INSERT IGNORE INTO categories (name, type, color, icon) VALUES
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
('Design', 'invoice', '#8B5CF6', 'pen-tool');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_receipt_date ON expenses(receipt_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON ai_predictions(user_id);
