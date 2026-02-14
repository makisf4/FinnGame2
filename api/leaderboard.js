"use strict";

const LEADERBOARD_KEY = "finn:leaderboard:v1";

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sanitizeName(input) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

function leaderboardKey(name) {
  return sanitizeName(name).toLowerCase();
}

function normalizeLeaderboard(entries) {
  const bestByName = new Map();

  for (const raw of entries || []) {
    const name = sanitizeName(raw && raw.name);
    const scoreValue = Number(raw && raw.score);
    const score = Number.isFinite(scoreValue) ? Math.floor(scoreValue) : 0;
    const atValue = Number(raw && raw.at);
    const at = Number.isFinite(atValue) ? atValue : 0;
    if (!name || score <= 0) continue;

    const key = leaderboardKey(name);
    const prev = bestByName.get(key);
    if (!prev || score > prev.score || (score === prev.score && at < prev.at)) {
      bestByName.set(key, { name, score, at });
    }
  }

  return Array.from(bestByName.values())
    .sort((a, b) => (b.score - a.score) || (a.at - b.at))
    .slice(0, 10);
}

function upsertScore(entries, name, score) {
  const cleanName = sanitizeName(name);
  const cleanScore = Number.isFinite(score) ? Math.floor(score) : 0;
  if (!cleanName || cleanScore <= 0) return normalizeLeaderboard(entries);

  const list = normalizeLeaderboard(entries);
  const key = leaderboardKey(cleanName);
  const idx = list.findIndex((e) => leaderboardKey(e.name) === key);
  if (idx >= 0) {
    if (cleanScore > list[idx].score) list[idx].score = cleanScore;
    list[idx].name = cleanName;
    list[idx].at = list[idx].at || Date.now();
  } else {
    list.push({ name: cleanName, score: cleanScore, at: Date.now() });
  }
  return normalizeLeaderboard(list);
}

function renamePlayer(entries, oldName, newName) {
  const oldKey = leaderboardKey(oldName);
  const newKey = leaderboardKey(newName);
  const list = normalizeLeaderboard(entries);
  if (!oldKey || !newKey) return list;

  if (oldKey === newKey) {
    const idx = list.findIndex((e) => leaderboardKey(e.name) === newKey);
    if (idx >= 0) list[idx].name = sanitizeName(newName);
    return normalizeLeaderboard(list);
  }

  const oldEntry = list.find((e) => leaderboardKey(e.name) === oldKey);
  const newEntry = list.find((e) => leaderboardKey(e.name) === newKey);
  if (!oldEntry && !newEntry) return list;

  if (oldEntry && newEntry) {
    newEntry.score = Math.max(newEntry.score, oldEntry.score);
    newEntry.name = sanitizeName(newName);
    return normalizeLeaderboard(list.filter((e) => leaderboardKey(e.name) !== oldKey));
  }
  if (oldEntry) oldEntry.name = sanitizeName(newName);
  return normalizeLeaderboard(list);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let data = "";
  for await (const chunk of req) data += chunk;
  if (!data) return {};
  return JSON.parse(data);
}

function getKvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  return { url, token };
}

async function kvRequest(path) {
  const { url, token } = getKvConfig();
  if (!url || !token) {
    throw new Error("KV env vars not configured");
  }
  const res = await fetch(`${url}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV request failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function getStoredLeaderboard() {
  const data = await kvRequest(`/get/${encodeURIComponent(LEADERBOARD_KEY)}`);
  if (!data || !data.result) return [];
  try {
    const parsed = JSON.parse(data.result);
    return normalizeLeaderboard(parsed);
  } catch (_) {
    return [];
  }
}

async function setStoredLeaderboard(entries) {
  const normalized = normalizeLeaderboard(entries);
  const payload = encodeURIComponent(JSON.stringify(normalized));
  await kvRequest(`/set/${encodeURIComponent(LEADERBOARD_KEY)}/${payload}`);
  return normalized;
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const entries = await getStoredLeaderboard();
      return sendJson(res, 200, { entries });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const body = await readJsonBody(req);
    const type = String(body.type || "");
    const entries = await getStoredLeaderboard();

    if (type === "record") {
      const name = sanitizeName(body.name);
      const score = Number(body.score);
      const updated = upsertScore(entries, name, score);
      await setStoredLeaderboard(updated);
      return sendJson(res, 200, { entries: updated });
    }

    if (type === "rename") {
      const oldName = sanitizeName(body.oldName);
      const newName = sanitizeName(body.newName);
      const updated = renamePlayer(entries, oldName, newName);
      await setStoredLeaderboard(updated);
      return sendJson(res, 200, { entries: updated });
    }

    return sendJson(res, 400, { error: "Unknown type" });
  } catch (err) {
    return sendJson(res, 503, { error: err && err.message ? err.message : "Leaderboard unavailable" });
  }
};

