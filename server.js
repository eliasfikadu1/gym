const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

const frontendUrl = (
  process.env.FRONTEND_URL ||
  "https://i-jogym-house.vercel.app"
).replace(/\/+$/, "");

const backendUrl = (
  process.env.BACKEND_URL ||
  "https://gym-cdb7.onrender.com"
).replace(/\/+$/, "");

// Check required environment variables
const requiredEnv = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

// Trust Render proxy for secure cookies
if (isProduction) {
  app.set("trust proxy", 1);
}

// CORS
app.use(cors({
  origin: [
    frontendUrl,
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Supabase PostgreSQL
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction
    ? { rejectUnauthorized: false }
    : false,
  connectionTimeoutMillis: 10000,
  max: 5
});

// Session configuration
app.use(session({
  name: "gym.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 1000 * 60 * 60 * 8
  }
}));
// Health check
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");

    res.json({
      success: true,
      message: "Gym Backend is Running!",
      database: "Connected"
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    res.status(503).json({
      success: false,
      message: "Backend is running, but database connection failed",
      database: "Disconnected"
    });
  }
});

// Root
app.get("/", (req, res) => {
  res.json({
    message: "Gym Backend is Running!"
  });
});

// Admin authentication middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({
      success: false,
      message: "Admin login required"
    });
  }

  return res.redirect(${frontendUrl}/login.html);
}

// Login page
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Admin login API
app.post("/api/admin/login", (req, res, next) => {
  const { adminUsername, adminPassword } = req.body || {};

  const correctUsername = process.env.ADMIN_USERNAME;
  const correctPassword = process.env.ADMIN_PASSWORD;

  if (
    typeof adminUsername !== "string" ||
    typeof adminPassword !== "string" ||
    !adminUsername ||
    !adminPassword
  ) {
    return res.status(400).json({
      success: false,
      message: "Please enter your admin username and password."
    });
  }

  if (
    adminUsername.trim() !== correctUsername ||
    adminPassword !== correctPassword
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin username or password."
    });
  }

  req.session.regenerate((err) => {
    if (err) {
      console.error("Session regenerate error:", err);

      return res.status(500).json({
        success: false,
        message: "Could not create admin session."
      });
    }

    req.session.isAdmin = true;
    req.session.adminUsername = correctUsername;

    req.session.save((saveError) => {
      if (saveError) {
        console.error("Session save error:", saveError);

        return res.status(500).json({
          success: false,
          message: "Could not save admin session."
        });
      }
      return res.json({
        success: true,
        message: "Login successful",
        redirect: ${backendUrl}/admin.html
      });
    });
  });
});

// Check admin session
app.get("/api/admin/check", requireAdmin, (req, res) => {
  res.json({
    success: true,
    isAdmin: true,
    username: req.session.adminUsername
  });
});

// Protected admin dashboard
app.get("/admin.html", requireAdmin, (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "admin.html")
  );
});

// Admin dashboard API
app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: "Welcome to the Admin Dashboard",
    username: req.session.adminUsername
  });
});

// Get registered members
app.get("/api/members", requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM members ORDER BY id DESC"
    );

    res.json({
      success: true,
      members: result.rows
    });
  } catch (error) {
    console.error("Failed to fetch members:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to load members"
    });
  }
});

// Admin logout
app.post("/api/admin/logout", requireAdmin, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);

      return res.status(500).json({
        success: false,
        message: "Could not log out."
      });
    }

    res.clearCookie("gym.sid", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax"
    });

    return res.json({
      success: true,
      message: "Logged out successfully",
      redirect: ${frontendUrl}/login.html
    });
  });
});

// Serve other public files
app.use(express.static(path.join(__dirname, "public")));

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gym Backend running on port ${PORT}`);

  db.query("SELECT 1")
    .then(() => {
      console.log("Supabase PostgreSQL Connected Successfully!");
    })
    .catch((error) => {
      console.error("Database connection failed!");
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
    });
});

// Graceful shutdown
function shutdown() {
  server.close(() => {
    db.end()
      .catch((error) => {
        console.error("Database shutdown error:", error.message);
      })
      .finally(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);