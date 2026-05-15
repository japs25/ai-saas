require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const USERS_FILE = path.join(__dirname, "data", "users.json");
const CHATS_FILE = path.join(__dirname, "data", "chats.json");

// helpers
function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// AUTH MIDDLEWARE
function auth(req, res, next) {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({
      error: "No token"
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();

  } catch {
    return res.status(401).json({
      error: "Invalid token"
    });
  }
}

/* ---------------- REGISTER ---------------- */

app.post("/api/register", async (req, res) => {

  const { username, password } = req.body;

  let users = read(USERS_FILE);

  if (users.find(u => u.username === username)) {
    return res.json({
      error: "User exists"
    });
  }

  const hash = await bcrypt.hash(password, 10);

  users.push({
    username,
    password: hash
  });

  write(USERS_FILE, users);

  res.json({
    success: true
  });
});

/* ---------------- LOGIN ---------------- */

app.post("/api/login", async (req, res) => {

  const { username, password } = req.body;

  const users = read(USERS_FILE);

  const user = users.find(u => u.username === username);

  if (!user) {
    return res.json({
      error: "User not found"
    });
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    return res.json({
      error: "Wrong password"
    });
  }

  const token = jwt.sign(
    { username },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    success: true,
    token,
    username
  });
});

/* ---------------- CHAT ---------------- */

app.post("/api/chat", auth, async (req, res) => {

  try {

    const { message, chatId } = req.body;

    const username = req.user.username;

    let chats = read(CHATS_FILE);

    chats.push({
      username,
      chatId,
      role: "user",
      text: message,
      time: Date.now()
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: message }]
            }
          ]
        })
      }
    );

    const data = await response.json();

    const aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.error?.message ||
      "No response";

    chats.push({
      username,
      chatId,
      role: "ai",
      text: aiText,
      time: Date.now()
    });

    write(CHATS_FILE, chats);

    res.json({
      reply: aiText
    });

  } catch (err) {

    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
});

app.listen(3000, () => {
  console.log("Secure AI SaaS running on http://localhost:3000");
});