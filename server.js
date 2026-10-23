const express = require("express");
const mysql = require("mysql2/promise");
const session = require("express-session");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

let db;

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "change-this-secret-before-deployment",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

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

// Public admin login page
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Protected admin dashboard
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

// Protected dashboard API
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

    res.clearCookie("connect.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    res.json({
      success: true,
      message: "Logged out successfully",
      redirect: "/login.html",
    });
  });
});

// Public health check
app.get("/api/health", (req, res) => {
  res.json({
    message: "Gym Backend is Running!",
  });
});

// Serve public files after protected routes
app.use(express.static(path.join(__dirname, "public")));

// Start server and connect to MySQL
async function startServer() {
  try {
    db = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "gym_management",
      port: Number(process.env.DB_PORT || 3306),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    await db.query("SELECT 1");

    console.log("MySQL Connected Successfully!");
    app.listen(PORT, () => {
      console.log(`Gym Backend running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed!");
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    process.exitCode = 1;

    if (db) {
      await db.end().catch(() => {});
    }
  }
}

startServer();