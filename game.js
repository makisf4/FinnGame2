(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const isMobileLayout = window.matchMedia("(max-width: 900px)").matches;
  const isPortraitLayout = window.matchMedia("(orientation: portrait)").matches;
  const useTallMobileArena = isMobileLayout && isPortraitLayout;
  const mobileSpriteScale = isMobileLayout ? 1.2 : 1;
  const mobileNameScale = isMobileLayout ? 1.5 : 1;

  canvas.width = 960;
  canvas.height = useTallMobileArena ? 1120 : 540;

  const ui = {
    score: document.getElementById("stat-score"),
    scoreMobile: document.getElementById("stat-score-mobile"),
    misses: document.getElementById("stat-misses"),
    status: document.getElementById("status-box"),
    audioBtn: document.getElementById("audio-toggle"),
    editNameBtn: document.getElementById("edit-name"),
    leaderToggleBtn: document.getElementById("leader-toggle"),
    leftBtn: document.getElementById("btn-left"),
    rightBtn: document.getElementById("btn-right"),
    leaderList: document.getElementById("leader-list"),
    leaderboardPanel: document.querySelector(".game-leaderboard"),
    nameCard: document.getElementById("name-card"),
    nameInput: document.getElementById("name-input"),
    nameSubmit: document.getElementById("name-submit"),
  };

  const W = canvas.width;
  const H = canvas.height;
  const groundY = H - 58;
  const restaurant = { x: 180, y: useTallMobileArena ? 98 : 20, w: 600, h: 120 };

  const foodTypes = [
    { id: "chicken", name: "Chicken", value: 12, color: "#f59e0b", rim: "#b45309", r: 13, sprite: "foodChicken" },
    { id: "pork", name: "Pork", value: 10, color: "#fb7185", rim: "#be123c", r: 12, sprite: "foodPork" },
    { id: "beef", name: "Beef", value: 14, color: "#b91c1c", rim: "#7f1d1d", r: 13, sprite: "foodBeef" },
    { id: "bread", name: "Bread", value: 6, color: "#d6a24f", rim: "#92400e", r: 12, sprite: "foodBread" },
    { id: "hazelnuts", name: "Hazelnuts", value: 8, color: "#8b5e34", rim: "#5b3a1d", r: 10, sprite: "foodHazelnuts" },
    { id: "veggies", name: "Veggies", value: 5, color: "#22c55e", rim: "#166534", r: 11, sprite: "foodVeggies" },
    { id: "poue", name: "Poue", value: 24, color: "#a855f7", rim: "#6b21a8", r: 12, sprite: null },
  ];
  const baseCustomerNames = ["Dido", "Elli", "Aggelos", "Cecile", "Makis"];
  const extraCustomerNames = ["Stergios", "Thanos", "Maria", "Alexandra", "Konstantina"];
  const primaryCustomerNames = [...baseCustomerNames, ...extraCustomerNames];

  const spriteSources = {
    finnBody: "assets/sprites/finnBody.png?v=png1",
    restaurant: "assets/sprites/restaurant.svg?v=ios9",
    foodChicken: "assets/sprites/foods/chicken.png?v=png1",
    foodPork: "assets/sprites/foods/pork.png?v=png1",
    foodBeef: "assets/sprites/foods/beef.png?v=png1",
    foodBread: "assets/sprites/foods/bread.png?v=png1",
    foodHazelnuts: "assets/sprites/foods/hazelnuts.png?v=png1",
    foodVeggies: "assets/sprites/foods/veggies.png?v=png1",
  };
  const sprites = Object.create(null);

  function loadSprites() {
    for (const [key, src] of Object.entries(spriteSources)) {
      const img = new Image();
      img.src = src;
      sprites[key] = img;
    }
  }

  function canDrawSprite(key) {
    const img = sprites[key];
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  const keys = Object.create(null);
  let pointerTarget = null;
  let pointerTimer = 0;

  const player = {
    x: W * 0.5 - 38,
    y: groundY - 38,
    w: 76,
    h: 38,
    speed: 460,
    facing: 1,
    bob: 0,
  };

  let foods = [];
  let particles = [];

  let state = "waiting_name";
  let score = 0;
  let misses = 0;
  const maxMisses = 3;
  let elapsed = 0;
  let spawnTimer = 0;
  let missFlash = 0;
  let ringPhase = 0;

  const FINN_REACH_MARGIN = 0.3;
  const FOOD_TERMINAL_MIN = 95;
  const FOOD_TERMINAL_MAX = 260;
  const TARGET_SWITCH_BUFFER = 0.42;
  const SELF_CATCH_MARGIN = 0.34;
  const QUEUE_EXTRA_MARGIN = 0.28;
  const EMERGENCY_TERMINAL_MIN = 20;
  const EMERGENCY_GRAVITY_MIN = 2.5;

  let targetFoodId = null;
  let nextFoodId = 1;
  let gameOverRecorded = false;
  let playerName = "Player";
  let leaderboard = [];
  let nameCardMode = "initial";
  let resumeStateAfterNameCard = "playing";

  const storageKeys = {
    playerName: "finn.playerName.v1",
    leaderboard: "finn.leaderboard.v1",
  };

  let audioCtx = null;
  let audioEnabled = true;
  let lastFoodCalloutAt = 0;
  let calloutBuffersLoading = false;
  const calloutBuffers = Object.create(null);
  const calloutSources = {
    chicken: "assets/audio/callouts/chicken.wav?v=1",
    pork: "assets/audio/callouts/pork.wav?v=1",
    beef: "assets/audio/callouts/beef.wav?v=1",
    bread: "assets/audio/callouts/bread.wav?v=1",
    hazelnuts: "assets/audio/callouts/hazelnuts.wav?v=1",
    veggies: "assets/audio/callouts/veggies.wav?v=1",
    poue: "assets/audio/callouts/poue.wav?v=1",
  };
  let preferredSpeechVoice = null;
  let speechUnlocked = false;
  let speechInFlight = false;
  let queuedSpeechName = null;

  const femaleVoiceHints = [
    "samantha",
    "victoria",
    "karen",
    "moira",
    "ava",
    "fiona",
    "tessa",
    "veena",
    "female",
  ];

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    ensureCalloutBuffers();
  }

  function decodeAudioDataCompat(ctx, arrayBuffer) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (value, isError = false) => {
        if (settled) return;
        settled = true;
        if (isError) reject(value);
        else resolve(value);
      };

      const copy = arrayBuffer.slice(0);
      const result = ctx.decodeAudioData(copy, (buf) => done(buf), (err) => done(err, true));
      if (result && typeof result.then === "function") {
        result.then((buf) => done(buf)).catch((err) => done(err, true));
      }
    });
  }

  function ensureCalloutBuffers() {
    if (calloutBuffersLoading || !audioCtx) return;
    calloutBuffersLoading = true;

    const entries = Object.entries(calloutSources);
    Promise.all(
      entries.map(async ([key, src]) => {
        try {
          const res = await fetch(src, { cache: "force-cache" });
          if (!res.ok) return;
          const data = await res.arrayBuffer();
          const buf = await decodeAudioDataCompat(audioCtx, data);
          if (buf) calloutBuffers[key] = buf;
        } catch (_) {}
      })
    ).catch(() => {});
  }

  function playCalloutClip(name) {
    if (!audioEnabled || !audioCtx || !name) return false;
    const key = String(name).toLowerCase();
    const buf = calloutBuffers[key];
    if (!buf) return false;

    try {
      const src = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.96;
      src.buffer = buf;
      src.connect(gain);
      gain.connect(audioCtx.destination);
      src.start();
      return true;
    } catch (_) {
      return false;
    }
  }

  function playTone(freq, duration, type = "square", volume = 0.03, when = 0) {
    if (!audioEnabled || !audioCtx || !freq) return;
    const start = audioCtx.currentTime + when;
    const end = start + duration;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }

  const sfx = {
    catch() {
      playTone(860, 0.06, "triangle", 0.045);
      playTone(1180, 0.07, "triangle", 0.032, 0.04);
    },
    miss() {
      playTone(240, 0.1, "sawtooth", 0.045);
      playTone(170, 0.12, "sawtooth", 0.035, 0.08);
    },
    gameOver() {
      playTone(340, 0.12, "square", 0.05);
      playTone(250, 0.12, "square", 0.05, 0.12);
      playTone(190, 0.2, "square", 0.05, 0.24);
    },
    restart() {
      playTone(520, 0.07, "triangle", 0.04);
      playTone(680, 0.08, "triangle", 0.035, 0.06);
    },
  };

  function getSpeechSynth() {
    if (!("speechSynthesis" in window)) return null;
    if (typeof window.SpeechSynthesisUtterance !== "function") return null;
    return window.speechSynthesis;
  }

  function isFemaleVoiceName(name) {
    const n = String(name || "").toLowerCase();
    return femaleVoiceHints.some((hint) => n.includes(hint));
  }

  function choosePreferredSpeechVoice() {
    const synth = getSpeechSynth();
    if (!synth) return null;

    const voices = synth.getVoices() || [];
    if (!voices.length) return null;

    const englishVoices = voices.filter((v) => String(v.lang || "").toLowerCase().startsWith("en"));
    const pool = englishVoices.length ? englishVoices : voices;

    let best = null;
    let bestScore = -Infinity;

    for (const v of pool) {
      const lang = String(v.lang || "").toLowerCase();
      const name = String(v.name || "").toLowerCase();
      let score = 0;

      if (lang.startsWith("en-us")) score += 50;
      else if (lang.startsWith("en")) score += 30;

      if (v.localService) score += 8;
      if (isFemaleVoiceName(name)) score += 45;
      if (name.includes("male")) score -= 25;
      if (name.includes("fred")) score -= 15;

      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }

    preferredSpeechVoice = best || pool[0] || null;
    return preferredSpeechVoice;
  }

  function initSpeechVoices() {
    const synth = getSpeechSynth();
    if (!synth) return;

    choosePreferredSpeechVoice();

    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", choosePreferredSpeechVoice);
    } else {
      synth.onvoiceschanged = choosePreferredSpeechVoice;
    }
  }

  function unlockSpeechIfNeeded() {
    const synth = getSpeechSynth();
    if (!synth || speechUnlocked || !audioEnabled) return;

    choosePreferredSpeechVoice();

    try {
      const prime = new window.SpeechSynthesisUtterance("ready");
      prime.volume = 0.01;
      prime.rate = 1;
      prime.pitch = 1;
      prime.lang = (preferredSpeechVoice && preferredSpeechVoice.lang) || "en-US";
      if (preferredSpeechVoice) prime.voice = preferredSpeechVoice;
      prime.onend = () => {
        speechUnlocked = true;
      };
      prime.onerror = () => {};
      synth.speak(prime);
      setTimeout(() => {
        speechUnlocked = true;
      }, 140);
    } catch (_) {
      speechUnlocked = false;
    }
  }

  function stopSpeech() {
    const synth = getSpeechSynth();
    if (!synth) return;
    queuedSpeechName = null;
    speechInFlight = false;
    synth.cancel();
  }

  function flushSpeechQueue() {
    if (!audioEnabled || speechInFlight || !queuedSpeechName) return;
    const synth = getSpeechSynth();
    if (!synth) return;

    if (!speechUnlocked) unlockSpeechIfNeeded();
    if (!speechUnlocked) return;
    if (!preferredSpeechVoice) choosePreferredSpeechVoice();

    const name = queuedSpeechName;
    queuedSpeechName = null;
    const utter = new window.SpeechSynthesisUtterance(name);
    utter.lang = (preferredSpeechVoice && preferredSpeechVoice.lang) || "en-US";
    utter.rate = 0.94;
    utter.pitch = 1.08;
    utter.volume = 0.95;
    if (preferredSpeechVoice) utter.voice = preferredSpeechVoice;
    utter.onend = () => {
      speechInFlight = false;
      if (queuedSpeechName) setTimeout(flushSpeechQueue, 60);
    };
    utter.onerror = () => {
      speechInFlight = false;
      if (queuedSpeechName) setTimeout(flushSpeechQueue, 120);
    };

    try {
      synth.resume();
    } catch (_) {}

    try {
      speechInFlight = true;
      synth.speak(utter);
    } catch (_) {
      speechInFlight = false;
    }
  }

  function speakFoodName(name) {
    if (!audioEnabled || !name) return;
    ensureAudio();

    // Prefer deterministic local callout clips (works on Brave/iOS too).
    if (playCalloutClip(name)) return;

    const now = performance.now();
    if (now - lastFoodCalloutAt < 280) return;
    lastFoodCalloutAt = now;
    queuedSpeechName = name;
    flushSpeechQueue();
  }

  function updateAudioButton() {
    if (!ui.audioBtn) return;
    ui.audioBtn.textContent = audioEnabled ? "Sound: ON" : "Sound: OFF";
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function rectOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function customerCount() {
    return clamp(5 + Math.floor(elapsed / 11), 5, 18);
  }

  function spawnInterval() {
    const c = customerCount();
    return clamp(1.02 - c * 0.04, 0.24, 1.25);
  }

  function fallBaseSpeed() {
    const c = customerCount();
    return 95 + c * 8 + elapsed * 1.0;
  }

  function randomFoodType() {
    const n = Math.random();
    if (n < 0.035) return foodTypes[6]; // Rare special drop: Poue
    if (n < 0.205) return foodTypes[0];
    if (n < 0.34) return foodTypes[1];
    if (n < 0.48) return foodTypes[2];
    if (n < 0.69) return foodTypes[3];
    if (n < 0.84) return foodTypes[4];
    return foodTypes[5];
  }

  function getCustomerName(index) {
    if (index < primaryCustomerNames.length) {
      return primaryCustomerNames[index];
    }

    const repeatIndex = index - primaryCustomerNames.length;
    const name = primaryCustomerNames[repeatIndex % primaryCustomerNames.length];
    const cycle = Math.floor(repeatIndex / primaryCustomerNames.length) + 2;
    return `${name}_${cycle}`;
  }

  function setStatus(text) {
    if (ui.status) ui.status.textContent = text;
  }

  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {}
  }

  function sanitizeName(input) {
    const clean = String(input || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 24);
    return clean;
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

  function loadPlayerName() {
    const stored = sanitizeName(safeStorageGet(storageKeys.playerName) || "");
    if (stored) playerName = stored;
  }

  function openNameCard(mode = "initial") {
    if (!ui.nameCard) return;
    nameCardMode = mode;
    resumeStateAfterNameCard = state;
    state = "waiting_name";
    ui.nameCard.classList.remove("is-hidden");
    if (ui.nameInput) {
      ui.nameInput.value = playerName && playerName !== "Player" ? playerName : "";
      setTimeout(() => {
        ui.nameInput.focus();
        ui.nameInput.select();
      }, 0);
    }
    if (ui.nameSubmit) {
      ui.nameSubmit.textContent = mode === "edit" ? "Save" : "Start";
    }
  }

  function closeNameCard() {
    if (!ui.nameCard) return;
    ui.nameCard.classList.add("is-hidden");
  }

  function submitPlayerName() {
    const typed = ui.nameInput ? ui.nameInput.value : "";
    const clean = sanitizeName(typed);
    if (!clean) {
      if (ui.nameInput) ui.nameInput.focus();
      return;
    }

    const previousName = playerName;
    playerName = clean;
    safeStorageSet(storageKeys.playerName, playerName);
    if (nameCardMode === "edit") {
      renameLeaderboardPlayer(previousName, playerName);
    }
    renderLeaderboard();
    closeNameCard();
    if (nameCardMode === "edit") {
      state = resumeStateAfterNameCard === "waiting_name" ? "playing" : resumeStateAfterNameCard;
      updatePanels();
    } else {
      restart();
    }
  }

  function loadLeaderboard() {
    const raw = safeStorageGet(storageKeys.leaderboard);
    if (!raw) {
      leaderboard = [];
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        leaderboard = [];
        return;
      }
      leaderboard = normalizeLeaderboard(parsed);
    } catch (_) {
      leaderboard = [];
    }
  }

  function saveLeaderboard() {
    safeStorageSet(storageKeys.leaderboard, JSON.stringify(leaderboard));
  }

  function renderLeaderboard() {
    if (!ui.leaderList) return;

    ui.leaderList.innerHTML = "";
    if (!leaderboard.length) {
      const li = document.createElement("li");
      li.textContent = "No scores yet";
      ui.leaderList.appendChild(li);
      return;
    }

    for (const entry of leaderboard) {
      const li = document.createElement("li");
      li.textContent = `${entry.name} - ${entry.score}`;
      ui.leaderList.appendChild(li);
    }
  }

  function upsertLeaderboardScore(name, score) {
    const cleanName = sanitizeName(name);
    const cleanScore = Number.isFinite(score) ? Math.floor(score) : 0;
    if (!cleanName || cleanScore <= 0) return;

    const key = leaderboardKey(cleanName);
    const idx = leaderboard.findIndex((e) => leaderboardKey(e.name) === key);
    if (idx >= 0) {
      if (cleanScore > leaderboard[idx].score) {
        leaderboard[idx].score = cleanScore;
      }
      leaderboard[idx].name = cleanName;
      leaderboard[idx].at = leaderboard[idx].at || Date.now();
    } else {
      leaderboard.push({
        name: cleanName,
        score: cleanScore,
        at: Date.now(),
      });
    }

    leaderboard = normalizeLeaderboard(leaderboard);
  }

  function renameLeaderboardPlayer(oldName, newName) {
    const oldKey = leaderboardKey(oldName);
    const newKey = leaderboardKey(newName);
    if (!oldKey || !newKey) return;

    if (oldKey === newKey) {
      const idx = leaderboard.findIndex((e) => leaderboardKey(e.name) === newKey);
      if (idx >= 0) leaderboard[idx].name = sanitizeName(newName);
      saveLeaderboard();
      renderLeaderboard();
      return;
    }

    const oldEntry = leaderboard.find((e) => leaderboardKey(e.name) === oldKey);
    const newEntry = leaderboard.find((e) => leaderboardKey(e.name) === newKey);
    if (!oldEntry && !newEntry) return;

    if (oldEntry && newEntry) {
      newEntry.score = Math.max(newEntry.score, oldEntry.score);
      newEntry.name = sanitizeName(newName);
      leaderboard = leaderboard.filter((e) => leaderboardKey(e.name) !== oldKey);
    } else if (oldEntry) {
      oldEntry.name = sanitizeName(newName);
    }

    leaderboard = normalizeLeaderboard(leaderboard);
    saveLeaderboard();
    renderLeaderboard();
  }

  function recordLeaderboardScore(finalScore) {
    if (!finalScore || finalScore <= 0) return;
    upsertLeaderboardScore(playerName || "Player", Number(finalScore));
    saveLeaderboard();
    renderLeaderboard();
  }

  function setMobileLeaderboardOpen(open) {
    if (!ui.leaderboardPanel || !isMobileLayout) return;
    ui.leaderboardPanel.classList.toggle("is-open", !!open);
    if (ui.leaderToggleBtn) {
      ui.leaderToggleBtn.textContent = open ? "Hide Board" : "Leaderboard";
    }
  }

  function updatePanels() {
    ui.score.textContent = String(score);
    if (ui.scoreMobile) ui.scoreMobile.textContent = String(score);
    ui.misses.textContent = `${misses} / ${maxMisses}`;

    if (!(canDrawSprite("finnBody") && canDrawSprite("restaurant"))) {
      setStatus("Loading sprite art...");
      return;
    }

    if (state === "waiting_name") {
      setStatus("Enter your name to start.");
    } else if (state === "gameover") {
      setStatus("Game Over - Tap screen or press R");
    } else {
      setStatus("Catch food before it hits the ground.");
    }
  }

  function renderFoodList() {
    // no-op (side food panel removed)
  }

  function restart() {
    state = "playing";
    score = 0;
    misses = 0;
    elapsed = 0;
    spawnTimer = 0;
    missFlash = 0;
    ringPhase = 0;
    foods = [];
    particles = [];
    player.x = W * 0.5 - player.w * 0.5;
    player.facing = 1;
    targetFoodId = null;
    nextFoodId = 1;
    gameOverRecorded = false;
    setStatus("Ready");
    ensureAudio();
    sfx.restart();
    updatePanels();
  }

  function createFoodDrop(x, y, type, driftRange, speedVariance) {
    const finnCenter = player.x + player.w * 0.5;
    const horizontalDist = Math.abs(x - finnCenter);
    const reachTime = horizontalDist / Math.max(1, player.speed) + FINN_REACH_MARGIN;

    // Estimated vertical distance to Finn's catch zone.
    const catchY = player.y - 6;
    const verticalDist = Math.max(120, catchY - y);

    const baseVy = fallBaseSpeed() + Math.random() * speedVariance;
    const fairnessVy = verticalDist / Math.max(0.4, reachTime);
    const terminalVy = clamp(Math.min(baseVy * 1.2, fairnessVy * 1.08), FOOD_TERMINAL_MIN, FOOD_TERMINAL_MAX);

    const baseGravity = clamp(terminalVy * 0.42, 28, 92);
    return {
      id: nextFoodId += 1,
      x,
      y,
      r: type.r,
      type,
      vy: terminalVy * (0.55 + Math.random() * 0.08),
      terminalVy,
      baseTerminalVy: terminalVy,
      gravity: baseGravity,
      baseGravity,
      vx: (Math.random() * 2 - 1) * driftRange,
      wobble: Math.random() * Math.PI * 2,
      delay: 0.2 + Math.random() * 0.22,
    };
  }

  function spawnFood() {
    const customers = customerCount();
    const slot = Math.floor(Math.random() * customers);
    const lane = restaurant.x + 28 + (slot / Math.max(1, customers - 1)) * (restaurant.w - 56);
    const t = randomFoodType();

    const x1 = lane + (Math.random() * 18 - 9);
    const y1 = restaurant.y + restaurant.h + 8;
    foods.push(createFoodDrop(x1, y1, t, 20, 45));

    const extraChance = clamp((customers - 8) * 0.06, 0, 0.5);
    if (Math.random() < extraChance) {
      const t2 = randomFoodType();
      const x2 = clamp(lane + (Math.random() * 100 - 50), restaurant.x + 20, restaurant.x + restaurant.w - 20);
      const y2 = restaurant.y + restaurant.h + 8;
      foods.push(createFoodDrop(x2, y2, t2, 28, 55));
    }
  }

  function makeCatchBurst(x, y, color) {
    for (let i = 0; i < 9; i += 1) {
      const a = (Math.PI * 2 * i) / 9 + Math.random() * 0.2;
      const sp = 40 + Math.random() * 120;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.5 + Math.random() * 0.35,
        color,
      });
    }
  }

  function updatePlayer(dt) {
    let dir = 0;
    if (keys["a"] || keys["arrowleft"]) dir -= 1;
    if (keys["d"] || keys["arrowright"]) dir += 1;

    if (pointerTarget !== null && pointerTimer > 0) {
      const targetX = clamp(pointerTarget - player.w * 0.5, 0, W - player.w);
      const dx = targetX - player.x;
      if (Math.abs(dx) > 2) {
        dir = Math.sign(dx);
        player.x += clamp(dx, -player.speed * dt, player.speed * dt);
      }
      pointerTimer -= dt;
    } else {
      player.x += dir * player.speed * dt;
    }

    player.x = clamp(player.x, 0, W - player.w);
    if (dir !== 0) player.facing = dir;
    player.bob += dt * (1 + Math.abs(dir) * 5);
  }

  function estimateFoodEta(food, catchY) {
    const dy = catchY - food.y;
    if (dy <= 0) return 0;

    const delay = Math.max(0, food.delay || 0);
    const vy = Math.max(35, food.vy);
    const g = Math.max(1, food.gravity || food.baseGravity || 1);
    const vt = Math.max(vy, food.terminalVy || food.baseTerminalVy || vy);

    const tToTerminal = (vt - vy) / g;
    const dToTerminal = vy * tToTerminal + 0.5 * g * tToTerminal * tToTerminal;

    let fallTime;
    if (dy <= dToTerminal) {
      const disc = vy * vy + 2 * g * dy;
      fallTime = (-vy + Math.sqrt(Math.max(0, disc))) / g;
    } else {
      fallTime = tToTerminal + (dy - dToTerminal) / Math.max(1, vt);
    }

    return clamp(delay + fallTime, 0, 9);
  }

  function choosePrimaryFood(catchY) {
    const finnCenter = player.x + player.w * 0.5;

    if (targetFoodId !== null) {
      const locked = foods.find((f) => f.id === targetFoodId);
      if (locked && estimateFoodEta(locked, catchY) < 4.2) {
        return locked;
      }
    }

    let best = null;
    let bestScore = Infinity;

    for (const f of foods) {
      const eta = estimateFoodEta(f, catchY);
      if (eta > 5.4) continue;

      const dx = Math.abs(f.x - finnCenter);
      const moveTime = dx / Math.max(1, player.speed);
      const mustReachBy = moveTime + SELF_CATCH_MARGIN;
      if (eta < mustReachBy) continue;
      const alignedBonus = dx < player.w * 0.95 ? 0.24 : 0;
      const score = eta + moveTime * 1.45 - alignedBonus;

      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }

    targetFoodId = best ? best.id : null;
    return best;
  }

  function updateFoods(dt) {
    const catchY = player.y - 6;
    const finnCenter = player.x + player.w * 0.5;
    const catchBox = {
      x: player.x + 4,
      y: player.y - 18,
      w: player.w - 8,
      h: 28,
    };

    const primaryFood = choosePrimaryFood(catchY);
    const primaryEta = primaryFood ? estimateFoodEta(primaryFood, catchY) : null;

    for (let i = foods.length - 1; i >= 0; i -= 1) {
      const f = foods[i];

      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }

      let targetTerminal = f.baseTerminalVy;
      let targetGravity = f.baseGravity;
      const eta = estimateFoodEta(f, catchY);

      // Hard safety: no food should become uncatchable from Finn's current position.
      const selfReachEta = Math.abs(f.x - finnCenter) / Math.max(1, player.speed) + SELF_CATCH_MARGIN;
      if (eta < selfReachEta) {
        const emergencySlowdown = clamp(eta / Math.max(0.05, selfReachEta), 0.03, 1);
        targetTerminal = Math.min(
          targetTerminal,
          clamp(f.baseTerminalVy * emergencySlowdown, EMERGENCY_TERMINAL_MIN, f.baseTerminalVy)
        );
        targetGravity = Math.min(
          targetGravity,
          clamp(f.baseGravity * emergencySlowdown * emergencySlowdown, EMERGENCY_GRAVITY_MIN, f.baseGravity)
        );
      }

      if (primaryFood && f.id !== primaryFood.id && primaryEta !== null) {
        const primaryTravelEta =
          Math.abs(primaryFood.x - finnCenter) / Math.max(1, player.speed) + SELF_CATCH_MARGIN;
        const guaranteedPrimaryEta = Math.max(primaryEta, primaryTravelEta);
        const travelAfterPrimary =
          Math.abs(f.x - primaryFood.x) / Math.max(1, player.speed) + TARGET_SWITCH_BUFFER;
        const requiredEta = guaranteedPrimaryEta + travelAfterPrimary + QUEUE_EXTRA_MARGIN;

        if (eta < requiredEta) {
          const slowdown = clamp(eta / Math.max(0.05, requiredEta), 0.03, 1);
          targetTerminal = clamp(f.baseTerminalVy * slowdown, 26, f.baseTerminalVy);
          targetGravity = clamp(f.baseGravity * slowdown * slowdown, 4, f.baseGravity);
        }
      }

      const blend = Math.min(1, dt * 9);
      f.terminalVy += (targetTerminal - f.terminalVy) * blend;
      f.gravity += (targetGravity - f.gravity) * blend;

      f.wobble += dt * 4;
      f.x += f.vx * dt + Math.sin(f.wobble) * 8 * dt;
      f.y += f.vy * dt;
      f.vy = Math.min(f.terminalVy, f.vy + f.gravity * dt);

      if (f.x < 8 || f.x > W - 8) f.vx *= -1;

      const foodRect = { x: f.x - f.r, y: f.y - f.r, w: f.r * 2, h: f.r * 2 };
      if (rectOverlap(catchBox, foodRect)) {
        score += f.type.value;
        makeCatchBurst(f.x, f.y, f.type.color);
        if (targetFoodId === f.id) targetFoodId = null;
        foods.splice(i, 1);
        ensureAudio();
        sfx.catch();
        speakFoodName(f.type.name);
        continue;
      }

      if (f.y + f.r >= groundY) {
        if (targetFoodId === f.id) targetFoodId = null;
        foods.splice(i, 1);
        misses += 1;
        missFlash = 0.25;
        ensureAudio();
        sfx.miss();
        if (misses >= maxMisses) {
          state = "gameover";
          ensureAudio();
          sfx.gameOver();
          if (!gameOverRecorded) {
            gameOverRecorded = true;
            recordLeaderboardScore(score);
          }
        }
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function update(dt) {
    missFlash = Math.max(0, missFlash - dt);
    ringPhase += dt * 2.2;

    if (state !== "playing") {
      updatePanels();
      return;
    }

    elapsed += dt;
    updatePlayer(dt);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnFood();
      spawnTimer = spawnInterval();
    }

    updateFoods(dt);
    updateParticles(dt);
    updatePanels();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#8ed0ff");
    g.addColorStop(1, "#dbeafe");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.52)";
    ctx.beginPath();
    ctx.ellipse(140, 90, 90, 32, 0, 0, Math.PI * 2);
    ctx.ellipse(220, 85, 64, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(730, 115, 82, 28, 0, 0, Math.PI * 2);
    ctx.ellipse(800, 110, 56, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRestaurant() {
    ctx.save();

    if (canDrawSprite("restaurant")) {
      const ship = sprites.restaurant;
      const baseX = restaurant.x - 36;
      const baseY = restaurant.y - 8;
      const baseW = restaurant.w + 72;
      const baseH = restaurant.h + 48;
      const drawW = baseW * mobileSpriteScale;
      const drawH = baseH * mobileSpriteScale;
      const drawX = baseX - (drawW - baseW) * 0.5;
      const drawY = baseY - (drawH - baseH) * 0.5;
      ctx.shadowColor = "rgba(15,23,42,0.35)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
      ctx.drawImage(ship, drawX, drawY, drawW, drawH);
      ctx.shadowColor = "transparent";
    } else {
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(restaurant.x + 40, restaurant.y + 16, restaurant.w - 80, 14);
      ctx.fillStyle = "#f97316";
      ctx.fillRect(restaurant.x, restaurant.y + 28, restaurant.w, restaurant.h - 20);
      ctx.fillStyle = "#7c2d12";
      ctx.fillRect(restaurant.x, restaurant.y + 98, restaurant.w, 10);
    }

    const customers = customerCount();
    const rows = customers <= 5 ? 1 : customers <= 10 ? 2 : 3;
    const perRow = Math.ceil(customers / rows);
    for (let i = 0; i < customers; i += 1) {
      const row = Math.floor(i / perRow);
      const rowStart = row * perRow;
      const rowCount = Math.min(perRow, customers - rowStart);
      const col = i - rowStart;
      const px = restaurant.x + 28 + (col / Math.max(1, rowCount - 1)) * (restaurant.w - 56);
      const rowStep = 18 * mobileNameScale;
      const py = restaurant.y + 68 + row * rowStep + Math.sin(ringPhase + i * 0.72) * 1.8;
      const label = getCustomerName(i);
      ctx.font = `700 ${Math.round(15 * mobileNameScale)}px Trebuchet MS`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(3, 3 * mobileNameScale * 0.75);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
      ctx.strokeText(label, px, py - 4);
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(label, px, py - 4);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    ctx.restore();
  }

  function drawGround() {
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(0, groundY, W, H - groundY);

    ctx.fillStyle = "#4b5563";
    for (let x = 0; x < W; x += 40) {
      ctx.fillRect(x + ((Math.floor(x / 40) % 2) * 10), groundY + 24, 24, 12);
    }
  }

  function drawFood(food) {
    const spriteKey = food.type.sprite;
    if (spriteKey && canDrawSprite(spriteKey)) {
      const size = food.r * 2.45 * mobileSpriteScale;
      ctx.save();
      ctx.translate(food.x, food.y);
      ctx.rotate(Math.sin(food.wobble) * 0.1);
      ctx.drawImage(sprites[spriteKey], -size * 0.5, -size * 0.5, size, size);
      ctx.restore();
      return;
    }

    const drawR = food.r * mobileSpriteScale;
    ctx.fillStyle = food.type.color;
    ctx.beginPath();
    ctx.arc(food.x, food.y, drawR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = food.type.rim;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.beginPath();
    ctx.arc(
      food.x - drawR * 0.3,
      food.y - drawR * 0.3,
      Math.max(2, drawR * 0.22),
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  function drawFinn() {
    const bob = Math.sin(player.bob) * 1.8;
    const x = player.x;
    const y = player.y + bob;

    ctx.save();
    ctx.fillStyle = "rgba(15,23,42,0.35)";
    ctx.beginPath();
    ctx.ellipse(
      x + player.w * 0.5,
      y + player.h + 10,
      26 * mobileSpriteScale,
      6 * mobileSpriteScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    if (canDrawSprite("finnBody")) {
      const baseBodyW = 124;
      const baseBodyH = 74;
      const bodyW = baseBodyW * mobileSpriteScale;
      const bodyH = baseBodyH * mobileSpriteScale;
      const bodyX = x + 38 - bodyW * 0.5;
      const bodyBottom = y + 50;
      const bodyY = bodyBottom - bodyH;

      const moveByKeys = !!(keys["a"] || keys["arrowleft"] || keys["d"] || keys["arrowright"]);
      const pointerTargetX = pointerTarget !== null ? clamp(pointerTarget - player.w * 0.5, 0, W - player.w) : player.x;
      const moveByPointer = pointerTimer > 0 && Math.abs(pointerTargetX - player.x) > 2;
      const moving = moveByKeys || moveByPointer;
      const tilt = moving ? 0.016 : 0.004;

      ctx.save();
      if (player.facing < 0) {
        ctx.translate(bodyX + bodyW, bodyY);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(bodyX, bodyY);
      }
      ctx.rotate(Math.sin(player.bob * 0.22) * tilt);
      ctx.drawImage(sprites.finnBody, 0, 0, bodyW, bodyH);
      ctx.restore();
      return;
    }

    // Fallback primitive if sprites fail to load.
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(x + 8, y + 9, 56, 24);
    const headW = 28;
    const headX = player.facing > 0 ? x + 48 : x;
    ctx.fillRect(headX, y, headW, 21);
    ctx.fillRect(x + 13, y + 30, 10, 10);
    ctx.fillRect(x + 50, y + 30, 10, 10);
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(x + 30, y + 14, 14, 6);
    ctx.fillStyle = "#111827";
    const eyeX = player.facing > 0 ? headX + 16 : headX + 8;
    ctx.fillRect(eyeX, y + 5, 4, 4);
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life * 1.6, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawGameOver() {
    if (state !== "gameover") return;

    const panelW = 600;
    const panelH = 200;
    const panelX = (W - panelW) * 0.5;
    const panelY = Math.max(160, (H - panelH) * 0.5);

    ctx.fillStyle = "rgba(2, 6, 23, 0.82)";
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 3;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.font = "bold 42px Trebuchet MS";
    ctx.fillText("Game Over", W * 0.5, panelY + 75);
    ctx.font = "20px Trebuchet MS";
    ctx.fillText(`Final score: ${score}`, W * 0.5, panelY + 115);
    ctx.font = "17px Trebuchet MS";
    ctx.fillText("Press Enter or R to play again", W * 0.5, panelY + 155);
    ctx.textAlign = "left";
  }

  function draw() {
    drawSky();
    drawRestaurant();

    for (const f of foods) drawFood(f);
    drawParticles();

    drawGround();
    drawFinn();

    if (missFlash > 0) {
      ctx.globalAlpha = missFlash * 1.8;
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    drawGameOver();
  }

  function setPointerTarget(clientX) {
    const rect = canvas.getBoundingClientRect();
    pointerTarget = ((clientX - rect.left) / rect.width) * W;
    pointerTimer = 0.55;
  }

  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      ensureAudio();
      unlockSpeechIfNeeded();
    } else {
      stopSpeech();
    }
    updateAudioButton();
  }

  function bindHoldButton(btn, keyName) {
    if (!btn) return;

    const press = (e) => {
      if (e) e.preventDefault();
      keys[keyName] = true;
      btn.classList.add("is-held");
      ensureAudio();
      unlockSpeechIfNeeded();
    };

    const release = (e) => {
      if (e) e.preventDefault();
      keys[keyName] = false;
      btn.classList.remove("is-held");
    };

    btn.addEventListener("pointerdown", press, { passive: false });
    btn.addEventListener("pointerup", release, { passive: false });
    btn.addEventListener("pointercancel", release, { passive: false });
    btn.addEventListener("pointerleave", release, { passive: false });

    btn.addEventListener("touchstart", press, { passive: false });
    btn.addEventListener("touchend", release, { passive: false });
    btn.addEventListener("touchcancel", release, { passive: false });
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;

    if ((k === "r" || k === "enter") && state !== "waiting_name") {
      restart();
    }

    if (k === "m" && !e.repeat) {
      toggleAudio();
    }

    ensureAudio();
    unlockSpeechIfNeeded();
  });

  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    setPointerTarget(e.clientX);
    ensureAudio();
  });

  canvas.addEventListener("touchstart", (e) => {
    if (state === "gameover") {
      restart();
      e.preventDefault();
      return;
    }
    if (e.touches.length > 0) setPointerTarget(e.touches[0].clientX);
    ensureAudio();
    unlockSpeechIfNeeded();
  });

  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 0) setPointerTarget(e.touches[0].clientX);
      e.preventDefault();
    },
    { passive: false }
  );

  if (ui.audioBtn) {
    ui.audioBtn.addEventListener("click", () => {
      ensureAudio();
      unlockSpeechIfNeeded();
      toggleAudio();
    });
  }

  if (ui.nameSubmit) {
    ui.nameSubmit.addEventListener("click", () => {
      submitPlayerName();
    });
  }

  if (ui.nameInput) {
    ui.nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitPlayerName();
      }
    });
  }

  if (ui.editNameBtn) {
    ui.editNameBtn.addEventListener("click", () => {
      openNameCard("edit");
      updatePanels();
    });
  }

  if (ui.leaderToggleBtn) {
    ui.leaderToggleBtn.addEventListener("click", () => {
      if (!ui.leaderboardPanel || !isMobileLayout) return;
      const nextOpen = !ui.leaderboardPanel.classList.contains("is-open");
      setMobileLeaderboardOpen(nextOpen);
    });
  }

  bindHoldButton(ui.leftBtn, "arrowleft");
  bindHoldButton(ui.rightBtn, "arrowright");

  window.addEventListener("blur", () => {
    keys["arrowleft"] = false;
    keys["arrowright"] = false;
    if (ui.leftBtn) ui.leftBtn.classList.remove("is-held");
    if (ui.rightBtn) ui.rightBtn.classList.remove("is-held");
  });

  loadSprites();
  initSpeechVoices();
  loadPlayerName();
  loadLeaderboard();
  renderLeaderboard();
  renderFoodList();
  updateAudioButton();
  setMobileLeaderboardOpen(false);
  const hasSavedName = !!sanitizeName(safeStorageGet(storageKeys.playerName) || "");
  if (hasSavedName) {
    closeNameCard();
    restart();
  } else {
    openNameCard("initial");
    updatePanels();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
