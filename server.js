const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();

// ======================================
// 1. ENVIRONMENT VARIABLES
// ======================================

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

const requiredEnv = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(Missing environment variable: ${key});
    process.exit(1);
  }
}

// ======================================
// 2. SUPABASE STORAGE
// ======================================

const supabaseStorage = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ======================================
// 3. POSTGRESQL CONNECTION
// ======================================

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction
    ? { rejectUnauthorized: false }
    : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 5
});

db.on("error", (error) => {
  console.error("PostgreSQL Pool Error:", error.message);
});

// ======================================
// 4. MIDDLEWARE
// ======================================

if (isProduction) {
  app.set("trust proxy", 1);
}

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

// ======================================
// 5. SESSION CONFIGURATION
// ======================================

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

// ======================================
// 6. PAYMENT SCREENSHOT UPLOAD
// ======================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024
  },

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

// ======================================
// 7. DATABASE INITIALIZATION
// ======================================

async function initializeDatabase() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.members (
        id BIGSERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        membership_plan VARCHAR(100) NOT NULL,
        payment_screenshot TEXT,
        payment_status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns if the table already exists.

    await db.query(`
      ALTER TABLE public.members
      ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
      ADD COLUMN IF NOT EXISTS membership_plan VARCHAR(100),
      ADD COLUMN IF NOT EXISTS payment_screenshot TEXT,
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'Pending',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    `);

    const result = await db.query(`
      SELECT
        current_database() AS database,
        current_schema() AS schema,
        to_regclass('public.members') AS members_table
    `);

    console.log("DATABASE CHECK:", result.rows[0]);

    if (result.rows[0].members_table) {
      console.log("SUCCESS: Members table is ready!");
    }

    console.log("Supabase PostgreSQL Connected Successfully!");

  } catch (error) {
    console.error("DATABASE INITIALIZATION ERROR:", error.message);
  }
}

// ======================================
// 8. HEALTH CHECK
// ======================================

app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");

    res.status(200).json({
      success: true,
      message: "Gym Backend is Running!",
      database: "Connected"
    });

  } catch (error) {
    console.error("Health Check Error:", error.message);

    res.status(503).json({
      success: false,
      message: "Database connection failed",
      database: "Disconnected"
    });
  }
});

// ======================================
// 9. ROOT ROUTE
// ======================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "I-JO House GYM Backend is Running!",
    frontend: frontendUrl
  });
});

// ======================================
// 10. ADMIN AUTHENTICATION
// ======================================

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: "Admin login required"
  });
}

// ======================================
// 11. ADMIN LOGIN
// ======================================

app.post("/api/admin/login", (req, res) => {
  const {
    adminUsername,
    adminPassword
  } = req.body || {};

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
      console.error("Session Error:", err.message);

      return res.status(500).json({
        success: false,
        message: "Could not create admin session."
      });
    }

    req.session.isAdmin = true;
    req.session.adminUsername = correctUsername;

    req.session.save((saveError) => {
      if (saveError) {
        console.error("Session Save Error:", saveError.message);

        return res.status(500).json({
          success: false,
          message: "Could not save admin session."
        });
      }

      return res.json({
        success: true,
        message: "Login successful",
        redirect: `${frontendUrl}/admin.html`
      });
    });
  });
});

// ======================================
// 12. CHECK ADMIN SESSION
// ======================================

app.get("/api/admin/check", requireAdmin, (req, res) => {
  res.json({
    success: true,
    isAdmin: true,
    username: req.session.adminUsername
  });
});

// ======================================
// 13. ADMIN DASHBOARD API
// ======================================
app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: "Welcome to I-JO House GYM Admin Dashboard",
    username: req.session.adminUsername
  });
});

// ======================================
// 14. PROTECTED ADMIN PAGE
// ======================================

app.get("/admin.html", requireAdmin, (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "admin.html")
  );
});

// ======================================
// 15. REGISTER NEW MEMBER
// ======================================

app.post(
  "/api/members",
  upload.single("paymentScreenshot"),
  async (req, res) => {

    let uploadedPath = null;

    try {
      const {
        name,
        email,
        phone,
        plan
      } = req.body;

      // Validate registration fields

      if (
        !name ||
        !email ||
        !phone ||
        !plan ||
        !req.file
      ) {
        return res.status(400).json({
          success: false,
          message: "Fill in all fields and upload payment screenshot."
        });
      }

      if (!["Basic", "Premium"].includes(plan)) {
        return res.status(400).json({
          success: false,
          message: "Invalid membership plan."
        });
      }

      const cleanName = name.trim();
      const cleanEmail = email.trim();
      const cleanPhone = phone.trim();

      if (
        !cleanName ||
        !cleanEmail ||
        !cleanPhone ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
      ) {
        return res.status(400).json({
          success: false,
          message: "Please enter valid registration information."
        });
      }

      // File extension

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

      uploadedPath =
        payments/${crypto.randomUUID()}.${extension};

      const { error: uploadError } =
        await supabaseStorage.storage
          .from("payment-screenshots")
          .upload(
            uploadedPath,
            req.file.buffer,
            {
              contentType: req.file.mimetype,
              upsert: false
            }
          );

      if (uploadError) {
        throw uploadError;
      }

      // Save member information to PostgreSQL

      const result = await db.query(`
        
        INSERT INTO public.members (
          full_name,
          email,
          phone,
          membership_plan,
          payment_screenshot,
          payment_status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
       ` ,
        [
          cleanName,
          cleanEmail,
          cleanPhone,
          plan,
          uploadedPath,
          "Pending"
        ]
      );

      console.log(
        "NEW MEMBER REGISTERED:",
        result.rows[0].id
      );

      return res.status(201).json({
        success: true,
        message: "Registration successful!",
        member: result.rows[0]
      });

    } catch (error) {
      console.error("REGISTRATION ERROR:", error);

      // Remove uploaded image if database insertion fails

      if (uploadedPath) {
        try {
          await supabaseStorage.storage
            .from("payment-screenshots")
            .remove([uploadedPath]);
        } catch (removeError) {
          console.error(
            "Storage Cleanup Error:",
            removeError.message
          );
        }
      }

      return res.status(500).json({
        success: false,
        message: "Registration failed. Please try again."
      });
    }
  }
);

// ======================================
// 16. GET ALL REGISTERED MEMBERS
// ADMIN ONLY
// ======================================
app.get("/api/members", requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        full_name,
        email,
        phone,
        membership_plan AS plan,
        payment_screenshot,
        payment_status,
        created_at
      FROM public.members
      ORDER BY created_at DESC, id DESC
    `);

    // Generate private screenshot URLs

    const members = await Promise.all(
      result.rows.map(async (member) => {

        let screenshotUrl = null;

        if (member.payment_screenshot) {
          const { data, error } =
            await supabaseStorage.storage
              .from("payment-screenshots")
              .createSignedUrl(
                member.payment_screenshot,
                3600
              );

          if (!error && data) {
            screenshotUrl = data.signedUrl;
          }
        }

        return {
          ...member,
          payment_screenshot_url: screenshotUrl
        };
      })
    );

    return res.status(200).json({
      success: true,
      total: members.length,
      members
    });

  } catch (error) {
    console.error("GET MEMBERS ERROR:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve members."
    });
  }
});

// ======================================
// 17. ADMIN LOGOUT
// ======================================

app.post("/api/admin/logout", requireAdmin, (req, res) => {

  req.session.destroy((err) => {

    if (err) {
      console.error("Logout Error:", err.message);

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

// ======================================
// 18. SERVE PUBLIC FILES
// ======================================

app.use(express.static(
  path.join(__dirname, "public")
));

// ======================================
// 19. NOT FOUND
// ======================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

// ======================================
// 20. ERROR HANDLER
// ======================================

app.use((err, req, res, next) => {

  console.error("SERVER ERROR:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  if (
    err instanceof multer.MulterError ||
    err.message.includes("Upload JPG")
  ) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error."
  });
});

// ======================================
// 21. START SERVER
// ======================================

const server = app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `I-JO House GYM Backend running on port ${PORT}`
  );

  initializeDatabase();
});

// ======================================
// 22. GRACEFUL SHUTDOWN
// ======================================

function shutdown() {

  console.log("Shutting down server...");

  server.close(() => {

    db.end()
      .then(() => {
        console.log("Database connection closed.");
        process.exit(0);
      })
      .catch((error) => {
        console.error(
          "Database shutdown error:",
          error.message
        );
        process.exit(1);
      });

  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);