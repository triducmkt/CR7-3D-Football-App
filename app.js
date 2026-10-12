/**
 * ============================================================================
 * TDCM ARENA 3D — CR7 SEMI-REALISTIC FOOTBALL WEB APP
 * Architecture: Inherits TDCM Team App V5+ Standards
 *   1. FIELD_MAP Pattern for Data & Mode Configuration
 *   2. Central AppStore (Single Source of Truth) + dispatchAction()
 *   3. Three.js Semi-Realistic 3D Character (CR7 Iconic Stance), Stadium & Physics
 *   4. Cross-Platform Controls (PC Mouse/Keyboard & Mobile Touch/Swipe)
 * ============================================================================
 */

/* ============================================================================
   1. FIELD_MAP DEFINITIONS (TDCM Mandatory Pattern)
   ============================================================================ */
const PLAYER_PROFILE_FIELD_MAP = {
  "Tên Cầu Thủ": { storageKey: "playerName", frontendKey: "playerName", type: "string", defaultVal: "RONALDO", visible: true },
  "Số Áo":       { storageKey: "jerseyNo",   frontendKey: "jerseyNo",   type: "number", defaultVal: 7,         visible: true },
  "Kỷ Lục Bàn":  { storageKey: "highScore",  frontendKey: "highScore",  type: "number", defaultVal: 0,         visible: true },
  "Chuỗi Cao":   { storageKey: "bestStreak", frontendKey: "bestStreak", type: "number", defaultVal: 0,         visible: true }
};

const GAME_MODE_FIELD_MAP = {
  "PENALTY_11M": {
    id: "PENALTY_11M",
    title: "Sút Phạt Penalty 11m",
    distanceMeters: 11,
    unlocked: true,
    cameraOffset: { x: -0.35, y: 1.82, z: 14.95 },
    cameraLookAt: { x: 0, y: 1.45, z: 0 }
  },
  "FREEKICK_WALL": {
    id: "FREEKICK_WALL",
    title: "Sút Phạt Hàng Rào",
    distanceMeters: 22,
    unlocked: false,
    phaseNote: "Chế độ Sút Phạt Hàng Rào (22m - 28m với hàng rào 5 cầu thủ nhảy chắn và quỹ đạo bóng xoáy Knuckleball nâng cao) đang được lên lịch phát triển ở Giai đoạn 2."
  },
  "FREESTYLE": {
    id: "FREESTYLE",
    title: "Sút Tự Do",
    distanceMeters: 18,
    unlocked: false,
    phaseNote: "Chế độ Sút Tự Do (tùy chỉnh mọi vị trí đặt bóng, góc sút và dẫn bóng đối mặt thủ môn) đang được lên lịch phát triển ở Giai đoạn 2."
  }
};

/* ============================================================================
   2. CENTRAL APPSTORE (Single Source of Truth & Optimistic UI)
   ============================================================================ */
const STORAGE_KEY = "TDCM_CR7_ARENA_3D_V1";

const AppStore = {
  state: {
    screen: "HOME", // "HOME" | "PENALTY_11M"
    playerName: "RONALDO",
    jerseyNo: 7,
    score: 0,
    streak: 0,
    highScore: 0,
    bestStreak: 0,
    lastSpeedKmh: 0,
    shotStyle: "knuckle", // "knuckle" | "curve" | "power"
    seriesResults: [], // array of 'goal' | 'miss' (max 5 per round, then resets)
    audioEnabled: true,
    aimPoint: { x: 2.35, y: 1.75 }, // target inside goal (width: -3.5..3.5, height: 0.2..2.35)
    powerPercent: 78
  },
  listeners: [],

  init() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.keys(PLAYER_PROFILE_FIELD_MAP).forEach((label) => {
          const cfg = PLAYER_PROFILE_FIELD_MAP[label];
          if (parsed[cfg.storageKey] !== undefined) {
            this.state[cfg.frontendKey] = parsed[cfg.storageKey];
          }
        });
      }
    } catch (e) {
      console.warn("AppStore localStorage read bypassed:", e);
    }
    this.notify();
  },

  saveToStorage() {
    try {
      const payload = {};
      Object.keys(PLAYER_PROFILE_FIELD_MAP).forEach((label) => {
        const cfg = PLAYER_PROFILE_FIELD_MAP[label];
        payload[cfg.storageKey] = this.state[cfg.frontendKey];
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("AppStore localStorage write bypassed:", e);
    }
  },

  subscribe(fn) {
    this.listeners.push(fn);
  },

  notify() {
    this.listeners.forEach((fn) => fn(this.state));
  },

  dispatchAction(action) {
    const { type, payload } = action;
    switch (type) {
      case "SET_PLAYER_NAME": {
        const cleanName = (payload || "").trim().toUpperCase().slice(0, 18) || "RONALDO";
        this.state.playerName = cleanName;
        this.saveToStorage();
        if (window.CR7Engine && window.CR7Engine.updateJerseyName) {
          window.CR7Engine.updateJerseyName(cleanName);
        }
        break;
      }
      case "SET_SCREEN": {
        this.state.screen = payload;
        if (payload === "PENALTY_11M") {
          this.state.seriesResults = [];
          if (window.CR7Engine) window.CR7Engine.enterPenaltyMode();
        } else {
          if (window.CR7Engine) window.CR7Engine.enterHomeMode();
        }
        break;
      }
      case "SET_SHOT_STYLE": {
        this.state.shotStyle = payload;
        break;
      }
      case "SET_AIM_POINT": {
        this.state.aimPoint = {
          x: Math.max(-3.45, Math.min(3.45, payload.x)),
          y: Math.max(0.22, Math.min(2.32, payload.y))
        };
        break;
      }
      case "SET_POWER": {
        this.state.powerPercent = Math.max(25, Math.min(100, Math.round(payload)));
        break;
      }
      case "RECORD_SHOT_RESULT": {
        const { isGoal, speedKmh } = payload;
        this.state.lastSpeedKmh = speedKmh;
        if (this.state.seriesResults.length >= 5) {
          this.state.seriesResults = [];
        }
        this.state.seriesResults.push(isGoal ? "goal" : "miss");

        if (isGoal) {
          this.state.score += 1;
          this.state.streak += 1;
          if (this.state.score > this.state.highScore) {
            this.state.highScore = this.state.score;
          }
          if (this.state.streak > this.state.bestStreak) {
            this.state.bestStreak = this.state.streak;
          }
        } else {
          this.state.streak = 0;
        }
        this.saveToStorage();
        break;
      }
      case "TOGGLE_AUDIO": {
        this.state.audioEnabled = !this.state.audioEnabled;
        StadiumAudio.setMuted(!this.state.audioEnabled);
        break;
      }
      default:
        break;
    }
    this.notify();
  }
};

/* ============================================================================
   3. WEB AUDIO SYNTHESIZER (Stadium Cheering Crowd, Whistle, Kick, Goal SIUUU)
   ============================================================================ */
const StadiumAudio = {
  ctx: null,
  crowdGain: null,
  isRunning: false,
  muted: false,

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.startCrowdAmbience();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  },

  setMuted(flag) {
    this.muted = flag;
    if (this.crowdGain && this.ctx) {
      this.crowdGain.gain.setTargetAtTime(flag ? 0.0001 : 0.14, this.ctx.currentTime, 0.15);
    }
  },

  startCrowdAmbience() {
    if (!this.ctx || this.isRunning) return;
    this.isRunning = true;

    // Generate 4-second looping stadium roar buffer (pink-ish filtered noise)
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 4;
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 620;
    filter.Q.value = 0.65;

    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = this.muted ? 0.0001 : 0.14;

    noise.connect(filter);
    filter.connect(this.crowdGain);
    this.crowdGain.connect(this.ctx.destination);
    noise.start();
  },

  playKick() {
    this.ensureContext();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.14);

    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  },

  playGoalRoar() {
    this.ensureContext();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (this.crowdGain) {
      this.crowdGain.gain.cancelScheduledValues(now);
      this.crowdGain.gain.setValueAtTime(0.16, now);
      this.crowdGain.gain.linearRampToValueAtTime(0.45, now + 0.18);
      this.crowdGain.gain.exponentialRampToValueAtTime(0.14, now + 2.6);
    }

    // Synthesize "SIUUU!" pitch swell
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(240, now + 0.25);
    osc.frequency.linearRampToValueAtTime(165, now + 1.15);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(950, now + 0.25);
    filter.Q.value = 2.2;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now + 0.25);
    osc.stop(now + 1.4);
  },

  playPostOrSave() {
    this.ensureContext();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.22);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }
};

/* ============================================================================
   4. THREE.JS 3D SEMI-REALISTIC ENGINE (CR7, STADIUM, GOALKEEPER, BALL PHYSICS)
   ============================================================================ */
const CR7Engine = {
  scene: null,
  camera: null,
  renderer: null,
  clock: null,

  // Entities
  cr7: null,
  keeper: null,
  ball: null,
  ballTrailMeshes: [],
  netMesh: null,
  netOriginalVerts: null,
  aimReticle: null,
  crowdInstanced: null,
  crowdData: [],
  flashParticles: null,
  jerseyBackMat: null,

  // Animation & Physics State
  phase: "STANCE", // "STANCE" | "RUNUP" | "KICK" | "FLIGHT" | "CELEBRATE" | "RESETTING"
  phaseTimer: 0,
  homeLoopTimer: 0,
  netRippleIntensity: 0,
  netImpactPoint: new THREE.Vector3(),

  // Shot trajectory data
  shotData: {
    active: false,
    startPos: new THREE.Vector3(0, 0.22, 11),
    targetPos: new THREE.Vector3(2.3, 1.7, 0),
    velocity: new THREE.Vector3(),
    spinX: 0,
    spinY: 0,
    knuckleSeed: 0,
    speedKmh: 112,
    elapsed: 0,
    duration: 0.68,
    keeperDiveX: 0,
    keeperDiveY: 1.2,
    willScore: true,
    outcomeType: "GOAL" // "GOAL" | "SAVED" | "POST" | "WIDE"
  },

  init() {
    const container = document.getElementById("canvas-container");
    this.clock = new THREE.Clock();

    // Scene & Night Stadium Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040914);
    this.scene.fog = new THREE.FogExp2(0x061022, 0.0085);

    // Perspective Camera
    this.camera = new THREE.PerspectiveCamera(
      46,
      window.innerWidth / window.innerHeight,
      0.1,
      260
    );

    // WebGL Renderer with Shadows & ToneMapping for Semi-Realistic PBR
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    // Build World
    this.setupLighting();
    this.buildPitchAndStadium();
    this.buildGoalAndDynamicNet();
    this.buildAimReticle();
    this.buildFootball();
    this.buildGoalkeeper();
    this.buildCR7Character();

    // Start in Home Mode
    this.enterHomeMode();

    // Resize listener
    window.addEventListener("resize", () => this.onResize());

    // Start Render Loop
    this.animate();
  },

  /* --------------------------------------------------------------------------
     LIGHTING (Stadium Floodlights + Rim Light on CR7's #7 Back)
     -------------------------------------------------------------------------- */
  setupLighting() {
    const hemiLight = new THREE.HemisphereLight(0x9ec5ff, 0x102a16, 0.68);
    this.scene.add(hemiLight);

    // Main Stadium Floodlight casting crisp shadows toward the goal & pitch
    const mainSpot = new THREE.DirectionalLight(0xfff8eb, 1.45);
    mainSpot.position.set(14, 28, 24);
    mainSpot.castShadow = true;
    mainSpot.shadow.mapSize.width = 2048;
    mainSpot.shadow.mapSize.height = 2048;
    mainSpot.shadow.camera.near = 5;
    mainSpot.shadow.camera.far = 75;
    const d = 18;
    mainSpot.shadow.camera.left = -d;
    mainSpot.shadow.camera.right = d;
    mainSpot.shadow.camera.top = d;
    mainSpot.shadow.camera.bottom = -d;
    mainSpot.shadow.bias = -0.0005;
    this.scene.add(mainSpot);

    // Dramatic Rim Light from behind the goal to highlight CR7's shoulders & muscles
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.85);
    rimLight.position.set(-12, 16, -18);
    this.scene.add(rimLight);

    // Warm Fill Light specifically illuminating CR7's iconic #7 back
    const backFill = new THREE.PointLight(0xffedd5, 0.9, 25);
    backFill.position.set(0, 3.8, 16.5);
    this.scene.add(backFill);
  },

  /* --------------------------------------------------------------------------
     STADIUM PITCH, LINES, STANDS, FLOODLIGHTS & CHEERING CROWD
     -------------------------------------------------------------------------- */
  buildPitchAndStadium() {
    // Procedural Mowed Grass Texture
    const grassCanvas = document.createElement("canvas");
    grassCanvas.width = 1024;
    grassCanvas.height = 1024;
    const gCtx = grassCanvas.getContext("2d");

    const stripeCount = 16;
    const stripeH = grassCanvas.height / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      gCtx.fillStyle = i % 2 === 0 ? "#1b5e20" : "#226b27";
      gCtx.fillRect(0, i * stripeH, grassCanvas.width, stripeH);
    }
    // Fine grass blade noise
    for (let i = 0; i < 45000; i++) {
      const x = Math.random() * grassCanvas.width;
      const y = Math.random() * grassCanvas.height;
      gCtx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
      gCtx.fillRect(x, y, 2, 3);
    }

    const grassTex = new THREE.CanvasTexture(grassCanvas);
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(6, 6);

    const pitchGeo = new THREE.PlaneGeometry(110, 110);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      roughness: 0.86,
      metalness: 0.04
    });
    const pitch = new THREE.Mesh(pitchGeo, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.scene.add(pitch);

    // Pitch White Lines (Goal line, 18-yard Penalty Box, 6-yard Box, 11m Spot, Penalty Arc)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide });
    const addPitchLine = (w, h, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      this.scene.add(m);
    };

    // Goal line
    addPitchLine(70, 0.12, 0, 0);
    // 6-yard box (Goal area)
    addPitchLine(18.32, 0.1, 0, 5.5);
    addPitchLine(0.1, 5.5, -9.16, 2.75);
    addPitchLine(0.1, 5.5, 9.16, 2.75);
    // 18-yard penalty area
    addPitchLine(40.32, 0.12, 0, 16.5);
    addPitchLine(0.12, 16.5, -20.16, 8.25);
    addPitchLine(0.12, 16.5, 20.16, 8.25);

    // 11m Penalty Spot
    const spotMesh = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), lineMat);
    spotMesh.rotation.x = -Math.PI / 2;
    spotMesh.position.set(0, 0.014, 11.0);
    this.scene.add(spotMesh);

    // LED Advertising Boards behind and around goal (TDCM Branding)
    const adCanvas = document.createElement("canvas");
    adCanvas.width = 2048;
    adCanvas.height = 128;
    const adCtx = adCanvas.getContext("2d");
    const grad = adCtx.createLinearGradient(0, 0, 2048, 0);
    grad.addColorStop(0, "#0F295A");
    grad.addColorStop(0.5, "#1A4B9F");
    grad.addColorStop(1, "#0F295A");
    adCtx.fillStyle = grad;
    adCtx.fillRect(0, 0, 2048, 128);
    adCtx.strokeStyle = "#4285F4";
    adCtx.lineWidth = 6;
    adCtx.strokeRect(0, 3, 2048, 122);
    adCtx.font = "900 44px Montserrat, sans-serif";
    adCtx.fillStyle = "#FFFFFF";
    adCtx.textAlign = "center";
    adCtx.fillText(
      "⚽ TDCM ARENA 3D   •   CR7 KNUCKLEBALL ENGINE   •   TRÍ ĐỨC CAR MEDIA   •   SIUUU! #7 ⚽",
      1024,
      78
    );
    const adTex = new THREE.CanvasTexture(adCanvas);
    const adMat = new THREE.MeshBasicMaterial({ map: adTex });

    const backBoard = new THREE.Mesh(new THREE.BoxGeometry(58, 1.15, 0.3), adMat);
    backBoard.position.set(0, 0.58, -6.5);
    this.scene.add(backBoard);

    const leftBoard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.15, 42), adMat);
    leftBoard.position.set(-29, 0.58, 14.5);
    this.scene.add(leftBoard);

    const rightBoard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.15, 42), adMat);
    rightBoard.position.set(29, 0.58, 14.5);
    this.scene.add(rightBoard);

    // Stadium Grandstands (Tiered Bowl)
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.9
    });
    const createStandSection = (w, d, h, x, y, z, rotY = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), standMat);
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      this.scene.add(m);
    };

    // North Stand (Directly behind goal - main camera backdrop)
    for (let tier = 0; tier < 8; tier++) {
      createStandSection(78, 2.6, 1.6, 0, 1.2 + tier * 1.45, -10.5 - tier * 2.3);
      createStandSection(60, 2.4, 1.6, -34 - tier * 2.1, 1.2 + tier * 1.45, 10, Math.PI / 2);
      createStandSection(60, 2.4, 1.6, 34 + tier * 2.1, 1.2 + tier * 1.45, 10, Math.PI / 2);
    }

    // Stadium Roof Canopy & Floodlight Banks
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.4 });
    const northRoof = new THREE.Mesh(new THREE.BoxGeometry(84, 0.8, 12), roofMat);
    northRoof.position.set(0, 15.5, -24);
    northRoof.rotation.x = 0.18;
    this.scene.add(northRoof);

    // Glowing Floodlight Strip on Roof
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
    for (let i = -32; i <= 32; i += 8) {
      const lightBank = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.9, 0.6), bulbMat);
      lightBank.position.set(i, 14.6, -19.2);
      this.scene.add(lightBank);
    }

    // Animated Cheering Spectators (InstancedMesh for 1,600 fans waving/jumping)
    const fanCount = 1600;
    const fanGeo = new THREE.BoxGeometry(0.48, 0.85, 0.38);
    const fanMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.crowdInstanced = new THREE.InstancedMesh(fanGeo, fanMat, fanCount);

    const palette = [
      new THREE.Color(0xc8102e), // Portugal Red
      new THREE.Color(0x0b5d33), // Portugal Green
      new THREE.Color(0xf5c542), // CR7 Gold
      new THREE.Color(0x4285f4), // TDCM Blue
      new THREE.Color(0xf8fafc)  // White Jersey
    ];

    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < fanCount; i++) {
      const section = i % 3; // 0: North (behind goal), 1: West, 2: East
      const tier = Math.floor(Math.random() * 8);
      let x = 0, y = 2.2 + tier * 1.45, z = 0;

      if (section === 0) {
        x = (Math.random() - 0.5) * 72;
        z = -10.2 - tier * 2.3 + (Math.random() - 0.5) * 1.1;
      } else if (section === 1) {
        x = -33.5 - tier * 2.1;
        z = -8 + Math.random() * 34;
      } else {
        x = 33.5 + tier * 2.1;
        z = -8 + Math.random() * 34;
      }

      dummy.position.set(x, y, z);
      dummy.rotation.y = Math.atan2(-x, 6 - z);
      dummy.updateMatrix();
      this.crowdInstanced.setMatrixAt(idx, dummy.matrix);
      this.crowdInstanced.setColorAt(idx, palette[Math.floor(Math.random() * palette.length)]);

      this.crowdData.push({
        baseX: x,
        baseY: y,
        baseZ: z,
        rotY: dummy.rotation.y,
        phase: Math.random() * Math.PI * 2,
        speed: 4.5 + Math.random() * 4.5,
        amp: 0.12 + Math.random() * 0.16
      });
      idx++;
    }
    this.crowdInstanced.instanceMatrix.needsUpdate = true;
    if (this.crowdInstanced.instanceColor) this.crowdInstanced.instanceColor.needsUpdate = true;
    this.scene.add(this.crowdInstanced);

    // Camera Flashes in the Stadium Stands (Sparkling Particles)
    const flashCount = 120;
    const flashGeo = new THREE.BufferGeometry();
    const flashPos = new Float32Array(flashCount * 3);
    for (let i = 0; i < flashCount; i++) {
      const tier = Math.floor(Math.random() * 8);
      flashPos[i * 3] = (Math.random() - 0.5) * 70;
      flashPos[i * 3 + 1] = 2.6 + tier * 1.45;
      flashPos[i * 3 + 2] = -10 - tier * 2.25;
    }
    flashGeo.setAttribute("position", new THREE.BufferAttribute(flashPos, 3));
    const flashMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.85,
      transparent: true,
      opacity: 0.85
    });
    this.flashParticles = new THREE.Points(flashGeo, flashMat);
    this.scene.add(this.flashParticles);
  },

  /* --------------------------------------------------------------------------
     3D GOALPOST & DYNAMIC RIPPLING NET
     -------------------------------------------------------------------------- */
  buildGoalAndDynamicNet() {
    const goalGroup = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.35
    });

    const goalW = 7.32;
    const goalH = 2.44;
    const goalD = 2.15;
    const postRadius = 0.065;

    // Left Post
    const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalH, 20), postMat);
    leftPost.position.set(-goalW / 2, goalH / 2, 0);
    leftPost.castShadow = true;
    goalGroup.add(leftPost);

    // Right Post
    const rightPost = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalH, 20), postMat);
    rightPost.position.set(goalW / 2, goalH / 2, 0);
    rightPost.castShadow = true;
    goalGroup.add(rightPost);

    // Crossbar
    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalW + postRadius * 2, 20), postMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, goalH, 0);
    crossbar.castShadow = true;
    goalGroup.add(crossbar);

    // Back Support Stanchions
    const stanchionMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.4 });
    [-goalW / 2, goalW / 2].forEach((xPos) => {
      const bottomBar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, goalD, 12), stanchionMat);
      bottomBar.rotation.x = Math.PI / 2;
      bottomBar.position.set(xPos, 0.04, -goalD / 2);
      goalGroup.add(bottomBar);

      const diagLen = Math.hypot(goalH, goalD);
      const diagBar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, diagLen, 12), stanchionMat);
      diagBar.position.set(xPos, goalH / 2, -goalD / 2);
      diagBar.rotation.x = Math.atan2(goalD, goalH);
      goalGroup.add(diagBar);
    });

    // Dynamic Deformable Back Net (High-segment Plane for vertex wave ripple)
    const netGeo = new THREE.PlaneGeometry(goalW, goalH, 28, 14);
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      wireframe: true,
      transparent: true,
      opacity: 0.48
    });
    this.netMesh = new THREE.Mesh(netGeo, netMat);
    this.netMesh.position.set(0, goalH / 2, -goalD * 0.72);
    this.netOriginalVerts = netGeo.attributes.position.array.slice();
    goalGroup.add(this.netMesh);

    // Top & Side Net Meshes
    const topNet = new THREE.Mesh(new THREE.PlaneGeometry(goalW, goalD * 0.72, 20, 6), netMat);
    topNet.rotation.x = Math.PI / 2;
    topNet.position.set(0, goalH, -goalD * 0.36);
    goalGroup.add(topNet);

    [-goalW / 2, goalW / 2].forEach((xPos) => {
      const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(goalD * 0.72, goalH, 8, 10), netMat);
      sideNet.rotation.y = Math.PI / 2;
      sideNet.position.set(xPos, goalH / 2, -goalD * 0.36);
      goalGroup.add(sideNet);
    });

    this.scene.add(goalGroup);
  },

  /* --------------------------------------------------------------------------
     3D TARGET AIM RETICLE INSIDE GOAL
     -------------------------------------------------------------------------- */
  buildAimReticle() {
    const group = new THREE.Group();
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.33, 32),
      new THREE.MeshBasicMaterial({ color: 0xf5c542, side: THREE.DoubleSide })
    );
    const innerDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 20),
      new THREE.MeshBasicMaterial({ color: 0x4285f4, side: THREE.DoubleSide })
    );
    group.add(outerRing, innerDot);
    group.position.set(AppStore.state.aimPoint.x, AppStore.state.aimPoint.y, 0.05);
    this.aimReticle = group;
    this.scene.add(group);
  },

  /* --------------------------------------------------------------------------
     3D FOOTBALL & GOLDEN KNUCKLEBALL TRAIL
     -------------------------------------------------------------------------- */
  buildFootball() {
    // Procedural Hex/Pentagon Match Ball Texture
    const bCanvas = document.createElement("canvas");
    bCanvas.width = 512;
    bCanvas.height = 256;
    const ctx = bCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 512, 256);

    // Draw modern Champions/Euro star & geometric panels
    ctx.fillStyle = "#111827";
    for (let x = 32; x < 512; x += 96) {
      for (let y = 32; y < 256; y += 96) {
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#c8102e";
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }

    const ballTex = new THREE.CanvasTexture(bCanvas);
    const ballGeo = new THREE.SphereGeometry(0.22, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({
      map: ballTex,
      roughness: 0.32,
      metalness: 0.1
    });
    this.ball = new THREE.Mesh(ballGeo, ballMat);
    this.ball.castShadow = true;
    this.ball.position.set(0, 0.22, 11.0);
    this.scene.add(this.ball);

    // Trail Spheres for Knuckleball / Curve Flight Effect
    for (let i = 0; i < 14; i++) {
      const tMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.16 * (1 - i / 16), 12, 12),
        new THREE.MeshBasicMaterial({
          color: i < 5 ? 0xf5c542 : 0x4285f4,
          transparent: true,
          opacity: 0
        })
      );
      this.scene.add(tMesh);
      this.ballTrailMeshes.push(tMesh);
    }
  },

  /* --------------------------------------------------------------------------
     3D ARTICULATED GOALKEEPER
     -------------------------------------------------------------------------- */
  buildGoalkeeper() {
    const gk = new THREE.Group();
    const kitMat = new THREE.MeshStandardMaterial({ color: 0xbef264, roughness: 0.55 }); // Neon Lime Keeper Kit
    const shortsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd99b72, roughness: 0.55 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.28), kitMat);
    torso.position.y = 1.24;
    torso.castShadow = true;
    gk.add(torso);

    // Head & Hair
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 20), skinMat);
    head.position.y = 1.74;
    head.castShadow = true;
    gk.add(head);

    // Arms with Gloves
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.32, 1.5, 0);
    const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.58, 12), kitMat);
    lArm.position.y = -0.26;
    const lGlove = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), gloveMat);
    lGlove.position.y = -0.58;
    leftArmGroup.add(lArm, lGlove);
    leftArmGroup.rotation.z = -0.55;
    gk.add(leftArmGroup);

    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.32, 1.5, 0);
    const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.58, 12), kitMat);
    rArm.position.y = -0.26;
    const rGlove = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), gloveMat);
    rGlove.position.y = -0.58;
    rightArmGroup.add(rArm, rGlove);
    rightArmGroup.rotation.z = 0.55;
    gk.add(rightArmGroup);

    // Legs
    [-0.14, 0.14].forEach((xOff) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.88, 12), shortsMat);
      leg.position.set(xOff, 0.45, 0);
      leg.castShadow = true;
      gk.add(leg);
    });

    gk.position.set(0, 0, 0.35);
    gk.userData = { leftArmGroup, rightArmGroup, torso };
    this.keeper = gk;
    this.scene.add(gk);
  },

  /* --------------------------------------------------------------------------
     SEMI-REALISTIC CR7 CHARACTER MODEL (Matching Reference Image 100%)
     - Red Portugal Kit (#7 RONALDO in metallic gold on back)
     - Green Collar Trim, Blue Captain Armband on Left Arm
     - Red Shorts, Deep Forest Green Knee Socks with White Ankle Tape
     - White/Gold Studded Mercurial Boots
     - Iconic Wide-Legged Free-Kick Power Stance before each kick!
     -------------------------------------------------------------------------- */
  createJerseyBackTexture(playerName) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    // Deep Crimson Portugal Jersey Fabric Base
    const fabricGrad = ctx.createLinearGradient(0, 0, 0, 1024);
    fabricGrad.addColorStop(0, "#b80f1d");
    fabricGrad.addColorStop(0.5, "#9e0b17");
    fabricGrad.addColorStop(1, "#840812");
    ctx.fillStyle = fabricGrad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Subtle vertical cloth weave & muscle shading folds
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    for (let y = 0; y < 1024; y += 8) {
      ctx.fillRect(0, y, 1024, 2);
    }

    // Green Collar Trim & Vertical Green Spine Stripe at top neck (exact detail from photo!)
    ctx.fillStyle = "#085c33";
    ctx.fillRect(0, 0, 1024, 38);
    ctx.fillRect(494, 0, 36, 130);

    // Gold Metallic Gradient for Name & Number 7
    const goldGrad = ctx.createLinearGradient(250, 140, 780, 820);
    goldGrad.addColorStop(0, "#FCE79C");
    goldGrad.addColorStop(0.35, "#E5B842");
    goldGrad.addColorStop(0.7, "#C69225");
    goldGrad.addColorStop(1, "#F7DC81");

    // Player Name ("RONALDO" or user input)
    const displayName = (playerName || "RONALDO").toUpperCase();
    ctx.save();
    ctx.fillStyle = goldGrad;
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    const fontSize = displayName.length > 10 ? 74 : 96;
    ctx.font = `900 ${fontSize}px 'Montserrat', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(displayName, 512, 235);

    // Iconic Angular Portugal '7'
    ctx.beginPath();
    // Top horizontal bar of 7
    ctx.moveTo(355, 295);
    ctx.lineTo(680, 295);
    ctx.lineTo(662, 378);
    // Diagonal stem of 7 tapering down toward left-center
    ctx.lineTo(485, 790);
    ctx.lineTo(395, 790);
    ctx.lineTo(568, 375);
    ctx.lineTo(355, 375);
    ctx.closePath();
    ctx.fill();

    // Inner inline groove inside the '7' (authentic Portugal kit font detail)
    ctx.strokeStyle = "rgba(130, 12, 22, 0.65)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(385, 335);
    ctx.lineTo(625, 335);
    ctx.lineTo(445, 760);
    ctx.stroke();
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  },

  updateJerseyName(newName) {
    if (!this.jerseyBackMat) return;
    const newTex = this.createJerseyBackTexture(newName);
    this.jerseyBackMat.map = newTex;
    this.jerseyBackMat.needsUpdate = true;
  },

  buildCR7Character() {
    const cr7 = new THREE.Group();

    // Materials (Semi-realistic PBR)
    const jerseyRedMat = new THREE.MeshStandardMaterial({
      color: 0xa80d19,
      roughness: 0.62,
      metalness: 0.06
    });
    this.jerseyBackMat = new THREE.MeshStandardMaterial({
      map: this.createJerseyBackTexture(AppStore.state.playerName),
      roughness: 0.55,
      metalness: 0.12
    });
    const shortsRedMat = new THREE.MeshStandardMaterial({
      color: 0x9e0c17,
      roughness: 0.68,
      metalness: 0.04
    });
    const captainBlueMat = new THREE.MeshStandardMaterial({
      color: 0x1d70e8, // Blue captain armband on left arm
      roughness: 0.48
    });
    const sockGreenMat = new THREE.MeshStandardMaterial({
      color: 0x0b4f2c, // Deep green socks from photo
      roughness: 0.72
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xc6865c, // Sun-kissed athletic skin tone
      roughness: 0.48,
      metalness: 0.04
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x161210,
      roughness: 0.8
    });
    const bootWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.25,
      metalness: 0.2
    });
    const goldAccentMat = new THREE.MeshStandardMaterial({
      color: 0xf5c542,
      roughness: 0.3,
      metalness: 0.7
    });

    // Root Pelvis / Hip Pivot
    const pelvis = new THREE.Group();
    pelvis.position.set(0, 0.98, 0);
    cr7.add(pelvis);

    // Upper Torso Pivot (Allows chest breathing & forward lean)
    const spine = new THREE.Group();
    pelvis.add(spine);

    // Athletic V-Taper Torso (Trapezoidal/Sculpted Chest + Back Plate with #7 Texture)
    const torsoMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.245, 0.185, 0.62, 24),
      jerseyRedMat
    );
    torsoMesh.scale.set(1.16, 1.0, 0.68);
    torsoMesh.position.set(0, 0.34, 0);
    torsoMesh.castShadow = true;
    spine.add(torsoMesh);

    // Broad Muscular Shoulders Bar
    const shoulderBridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.13, 0.22),
      jerseyRedMat
    );
    shoulderBridge.position.set(0, 0.60, 0);
    shoulderBridge.castShadow = true;
    spine.add(shoulderBridge);

    // Back Jersey Number & Name Panel (Slightly curved plane facing camera behind CR7)
    const backPanelGeo = new THREE.PlaneGeometry(0.46, 0.58, 12, 12);
    const posAttr = backPanelGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      // Subtle convex curve matching CR7's muscular back
      posAttr.setZ(i, Math.cos(vx * 3.2) * 0.025);
    }
    backPanelGeo.computeVertexNormals();
    const backPanel = new THREE.Mesh(backPanelGeo, this.jerseyBackMat);
    backPanel.position.set(0, 0.35, 0.145);
    spine.add(backPanel);

    // Jersey Lower Hem & Hip Shorts Base
    const shortsBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.195, 0.21, 0.22, 20),
      shortsRedMat
    );
    shortsBase.scale.set(1.12, 1, 0.76);
    shortsBase.position.set(0, 0.02, 0);
    shortsBase.castShadow = true;
    pelvis.add(shortsBase);

    // Muscular Neck & Sculpted Head with CR7 Short Fade Haircut
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.082, 0.14, 16),
      skinMat
    );
    neck.position.set(0, 0.70, 0);
    spine.add(neck);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.84, 0);
    spine.add(headGroup);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 24), skinMat);
    skull.scale.set(0.92, 1.12, 0.98);
    skull.castShadow = true;
    headGroup.add(skull);

    // CR7 Hair Cap (Dark crown + clean fade on sides & nape)
    const hairCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.128, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    hairCrown.scale.set(0.93, 1.12, 1.0);
    hairCrown.rotation.x = -0.18;
    hairCrown.position.y = 0.01;
    headGroup.add(hairCrown);

    // Ears
    [-0.115, 0.115].forEach((earX) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 10), skinMat);
      ear.scale.set(0.5, 1.1, 0.7);
      ear.position.set(earX, 0.0, 0);
      headGroup.add(ear);
    });

    // ------------------------------------------------------------------------
    // ARMS (Long Red Sleeves + Blue Captain Armband on Left Arm + Clenched Hands)
    // ------------------------------------------------------------------------
    const buildArm = (isLeft) => {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(isLeft ? -0.30 : 0.30, 0.58, 0);

      // Deltoid cap
      const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 16), jerseyRedMat);
      shoulderPivot.add(deltoid);

      // Upper Arm (Long sleeve red)
      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.056, 0.30, 16),
        jerseyRedMat
      );
      upperArm.position.y = -0.15;
      upperArm.castShadow = true;
      shoulderPivot.add(upperArm);

      // Blue Captain's Armband on Left Arm (or white FIFA patch on Right Arm, matching photo!)
      if (isLeft) {
        const armband = new THREE.Mesh(
          new THREE.CylinderGeometry(0.071, 0.067, 0.085, 18),
          captainBlueMat
        );
        armband.position.y = -0.17;
        shoulderPivot.add(armband);
      } else {
        const badge = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.06, 0.05),
          bootWhiteMat
        );
        badge.position.set(0.064, -0.15, 0);
        shoulderPivot.add(badge);
      }

      // Forearm (Long sleeve red with cuff)
      const elbowPivot = new THREE.Group();
      elbowPivot.position.y = -0.30;
      shoulderPivot.add(elbowPivot);

      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.044, 0.26, 16),
        jerseyRedMat
      );
      forearm.position.y = -0.13;
      forearm.castShadow = true;
      elbowPivot.add(forearm);

      // Focused Hand / Fist (Tensed fingers as in CR7's power stance)
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 14, 14), skinMat);
      hand.scale.set(0.85, 1.25, 0.75);
      hand.position.y = -0.28;
      elbowPivot.add(hand);

      return { shoulderPivot, elbowPivot };
    };

    const leftArm = buildArm(true);
    const rightArm = buildArm(false);
    spine.add(leftArm.shoulderPivot, rightArm.shoulderPivot);

    // ------------------------------------------------------------------------
    // LEGS (Wide-Legged Shorts, Muscular Knees, Green Socks, White/Gold Boots)
    // ------------------------------------------------------------------------
    const buildLeg = (isLeft) => {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(isLeft ? -0.135 : 0.135, 0, 0);

      // Shorts Thigh Legging (Wide flared red shorts as in the photo)
      const shortLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.115, 0.125, 0.34, 18),
        shortsRedMat
      );
      shortLeg.position.y = -0.16;
      shortLeg.castShadow = true;
      hipPivot.add(shortLeg);

      // Bare Muscular Knee / Lower Quad Transition
      const upperKnee = new THREE.Mesh(
        new THREE.CylinderGeometry(0.082, 0.072, 0.16, 16),
        skinMat
      );
      upperKnee.position.y = -0.36;
      upperKnee.castShadow = true;
      hipPivot.add(upperKnee);

      // Knee Joint Pivot
      const kneePivot = new THREE.Group();
      kneePivot.position.y = -0.42;
      hipPivot.add(kneePivot);

      // Sculpted Muscular Calf in Deep Forest Green Sock (#0b4f2c)
      const calfSock = new THREE.Mesh(
        new THREE.CylinderGeometry(0.084, 0.052, 0.42, 18),
        sockGreenMat
      );
      calfSock.position.y = -0.21;
      calfSock.castShadow = true;
      kneePivot.add(calfSock);

      // White Ankle Tape / Sock Cuff at bottom above boot (exact photo match!)
      const ankleCuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.054, 0.08, 16),
        bootWhiteMat
      );
      ankleCuff.position.y = -0.43;
      kneePivot.add(ankleCuff);

      // White & Gold Studded Football Boot
      const bootGroup = new THREE.Group();
      bootGroup.position.set(0, -0.49, -0.04);
      kneePivot.add(bootGroup);

      const bootBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.085, 0.27),
        bootWhiteMat
      );
      bootBody.castShadow = true;
      bootGroup.add(bootBody);

      const goldStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.114, 0.03, 0.18),
        goldAccentMat
      );
      goldStripe.position.set(0, -0.01, -0.02);
      bootGroup.add(goldStripe);

      return { hipPivot, kneePivot, bootGroup };
    };

    const leftLeg = buildLeg(true);
    const rightLeg = buildLeg(false);
    pelvis.add(leftLeg.hipPivot, rightLeg.hipPivot);

    cr7.userData = {
      pelvis,
      spine,
      headGroup,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg
    };

    this.cr7 = cr7;
    this.scene.add(cr7);
    this.applySignatureStance(0);
  },

  /* --------------------------------------------------------------------------
     CR7 POSE & ANIMATION CONTROLLERS
     -------------------------------------------------------------------------- */
  applySignatureStance(timeSec) {
    if (!this.cr7) return;
    const { pelvis, spine, headGroup, leftArm, rightArm, leftLeg, rightLeg } = this.cr7.userData;

    // Position CR7 behind the ball at a slight left angle (classic CR7 run-up angle)
    this.cr7.position.set(-0.78, 0, 13.35);
    this.cr7.rotation.y = -0.18;

    // Deep focused breathing before the kick
    const breath = Math.sin(timeSec * 2.6);
    pelvis.position.set(0, 0.95, 0);
    pelvis.rotation.set(0, 0, 0);

    spine.rotation.set(0.04 + breath * 0.015, 0, 0);
    spine.scale.set(1 + breath * 0.018, 1, 1 + breath * 0.022);
    headGroup.rotation.set(-0.06, 0.12, 0);

    // WIDE-LEGGED POWER STANCE (Matching the red-circled area in the reference photo!)
    leftLeg.hipPivot.rotation.set(0.03, 0.08, -0.25);
    rightLeg.hipPivot.rotation.set(0.03, -0.08, 0.25);
    leftLeg.kneePivot.rotation.set(0.04, 0, 0);
    rightLeg.kneePivot.rotation.set(0.04, 0, 0);

    // Tensed straight arms angled slightly away from the sides
    leftArm.shoulderPivot.rotation.set(0.05, 0, -0.24 - breath * 0.015);
    rightArm.shoulderPivot.rotation.set(0.05, 0, 0.24 + breath * 0.015);
    leftArm.elbowPivot.rotation.set(-0.08, 0, 0);
    rightArm.elbowPivot.rotation.set(-0.08, 0, 0);
  },

  updateRunupAndKickAnimation(dt) {
    const { pelvis, spine, leftArm, rightArm, leftLeg, rightLeg } = this.cr7.userData;

    if (this.phase === "RUNUP") {
      // 0.72s explosive curved run-up from (-0.78, 13.35) to (-0.24, 11.12)
      const duration = 0.72;
      const p = Math.min(1, this.phaseTimer / duration);
      const ease = p * p * (3 - 2 * p);

      this.cr7.position.x = -0.78 + ease * 0.54;
      this.cr7.position.z = 13.35 - ease * 2.23;
      this.cr7.rotation.y = -0.18 * (1 - ease);

      // Running stride cycle
      const stride = Math.sin(p * Math.PI * 4);
      pelvis.position.y = 0.94 + Math.abs(stride) * 0.05;
      spine.rotation.x = 0.22; // Athletic forward lean

      leftLeg.hipPivot.rotation.set(stride * 0.65, 0, -0.06);
      rightLeg.hipPivot.rotation.set(-stride * 0.65, 0, 0.06);
      leftLeg.kneePivot.rotation.x = Math.max(0, -stride * 0.75);
      rightLeg.kneePivot.rotation.x = Math.max(0, stride * 0.75);

      leftArm.shoulderPivot.rotation.set(-stride * 0.55, 0, -0.2);
      rightArm.shoulderPivot.rotation.set(stride * 0.55, 0, 0.2);

      // Wind up right kicking leg at the end of run-up
      if (p > 0.75) {
        const wind = (p - 0.75) / 0.25;
        rightLeg.hipPivot.rotation.x = 0.85 * wind;
        rightLeg.kneePivot.rotation.x = 0.95 * wind;
        leftArm.shoulderPivot.rotation.z = -0.65 * wind;
        leftArm.shoulderPivot.rotation.x = -0.45 * wind;
      }

      if (p >= 1) {
        this.phase = "KICK";
        this.phaseTimer = 0;
        this.launchBallPhysics();
      }
    } else if (this.phase === "KICK") {
      // Follow-through whip of the right leg
      const p = Math.min(1, this.phaseTimer / 0.35);
      const whip = Math.sin(p * Math.PI * 0.5);

      spine.rotation.x = 0.22 - whip * 0.32;
      spine.rotation.z = -whip * 0.16;
      leftLeg.hipPivot.rotation.set(0.15, 0, -0.08);
      leftLeg.kneePivot.rotation.x = 0.12;

      // Right leg swings powerfully forward & across
      rightLeg.hipPivot.rotation.set(0.85 - whip * 1.65, 0, 0.1);
      rightLeg.kneePivot.rotation.x = 0.95 * (1 - whip);

      leftArm.shoulderPivot.rotation.set(-0.4 + whip * 0.6, 0, -0.55);
      rightArm.shoulderPivot.rotation.set(0.3 - whip * 0.5, 0, 0.45);
    } else if (this.phase === "CELEBRATE") {
      // Iconic CR7 "SIUUU!" Jump, Mid-Air Spin & Wide Stance Landing
      const p = Math.min(1, this.phaseTimer / 1.45);
      if (p < 0.55) {
        const jumpP = p / 0.55;
        const jumpArc = Math.sin(jumpP * Math.PI);
        pelvis.position.y = 0.95 + jumpArc * 0.72;
        this.cr7.rotation.y = jumpP * Math.PI; // Spin 180 degrees to show #7 / face crowd
        leftArm.shoulderPivot.rotation.set(-0.8 * jumpArc, 0, -0.6);
        rightArm.shoulderPivot.rotation.set(-0.8 * jumpArc, 0, 0.6);
        leftLeg.hipPivot.rotation.set(-0.2, 0, -0.22);
        rightLeg.hipPivot.rotation.set(-0.2, 0, 0.22);
      } else {
        // Land in wide power stance with arms flung down ("SIUUU!")
        pelvis.position.y = 0.92;
        leftLeg.hipPivot.rotation.set(0.08, 0, -0.28);
        rightLeg.hipPivot.rotation.set(0.08, 0, 0.28);
        leftArm.shoulderPivot.rotation.set(0.15, 0, -0.42);
        rightArm.shoulderPivot.rotation.set(0.15, 0, 0.42);
      }
    }
  },

  /* --------------------------------------------------------------------------
     SHOT LAUNCH, BALL AERODYNAMICS (KNUCKLEBALL / CURVE) & GOALKEEPER AI
     -------------------------------------------------------------------------- */
  triggerShot(customAim = null, customPower = null, customCurve = null) {
    if (this.phase !== "STANCE") return;

    StadiumAudio.playKick();
    const state = AppStore.state;
    const aimX = customAim ? customAim.x : state.aimPoint.x;
    const aimY = customAim ? customAim.y : state.aimPoint.y;
    const power = customPower !== null ? customPower : state.powerPercent;
    const style = state.shotStyle;

    // Calculate speed (km/h) and flight duration
    const speedKmh = Math.round(86 + (power / 100) * 46); // 86 .. 132 km/h
    const duration = Math.max(0.46, 0.78 - (power / 100) * 0.26);

    // Determine spin / knuckle parameters
    let spinX = customCurve !== null ? customCurve : 0;
    if (customCurve === null) {
      if (style === "curve") {
        spinX = aimX >= 0 ? -1.35 : 1.35; // Curls inward toward the corner
      } else if (style === "knuckle") {
        spinX = (Math.random() - 0.5) * 0.6;
      }
    }

    // Over-power risk if power > 96%
    let finalTargetY = aimY;
    if (power > 96) {
      finalTargetY += (power - 95) * 0.14;
    }

    // In HOME showcase mode, always guarantee a spectacular top-corner goal!
    const isHome = state.screen === "HOME";
    const targetX = isHome ? (Math.random() > 0.5 ? 2.65 : -2.65) : aimX;
    const targetY = isHome ? 1.88 + Math.random() * 0.32 : finalTargetY;

    // Goalkeeper Dive Decision
    let keeperDiveX = 0;
    let keeperDiveY = 1.2;
    let outcomeType = "GOAL";

    if (isHome) {
      // Keeper dives slightly short so CR7's showcase shot always blasts into the net
      keeperDiveX = targetX * 0.68;
      keeperDiveY = 1.35;
      outcomeType = "GOAL";
    } else {
      // Check if ball hits post/crossbar or goes wide/over
      const inWidth = Math.abs(targetX) <= 3.56;
      const inHeight = targetY <= 2.38 && targetY >= 0.15;
      const hitsPost =
        (Math.abs(Math.abs(targetX) - 3.66) < 0.14 && targetY <= 2.48) ||
        (Math.abs(targetY - 2.44) < 0.11 && Math.abs(targetX) <= 3.7);

      if (hitsPost) {
        outcomeType = "POST";
      } else if (!inWidth || !inHeight) {
        outcomeType = "WIDE";
      } else {
        // Keeper AI: guesses direction 60% of the time, but top corners with high power beat the keeper!
        const cornerDifficulty =
          Math.abs(targetX) / 3.55 * 0.55 +
          (targetY / 2.35) * 0.25 +
          (power / 100) * 0.25;
        const keeperGuessesRight = Math.random() < 0.58;
        keeperDiveX = keeperGuessesRight
          ? Math.sign(targetX || 1) * (1.8 + Math.random() * 1.1)
          : -Math.sign(targetX || 1) * (1.6 + Math.random() * 1.0);
        keeperDiveY = Math.min(2.0, Math.max(0.5, targetY));

        const distFromKeeper = Math.hypot(targetX - keeperDiveX, targetY - keeperDiveY);
        if (keeperGuessesRight && distFromKeeper < 0.68 && cornerDifficulty < 0.82) {
          outcomeType = "SAVED";
        } else {
          outcomeType = "GOAL";
        }
      }
    }

    this.shotData = {
      active: false,
      startPos: new THREE.Vector3(0, 0.22, 11.0),
      targetPos: new THREE.Vector3(targetX, targetY, -0.85),
      spinX,
      knuckleSeed: Math.random() * 10,
      speedKmh,
      elapsed: 0,
      duration,
      keeperDiveX,
      keeperDiveY,
      willScore: outcomeType === "GOAL",
      outcomeType
    };

    this.phase = "RUNUP";
    this.phaseTimer = 0;
  },

  launchBallPhysics() {
    StadiumAudio.playKick();
    this.shotData.active = true;
    this.shotData.elapsed = 0;
  },

  updateBallAndKeeper(dt) {
    // Idle keeper bounce during STANCE
    if (!this.shotData.active && this.keeper) {
      const t = this.clock.getElapsedTime();
      this.keeper.position.x = Math.sin(t * 2.2) * 0.35;
      this.keeper.position.y = Math.abs(Math.sin(t * 5.5)) * 0.08;
      this.keeper.rotation.z = 0;
      this.keeper.userData.leftArmGroup.rotation.z = -0.55;
      this.keeper.userData.rightArmGroup.rotation.z = 0.55;
    }

    if (!this.shotData.active) return;

    this.shotData.elapsed += dt;
    const p = Math.min(1, this.shotData.elapsed / this.shotData.duration);
    const { startPos, targetPos, spinX, knuckleSeed } = this.shotData;

    // Parabolic height arc + Magnus curve / CR7 Knuckleball lateral wobble
    const arcHeight = Math.sin(p * Math.PI) * (0.65 + targetPos.y * 0.22);
    let lateralOffset = Math.sin(p * Math.PI) * spinX;
    if (AppStore.state.shotStyle === "knuckle") {
      lateralOffset += Math.sin(p * Math.PI * 3.2 + knuckleSeed) * 0.28 * Math.sin(p * Math.PI);
    }

    const bx = THREE.MathUtils.lerp(startPos.x, targetPos.x, p) + lateralOffset;
    const by = THREE.MathUtils.lerp(startPos.y, targetPos.y, p) + arcHeight * (1 - p * 0.45);
    const bz = THREE.MathUtils.lerp(startPos.z, targetPos.z, p);

    this.ball.position.set(bx, Math.max(0.22, by), bz);
    this.ball.rotation.x -= dt * 22;
    this.ball.rotation.y += dt * 14 * spinX;

    // Update Golden/Blue Flight Trail
    for (let i = this.ballTrailMeshes.length - 1; i > 0; i--) {
      this.ballTrailMeshes[i].position.copy(this.ballTrailMeshes[i - 1].position);
      this.ballTrailMeshes[i].material.opacity = (1 - i / this.ballTrailMeshes.length) * 0.55;
    }
    this.ballTrailMeshes[0].position.copy(this.ball.position);
    this.ballTrailMeshes[0].material.opacity = 0.65;

    // Goalkeeper Dive Animation
    if (this.keeper) {
      const diveP = Math.min(1, p * 1.18);
      this.keeper.position.x = THREE.MathUtils.lerp(0, this.shotData.keeperDiveX, diveP);
      this.keeper.position.y = Math.sin(diveP * Math.PI) * (this.shotData.keeperDiveY * 0.45);
      const diveDir = Math.sign(this.shotData.keeperDiveX || 1);
      this.keeper.rotation.z = -diveDir * diveP * 1.15;
      this.keeper.userData.leftArmGroup.rotation.z = -2.5 * diveP;
      this.keeper.userData.rightArmGroup.rotation.z = 2.5 * diveP;
    }

    // Impact at end of flight
    if (p >= 1) {
      this.shotData.active = false;
      this.handleShotOutcome();
    }
  },

  handleShotOutcome() {
    const { outcomeType, speedKmh, targetPos } = this.shotData;
    const isHome = AppStore.state.screen === "HOME";

    // Hide flight trail gradually
    this.ballTrailMeshes.forEach((m) => (m.material.opacity = 0));

    if (outcomeType === "GOAL") {
      // Trigger 3D Net Ripple
      this.netRippleIntensity = 1.0;
      this.netImpactPoint.copy(targetPos);
      StadiumAudio.playGoalRoar();
      this.phase = "CELEBRATE";
      this.phaseTimer = 0;

      if (!isHome) {
        AppStore.dispatchAction({
          type: "RECORD_SHOT_RESULT",
          payload: { isGoal: true, speedKmh }
        });
        UIController.showCenterBanner(
          "GOAL! SIUUU!",
          `Cú sút hoàn hảo của ${AppStore.state.playerName} • ${speedKmh} KM/H`,
          true
        );
      }
    } else {
      StadiumAudio.playPostOrSave();
      // Deflect ball outward
      this.ball.position.z = 1.8;
      this.ball.position.x *= 1.25;
      this.phase = "RESETTING";
      this.phaseTimer = 0;

      if (!isHome) {
        AppStore.dispatchAction({
          type: "RECORD_SHOT_RESULT",
          payload: { isGoal: false, speedKmh }
        });
        const reason =
          outcomeType === "SAVED"
            ? "Thủ môn xuất sắc bay người cản phá!"
            : outcomeType === "POST"
            ? "Bóng dội xà ngang / cột dọc đáng tiếc!"
            : "Bóng đi chệch khung thành!";
        UIController.showCenterBanner("KHÔNG VÀO!", reason, false);
      }
    }

    // Schedule reset back to CR7 Iconic Stance
    setTimeout(() => {
      this.resetToStance();
    }, isHome ? 1750 : 2100);
  },

  resetToStance() {
    this.phase = "STANCE";
    this.phaseTimer = 0;
    this.shotData.active = false;
    this.ball.position.set(0, 0.22, 11.0);
    this.ball.rotation.set(0, 0, 0);
    this.ballTrailMeshes.forEach((m) => (m.material.opacity = 0));
    if (this.keeper) {
      this.keeper.position.set(0, 0, 0.35);
      this.keeper.rotation.set(0, 0, 0);
    }
    this.applySignatureStance(this.clock.getElapsedTime());
  },

  /* --------------------------------------------------------------------------
     MODE TRANSITIONS (HOME SHOWCASE LOOP vs PENALTY 11M GAMEPLAY)
     -------------------------------------------------------------------------- */
  enterHomeMode() {
    this.resetToStance();
    if (this.aimReticle) this.aimReticle.visible = false;
    this.homeLoopTimer = 1.6; // First automatic CR7 shot happens 1.8s after load!
  },

  enterPenaltyMode() {
    this.resetToStance();
    if (this.aimReticle) this.aimReticle.visible = true;
  },

  /* --------------------------------------------------------------------------
     MAIN RENDER & ANIMATION LOOP
     -------------------------------------------------------------------------- */
  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.getElapsedTime();
    const isHome = AppStore.state.screen === "HOME";

    this.phaseTimer += dt;

    // 1. Update CR7 Pose / Run-up / Kick / Celebration
    if (this.phase === "STANCE") {
      this.applySignatureStance(elapsed);

      // In HOME mode, automatically loop CR7's run-up & rocket shot into top corner!
      if (isHome) {
        this.homeLoopTimer += dt;
        if (this.homeLoopTimer > 3.1) {
          this.homeLoopTimer = 0;
          this.triggerShot();
        }
      }
    } else {
      this.updateRunupAndKickAnimation(dt);
    }

    // 2. Update Ball Flight & Goalkeeper
    this.updateBallAndKeeper(dt);

    // 3. Update Dynamic Net Wave Ripple
    if (this.netMesh && this.netRippleIntensity > 0.005) {
      const posAttr = this.netMesh.geometry.attributes.position;
      const orig = this.netOriginalVerts;
      for (let i = 0; i < posAttr.count; i++) {
        const vx = orig[i * 3];
        const vy = orig[i * 3 + 1] + 1.22;
        const dist = Math.hypot(vx - this.netImpactPoint.x, vy - this.netImpactPoint.y);
        const wave =
          Math.max(0, 1 - dist / 2.2) *
          Math.sin(elapsed * 28 - dist * 4) *
          0.42 *
          this.netRippleIntensity;
        posAttr.setZ(i, orig[i * 3 + 2] - Math.abs(wave));
      }
      posAttr.needsUpdate = true;
      this.netRippleIntensity *= 0.94;
    }

    // 4. Animate Cheering Stadium Spectators & Camera Flashes
    if (this.crowdInstanced) {
      const dummy = new THREE.Object3D();
      const excitement = this.phase === "CELEBRATE" ? 2.4 : 1.0;
      for (let i = 0; i < this.crowdData.length; i++) {
        const fan = this.crowdData[i];
        const bounce = Math.abs(Math.sin(elapsed * fan.speed * excitement + fan.phase)) * fan.amp * excitement;
        dummy.position.set(fan.baseX, fan.baseY + bounce, fan.baseZ);
        dummy.rotation.y = fan.rotY;
        dummy.updateMatrix();
        this.crowdInstanced.setMatrixAt(i, dummy.matrix);
      }
      this.crowdInstanced.instanceMatrix.needsUpdate = true;
    }

    if (this.flashParticles) {
      this.flashParticles.material.opacity =
        this.phase === "CELEBRATE"
          ? 0.65 + Math.sin(elapsed * 35) * 0.35
          : 0.25 + Math.sin(elapsed * 12) * 0.2;
    }

    // 5. Update 3D Target Aim Reticle
    if (this.aimReticle && this.aimReticle.visible) {
      this.aimReticle.position.x = THREE.MathUtils.lerp(
        this.aimReticle.position.x,
        AppStore.state.aimPoint.x,
        0.25
      );
      this.aimReticle.position.y = THREE.MathUtils.lerp(
        this.aimReticle.position.y,
        AppStore.state.aimPoint.y,
        0.25
      );
      const pulse = 1 + Math.sin(elapsed * 6) * 0.08;
      this.aimReticle.scale.set(pulse, pulse, 1);
    }

    // 6. Camera Choreography (Home Showcase vs Penalty 11m Behind-CR7 View)
    if (isHome) {
      // Smoothly frames CR7's #7 back, wide-legged stance, and the stadium goal
      const swayX = Math.sin(elapsed * 0.55) * 0.85;
      const zoomZ = this.phase === "KICK" || this.phase === "CELEBRATE" ? 13.8 : 15.6;
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, -0.45 + swayX, 0.05);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 1.72, 0.05);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, zoomZ, 0.05);
      this.camera.lookAt(0, 1.38, 2.5);
    } else {
      // Penalty 11m Gameplay Camera: Iconic over-the-back view of CR7 #7
      const cfg = GAME_MODE_FIELD_MAP.PENALTY_11M;
      const followZ = this.shotData.active ? 12.6 : cfg.cameraOffset.z;
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, cfg.cameraOffset.x, 0.08);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, cfg.cameraOffset.y, 0.08);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, followZ, 0.08);
      this.camera.lookAt(cfg.cameraLookAt.x, cfg.cameraLookAt.y, cfg.cameraLookAt.z);
    }

    this.renderer.render(this.scene, this.camera);
  },

  onResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
};

window.CR7Engine = CR7Engine;

/* ============================================================================
   5. UI CONTROLLER & CROSS-PLATFORM SWIPE / AIM INPUT (PC & MOBILE)
   ============================================================================ */
const UIController = {
  swipeCanvas: null,
  swipeCtx: null,
  isDragging: false,
  dragPoints: [],

  init() {
    this.swipeCanvas = document.getElementById("swipe-canvas");
    this.swipeCtx = this.swipeCanvas.getContext("2d");
    this.resizeSwipeCanvas();
    window.addEventListener("resize", () => this.resizeSwipeCanvas());

    // Subscribe UI to Central AppStore
    AppStore.subscribe((state) => this.renderUI(state));

    // Bind Home Input & Mode Buttons
    const nameInput = document.getElementById("player-name-input");
    nameInput.addEventListener("input", (e) => {
      AppStore.dispatchAction({ type: "SET_PLAYER_NAME", payload: e.target.value });
    });

    document.getElementById("btn-mode-penalty").addEventListener("click", () => {
      StadiumAudio.ensureContext();
      AppStore.dispatchAction({ type: "SET_SCREEN", payload: "PENALTY_11M" });
    });

    document.getElementById("btn-mode-freekick").addEventListener("click", () => {
      this.openLockedModal(GAME_MODE_FIELD_MAP.FREEKICK_WALL);
    });

    document.getElementById("btn-mode-freestyle").addEventListener("click", () => {
      this.openLockedModal(GAME_MODE_FIELD_MAP.FREESTYLE);
    });

    // Top Nav Buttons
    document.getElementById("btn-back-home").addEventListener("click", () => {
      AppStore.dispatchAction({ type: "SET_SCREEN", payload: "HOME" });
    });

    document.getElementById("btn-audio-toggle").addEventListener("click", () => {
      StadiumAudio.ensureContext();
      AppStore.dispatchAction({ type: "TOGGLE_AUDIO" });
    });

    // Shot Style Chips
    document.querySelectorAll(".style-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        AppStore.dispatchAction({
          type: "SET_SHOT_STYLE",
          payload: chip.getAttribute("data-style")
        });
      });
    });

    // Shoot Button & Spacebar
    document.getElementById("btn-shoot-now").addEventListener("click", () => {
      StadiumAudio.ensureContext();
      CR7Engine.triggerShot();
    });

    window.addEventListener("keydown", (e) => {
      if (AppStore.state.screen !== "PENALTY_11M") return;
      if (e.code === "Space") {
        e.preventDefault();
        StadiumAudio.ensureContext();
        CR7Engine.triggerShot();
      } else if (e.code === "ArrowLeft") {
        AppStore.dispatchAction({
          type: "SET_AIM_POINT",
          payload: { x: AppStore.state.aimPoint.x - 0.35, y: AppStore.state.aimPoint.y }
        });
      } else if (e.code === "ArrowRight") {
        AppStore.dispatchAction({
          type: "SET_AIM_POINT",
          payload: { x: AppStore.state.aimPoint.x + 0.35, y: AppStore.state.aimPoint.y }
        });
      } else if (e.code === "ArrowUp") {
        AppStore.dispatchAction({
          type: "SET_AIM_POINT",
          payload: { x: AppStore.state.aimPoint.x, y: AppStore.state.aimPoint.y + 0.25 }
        });
      } else if (e.code === "ArrowDown") {
        AppStore.dispatchAction({
          type: "SET_AIM_POINT",
          payload: { x: AppStore.state.aimPoint.x, y: AppStore.state.aimPoint.y - 0.25 }
        });
      }
    });

    // Modal Controls
    const closeModal = () => {
      document.getElementById("tdcm-modal").classList.remove("active");
    };
    document.getElementById("modal-close-x").addEventListener("click", closeModal);
    document.getElementById("modal-btn-secondary").addEventListener("click", closeModal);
    document.getElementById("modal-btn-primary").addEventListener("click", () => {
      closeModal();
      StadiumAudio.ensureContext();
      AppStore.dispatchAction({ type: "SET_SCREEN", payload: "PENALTY_11M" });
    });

    // Bind Swipe & Target Drag on Canvas (Supports PC Mouse & Mobile Touch)
    this.setupSwipeAndAimControls();
  },

  resizeSwipeCanvas() {
    if (!this.swipeCanvas) return;
    this.swipeCanvas.width = window.innerWidth;
    this.swipeCanvas.height = window.innerHeight;
  },

  setupSwipeAndAimControls() {
    const canvas = this.swipeCanvas;

    const getPoint = (e) => {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    };

    const onStart = (e) => {
      if (AppStore.state.screen !== "PENALTY_11M") return;
      StadiumAudio.ensureContext();
      const pt = getPoint(e);
      this.isDragging = true;
      this.dragPoints = [pt];
      this.updateAimFromScreenPoint(pt);
    };

    const onMove = (e) => {
      if (!this.isDragging || AppStore.state.screen !== "PENALTY_11M") return;
      const pt = getPoint(e);
      this.dragPoints.push(pt);
      this.updateAimFromScreenPoint(pt);
      this.drawSwipeTrail();
    };

    const onEnd = () => {
      if (!this.isDragging) return;
      this.isDragging = false;

      if (this.dragPoints.length >= 4) {
        const first = this.dragPoints[0];
        const last = this.dragPoints[this.dragPoints.length - 1];
        const dy = first.y - last.y;
        const dist = Math.hypot(last.x - first.x, dy);

        // If user swiped upward from lower half of screen, trigger immediate swipe shot!
        if (first.y > window.innerHeight * 0.48 && dy > 45 && dist > 55) {
          const mid = this.dragPoints[Math.floor(this.dragPoints.length / 2)];
          const midExpectedX = (first.x + last.x) / 2;
          const curveAmount = ((mid.x - midExpectedX) / window.innerWidth) * -6.5;
          const swipePower = Math.min(98, Math.max(55, Math.round((dist / (window.innerHeight * 0.42)) * 95)));
          AppStore.dispatchAction({ type: "SET_POWER", payload: swipePower });
          CR7Engine.triggerShot(AppStore.state.aimPoint, swipePower, curveAmount);
        }
      }

      this.dragPoints = [];
      this.clearSwipeTrail();
    };

    canvas.addEventListener("mousedown", onStart);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);

    canvas.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
  },

  updateAimFromScreenPoint(pt) {
    // Map upper-middle screen area to the 3D goal coordinates (-3.45..3.45, 0.25..2.32)
    const normX = (pt.x / window.innerWidth - 0.5) * 2; // -1 .. 1
    const normY = 1 - pt.y / (window.innerHeight * 0.62); // 0 .. 1 in goal region
    const goalX = normX * 4.2;
    const goalY = 0.25 + Math.max(0, Math.min(1, normY)) * 2.1;

    AppStore.dispatchAction({
      type: "SET_AIM_POINT",
      payload: { x: goalX, y: goalY }
    });

    // Dynamically adjust shot power based on target height
    const power = Math.round(62 + (goalY / 2.35) * 32);
    AppStore.dispatchAction({ type: "SET_POWER", payload: power });
  },

  drawSwipeTrail() {
    const ctx = this.swipeCtx;
    ctx.clearRect(0, 0, this.swipeCanvas.width, this.swipeCanvas.height);
    if (this.dragPoints.length < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.dragPoints[0].x, this.dragPoints[0].y);
    for (let i = 1; i < this.dragPoints.length; i++) {
      ctx.lineTo(this.dragPoints[i].x, this.dragPoints[i].y);
    }
    ctx.strokeStyle = "#F5C542";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.shadowColor = "#4285F4";
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();
  },

  clearSwipeTrail() {
    if (!this.swipeCtx) return;
    this.swipeCtx.clearRect(0, 0, this.swipeCanvas.width, this.swipeCanvas.height);
  },

  openLockedModal(modeCfg) {
    document.getElementById("modal-title").textContent = `⏳ ${modeCfg.title.toUpperCase()}`;
    document.getElementById("modal-body").innerHTML = `
      <p style="margin-bottom:10px;"><strong>${modeCfg.title}</strong> (${modeCfg.distanceMeters}m) hiện đang trong danh sách nâng cấp <strong>Giai đoạn 2</strong> theo lộ trình anh Đức đã chốt.</p>
      <p style="color:#1A4B9F;font-weight:600;">👉 Hiện tại anh có thể trải nghiệm ngay chế độ <strong>Sút Phạt Penalty 11m</strong> với đầy đủ dáng đứng thương hiệu CR7 và hiệu ứng khán đài 3D!</p>
    `;
    document.getElementById("tdcm-modal").classList.add("active");
  },

  showCenterBanner(title, subtitle, isGoal) {
    const banner = document.getElementById("center-banner");
    const titleEl = document.getElementById("center-banner-title");
    const subEl = document.getElementById("center-banner-sub");

    titleEl.textContent = title;
    titleEl.className = `center-banner-title ${isGoal ? "goal" : "miss"}`;
    subEl.textContent = subtitle;
    banner.classList.add("show");

    setTimeout(() => {
      banner.classList.remove("show");
    }, 1850);
  },

  renderUI(state) {
    const homeEl = document.getElementById("home-screen");
    const hudEl = document.getElementById("game-hud");
    const backBtn = document.getElementById("btn-back-home");

    if (state.screen === "HOME") {
      homeEl.classList.remove("hidden");
      hudEl.classList.add("hidden");
      this.swipeCanvas.classList.add("disabled");
      backBtn.style.display = "none";
    } else {
      homeEl.classList.add("hidden");
      hudEl.classList.remove("hidden");
      this.swipeCanvas.classList.remove("disabled");
      backBtn.style.display = "inline-flex";
    }

    // Update Home Stats & Name
    document.getElementById("home-high-score").textContent = `KỶ LỤC: ${state.highScore} BÀN`;
    document.getElementById("home-best-streak").textContent = `Chuỗi thắng: ${state.bestStreak}`;

    // Update HUD Scoreboard
    document.getElementById("hud-player-name").textContent = state.playerName;
    document.getElementById("hud-score").textContent = state.score;
    document.getElementById("hud-streak").textContent = state.streak;
    document.getElementById("hud-speed").innerHTML = `${state.lastSpeedKmh} <small style="font-size:10px">KM/H</small>`;

    // Update 5-Shot Penalty Series Dots
    const dotsWrap = document.getElementById("series-dots");
    if (dotsWrap) {
      let dotsHtml = "";
      for (let i = 0; i < 5; i++) {
        const res = state.seriesResults[i];
        const cls = res ? res : i === state.seriesResults.length ? "current" : "";
        dotsHtml += `<span class="shot-dot ${cls}"></span>`;
      }
      dotsWrap.innerHTML = dotsHtml;
    }

    // Update Shot Style Chips
    document.querySelectorAll(".style-chip").forEach((chip) => {
      chip.classList.toggle("active", chip.getAttribute("data-style") === state.shotStyle);
    });

    // Update Power Bar
    document.getElementById("power-percent-label").textContent = `LỰC SÚT: ${state.powerPercent}%`;
    document.getElementById("power-bar-fill").style.width = `${state.powerPercent}%`;

    // Update Audio Label
    document.getElementById("audio-label").textContent = state.audioEnabled ? "CĐV: BẬT" : "CĐV: TẮT";
  }
};

/* ============================================================================
   6. INITIALIZE APPLICATION ON DOM READY
   ============================================================================ */
window.addEventListener("DOMContentLoaded", () => {
  AppStore.init();
  UIController.init();
  CR7Engine.init();
});
