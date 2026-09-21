# 🧾 InvoiceAI - Full-Stack AI Invoice & Expense Manager

A production-grade fintech SaaS application with AI-powered invoice categorization, built with React + Flask + PostgreSQL.

---

## 🏗️ Project Structure

```
invoice-app/
├── frontend/                    # React + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx       # App shell wrapper
│   │   │   ├── Sidebar.jsx      # Navigation sidebar
│   │   │   ├── Navbar.jsx       # Top bar
│   │   │   └── ProtectedRoute.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx    # Charts + summary cards
│   │   │   ├── Invoices.jsx     # Invoice CRUD + upload
│   │   │   └── Expenses.jsx     # Expense CRUD + edit
│   │   ├── styles/              # Per-component CSS files
│   │   ├── services/
│   │   │   └── api.js           # Axios instance + service functions
│   │   ├── context/
│   │   │   └── AuthContext.jsx  # JWT auth state
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── backend/                     # Python Flask API
│   ├── app.py                   # App factory + blueprint registration
│   ├── config.py                # Environment config
│   ├── routes/
│   │   ├── auth.py              # Register, Login, Logout, /me
│   │   ├── invoices.py          # Invoice CRUD + upload simulation
│   │   ├── expenses.py          # Expense CRUD
│   │   ├── dashboard.py         # Analytics endpoints
│   │   └── categories.py        # Category listing
│   ├── utils/
│   │   ├── db.py                # MySQL connection manager
│   │   └── ai_categorizer.py    # Keyword-based AI categorization
│   ├── .env.example
│   └── requirements.txt
│
└── database/
    └── schema.sql               # Complete MySQL schema
```

---

## ⚡ Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- PostgreSQL 14+

---

### 1. Database Setup

Create an empty PostgreSQL database, set `DATABASE_URL` in `backend/.env`, then:

```bash
cd backend
python init_db.py              # creates tables + default categories (non-destructive)
python init_db.py --seed-demo  # optional demo login: test@example.com / test123
```

(`database/setup_expenses.sql` is the legacy MySQL schema, kept for reference.)

---

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL DATABASE_URL

# Run Flask
python app.py
# Server starts at http://localhost:5000
```

---

### 3. Frontend Setup

```bash
cd frontend

# Install packages
npm install

# Start dev server
npm run dev
# App runs at http://localhost:5173
```

---

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Login, get JWT |
| POST | `/api/auth/logout` | Invalidate token |
| GET | `/api/auth/me` | Get current user |

### Invoices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoices/` | List all invoices |
| POST | `/api/invoices/` | Create invoice |
| GET | `/api/invoices/:id` | Get single invoice |
| PUT | `/api/invoices/:id` | Update invoice |
| DELETE | `/api/invoices/:id` | Delete invoice |
| POST | `/api/invoices/upload` | Simulate PDF upload + parse |

### Expenses
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses/` | List all expenses |
| POST | `/api/expenses/` | Add expense |
| GET | `/api/expenses/:id` | Get single expense |
| PUT | `/api/expenses/:id` | Edit expense |
| DELETE | `/api/expenses/:id` | Delete expense |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary` | Summary cards data |
| GET | `/api/dashboard/chart/monthly` | 6-month bar chart data |
| GET | `/api/dashboard/chart/categories` | Donut chart data |
| GET | `/api/dashboard/recent` | Recent 10 transactions |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories/` | List all categories |

---

## 📋 Sample JSON

### Register
```json
POST /api/auth/register
{
  "name": "Jane Smith",
  "email": "jane@company.com",
  "password": "secure123",
  "company": "Acme Corp"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR...",
  "user": { "id": 1, "name": "Jane Smith", "email": "jane@company.com" }
}
```

### Create Invoice
```json
POST /api/invoices/
Authorization: Bearer <token>
{
  "client_name": "TechStartup Inc",
  "client_email": "billing@techstartup.com",
  "amount": 15000,
  "tax": 2700,
  "description": "Software development and consulting services",
  "due_date": "2024-02-15",
  "status": "sent"
}

Response:
{
  "invoice": {
    "id": 1,
    "invoice_number": "INV-2024-3821",
    "client_name": "TechStartup Inc",
    "total_amount": 17700,
    "ai_category": "Consulting",
    "ai_confidence": 87.3,
    "status": "sent"
  }
}
```

### Add Expense
```json
POST /api/expenses/
Authorization: Bearer <token>
{
  "title": "AWS Monthly Bill",
  "amount": 4250,
  "vendor": "Amazon Web Services",
  "description": "Cloud hosting and server infrastructure",
  "receipt_date": "2024-01-15",
  "payment_method": "credit_card"
}

Response:
{
  "expense": {
    "id": 1,
    "title": "AWS Monthly Bill",
    "amount": 4250,
    "ai_category": "Technology",
    "ai_confidence": 92.1
  },
  "ai_category": { "category": "Technology", "confidence": 92.1 }
}
```

---

## 🤖 AI Categorization

The `ai_categorizer.py` module simulates ML categorization using keyword matching:

- **Input**: Invoice description + client name, or expense title + vendor + description
- **Process**: Matches against keyword lists for 12 categories
- **Output**: Category name + confidence score (50–97%)
- **Categories**: Technology, Marketing, Travel, Food & Dining, Office Supplies, Consulting, Software, Healthcare, Utilities, Entertainment, Legal, Design

**To upgrade to real AI**, replace the `categorize()` function with:
- OpenAI GPT-4 text classification
- Google Cloud Natural Language API
- AWS Comprehend custom classifier

---

## 🔒 Security

- Passwords hashed with **bcrypt** (12 rounds)
- **JWT tokens** expire after 24 hours
- Token **blocklist** on logout
- CORS restricted to allowed origins
- SQL injection protected via **parameterized queries**

---

## 🎨 Design System

- Font: **Plus Jakarta Sans** (headings/body) + **DM Mono** (numbers)
- Primary: `#2563EB` (blue)
- Background: `#F8FAFC`
- Cards: white with subtle shadows
- Fully responsive down to 375px

---

## 🚀 Production Deployment

GitHub → **Vercel** (frontend) + **Render** (backend, Docker) → **Railway PostgreSQL**.

| | Setting |
|---|---|
| Vercel root directory | `frontend` (build `npm run build`, output `dist`, config in `frontend/vercel.json`) |
| Vercel env | `VITE_API_URL=https://<your-backend>.onrender.com` |
| Render | Blueprint `render.yaml` (Docker, root `backend`, health check `/api/health`) |
| Render env | `DATABASE_URL` (Railway `DATABASE_PUBLIC_URL`), `DB_SSLMODE=require`, `FRONTEND_URL`, `SECRET_KEY`, `JWT_SECRET_KEY`, `GEMINI_API_KEY` |
| Migrations | Run automatically on container start (`python init_db.py`, non-destructive) |

See `backend/.env.example` and `frontend/.env.example` for all variables.
