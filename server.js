require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const USERS_FILE = "./data/users.json";
const CHATS_FILE = "./data/chats.json";

const JWT_SECRET = process.env.JWT_SECRET || "secret123";

/* ---------------- CREATE FILES IF MISSING ---------------- */

if (!fs.existsSync("./data")) {
  fs.mkdirSync("./data");
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "[]");
}

if (!fs.existsSync(CHATS_FILE)) {
  fs.writeFileSync(CHATS_FILE, "[]");
}

/* ---------------- HELPERS ---------------- */

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ---------------- REGISTER ---------------- */

app.post("/api/register", async (req, res) => {

  const { username, password } = req.body;

  const users = readJSON(USERS_FILE);

  const exists = users.find(u => u.username === username);

  if (exists) {
    return res.json({
      error: "User already exists"
    });
  }

  const hashed = await bcrypt.hash(password, 10);

  users.push({
    username,
    password: hashed
  });

  writeJSON(USERS_FILE, users);

  res.json({
    success: true
  });

});

/* ---------------- LOGIN ---------------- */

app.post("/api/login", async (req, res) => {

  const { username, password } = req.body;

  const users = readJSON(USERS_FILE);

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
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    success: true,
    token,
    username
  });

});

/* ---------------- CHAT ---------------- */

app.post("/api/chat", async (req, res) => {

  try {

    const token = req.headers.authorization;

    if (!token) {
      return res.json({
        error: "No token"
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const { message, chatId } = req.body;

    /* GOOGLE GEMINI API */
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: message
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    console.log("GEMINI RESPONSE:", JSON.stringify(data, null, 2));

    let reply = "No AI response";

    if (
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0]
    ) {
      reply = data.candidates[0].content.parts[0].text;
    }

    /* SAVE CHAT */
    const chats = readJSON(CHATS_FILE);

    chats.push({
      username: decoded.username,
      chatId,
      user: message,
      ai: reply,
      time: Date.now()
    });

    writeJSON(CHATS_FILE, chats);

    res.json({
      reply
    });

  } catch (err) {

    console.log(err);

    res.json({
      error: err.message
    });

  }

});

/* ---------------- START SERVER ---------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Secure AI SaaS running on http://localhost:" + PORT);
});