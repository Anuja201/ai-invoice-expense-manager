-- demo_data.sql - OPTIONAL demo account + sample data (port of database/setup_expenses.sql seeds).
-- Loaded only by: python init_db.py --seed-demo
-- Demo login: test@example.com / test123  (do not load this in a real production database
-- unless you want a public demo account). Adds rows only if the demo user has no data yet.

INSERT INTO users (name, email, password_hash, company, avatar_initials)
VALUES ('Test User', 'test@example.com',
        '$2b$12$Hn9YfpsLhiH0A1jtqUajAucPRblldheWv4eHMM4vMt3et34sKbkni',
        'Test Company', 'TU')
ON CONFLICT (email) DO NOTHING;

INSERT INTO expenses (user_id, title, amount, category_id, ai_category, ai_confidence,
                      description, vendor, receipt_date, payment_method, status)
SELECT u.id, v.title, v.amount, c.id, v.cat, v.conf, v.description, v.vendor,
       v.receipt_date::date, v.payment_method, v.status
FROM users u
CROSS JOIN (VALUES
    ('AWS Monthly Hosting', 2500.00, 'Technology', 92.50, 'Monthly web hosting and CDN services', 'Amazon Web Services', '2025-01-15', 'upi', 'approved'),
    ('Office Supplies', 450.00, 'Office Supplies', 78.00, 'Printer paper, pens, and folders', 'Staples', '2025-01-10', 'debit_card', 'approved'),
    ('Team Lunch', 1200.00, 'Food & Dining', 95.00, 'Monthly team building lunch', 'Restaurant XYZ', '2025-01-12', 'cash', 'approved'),
    ('Flight to Mumbai', 4500.00, 'Travel', 88.50, 'Business trip flight tickets', 'MakeMyTrip', '2025-01-08', 'credit_card', 'approved'),
    ('Google Workspace', 1500.00, 'Software', 97.00, 'Annual G-Suite subscription', 'Google', '2025-01-01', 'upi', 'approved'),
    ('Marketing Campaign', 5000.00, 'Marketing', 85.00, 'Q1 digital marketing campaign', 'Digital Agency', '2025-01-05', 'bank_transfer', 'pending'),
    ('Electricity Bill', 1200.00, 'Utilities', 99.00, 'Monthly office electricity', 'MSEB', '2025-01-14', 'upi', 'approved'),
    ('Figma Subscription', 1200.00, 'Software', 96.50, 'Design tool monthly plan', 'Figma Inc', '2025-01-03', 'credit_card', 'approved'),
    ('Uber Business Ride', 350.00, 'Travel', 91.00, 'Client meeting transportation', 'Uber', '2025-01-11', 'upi', 'approved'),
    ('Medical Checkup', 2000.00, 'Healthcare', 98.00, 'Annual employee health checkup', 'Apollo Hospital', '2025-01-09', 'debit_card', 'approved')
) AS v(title, amount, cat, conf, description, vendor, receipt_date, payment_method, status)
LEFT JOIN categories c ON c.name = v.cat
WHERE u.email = 'test@example.com'
  AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.user_id = u.id);

INSERT INTO invoices (user_id, invoice_number, client_name, client_email, amount, tax, total_amount,
                      status, category_id, ai_category, ai_confidence, description, due_date)
SELECT u.id, v.num, v.client, v.email, v.amount, v.tax, v.total, v.status, c.id, v.cat, v.conf,
       v.description, v.due_date::date
FROM users u
CROSS JOIN (VALUES
    ('INV-2025-1001', 'Acme Corp', 'billing@acme.com', 10000.00, 1800.00, 11800.00, 'paid', 'Consulting', 87.50, 'Consulting services for Q1', '2025-02-01'),
    ('INV-2025-1002', 'Tech Solutions', 'accounts@techsol.com', 5000.00, 900.00, 5900.00, 'sent', 'Technology', 94.00, 'Software development project', '2025-02-15'),
    ('INV-2025-1003', 'Creative Studio', 'hello@creativestudio.com', 7500.00, 1350.00, 8850.00, 'draft', 'Design', 89.50, 'Brand identity design', '2025-03-01')
) AS v(num, client, email, amount, tax, total, status, cat, conf, description, due_date)
LEFT JOIN categories c ON c.name = v.cat
WHERE u.email = 'test@example.com'
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.user_id = u.id);
