-- Setup script for Invoice Manager Database
-- Creates database, tables, and sample data

-- Create database if not exists
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
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
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
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
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

-- Seed a test user (password: test123)
INSERT IGNORE INTO users (id, name, email, password_hash, company, avatar_initials) VALUES
(1, 'Test User', 'test@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqKx8pKv2G', 'Test Company', 'TU');

-- Seed sample expenses for test user
INSERT IGNORE INTO expenses (id, user_id, title, amount, category_id, ai_category, ai_confidence, description, vendor, receipt_date, payment_method, status) VALUES
(1, 1, 'AWS Monthly Hosting', 2500.00, 1, 'Technology', 92.50, 'Monthly web hosting and CDN services', 'Amazon Web Services', '2025-01-15', 'upi', 'approved'),
(2, 1, 'Office Supplies', 450.00, 5, 'Office Supplies', 78.00, 'Printer paper, pens, and folders', 'Staples', '2025-01-10', 'debit_card', 'approved'),
(3, 1, 'Team Lunch', 1200.00, 4, 'Food & Dining', 95.00, 'Monthly team building lunch', 'Restaurant XYZ', '2025-01-12', 'cash', 'approved'),
(4, 1, 'Flight to Mumbai', 4500.00, 3, 'Travel', 88.50, 'Business trip flight tickets', 'MakeMyTrip', '2025-01-08', 'credit_card', 'approved'),
(5, 1, 'Google Workspace', 1500.00, 7, 'Software', 97.00, 'Annual G-Suite subscription', 'Google', '2025-01-01', 'upi', 'approved'),
(6, 1, 'Marketing Campaign', 5000.00, 2, 'Marketing', 85.00, 'Q1 digital marketing campaign', 'Digital Agency', '2025-01-05', 'bank_transfer', 'pending'),
(7, 1, 'Electricity Bill', 1200.00, 9, 'Utilities', 99.00, 'Monthly office electricity', 'MSEB', '2025-01-14', 'upi', 'approved'),
(8, 1, 'Figma Subscription', 1200.00, 7, 'Software', 96.50, 'Design tool monthly plan', 'Figma Inc', '2025-01-03', 'credit_card', 'approved'),
(9, 1, 'Uber Business Ride', 350.00, 3, 'Travel', 91.00, 'Client meeting transportation', 'Uber', '2025-01-11', 'upi', 'approved'),
(10, 1, 'Medical Checkup', 2000.00, 8, 'Healthcare', 98.00, 'Annual employee health checkup', 'Apollo Hospital', '2025-01-09', 'debit_card', 'approved');

-- Seed sample invoices for test user
INSERT IGNORE INTO invoices (id, user_id, invoice_number, client_name, client_email, amount, tax, total_amount, status, category_id, ai_category, ai_confidence, description, due_date) VALUES
(1, 1, 'INV-2025-1001', 'Acme Corp', 'billing@acme.com', 10000.00, 1800.00, 11800.00, 'paid', 6, 'Consulting', 87.50, 'Consulting services for Q1', '2025-02-01'),
(2, 1, 'INV-2025-1002', 'Tech Solutions', 'accounts@techsol.com', 5000.00, 900.00, 5900.00, 'sent', 1, 'Technology', 94.00, 'Software development project', '2025-02-15'),
(3, 1, 'INV-2025-1003', 'Creative Studio', 'hello@creativestudio.com', 7500.00, 1350.00, 8850.00, 'draft', 12, 'Design', 89.50, 'Brand identity design', '2025-03-01');

-- Create indexes for performance (MySQL syntax)
CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_created_at ON invoices(created_at);
CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_receipt_date ON expenses(receipt_date);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_predictions_user ON ai_predictions(user_id);

