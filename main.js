const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const express = require("express");
const axios = require("axios");
const http = require("http");
const fs = require("fs");

const dotenv = require("dotenv");
dotenv.config(); // Loads variables from .env into process.env

const CLIENT_ID = process.env.FITBIT_CLIENT_ID;
const CLIENT_SECRET = process.env.FITBIT_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.REDIRECT_URI || "http://localhost:3000/callback";
const TOKEN_STORE = path.join(app.getPath("userData"), "fitbit_tokens.json");

let win;
let server;

const createWindow = () => {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.loadFile("index.html");
};

app.whenReady().then(() => {
  createWindow();
  startAuthServer();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
  if (server) server.close();
});

// Simple token storage helper
function saveTokens(obj) {
  fs.writeFileSync(TOKEN_STORE, JSON.stringify(obj, null, 2));
}

function loadTokens() {
  if (!fs.existsSync(TOKEN_STORE)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_STORE));
}
// Exchange code for tokens
async function exchangeCode(code) {
  const resp = await axios.post(
    "https://api.fitbit.com/oauth2/token",
    new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      },
    },
  );
  const data = resp.data;
  data.obtained_at = Date.now();
  saveTokens(data);
  return data;
}
ipcMain.handle("start-oauth", async () => {
  console.log("hi");
  const scope = encodeURIComponent("activity");
  const url = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scope}`;
  shell.openExternal(url);
});

// Simple Express server for callback
function startAuthServer() {
  const ex = express();
  ex.get("/callback", async (req, res) => {
    const code = req.query.code;
    await exchangeCode(code);
    res.send("<h3>Fitbit connected! Go back to the app.</h3>");
    if (win && !win.isDestroyed()) {
      win.webContents.send("oauth-done");
    }
  });
  server = http.createServer(ex);
  server.listen(3000);
  console.log("server is running on port", server.address().port);
}

// Get today’s steps
ipcMain.handle("get-steps", async () => {
  const tokens = loadTokens();
  const today = new Date().toISOString().split("T")[0]; // "2025-09-19"
  if (!tokens) return { steps: 0 };

  console.log("Using access token:", tokens.access_token);

  try {
    const resp = await axios.get(
      `https://api.fitbit.com/1/user/-/activities/date/${today}.json`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    const steps = resp.data.summary.steps;
    return { steps };
  } catch (err) {
    console.error(
      "Fitbit API error:",
      err.response?.status,
      err.response?.data,
    );
    throw err;
  }
});
