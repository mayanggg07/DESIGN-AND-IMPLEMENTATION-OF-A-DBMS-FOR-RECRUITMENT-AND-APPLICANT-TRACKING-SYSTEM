# MySQL Explorer Studio 🚀

A modern, responsive web application and CRUD dashboard connected directly to your MySQL database.

---

## ✨ Features

- **Automatic Schema & Table Discovery**: Lists all tables in your MySQL database automatically, along with row counts.
- **Full CRUD Operations**:
  - **Create**: Add new records with dynamic form inputs automatically tailored to column data types (dates, numbers, text, etc.), while safely detecting auto-increment IDs.
  - **Read / Browse**: Clean tabular view with pagination (10, 20, 50, 100 rows), sorting on any column, and live full-table text search.
  - **Update**: Edit any existing record via a pre-populated modal.
  - **Delete**: Safe record deletion with confirmation dialog.
- **SQL Query Console**: Execute raw `SELECT`, `INSERT`, `UPDATE`, or `DELETE` queries with live execution metrics and formatted result tables.
- **Connection Manager**: Test connections and switch databases seamlessly from the UI or via `.env`.

---

## 🛠️ Project Structure

```
mysql-web-app/
├── public/
│   ├── index.html       # Single-page dashboard interface
│   ├── app.js           # Client-side application logic & CRUD interactions
│   └── styles.css       # Custom scrollbars and styling
├── .env                 # Database credentials configuration
├── package.json         # Project metadata and dependencies
└── server.js            # Express server & MySQL REST APIs
```

---

## 🚀 Getting Started

1. **Start the application**:
   ```bash
   npm start
   ```

2. **Open in your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

3. **Connect to your Database**:
   - Click **"Connection Settings"** in the top right.
   - Enter your MySQL root password and database name (or click **"List DBs"** to auto-discover your databases).
   - Click **"Connect & Save"**.
