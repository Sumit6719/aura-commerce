# 🛍️ Aura Commerce

### Agentic AI Shopping Concierge with Razorpay Payments

Aura Commerce is an **Agentic AI-powered shopping concierge** that helps customers discover products, make purchase decisions, and complete purchases through a conversational interface.

The system combines **Google Gemini**, a merchant-controlled product catalog, inventory validation, transaction policies, and **Razorpay Payment Links** into an end-to-end AI commerce workflow.

---

## ✨ Key Features

- 🤖 **Agentic AI Shopping Assistant**
  - Understands natural-language shopping requests
  - Searches the merchant catalog
  - Retrieves product information
  - Checks inventory
  - Recommends compatible accessories

- 💰 **AI-Assisted Checkout**
  - Detects purchase intent
  - Initiates checkout
  - Collects customer details
  - Generates Razorpay Payment Links

- 🛡️ **Merchant Policy Engine**
  - Enforces minimum product prices
  - Validates product availability
  - Prevents unauthorized purchases
  - Enforces autonomous transaction limits

- 👨‍💼 **Human-in-the-Loop Approval**
  - Transactions above the autonomous limit are paused
  - Merchant can approve or reject transactions
  - Approved transactions are revalidated before payment generation

- 📊 **Merchant Console**
  - Sales dashboard
  - Transaction information
  - Audit logs
  - Approval management
  - Payment tracking

- 🧾 **Audit Trail**
  - User messages
  - Tool invocations
  - Catalog searches
  - Checkout events
  - Payment-link generation
  - Transaction approvals/rejections

---

## 🧠 Agentic AI Workflow

```text
Customer
   │
   ▼
Aura AI Shopping Concierge
   │
   ▼
Gemini Agent
   │
   ├── Search Products
   ├── Get Product Details
   ├── Check Stock
   ├── Recommend Accessories
   ├── Initiate Checkout
   └── Generate Payment Link
          │
          ▼
   Merchant Policy Engine
          │
     ┌────┴────┐
     │         │
 Approved   Approval Required
     │         │
     │         ▼
     │    Merchant Console
     │         │
     │     Approve / Reject
     │         │
     └────┬────┘
          ▼
  Razorpay Payment Link
          │
          ▼
       Customer

🛠️ Tech Stack
- Frontend: React, Vite, Vanilla CSS
- Backend: Node.js, Express.js
- AI: Google Gemini
- Payments: Razorpay
- Database: SQLite

Backend:
🚀 Run Locally
cd backend
npm install
node index.js
http://localhost:3005

Frontend
Open a second terminal:
cd frontend
npm install
npm run dev

Create backend/.env with your Gemini and Razorpay credentials.

🔐 Security
Secrets, databases, node_modules, and build files are excluded through .gitignore.
Note: This is a demo project built for the Razorpay Buildathon.

👨‍💻 Author
Sumit Bilagikar
GitHub: https://github.com/Sumit6719
