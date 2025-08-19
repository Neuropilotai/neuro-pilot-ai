const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const bcrypt = require("bcryptjs");
const path = require("path");

let db;

async function initDatabase() {
  db = await open({
    filename: path.join(__dirname, "users.db"),
    driver: sqlite3.Database,
  });

  await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            firstName TEXT,
            lastName TEXT,
            company TEXT,
            role TEXT DEFAULT 'user',
            isActive BOOLEAN DEFAULT true,
            emailVerified BOOLEAN DEFAULT false,
            verificationToken TEXT,
            resetPasswordToken TEXT,
            resetPasswordExpires DATETIME,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

  await db.exec(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expiresAt DATETIME NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

  await db.exec(`
        CREATE TABLE IF NOT EXISTS resume_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            orderId TEXT UNIQUE NOT NULL,
            package TEXT NOT NULL,
            price REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            stripeSessionId TEXT,
            resumeData TEXT,
            generatedResume TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

  await db.exec(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            plan TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            stripeSubscriptionId TEXT,
            currentPeriodEnd DATETIME,
            cancelAtPeriodEnd BOOLEAN DEFAULT false,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

  console.log("Database initialized successfully");
}

const UserModel = {
  async create(userData) {
    const { email, password, firstName, lastName, company } = userData;
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.run(
      `INSERT INTO users (email, password, firstName, lastName, company) 
             VALUES (?, ?, ?, ?, ?)`,
      [email, hashedPassword, firstName, lastName, company],
    );

    return result.lastID;
  },

  async findByEmail(email) {
    return await db.get("SELECT * FROM users WHERE email = ?", [email]);
  },

  async findById(id) {
    return await db.get("SELECT * FROM users WHERE id = ?", [id]);
  },

  async updateUser(id, updates) {
    const fields = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = Object.values(updates);

    await db.run(
      `UPDATE users SET ${fields}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id],
    );
  },

  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  },

  async getAllOrders(userId) {
    return await db.all(
      "SELECT * FROM resume_orders WHERE userId = ? ORDER BY createdAt DESC",
      [userId],
    );
  },

  async getSubscription(userId) {
    return await db.get(
      'SELECT * FROM subscriptions WHERE userId = ? AND status = "active"',
      [userId],
    );
  },
};

const SessionModel = {
  async create(userId, token, expiresAt) {
    const result = await db.run(
      `INSERT INTO user_sessions (userId, token, expiresAt) VALUES (?, ?, ?)`,
      [userId, token, expiresAt],
    );
    return result.lastID;
  },

  async findByToken(token) {
    const session = await db.get(
      `SELECT s.*, u.id as userId, u.email, u.firstName, u.lastName, u.role 
             FROM user_sessions s 
             JOIN users u ON s.userId = u.id 
             WHERE s.token = ? AND datetime(s.expiresAt) > datetime('now')`,
      [token],
    );
    return session;
  },

  async deleteByToken(token) {
    await db.run("DELETE FROM user_sessions WHERE token = ?", [token]);
  },

  async deleteExpired() {
    await db.run(
      'DELETE FROM user_sessions WHERE expiresAt <= datetime("now")',
    );
  },
};

module.exports = {
  initDatabase,
  UserModel,
  SessionModel,
  getDb: () => db,
};
