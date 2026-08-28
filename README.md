\# 🛍️ Aura Commerce



\### Agentic AI Shopping Concierge with Razorpay Payments



Aura Commerce is an \*\*Agentic AI-powered shopping concierge\*\* that helps customers discover products, make purchase decisions, and complete purchases through a conversational interface.



The system combines \*\*Google Gemini\*\*, a merchant-controlled product catalog, inventory validation, transaction policies, and \*\*Razorpay Payment Links\*\* into an end-to-end AI commerce workflow.



\---



\## ✨ Key Features



\- 🤖 \*\*Agentic AI Shopping Assistant\*\*

&#x20; - Understands natural-language shopping requests

&#x20; - Searches the merchant catalog

&#x20; - Retrieves product information

&#x20; - Checks real-time inventory

&#x20; - Recommends compatible accessories



\- 💰 \*\*AI-Assisted Checkout\*\*

&#x20; - Detects purchase intent

&#x20; - Initiates checkout

&#x20; - Collects customer details

&#x20; - Generates Razorpay Payment Links



\- 🛡️ \*\*Merchant Policy Engine\*\*

&#x20; - Enforces minimum product prices

&#x20; - Validates product availability

&#x20; - Prevents unauthorized purchases

&#x20; - Enforces autonomous transaction limits



\- 👨‍💼 \*\*Human-in-the-Loop Approval\*\*

&#x20; - Transactions above the autonomous limit are paused

&#x20; - Merchant can approve or reject transactions

&#x20; - Approved transactions are revalidated before payment generation



\- 📊 \*\*Merchant Console\*\*

&#x20; - Sales dashboard

&#x20; - Transaction information

&#x20; - Audit logs

&#x20; - Approval management

&#x20; - Payment tracking



\- 🧾 \*\*Audit Trail\*\*

&#x20; - User messages

&#x20; - Tool invocations

&#x20; - Catalog searches

&#x20; - Checkout events

&#x20; - Payment-link generation

&#x20; - Transaction approvals/rejections



\---



\## 🧠 Agentic AI Workflow



```text

Customer

&#x20;  │

&#x20;  ▼

Aura AI Shopping Concierge

&#x20;  │

&#x20;  ▼

Gemini Agent

&#x20;  │

&#x20;  ├── Search Products

&#x20;  ├── Get Product Details

&#x20;  ├── Check Stock

&#x20;  ├── Recommend Accessories

&#x20;  ├── Initiate Checkout

&#x20;  └── Generate Payment Link

&#x20;         │

&#x20;         ▼

&#x20;   Merchant Policy Engine

&#x20;         │

&#x20;    ┌────┴────┐

&#x20;    │         │

&#x20;Approved   Approval Required

&#x20;    │         │

&#x20;    │         ▼

&#x20;    │    Merchant Console

&#x20;    │         │

&#x20;    │     Approve / Reject

&#x20;    │         │

&#x20;    └────┬────┘

&#x20;         ▼

&#x20;  Razorpay Payment Link

&#x20;         │

&#x20;         ▼

&#x20;      Customer



🛠️ Tech Stack
Frontend: React, Vite, Vanilla CSS
Backend: Node.js, Express.js
AI: Google Gemini
Payments: Razorpay
Database: SQLite

🚀 Run Locally:
Backend-
cd backend
npm install
node index.js
Backend runs on http://localhost:3005

Frontend
cd frontend
npm install
npm run dev

Create backend/.env with your Gemini and Razorpay credentials.

🔐 Security
Secrets, databases, node_modules, and build files are excluded through .gitignore.
Demo project built for the Razorpay Buildathon.

👨‍💻 Author
Sumit Bilagikar
GitHub: https://github.com/Sumit6719

