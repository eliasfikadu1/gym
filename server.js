const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();

const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable"
  );
  process.exit(1);
}

const supabaseStorage = createClient(supabaseUrl, supabaseKey);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (allowedTypes.includes(file.mimetype)) {
      return cb(null, true);
    }

    cb(new Error("Upload JPG, PNG, or WebP images only."));
  }
});
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

  return res.redirect(`${frontendUrl}/login.html`);
}

// Login page
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Admin login API
app.post("/api/admin/login", (req, res) => {
  const { adminUsername, adminPassword } = req.body || {};

  const correctUsername = process.env.ADMIN_USERNAME;
  const correctPassword = process.env.ADMIN_PASSWORD;

  if (
    typeof adminUsername !== "string" ||
    typeof adminPassword !== "string" ||
    !adminUsername.trim() ||
    !adminPassword
  ) {
    return res.status(400).json({
      success: false,
      message: "Please enter your admin username and password."
    });
  }

  if (!correctUsername || !correctPassword) {
    console.error("Admin credentials are not configured.");

    return res.status(500).json({
      success: false,
      message: "Admin login is not configured on the server."
    });
  }

  if (
    adminUsername.trim() !== correctUsername.trim() ||
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
        redirect: "/admin.html"
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
// Register member and upload payment screenshot
app.post(
  "/api/members",
  upload.single("paymentScreenshot"),
  async (req, res) => {
    let uploadedPath = null;

    try {
      const { name, email, phone, plan } = req.body;

      if (!name || !email || !phone || !plan || !req.file) {
        return res.status(400).json({
          success: false,
          message: "Fill in all fields and upload your payment screenshot."
        });
      }

      if (!["Basic", "Premium"].includes(plan)) {
        return res.status(400).json({
          success: false,
          message: "Invalid membership plan."
        });
      }

      const extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
      };

      const extension = extensions[req.file.mimetype];

      if (!extension) {
        return res.status(400).json({
          success: false,
          message: "Only JPG, PNG, and WEBP images are allowed."
        });
      }

      // Upload payment screenshot to Supabase Storage
      uploadedPath = `payments/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${extension}`;

      const { error: uploadError } =
        await supabaseStorage.storage
          .from("payment-screenshots")
          .upload(uploadedPath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
          });

      if (uploadError) {
        throw uploadError;
      }

      // Save member information in Supabase PostgreSQL
      const result = await db.query(
        `INSERT INTO public.members
          (full_name, email, phone, membership_plan)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          name.trim(),
          email.trim(),
          phone.trim(),
          plan
        ]
      );

      return res.status(201).json({
        success: true,
        message: "Registration successful!",
        member: result.rows[0]
      });

    } catch (error) {
      console.error("Registration error:", error.message);

      if (uploadedPath) {
        await supabaseStorage.storage
          .from("payment-screenshots")
          .remove([uploadedPath])
          .catch(() => {});
      }

      return res.status(500).json({
        success: false,
        message: "Registration failed. Please try again."
      });
    }
  }
);
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
      redirect: `${frontendUrl}/login.html`
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