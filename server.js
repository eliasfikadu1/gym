const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing");
  process.exit(1);
}

if (!process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET is missing");
  process.exit(1);
}

if (isProduction && !process.env.FRONTEND_URL) {
  console.error("FRONTEND_URL is missing");
  process.exit(1);
}

// PostgreSQL connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction
    ? { rejectUnauthorized: false }
    : false,
  connectionTimeoutMillis: 10000,
  max: 5,
});

if (isProduction) {
  app.set("trust proxy", 1);
}

// Middleware
app.use(
  cors({
    origin: isProduction
      ? process.env.FRONTEND_URL
      : ["http://localhost:5500", "http://127.0.0.1:5500"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: "gym.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

// Health check
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");

    res.json({
      message: "Gym Backend is Running!",
      database: "Connected",
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    res.status(503).json({
      message: "Backend is running, but database connection failed",
      database: "Disconnected",
    });
  }
});

// Root route
app.get("/", (req, res) => {
  res.json({ message: "Gym Backend is Running!" });
});

// Admin protection
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({
      success: false,
      message: "Admin login required",
    });
  }

  return res.redirect("/login.html");
}

// Admin login page
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Protected admin page
app.get("/admin.html", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Admin login API
app.post("/api/admin/login", (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Username and password are required",
    });
  }

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return res.status(500).json({
      success: false,
      message: "Admin credentials are not configured",
    });
  }

  if (
    username !== process.env.ADMIN_USERNAME ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin username or password",
    });
  }

  req.session.regenerate((err) => {
    if (err) return next(err);

    req.session.isAdmin = true;
    req.session.adminUsername = username;

    req.session.save((saveError) => {
      if (saveError) return next(saveError);

      res.json({
        success: true,
        message: "Admin login successful",
        redirect: "/admin.html",
      });
    });
  });
});

// Check admin session
app.get("/api/admin/check", requireAdmin, (req, res) => {
  res.json({
    success: true,
    isAdmin: true,
    username: req.session.adminUsername,
  });
});

// Admin dashboard API
app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: "Welcome to the Admin Dashboard",
    username: req.session.adminUsername,
  });
});
// Admin logout
app.post("/api/admin/logout", requireAdmin, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);

    res.clearCookie("gym.sid", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    });

    res.json({
      success: true,
      message: "Logged out successfully",
      redirect: "/login.html",
    });
  });
});

// Serve frontend files if they exist in /public
app.use(express.static(path.join(__dirname, "public")));

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (res.headersSent) return next(err);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// Start HTTP server even if database is temporarily unavailable
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

// Close connections gracefully
function shutdown() {
  server.close(() => {
    db.end()
      .catch((error) => console.error("Database shutdown error:", error.message))
      .finally(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);