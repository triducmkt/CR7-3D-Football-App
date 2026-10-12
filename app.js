/**
 * ============================================================================
 * TDCM ARENA 3D — CR7 ULTRA-HD 5X SEMI-REALISTIC FOOTBALL WEB APP
 * Architecture: Inherits TDCM Team App V5+ Standards
 *   1. FIELD_MAP Pattern for Data & Mode Configuration
 *   2. Central AppStore (Single Source of Truth) + dispatchAction()
 *   3. 5x High-Poly Anatomical CR7 Model + 2048px PBR Bump/Texture Maps
 *   4. Full-Body Camera Framing + Authentic 7-Stage CR7 Animation Sequence
 *   5. Blinking Multi-Ring 3D Reticle + 2x Mouse/Arrow Key Sensitivity
 *   6. Hold-Space Accelerated Power Meter with 80% 5px Red Sweet Spot -> P:MAX, A:MAX, S:100%
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
    // Camera moved further back & framed to show 100% full body of CR7 with +20% longer athletic legs
    cameraOffset: { x: -0.44, y: 1.66, z: 18.75 },
    cameraLookAt: { x: 0, y: 1.15, z: 2.2 }
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
    seriesResults: [],
    audioEnabled: true,
    aimPoint: { x: 2.35, y: 1.75 }, // target inside goal (width: -3.5..3.5, height: 0.2..2.35)
    powerPercent: 0,
    pasRating: { pText: "CHỜ LÊN LỰC", aText: "CHỜ LÊN LỰC", sPercent: 80, isSweetSpot: false }
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
          this.state.powerPercent = 0;
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
          x: Math.max(-3.55, Math.min(3.55, payload.x)),
          y: Math.max(0.22, Math.min(2.36, payload.y))
        };
        break;
      }
      case "SET_POWER": {
        const pct = Math.max(0, Math.min(100, payload));
        this.state.powerPercent = pct;
        this.state.pasRating = evaluateShotPowerMetrics(pct);
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

/**
 * Hàm xác định lực sút (P), độ chính xác (A) và xác suất ghi bàn (S)
 * dựa trên mốc điểm đỏ 80% (Red Line 5px):
 * - Thả đúng vùng mốc đỏ 80% (76.5% -> 83.5%): Lực sút P TỐT NHẤT (100%), Độ chính xác A CAO NHẤT (100%) -> Xác suất ghi bàn S = 100%!
 */
function evaluateShotPowerMetrics(powerPct) {
  const pct = Math.round(powerPct);
  const deltaFrom80 = Math.abs(powerPct - 80);

  if (pct === 0) {
    return { pText: "0%", aText: "--", sPercent: 0, isSweetSpot: false, scatter: 0 };
  }

  // Ngay tại vạch đỏ 80% (dung sai tương ứng vạch đỏ 5px trên thanh lực)
  if (deltaFrom80 <= 3.8) {
    return {
      pText: "TỐT NHẤT (MAX)",
      aText: "CAO NHẤT (A+)",
      sPercent: 100,
      isSweetSpot: true,
      scatter: 0.0 // Tuyệt đối chuẩn tâm ngắm 100%
    };
  }

  // Khá gần vạch đỏ (70% - 88%)
  if (deltaFrom80 <= 10) {
    const sVal = Math.round(92 - (deltaFrom80 - 3.8) * 2.5);
    return {
      pText: `${pct}% (MẠNH)`,
      aText: "CAO (A)",
      sPercent: Math.max(75, sVal),
      isSweetSpot: false,
      scatter: 0.14
    };
  }

  // Quá mạnh (> 90% -> dễ vọt xà)
  if (powerPct > 90) {
    const sVal = Math.max(25, Math.round(65 - (powerPct - 90) * 4.5));
    return {
      pText: `${pct}% (QUÁ LỰC)`,
      aText: "THẤP (DỄ VỌT XÀ)",
      sPercent: sVal,
      isSweetSpot: false,
      scatter: 0.45
    };
  }

  // Lực nhẹ (< 70% -> thủ môn dễ bắt)
  const sVal = Math.max(30, Math.round(35 + (powerPct / 70) * 38));
  return {
    pText: `${pct}% (NHẸ)`,
    aText: "TRUNG BÌNH (B)",
    sPercent: sVal,
    isSweetSpot: false,
    scatter: 0.25
  };
}

/* ============================================================================
   3. REAL MP3 STADIUM AUDIO SYSTEM
   - 1-svd.mp3: Âm thanh nền ở trang Home và nền sân vận động (loop), chỉ tắt khi kích hoạt các file mp3 khác ở trang sút.
   - 2-coi.mp3: Kích hoạt ngay khi kết thúc giữ Space để sút, chỉ phát đúng 1.5 giây.
   - 3-sut.mp3: Kích hoạt ngay thời điểm chân cầu thủ chạm vào quả bóng.
   - 4-vao.mp3 & 4-cheer.mp3: Kích hoạt song song cùng lúc ngay khi ghi bàn (GOAL), và kết thúc ngay khi kích hoạt 5-siu.mp3.
   - 5-siu.mp3: Kích hoạt ngay khi cầu thủ bắt đầu thực hiện animation ăn mừng SIUUU (sau 3 giây chạy dang tay).
   - 4-nogoal.mp3: Kích hoạt ngay khi sút hụt ra ngoài hoặc không vào (no score).
   ============================================================================ */
const StadiumAudio = {
  bgmSvd: null,
  sfxCoi: null,
  sfxSut: null,
  sfxVao: null,
  sfxCheer: null,
  sfxSiu: null,
  sfxNoGoal: null,
  coiTimer: null,
  resumeTimer: null,
  muted: false,
  initialized: false,

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.bgmSvd = new Audio("1-svd.mp3");
    this.bgmSvd.loop = true;
    this.bgmSvd.volume = 0.65;
    this.bgmSvd.preload = "auto";

    this.sfxCoi = new Audio("2-coi.mp3");
    this.sfxCoi.volume = 0.9;
    this.sfxCoi.preload = "auto";

    this.sfxSut = new Audio("3-sut.mp3");
    this.sfxSut.volume = 1.0;
    this.sfxSut.preload = "auto";

    this.sfxVao = new Audio("4-vao.mp3");
    this.sfxVao.volume = 1.0;
    this.sfxVao.preload = "auto";

    this.sfxCheer = new Audio("4-cheer.mp3");
    this.sfxCheer.volume = 0.92;
    this.sfxCheer.preload = "auto";

    this.sfxSiu = new Audio("5-siu.mp3");
    this.sfxSiu.volume = 1.0;
    this.sfxSiu.preload = "auto";

    this.sfxNoGoal = new Audio("4-nogoal.mp3");
    this.sfxNoGoal.volume = 1.0;
    this.sfxNoGoal.preload = "auto";

    // Khi 5-siu.mp3 hoặc 4-nogoal.mp3 kết thúc, tự động kiểm tra để bật lại nhạc nền 1-svd.mp3
    [this.sfxSiu, this.sfxNoGoal].forEach((audioEl) => {
      audioEl.addEventListener("ended", () => {
        this.checkAndResumeBgm();
      });
    });

    // Thử tự động phát nhạc nền 1-svd.mp3 ngay khi mở trang hoặc ngay khi người dùng tương tác đầu tiên
    this.ensureContext();
    const unlockAudio = () => {
      this.ensureContext();
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    window.addEventListener("touchstart", unlockAudio, { once: true });
  },

  ensureContext() {
    if (!this.initialized) this.init();
    if (this.muted) return;
    if (!this.isAnyActionSfxPlaying()) {
      this.bgmSvd.play().catch(() => {});
    }
  },

  getActionAudioList() {
    return [
      this.sfxCoi,
      this.sfxSut,
      this.sfxVao,
      this.sfxCheer,
      this.sfxSiu,
      this.sfxNoGoal
    ];
  },

  isAnyActionSfxPlaying() {
    return this.getActionAudioList().some((audioEl) => audioEl && !audioEl.paused);
  },

  pauseBgmForAction() {
    if (this.bgmSvd && !this.bgmSvd.paused) {
      this.bgmSvd.pause();
    }
  },

  stopAllActionSfx() {
    if (this.coiTimer) {
      clearTimeout(this.coiTimer);
      this.coiTimer = null;
    }
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    this.getActionAudioList().forEach((audioEl) => {
      if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
      }
    });
  },

  checkAndResumeBgm() {
    if (!this.initialized) this.init();
    if (this.muted) return;
    if (!this.isAnyActionSfxPlaying()) {
      this.bgmSvd.play().catch(() => {});
    }
  },

  setMuted(flag) {
    if (!this.initialized) this.init();
    this.muted = flag;
    if (flag) {
      if (this.bgmSvd) this.bgmSvd.pause();
      this.stopAllActionSfx();
    } else {
      this.checkAndResumeBgm();
    }
  },

  /**
   * 1. Kích hoạt 2-coi.mp3 ngay khi kết thúc giữ Space để sút (chỉ phát đúng 1.5 giây)
   */
  playWhistleOnShotStart() {
    if (!this.initialized) this.init();
    if (this.muted || AppStore.state.screen === "HOME") return;

    this.stopAllActionSfx();
    this.pauseBgmForAction();

    this.sfxCoi.currentTime = 0;
    this.sfxCoi.play().catch(() => {});
    this.coiTimer = setTimeout(() => {
      if (this.sfxCoi) {
        this.sfxCoi.pause();
        this.sfxCoi.currentTime = 0;
      }
      this.coiTimer = null;
    }, 1500);
  },

  /**
   * 2. CẢI TIẾN 1: Kích hoạt 3-sut.mp3 NGAY THỜI ĐIỂM chân cầu thủ chạm vào quả bóng
   */
  playBallStrike() {
    if (!this.initialized) this.init();
    if (this.muted || AppStore.state.screen === "HOME") return;

    this.pauseBgmForAction();
    this.sfxSut.currentTime = 0;
    this.sfxSut.play().catch(() => {});
  },

  /**
   * 3. CẢI TIẾN 2: Kích hoạt song song cùng lúc 4-vao.mp3 và 4-cheer.mp3 ngay khi ghi bàn (GOAL)
   */
  playGoalAndCheer() {
    if (!this.initialized) this.init();
    if (this.muted || AppStore.state.screen === "HOME") return;

    this.pauseBgmForAction();
    if (this.coiTimer) {
      clearTimeout(this.coiTimer);
      this.coiTimer = null;
    }
    if (this.sfxCoi && !this.sfxCoi.paused) {
      this.sfxCoi.pause();
      this.sfxCoi.currentTime = 0;
    }

    this.sfxVao.currentTime = 0;
    this.sfxCheer.currentTime = 0;
    this.sfxVao.play().catch(() => {});
    this.sfxCheer.play().catch(() => {});
  },

  /**
   * 4. CẢI TIẾN 2 & 4: Kết thúc ngay 4-vao.mp3 + 4-cheer.mp3 và kích hoạt ngay 5-siu.mp3
   *    khi cầu thủ chuyển sang animation ăn mừng SIUUU (sau 3 giây chạy dang tay)
   */
  playSiuCelebration() {
    if (!this.initialized) this.init();
    if (this.muted || AppStore.state.screen === "HOME") return;

    this.pauseBgmForAction();

    // Kết thúc ngay lập tức 4-vao.mp3 và 4-cheer.mp3
    [this.sfxVao, this.sfxCheer].forEach((audioEl) => {
      if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
      }
    });

    // Kích hoạt ngay 5-siu.mp3
    this.sfxSiu.currentTime = 0;
    this.sfxSiu.play().catch(() => {});
  },

  /**
   * 5. CẢI TIẾN 5: Kích hoạt 4-nogoal.mp3 ngay khi sút hụt ra ngoài hoặc không vào (no score)
   */
  playNoGoal() {
    if (!this.initialized) this.init();
    if (this.muted || AppStore.state.screen === "HOME") return;

    this.pauseBgmForAction();
    if (this.coiTimer) {
      clearTimeout(this.coiTimer);
      this.coiTimer = null;
    }
    if (this.sfxCoi && !this.sfxCoi.paused) {
      this.sfxCoi.pause();
      this.sfxCoi.currentTime = 0;
    }

    this.sfxNoGoal.currentTime = 0;
    this.sfxNoGoal.play().catch(() => {});
  }
};

/* ============================================================================
   4. THREE.JS 5X HIGH-POLY SEMI-REALISTIC ENGINE
   ============================================================================ */
const CR7Engine = {
  scene: null,
  camera: null,
  renderer: null,
  clock: null,
  maxAnisotropy: 1,

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
  // Detailed phases: "STANCE" -> "STEP_CLOSE" (0.5x slow-mo) -> "RUNUP" (0.5x slow-mo) -> "KICK" (1.0x) -> "CELEBRATE_RUN" -> "CELEBRATE_SIU" | "DISAPPOINTED"
  phase: "STANCE",
  phaseTimer: 0,
  homeLoopTimer: 0,
  preKickTimeScale: 0.5, // CẢI TIẾN 2 & 5: Slow-Mo 0.5x từ lúc nhả Space đến khi chân chạm bóng
  sutAudioFired: false,  // CẢI TIẾN 1: Đánh dấu đã kích hoạt 3-sut.mp3 trước 0.5s thực tế khi chân chạm bóng
  camMode: "DEFAULT",    // "DEFAULT" | "FOLLOW_BALL" | "HOLD_AT_GOAL"
  camHoldTimer: 0,
  camHoldPos: new THREE.Vector3(0, 1.35, 2.75),
  camHoldLook: new THREE.Vector3(0, 1.15, -0.6),
  netRippleIntensity: 0,
  netImpactPoint: new THREE.Vector3(),

  shotData: {
    active: false,
    startPos: new THREE.Vector3(0, 0.22, 11),
    targetPos: new THREE.Vector3(2.3, 1.7, 0),
    spinX: 0,
    knuckleSeed: 0,
    speedKmh: 118,
    elapsed: 0,
    duration: 0.62,
    keeperDiveX: 0,
    keeperDiveY: 1.2,
    willScore: true,
    isSweetSpot: false,
    outcomeType: "GOAL"
  },

  init() {
    const container = document.getElementById("canvas-container");
    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040914);
    this.scene.fog = new THREE.FogExp2(0x061022, 0.0078);

    this.camera = new THREE.PerspectiveCamera(
      44,
      window.innerWidth / window.innerHeight,
      0.1,
      280
    );

    // 5x High-Pixel Super-Sampling & 4096 Shadow Map
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * 1.65, 3.0));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy() || 8;
    container.appendChild(this.renderer.domElement);

    // Build World
    this.setupLighting();
    this.buildPitchAndStadium();
    this.buildGoalAndDynamicNet();
    this.buildAimReticle();
    this.buildHighResFootball();
    this.buildGoalkeeper();
    this.buildHighPolyCR7Character();

    this.enterHomeMode();
    window.addEventListener("resize", () => this.onResize());
    this.animate();
  },

  setupLighting() {
    const hemiLight = new THREE.HemisphereLight(0xa5c8ff, 0x0f2916, 0.72);
    this.scene.add(hemiLight);

    const mainSpot = new THREE.DirectionalLight(0xfff9ed, 1.52);
    mainSpot.position.set(14, 30, 26);
    mainSpot.castShadow = true;
    mainSpot.shadow.mapSize.width = 4096;
    mainSpot.shadow.mapSize.height = 4096;
    mainSpot.shadow.camera.near = 5;
    mainSpot.shadow.camera.far = 80;
    const d = 19;
    mainSpot.shadow.camera.left = -d;
    mainSpot.shadow.camera.right = d;
    mainSpot.shadow.camera.top = d;
    mainSpot.shadow.camera.bottom = -d;
    mainSpot.shadow.bias = -0.0003;
    this.scene.add(mainSpot);

    // Rim Light sculpting CR7's shoulders, lats & calves
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.92);
    rimLight.position.set(-14, 15, -16);
    this.scene.add(rimLight);

    // Dedicated Back Key Light for CR7's #7 Gold Print & Green Socks
    const backFill = new THREE.PointLight(0xfff0d4, 1.05, 28);
    backFill.position.set(0, 3.2, 17.5);
    this.scene.add(backFill);
  },

  /* --------------------------------------------------------------------------
     STADIUM PITCH (2048px Grass Texture), STANDS & CHEERING CROWD
     -------------------------------------------------------------------------- */
  buildPitchAndStadium() {
    const grassCanvas = document.createElement("canvas");
    grassCanvas.width = 2048;
    grassCanvas.height = 2048;
    const gCtx = grassCanvas.getContext("2d");

    const stripeCount = 20;
    const stripeH = grassCanvas.height / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      gCtx.fillStyle = i % 2 === 0 ? "#19581d" : "#216926";
      gCtx.fillRect(0, i * stripeH, grassCanvas.width, stripeH);
    }
    for (let i = 0; i < 120000; i++) {
      const x = Math.random() * grassCanvas.width;
      const y = Math.random() * grassCanvas.height;
      gCtx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.055)";
      gCtx.fillRect(x, y, 2, 4);
    }

    const grassTex = new THREE.CanvasTexture(grassCanvas);
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(8, 8);
    grassTex.anisotropy = this.maxAnisotropy;

    const pitchGeo = new THREE.PlaneGeometry(120, 120);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      bumpMap: grassTex,
      bumpScale: 0.015,
      roughness: 0.84,
      metalness: 0.04
    });
    const pitch = new THREE.Mesh(pitchGeo, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.scene.add(pitch);

    // Pitch White Lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide });
    const addPitchLine = (w, h, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      this.scene.add(m);
    };

    addPitchLine(70, 0.12, 0, 0);
    addPitchLine(18.32, 0.1, 0, 5.5);
    addPitchLine(0.1, 5.5, -9.16, 2.75);
    addPitchLine(0.1, 5.5, 9.16, 2.75);
    addPitchLine(40.32, 0.12, 0, 16.5);
    addPitchLine(0.12, 16.5, -20.16, 8.25);
    addPitchLine(0.12, 16.5, 20.16, 8.25);

    const spotMesh = new THREE.Mesh(new THREE.CircleGeometry(0.18, 36), lineMat);
    spotMesh.rotation.x = -Math.PI / 2;
    spotMesh.position.set(0, 0.014, 11.0);
    this.scene.add(spotMesh);

    // LED Advertising Boards
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
    adTex.anisotropy = this.maxAnisotropy;
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

    // Stadium Grandstands
    const standMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    const createStandSection = (w, d, h, x, y, z, rotY = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), standMat);
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      this.scene.add(m);
    };

    for (let tier = 0; tier < 8; tier++) {
      createStandSection(78, 2.6, 1.6, 0, 1.2 + tier * 1.45, -10.5 - tier * 2.3);
      createStandSection(60, 2.4, 1.6, -34 - tier * 2.1, 1.2 + tier * 1.45, 10, Math.PI / 2);
      createStandSection(60, 2.4, 1.6, 34 + tier * 2.1, 1.2 + tier * 1.45, 10, Math.PI / 2);
    }

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.4 });
    const northRoof = new THREE.Mesh(new THREE.BoxGeometry(84, 0.8, 12), roofMat);
    northRoof.position.set(0, 15.5, -24);
    northRoof.rotation.x = 0.18;
    this.scene.add(northRoof);

    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
    for (let i = -32; i <= 32; i += 8) {
      const lightBank = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.9, 0.6), bulbMat);
      lightBank.position.set(i, 14.6, -19.2);
      this.scene.add(lightBank);
    }

    // 1,800 Cheering Spectators
    const fanCount = 1800;
    const fanGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.85, 10);
    const fanMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.crowdInstanced = new THREE.InstancedMesh(fanGeo, fanMat, fanCount);

    const palette = [
      new THREE.Color(0xc8102e),
      new THREE.Color(0x0b5d33),
      new THREE.Color(0xf5c542),
      new THREE.Color(0x4285f4),
      new THREE.Color(0xf8fafc)
    ];

    const dummy = new THREE.Object3D();
    for (let i = 0; i < fanCount; i++) {
      const section = i % 3;
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
      this.crowdInstanced.setMatrixAt(i, dummy.matrix);
      this.crowdInstanced.setColorAt(i, palette[Math.floor(Math.random() * palette.length)]);

      this.crowdData.push({
        baseX: x,
        baseY: y,
        baseZ: z,
        rotY: dummy.rotation.y,
        phase: Math.random() * Math.PI * 2,
        speed: 4.5 + Math.random() * 4.5,
        amp: 0.12 + Math.random() * 0.16
      });
    }
    this.crowdInstanced.instanceMatrix.needsUpdate = true;
    if (this.crowdInstanced.instanceColor) this.crowdInstanced.instanceColor.needsUpdate = true;
    this.scene.add(this.crowdInstanced);

    const flashCount = 140;
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
      size: 0.9,
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
      roughness: 0.18,
      metalness: 0.38
    });

    const goalW = 7.32;
    const goalH = 2.44;
    const goalD = 2.15;
    const postRadius = 0.068;

    const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalH, 36), postMat);
    leftPost.position.set(-goalW / 2, goalH / 2, 0);
    leftPost.castShadow = true;
    goalGroup.add(leftPost);

    const rightPost = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalH, 36), postMat);
    rightPost.position.set(goalW / 2, goalH / 2, 0);
    rightPost.castShadow = true;
    goalGroup.add(rightPost);

    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalW + postRadius * 2, 36), postMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, goalH, 0);
    crossbar.castShadow = true;
    goalGroup.add(crossbar);

    const stanchionMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.4 });
    [-goalW / 2, goalW / 2].forEach((xPos) => {
      const bottomBar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, goalD, 20), stanchionMat);
      bottomBar.rotation.x = Math.PI / 2;
      bottomBar.position.set(xPos, 0.04, -goalD / 2);
      goalGroup.add(bottomBar);

      const diagLen = Math.hypot(goalH, goalD);
      const diagBar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, diagLen, 20), stanchionMat);
      diagBar.position.set(xPos, goalH / 2, -goalD / 2);
      diagBar.rotation.x = Math.atan2(goalD, goalH);
      goalGroup.add(diagBar);
    });

    const netGeo = new THREE.PlaneGeometry(goalW, goalH, 40, 20);
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      wireframe: true,
      transparent: true,
      opacity: 0.52
    });
    this.netMesh = new THREE.Mesh(netGeo, netMat);
    this.netMesh.position.set(0, goalH / 2, -goalD * 0.72);
    this.netOriginalVerts = netGeo.attributes.position.array.slice();
    goalGroup.add(this.netMesh);

    const topNet = new THREE.Mesh(new THREE.PlaneGeometry(goalW, goalD * 0.72, 28, 10), netMat);
    topNet.rotation.x = Math.PI / 2;
    topNet.position.set(0, goalH, -goalD * 0.36);
    goalGroup.add(topNet);

    [-goalW / 2, goalW / 2].forEach((xPos) => {
      const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(goalD * 0.72, goalH, 12, 16), netMat);
      sideNet.rotation.y = Math.PI / 2;
      sideNet.position.set(xPos, goalH / 2, -goalD * 0.36);
      goalGroup.add(sideNet);
    });

    this.scene.add(goalGroup);
  },

  /* --------------------------------------------------------------------------
     CẢI TIẾN 4: HỒNG TÂM NHẤP NHÁY ĐẸP, THU HÚT NGƯỜI CHƠI HƠN
     (Multi-Ring Rotating Neon/Gold Bullseye + Pulsing Crosshair Blades)
     -------------------------------------------------------------------------- */
  buildAimReticle() {
    const group = new THREE.Group();

    // 1. Outer Segmented Golden Ring (Rotates Clockwise)
    const outerGroup = new THREE.Group();
    const goldMat = new THREE.MeshBasicMaterial({
      color: 0xf5c542,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    for (let i = 0; i < 4; i++) {
      const arc = new THREE.Mesh(
        new THREE.RingGeometry(0.32, 0.39, 32, 1, i * (Math.PI / 2) + 0.18, Math.PI / 2 - 0.36),
        goldMat
      );
      outerGroup.add(arc);
    }
    group.add(outerGroup);

    // 2. Inner Counter-Rotating Neon Cyan/Blue Ring
    const innerGroup = new THREE.Group();
    const blueMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    for (let i = 0; i < 3; i++) {
      const arc = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.24, 28, 1, i * ((Math.PI * 2) / 3) + 0.15, (Math.PI * 2) / 3 - 0.3),
        blueMat
      );
      innerGroup.add(arc);
    }
    group.add(innerGroup);

    // 3. 4 Pulsing Crosshair Pointers
    const crossGroup = new THREE.Group();
    const bladeMat = new THREE.MeshBasicMaterial({
      color: 0xff3b3b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].forEach((angle) => {
      const bladePivot = new THREE.Group();
      bladePivot.rotation.z = angle;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.16), bladeMat);
      blade.position.y = 0.44;
      bladePivot.add(blade);
      crossGroup.add(bladePivot);
    });
    group.add(crossGroup);

    // 4. Glowing Center Bullseye Core
    const centerMat = new THREE.MeshBasicMaterial({
      color: 0xff1e1e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const centerCore = new THREE.Mesh(new THREE.CircleGeometry(0.085, 32), centerMat);
    const centerHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.09, 0.14, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      })
    );
    group.add(centerCore, centerHalo);

    group.position.set(AppStore.state.aimPoint.x, AppStore.state.aimPoint.y, 0.08);
    group.userData = { outerGroup, innerGroup, crossGroup, centerCore, centerHalo, goldMat, bladeMat, centerMat };
    this.aimReticle = group;
    this.scene.add(group);
  },

  /* --------------------------------------------------------------------------
     CẢI TIẾN 1A: QUẢ BÓNG 3D 5X HIGH-POLY (128x128 Sphere + 2048px Seam & Dimple Bump)
     -------------------------------------------------------------------------- */
  buildHighResFootball() {
    const bCanvas = document.createElement("canvas");
    bCanvas.width = 2048;
    bCanvas.height = 1024;
    const ctx = bCanvas.getContext("2d");

    const bumpCanvas = document.createElement("canvas");
    bumpCanvas.width = 2048;
    bumpCanvas.height = 1024;
    const bCtx = bumpCanvas.getContext("2d");

    // Base Pearl-White Polyurethane Leather
    const baseGrad = ctx.createLinearGradient(0, 0, 0, 1024);
    baseGrad.addColorStop(0, "#ffffff");
    baseGrad.addColorStop(0.5, "#f8fafc");
    baseGrad.addColorStop(1, "#e2e8f0");
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, 2048, 1024);

    bCtx.fillStyle = "#d0d0d0";
    bCtx.fillRect(0, 0, 2048, 1024);

    // Micro-grip dimples across the entire ball surface for 5x realism
    bCtx.fillStyle = "#9ca3af";
    for (let x = 0; x < 2048; x += 12) {
      for (let y = 0; y < 1024; y += 12) {
        bCtx.fillRect(x, y, 4, 4);
      }
    }

    // Draw Classic & Modern Champions League Star / Hex-Pentagon Panels
    const drawPolygon = (targetCtx, cx, cy, r, sides, fillStyle, strokeStyle, lineW) => {
      targetCtx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = (i * Math.PI * 2) / sides - Math.PI / 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) targetCtx.moveTo(px, py);
        else targetCtx.lineTo(px, py);
      }
      targetCtx.closePath();
      if (fillStyle) {
        targetCtx.fillStyle = fillStyle;
        targetCtx.fill();
      }
      if (strokeStyle) {
        targetCtx.strokeStyle = strokeStyle;
        targetCtx.lineWidth = lineW;
        targetCtx.stroke();
      }
    };

    const spacingX = 256;
    const spacingY = 220;
    for (let row = 0; row <= 5; row++) {
      for (let col = 0; col <= 8; col++) {
        const cx = col * spacingX + (row % 2 === 1 ? spacingX / 2 : 0);
        const cy = row * spacingY;
        const isPentagon = (row + col) % 2 === 0;

        if (isPentagon) {
          // Deep Carbon Black / Crimson Gold-rimmed Pentagon
          drawPolygon(ctx, cx, cy, 74, 5, "#111827", "#f5c542", 8);
          drawPolygon(ctx, cx, cy, 56, 5, "#991b1b", null, 0);
          drawPolygon(bCtx, cx, cy, 76, 5, null, "#1f2937", 14);
        } else {
          // White Hexagon with thermally bonded seam grooves
          drawPolygon(ctx, cx, cy, 82, 6, null, "#64748b", 6);
          drawPolygon(ctx, cx, cy, 64, 6, null, "rgba(66,133,244,0.35)", 4);
          drawPolygon(bCtx, cx, cy, 82, 6, null, "#111827", 12);
        }
      }
    }

    const ballTex = new THREE.CanvasTexture(bCanvas);
    ballTex.anisotropy = this.maxAnisotropy;
    const ballBump = new THREE.CanvasTexture(bumpCanvas);
    ballBump.anisotropy = this.maxAnisotropy;

    // 5x High-Poly Sphere (128x128 segments)
    const ballGeo = new THREE.SphereGeometry(0.22, 128, 128);
    const ballMat = new THREE.MeshStandardMaterial({
      map: ballTex,
      bumpMap: ballBump,
      bumpScale: 0.014,
      roughness: 0.24,
      metalness: 0.08
    });
    this.ball = new THREE.Mesh(ballGeo, ballMat);
    this.ball.castShadow = true;
    this.ball.receiveShadow = true;
    this.ball.position.set(0, 0.22, 11.0);
    this.scene.add(this.ball);

    // 18 High-Smoothness Flight Trail Spheres
    for (let i = 0; i < 18; i++) {
      const tMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.17 * (1 - i / 20), 24, 24),
        new THREE.MeshBasicMaterial({
          color: i < 6 ? 0xf5c542 : 0x4285f4,
          transparent: true,
          opacity: 0
        })
      );
      this.scene.add(tMesh);
      this.ballTrailMeshes.push(tMesh);
    }
  },

  /* --------------------------------------------------------------------------
     3D HIGH-POLY ARTICULATED GOALKEEPER
     -------------------------------------------------------------------------- */
  buildGoalkeeper() {
    const gk = new THREE.Group();
    const kitMat = new THREE.MeshStandardMaterial({ color: 0xbef264, roughness: 0.5 });
    const shortsMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd99b72, roughness: 0.45 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35 });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.68, 36), kitMat);
    torso.scale.set(1.12, 1, 0.68);
    torso.position.y = 1.24;
    torso.castShadow = true;
    gk.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 48, 48), skinMat);
    head.position.y = 1.76;
    head.castShadow = true;
    gk.add(head);

    const buildKeeperArm = (isLeft) => {
      const armGroup = new THREE.Group();
      armGroup.position.set(isLeft ? -0.32 : 0.32, 1.52, 0);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.055, 0.58, 32), kitMat);
      arm.position.y = -0.26;
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.095, 32, 32), gloveMat);
      glove.scale.set(0.9, 1.2, 0.65);
      glove.position.y = -0.58;
      armGroup.add(arm, glove);
      armGroup.rotation.z = isLeft ? -0.55 : 0.55;
      return armGroup;
    };

    const leftArmGroup = buildKeeperArm(true);
    const rightArmGroup = buildKeeperArm(false);
    gk.add(leftArmGroup, rightArmGroup);

    [-0.14, 0.14].forEach((xOff) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.065, 0.88, 32), shortsMat);
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
     CẢI TIẾN 1B: NHÂN VẬT CR7 5X HIGH-POLY & 2048PX TEXTURE/BUMP MAPS
     - LatheGeometry 72x48 cho Lưng chữ V, Cơ bắp đùi, Bắp chân săn chắc
     - Bàn tay có đủ 5 ngón tay, Giày Mercurial có đinh tán 3D
     - Khuôn mặt có sống mũi, xương hàm, chân mày, tai & tóc Fade CR7
     -------------------------------------------------------------------------- */
  createJerseyBackTexture(playerName) {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext("2d");

    // Rich Portugal Crimson Jersey Fabric Base (2048x2048 Ultra-HD)
    const fabricGrad = ctx.createLinearGradient(0, 0, 0, 2048);
    fabricGrad.addColorStop(0, "#be1120");
    fabricGrad.addColorStop(0.45, "#a30c18");
    fabricGrad.addColorStop(1, "#820812");
    ctx.fillStyle = fabricGrad;
    ctx.fillRect(0, 0, 2048, 2048);

    // Subtle anatomical muscle shading on upper back (trapezius & latissimus dorsi contour)
    const muscleShadow = ctx.createRadialGradient(1024, 650, 120, 1024, 650, 920);
    muscleShadow.addColorStop(0, "rgba(255, 255, 255, 0.07)");
    muscleShadow.addColorStop(0.6, "rgba(0, 0, 0, 0.0)");
    muscleShadow.addColorStop(1, "rgba(0, 0, 0, 0.28)");
    ctx.fillStyle = muscleShadow;
    ctx.fillRect(0, 0, 2048, 2048);

    // Realistic horizontal & vertical jersey tension folds (matching photo!)
    for (let y = 1100; y < 1900; y += 140) {
      const foldGrad = ctx.createLinearGradient(300, y - 35, 1748, y + 35);
      foldGrad.addColorStop(0, "rgba(0,0,0,0)");
      foldGrad.addColorStop(0.5, "rgba(0,0,0,0.16)");
      foldGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = foldGrad;
      ctx.fillRect(250, y - 30, 1548, 60);
    }

    // Fine micro-mesh fabric weave
    ctx.fillStyle = "rgba(0, 0, 0, 0.09)";
    for (let y = 0; y < 2048; y += 8) {
      ctx.fillRect(0, y, 2048, 3);
    }

    // Deep Forest Green Collar & Vertical Spine Tape at Top Neck
    ctx.fillStyle = "#075931";
    ctx.fillRect(0, 0, 2048, 72);
    ctx.fillRect(988, 0, 72, 265);

    // Metallic Gold Gradient for Name & Number 7
    const goldGrad = ctx.createLinearGradient(500, 280, 1560, 1640);
    goldGrad.addColorStop(0, "#FFF1B8");
    goldGrad.addColorStop(0.3, "#E7B941");
    goldGrad.addColorStop(0.65, "#C48E20");
    goldGrad.addColorStop(1, "#FCE694");

    const displayName = (playerName || "RONALDO").toUpperCase();
    ctx.save();
    ctx.fillStyle = goldGrad;
    ctx.shadowColor = "rgba(0, 0, 0, 0.62)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    const fontSize = displayName.length > 10 ? 150 : 196;
    ctx.font = `900 ${fontSize}px 'Montserrat', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(displayName, 1024, 475);

    // Iconic Angular Portugal '7' in 2048px Crisp Vector Resolution
    ctx.beginPath();
    ctx.moveTo(710, 590);
    ctx.lineTo(1360, 590);
    ctx.lineTo(1324, 756);
    ctx.lineTo(970, 1580);
    ctx.lineTo(790, 1580);
    ctx.lineTo(1136, 750);
    ctx.lineTo(710, 750);
    ctx.closePath();
    ctx.fill();

    // Inner inline groove inside the '7'
    ctx.strokeStyle = "rgba(128, 10, 20, 0.72)";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(770, 670);
    ctx.lineTo(1250, 670);
    ctx.lineTo(890, 1520);
    ctx.stroke();
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = this.maxAnisotropy;
    tex.needsUpdate = true;
    return tex;
  },

  createFabricBumpTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? "#969696" : "#6a6a6a";
      ctx.fillRect(0, y, 512, 2);
    }
    for (let i = 0; i < 12; i++) {
      const y = i * 42;
      const grad = ctx.createLinearGradient(0, y, 0, y + 24);
      grad.addColorStop(0, "#707070");
      grad.addColorStop(0.5, "#a8a8a8");
      grad.addColorStop(1, "#707070");
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, 512, 24);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  },

  updateJerseyName(newName) {
    if (!this.jerseyBackMat) return;
    const newTex = this.createJerseyBackTexture(newName);
    this.jerseyBackMat.map = newTex;
    this.jerseyBackMat.needsUpdate = true;
  },

  buildHighPolyCR7Character() {
    const cr7 = new THREE.Group();
    const fabricBump = this.createFabricBumpTexture();

    // High-Definition Semi-Realistic PBR Materials
    const jerseyRedMat = new THREE.MeshStandardMaterial({
      color: 0xa90d19,
      bumpMap: fabricBump,
      bumpScale: 0.008,
      roughness: 0.58,
      metalness: 0.06
    });
    this.jerseyBackMat = new THREE.MeshStandardMaterial({
      map: this.createJerseyBackTexture(AppStore.state.playerName),
      bumpMap: fabricBump,
      bumpScale: 0.006,
      roughness: 0.52,
      metalness: 0.14
    });
    const collarGreenMat = new THREE.MeshStandardMaterial({
      color: 0x075931,
      roughness: 0.55
    });
    const shortsRedMat = new THREE.MeshStandardMaterial({
      color: 0x9b0b16,
      bumpMap: fabricBump,
      bumpScale: 0.009,
      roughness: 0.64,
      metalness: 0.04
    });
    const captainBlueMat = new THREE.MeshStandardMaterial({
      color: 0x1d70e8,
      roughness: 0.42
    });
    const sockGreenMat = new THREE.MeshStandardMaterial({
      color: 0x0a4f2b,
      bumpMap: fabricBump,
      bumpScale: 0.01,
      roughness: 0.68
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xc58358,
      roughness: 0.42,
      metalness: 0.05
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x15110f,
      roughness: 0.76
    });
    const bootWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.22,
      metalness: 0.25
    });
    const goldAccentMat = new THREE.MeshStandardMaterial({
      color: 0xf5c542,
      roughness: 0.25,
      metalness: 0.78
    });

    // Root Pelvis / Hip Pivot (+20% leg length -> pelvis elevated from 0.96m to 1.15m)
    const pelvis = new THREE.Group();
    pelvis.position.set(0, 1.15, 0);
    cr7.add(pelvis);

    // Upper Torso / Spine Pivot
    const spine = new THREE.Group();
    pelvis.add(spine);

    // 1. 5x HIGH-POLY ANATOMICAL V-TAPER TORSO (LatheGeometry 72 radial segments x 40 rings)
    const torsoPoints = [];
    const rings = 40;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings; // 0 (waist) -> 1 (shoulders/neck base)
      const y = t * 0.64;
      // Anatomical V-shape profile: narrow waist (0.175) flaring out to muscular lats/chest (0.255) then rounding into traps
      let r = 0.178 + Math.pow(t, 0.85) * 0.078;
      if (t > 0.88) {
        r -= (t - 0.88) * 0.45;
      }
      // Subtle jersey hem flare at very bottom
      if (t < 0.12) {
        r += (0.12 - t) * 0.08;
      }
      torsoPoints.push(new THREE.Vector2(r, y));
    }
    const torsoGeo = new THREE.LatheGeometry(torsoPoints, 72);
    const torsoMesh = new THREE.Mesh(torsoGeo, jerseyRedMat);
    torsoMesh.scale.set(1.18, 1.0, 0.68);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    spine.add(torsoMesh);

    // Green Collar Ring at Top of Jersey
    const collarMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.095, 0.018, 24, 48),
      collarGreenMat
    );
    collarMesh.rotation.x = Math.PI / 2 + 0.08;
    collarMesh.scale.set(1.15, 0.95, 1);
    collarMesh.position.set(0, 0.63, 0);
    spine.add(collarMesh);

    // High-Poly Curved Back Jersey Panel (48x48 grid) with 2048px Gold #7 Texture
    const backPanelGeo = new THREE.PlaneGeometry(0.45, 0.57, 48, 48);
    const posAttr = backPanelGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      // Conform smoothly to the V-taper back and shoulder blades
      const latCurve = Math.cos(vx * 3.4) * 0.032;
      const spineGroove = -Math.exp(-Math.pow(vx * 18, 2)) * 0.008;
      const verticalContour = Math.sin((vy + 0.28) * Math.PI) * 0.014;
      posAttr.setZ(i, latCurve + spineGroove + verticalContour);
    }
    backPanelGeo.computeVertexNormals();
    const backPanel = new THREE.Mesh(backPanelGeo, this.jerseyBackMat);
    backPanel.position.set(0, 0.34, 0.146);
    spine.add(backPanel);

    // Sculpted Pelvis / Hip Shorts Block (64 radial segments)
    const shortsBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.195, 0.215, 0.24, 64, 16),
      shortsRedMat
    );
    shortsBase.scale.set(1.14, 1, 0.76);
    shortsBase.position.set(0, 0.01, 0);
    shortsBase.castShadow = true;
    pelvis.add(shortsBase);

    // 2. HIGH-POLY SCULPTED NECK & REALISTIC CR7 HEAD (96x96 Sphere + Jawline + Brow + Nose + Fade Hair)
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.086, 0.15, 64, 16),
      skinMat
    );
    neck.position.set(0, 0.70, 0);
    neck.castShadow = true;
    spine.add(neck);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.84, 0);
    spine.add(headGroup);

    // Sculpted Cranium & Jawline (96x96 segments with vertex sculpting)
    const headGeo = new THREE.SphereGeometry(0.126, 96, 96);
    const hPos = headGeo.attributes.position;
    for (let i = 0; i < hPos.count; i++) {
      let x = hPos.getX(i);
      let y = hPos.getY(i);
      let z = hPos.getZ(i);
      // Taper lower jaw & chin
      if (y < 0) {
        const jawFactor = 1 - Math.abs(y) * 1.15;
        x *= Math.max(0.68, jawFactor);
      }
      // Flatten temples slightly
      x *= 0.91;
      y *= 1.14;
      hPos.setXYZ(i, x, y, z);
    }
    headGeo.computeVertexNormals();
    const skull = new THREE.Mesh(headGeo, skinMat);
    skull.castShadow = true;
    headGroup.add(skull);

    // Nose Bridge & Brow Ridge (Facing toward goal: -Z)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.055, 24), skinMat);
    nose.rotation.x = -Math.PI / 2 + 0.2;
    nose.position.set(0, 0.0, -0.125);
    headGroup.add(nose);

    // CR7 Textured Short Fade Haircut (High-poly crown + tapered nape fade)
    const hairCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.129, 80, 80, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hairMat
    );
    hairCrown.scale.set(0.92, 1.15, 1.01);
    hairCrown.rotation.x = -0.16;
    hairCrown.position.y = 0.012;
    headGroup.add(hairCrown);

    // Sculpted Ears
    [-0.114, 0.114].forEach((earX) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.027, 32, 32), skinMat);
      ear.scale.set(0.48, 1.15, 0.72);
      ear.position.set(earX, -0.005, 0);
      headGroup.add(ear);
    });

    // 3. 5X HIGH-POLY ARMS + CAPTAIN ARMBAND + ARTICULATED 5-FINGER HANDS
    const buildHighPolyArm = (isLeft) => {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(isLeft ? -0.305 : 0.305, 0.58, 0);

      // High-poly Deltoid Shoulder Cap
      const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.086, 48, 48), jerseyRedMat);
      deltoid.scale.set(1.05, 1.12, 0.95);
      deltoid.castShadow = true;
      shoulderPivot.add(deltoid);

      // Anatomical Bicep/Tricep Lathe (64 segments)
      const upperArmPts = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const r = 0.056 + Math.sin(t * Math.PI) * 0.015 + (1 - t) * 0.008;
        upperArmPts.push(new THREE.Vector2(r, -t * 0.30));
      }
      const upperArm = new THREE.Mesh(new THREE.LatheGeometry(upperArmPts, 64), jerseyRedMat);
      upperArm.castShadow = true;
      shoulderPivot.add(upperArm);

      // Blue Captain's Armband on Left Arm (exact reference photo detail!)
      if (isLeft) {
        const armband = new THREE.Mesh(
          new THREE.CylinderGeometry(0.073, 0.069, 0.088, 64),
          captainBlueMat
        );
        armband.position.y = -0.175;
        shoulderPivot.add(armband);
      } else {
        const patch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.071, 0.068, 0.055, 48, 1, false, -0.4, 0.8),
          bootWhiteMat
        );
        patch.position.y = -0.155;
        shoulderPivot.add(patch);
      }

      // Elbow Joint & Sculpted Forearm Sleeve
      const elbowPivot = new THREE.Group();
      elbowPivot.position.y = -0.30;
      shoulderPivot.add(elbowPivot);

      const forearmPts = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const r = 0.040 + Math.sin((1 - t) * Math.PI * 0.7) * 0.018;
        forearmPts.push(new THREE.Vector2(r, -t * 0.25));
      }
      const forearm = new THREE.Mesh(new THREE.LatheGeometry(forearmPts, 64), jerseyRedMat);
      forearm.castShadow = true;
      elbowPivot.add(forearm);

      // White Wrist Tape
      const wristTape = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.040, 0.032, 48),
        bootWhiteMat
      );
      wristTape.position.y = -0.255;
      elbowPivot.add(wristTape);

      // Sculpted Hand with 5 Individual Fingers (Tensed CR7 Free-Kick Pose)
      const handGroup = new THREE.Group();
      handGroup.position.y = -0.295;
      elbowPivot.add(handGroup);

      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.042, 36, 36), skinMat);
      palm.scale.set(0.72, 1.15, 0.92);
      handGroup.add(palm);

      // 4 Fingers slightly curled inward + 1 Thumb
      for (let f = 0; f < 4; f++) {
        const zOff = (f - 1.5) * 0.016;
        const finger = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0085, 0.007, 0.048, 18),
          skinMat
        );
        finger.position.set(isLeft ? 0.012 : -0.012, -0.042, zOff);
        finger.rotation.z = isLeft ? 0.35 : -0.35;
        handGroup.add(finger);
      }
      const thumb = new THREE.Mesh(
        new THREE.CylinderGeometry(0.010, 0.008, 0.042, 18),
        skinMat
      );
      thumb.position.set(isLeft ? 0.022 : -0.022, -0.02, -0.032);
      thumb.rotation.x = 0.45;
      handGroup.add(thumb);

      return { shoulderPivot, elbowPivot, handGroup };
    };

    const leftArm = buildHighPolyArm(true);
    const rightArm = buildHighPolyArm(false);
    spine.add(leftArm.shoulderPivot, rightArm.shoulderPivot);

    // 4. CẢI TIẾN 3: ĐÔI CHÂN DÀI HƠN 20%, ĐÙI TO THON DÀI DẦN XUỐNG CỔ CHÂN & GIÀY ĐÁ BÓNG MŨI NHỌN THẬT NGOÀI ĐỜI
    const buildHighPolyLeg = (isLeft) => {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(isLeft ? -0.145 : 0.145, 0, 0);

      // 4A. Ống quần đùi đỏ ôm phần gốc đùi to vạm vỡ (LatheGeometry 72 segments, y: 0 -> -0.34)
      const shortPts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        // Phần hông/đùi trên nở to (0.130) và thuôn gọn tự nhiên xuống gấu quần (0.112)
        const r = 0.130 - t * 0.018 + Math.sin(t * Math.PI) * 0.005;
        shortPts.push(new THREE.Vector2(r, -t * 0.34));
      }
      const shortLeg = new THREE.Mesh(new THREE.LatheGeometry(shortPts, 72), shortsRedMat);
      shortLeg.scale.set(1.04, 1.0, 1.08);
      shortLeg.castShadow = true;
      hipPivot.add(shortLeg);

      // 4B. Đùi cơ bắp (Quadriceps) to ở trên nhưng THON DÀI DẦN mượt mà xuống đầu gối (y: -0.28 -> -0.52)
      const quadPts = [];
      for (let i = 0; i <= 28; i++) {
        const t = i / 28; // 0 (dưới quần đùi) -> 1 (khớp gối)
        // Cơ đùi trên to khỏe (0.105), nổi nhẹ cơ giọt lệ vastus medialis ở giữa đùi rồi thon gọn dần xuống gối (0.060)
        const vastusBulge = Math.sin(Math.pow(t, 0.85) * Math.PI) * 0.012;
        const r = 0.105 * (1 - t * 0.43) + vastusBulge;
        quadPts.push(new THREE.Vector2(r, -0.28 - t * 0.24));
      }
      const quadMesh = new THREE.Mesh(new THREE.LatheGeometry(quadPts, 72), skinMat);
      quadMesh.scale.set(1.02, 1.0, 1.06);
      quadMesh.castShadow = true;
      hipPivot.add(quadMesh);

      // Xương bánh chè (Patella) thon gọn ăn khớp với đầu gối
      const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.059, 48, 48), skinMat);
      kneeCap.scale.set(0.92, 1.08, 0.90);
      kneeCap.position.set(0, -0.515, -0.008);
      kneeCap.castShadow = true;
      hipPivot.add(kneeCap);

      // Khớp Gối (Knee Pivot hạ xuống -0.52m để tăng chiều dài đùi +20%)
      const kneePivot = new THREE.Group();
      kneePivot.position.y = -0.52;
      hipPivot.add(kneePivot);

      // 4C. Bắp chân (Calf) dài thanh thoát, cơ bắp chuối cao và THON NHỎ DẦN xuống cổ chân (y: 0 -> -0.50)
      const calfPts = [];
      for (let i = 0; i <= 32; i++) {
        const t = i / 32; // 0 (dưới gối) -> 1 (cổ chân)
        // Bắp chuối (gastrocnemius) nở ở 1/3 trên (t ~ 0.26) rồi vuốt thon dài xuống gân Achilles & mắt cá (r = 0.036)
        const gastroBulge = Math.sin(Math.pow(t, 0.65) * Math.PI) * 0.024 * (1 - t * 0.45);
        const baseRadius = 0.060 * (1 - t * 0.40) + gastroBulge;
        calfPts.push(new THREE.Vector2(baseRadius, -t * 0.50));
      }
      const calfSock = new THREE.Mesh(new THREE.LatheGeometry(calfPts, 72), sockGreenMat);
      calfSock.scale.set(0.98, 1.0, 1.05);
      calfSock.castShadow = true;
      kneePivot.add(calfSock);

      // Băng quấn cổ chân trắng (Ankle Tape) ôm sát cổ chân thon gọn (y: -0.45 -> -0.54)
      const tapePts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const r = 0.041 * (1 - t * 0.12);
        tapePts.push(new THREE.Vector2(r, -0.45 - t * 0.09));
      }
      const ankleCuff = new THREE.Mesh(new THREE.LatheGeometry(tapePts, 64), bootWhiteMat);
      ankleCuff.castShadow = true;
      kneePivot.add(ankleCuff);

      // 4D. Khớp Cổ Chân (Ankle Pivot tại y = -0.54m) giúp khóa cứng cổ chân (Plantar Flexion) khi sút Knuckleball!
      const anklePivot = new THREE.Group();
      anklePivot.position.set(0, -0.54, 0);
      kneePivot.add(anklePivot);

      // 4E. ĐÔI GIÀY ĐÁ BÓNG MŨI NHỌN THẬT NGOÀI ĐỜI (Sculpted Pointed Nike Mercurial Vapor/Superfly Last)
      const bootGroup = new THREE.Group();
      bootGroup.position.set(0, -0.025, 0);
      anklePivot.add(bootGroup);

      // Thân giày 3D vuốt nhọn khí động học về phía mũi giày (64x48 vertex-sculpted aerodynamic boot last)
      const bootUpperGeo = new THREE.SphereGeometry(1.0, 64, 48);
      const bPos = bootUpperGeo.attributes.position;
      for (let i = 0; i < bPos.count; i++) {
        const nx = bPos.getX(i); // -1..1
        const ny = bPos.getY(i); // -1..1
        const nz = bPos.getZ(i); // -1 (mũi giày) .. +1 (gót giày)

        // u = 0 tại gót giày (z = +0.085), u = 1 tại mũi giày nhọn (z = -0.225) -> tổng chiều dài giày 0.31m
        const u = (1 - nz) * 0.5;
        const z = 0.085 - u * 0.310;

        // Độ rộng ngang (Width): Gót ôm gọn (0.038), nở nhẹ ở mu bàn chân (0.048), sau đó VUỐT NHỌN SẮC NÉT về mũi giày (0.007)
        let halfW;
        if (u < 0.55) {
          halfW = 0.037 + Math.sin((u / 0.55) * Math.PI * 0.65) * 0.012;
        } else {
          const tipT = (u - 0.55) / 0.45; // 0 -> 1 về phía mũi nhọn
          halfW = 0.049 * Math.pow(1 - tipT, 1.15) + 0.006;
        }
        // Độ cong bất đối xứng tự nhiên giữa má trong và má ngoài bàn chân
        const archShiftX = (isLeft ? -1 : 1) * Math.sin(u * Math.PI) * 0.005;
        const x = nx * halfW + archShiftX;

        // Độ cao (Height): Đế phẳng bên dưới (-0.032), mu giày vồng cao ở cổ chân rồi vuốt thấp nhọn xuống mũi giày
        let y;
        const toeSpring = u > 0.72 ? Math.pow((u - 0.72) / 0.28, 1.6) * 0.010 : 0;
        if (ny < 0) {
          y = ny * 0.032 + toeSpring;
        } else {
          let topH;
          if (u < 0.28) {
            topH = 0.046; // Cổ giày ôm mắt cá
          } else {
            const vampT = (u - 0.28) / 0.72;
            topH = 0.046 * Math.pow(1 - vampT, 0.92) + 0.008; // Vuốt mỏng nhọn xuống mũi giày
          }
          y = ny * topH + toeSpring;
        }

        bPos.setXYZ(i, x, y, z);
      }
      bootUpperGeo.computeVertexNormals();
      const bootUpper = new THREE.Mesh(bootUpperGeo, bootWhiteMat);
      bootUpper.castShadow = true;
      bootUpper.receiveShadow = true;
      bootGroup.add(bootUpper);

      // Cổ giày thun Dynamic Fit Collar ôm sát cổ chân
      const bootCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.042, 0.038, 48),
        bootWhiteMat
      );
      bootCollar.position.set(0, 0.032, 0.015);
      bootCollar.rotation.x = 0.12;
      bootGroup.add(bootCollar);

      // Gót giày bọc khung Carbon Vàng Kim Loại (Metallic Gold Heel Counter)
      const heelCup = new THREE.Mesh(
        new THREE.SphereGeometry(0.039, 36, 36, 0, Math.PI * 2, 0, Math.PI * 0.65),
        goldAccentMat
      );
      heelCup.rotation.x = Math.PI / 2;
      heelCup.scale.set(0.96, 0.85, 0.82);
      heelCup.position.set(0, -0.002, 0.062);
      bootGroup.add(heelCup);

      // Đường vạch khí động học Vàng Kim Loại chạy dọc 2 bên má giày vuốt nhọn về phía mũi
      [-1, 1].forEach((side) => {
        const stripeGeo = new THREE.ConeGeometry(0.012, 0.19, 16);
        stripeGeo.rotateX(-Math.PI / 2);
        const stripe = new THREE.Mesh(stripeGeo, goldAccentMat);
        stripe.scale.set(0.28, 0.75, 1.0);
        stripe.position.set(side * 0.039, -0.004, -0.045);
        stripe.rotation.y = side * -0.11;
        bootGroup.add(stripe);
      });

      // Hệ thống 9 đinh tán mũi tên (Bladed Chevron Cleats) dưới đế giày bóng đá chuyên nghiệp
      const studMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.25, metalness: 0.5 });
      const studCoords = [
        [-0.024, 0.055], [0.024, 0.055],   // 2 đinh gót (Heel studs)
        [-0.030, -0.045], [0.030, -0.045], // 2 đinh bàn chân sau
        [-0.032, -0.105], [0.032, -0.105], // 2 đinh bàn chân giữa
        [-0.022, -0.155], [0.022, -0.155], // 2 đinh mũi thu hẹp theo dáng mũi nhọn
        [0.0, -0.190]                      // 1 đinh mũi nhọn trung tâm (Toe-off traction blade)
      ];
      studCoords.forEach(([sx, sz]) => {
        const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0035, 0.022, 12), studMat);
        stud.position.set(sx, -0.034, sz);
        bootGroup.add(stud);
      });

      return { hipPivot, kneePivot, anklePivot, bootGroup };
    };

    const leftLeg = buildHighPolyLeg(true);
    const rightLeg = buildHighPolyLeg(false);
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
     CẢI TIẾN 4: MÔ PHỎNG VẬT LÝ & SINH CƠ HỌC (BIOMECHANICS) CÚ SÚT KNUCKLEBALL CỦA CR7
     1. Tư thế chuẩn bị: Đứng chữ A rộng chân -> Hít sâu nâng 2 vai căng lồng ngực -> Thở ra hạ vai gồng khóa cơ bụng (Core Bracing).
     2. Bước thu chân & Xoay góc 40 độ (STEP_CLOSE): Hạ trọng tâm, thu chân phải lấy nhịp, xoay hông mở góc chạy đà ~40 độ, mắt khóa chặt vào van bóng.
     3. Chạy lấy đà + Bước nhảy đệm "Vault Step" + Đặt chân trụ & Kéo chân sút xa ra sau (RUNUP):
        - 3 bước chạy đà gia tốc góc 40 độ.
        - Bước áp chót (Penultimate "Vault Step"): Bật nảy trên mũi chân phải phóng trọng tâm lên cao & về trước.
        - Đặt chân trụ (Plant Foot Slam): Chân trái cắm mạnh sát bên trái quả bóng, gối khuỵu làm trụ nén lò xo, ngực và vai đổ đè lên trên bóng, tay trái vung cao ngang vai làm đối trọng.
        - Kéo căng chân sút (Extreme Hip-Extension Backswing): Cơ mông & đùi sau kéo đùi phải vươn cực xa ra phía sau lưng (75°), gối phải gập sâu đưa gót giày sát mông, cổ chân phải khóa cứng duỗi thẳng mũi giày nhọn xuống dưới (Rigid Plantar Flexion).
     4. Quất chân Knuckleball & Nhảy thu chân trụ (KICK): Quất đùi và cẳng chân như roi da đập mu bàn chân khóa cứng xuyên tâm bóng (0 xoáy), lực quán tính nhấc bổng cả chân trụ lên khỏi mặt cỏ (Scissor Hop).
     -------------------------------------------------------------------------- */
  applySignatureStance(timeSec) {
    if (!this.cr7) return;
    const { pelvis, spine, headGroup, leftArm, rightArm, leftLeg, rightLeg } = this.cr7.userData;

    this.cr7.position.set(-0.88, 0, 13.55);
    this.cr7.rotation.y = -0.22;

    // 3.2-second realistic breathing + shoulder shrug ritual cycle
    const cycle = timeSec % 3.2;
    let shrug = 0;
    let chestExpand = 0;

    if (cycle > 0.7 && cycle < 2.2) {
      // Deep inhale & dramatic CR7 shoulder raise, then sharp exhale drop
      const t = (cycle - 0.7) / 1.5; // 0..1
      shrug = Math.sin(t * Math.PI); // Smooth rise and fall of shoulders
      chestExpand = Math.sin(t * Math.PI) * 0.038;
    } else {
      chestExpand = Math.sin(timeSec * 2.5) * 0.012;
    }

    pelvis.position.set(0, 1.135, 0);
    pelvis.rotation.set(0, 0, 0);

    spine.rotation.set(0.045 - shrug * 0.03, 0, 0);
    spine.scale.set(1 + chestExpand, 1 + shrug * 0.015, 1 + chestExpand * 1.3);
    headGroup.rotation.set(-0.04 - shrug * 0.04, 0.16, 0);

    // Elevate shoulders during the deep breath shrug
    leftArm.shoulderPivot.position.y = 0.58 + shrug * 0.036;
    rightArm.shoulderPivot.position.y = 0.58 + shrug * 0.036;

    // WIDE-LEGGED A-STANCE (Chân dài +20% đứng chữ A thương hiệu)
    leftLeg.hipPivot.rotation.set(0.03, 0.08, -0.24);
    rightLeg.hipPivot.rotation.set(0.03, -0.08, 0.24);
    leftLeg.kneePivot.rotation.set(0.03, 0, 0);
    rightLeg.kneePivot.rotation.set(0.03, 0, 0);
    leftLeg.anklePivot.rotation.set(-0.03, 0, 0);
    rightLeg.anklePivot.rotation.set(-0.03, 0, 0);

    // Tensed straight arms angled out from hips
    leftArm.shoulderPivot.rotation.set(0.05, 0, -0.25 - shrug * 0.05);
    rightArm.shoulderPivot.rotation.set(0.05, 0, 0.25 + shrug * 0.05);
    leftArm.elbowPivot.rotation.set(-0.09, 0, 0);
    rightArm.elbowPivot.rotation.set(-0.09, 0, 0);
  },

  updateDetailedCR7Sequence(animDt) {
    const { pelvis, spine, headGroup, leftArm, rightArm, leftLeg, rightLeg } = this.cr7.userData;

    if (this.phase === "STEP_CLOSE") {
      // Giai đoạn 1 (0.46s ở tốc độ Slow-Mo 0.5x = 0.92s thực tế):
      // Thở ra khóa cơ bụng, hạ thấp trọng tâm, thu chân phải vào lấy nhịp & mở góc chạy đà 40 độ
      const duration = 0.46;
      const p = Math.min(1, this.phaseTimer / duration);
      const ease = p * p * (3 - 2 * p);

      this.cr7.rotation.y = -0.22 - ease * 0.14; // Xoay góc lấy đà ~38-40 độ đặc trưng của CR7
      const stanceSpread = 0.24 * (1 - ease * 0.85);

      leftLeg.hipPivot.rotation.set(0.08 + ease * 0.16, 0.05, -stanceSpread);
      rightLeg.hipPivot.rotation.set(-0.18 * ease, -0.05, stanceSpread);
      leftLeg.kneePivot.rotation.x = 0.04 + ease * 0.24;
      rightLeg.kneePivot.rotation.x = 0.04 + ease * 0.34;
      leftLeg.anklePivot.rotation.x = -0.08 * ease;
      rightLeg.anklePivot.rotation.x = 0.18 * ease; // Nhón nhẹ mũi chân phải chuẩn bị bứt tốc

      pelvis.position.y = 1.135 - ease * 0.065;
      pelvis.rotation.y = -0.12 * ease;
      spine.rotation.set(0.05 + ease * 0.20, 0.08 * ease, 0);
      headGroup.rotation.set(0.18 * ease, 0.18, 0); // Mắt khóa chặt vào tâm quả bóng

      leftArm.shoulderPivot.position.y = 0.58;
      rightArm.shoulderPivot.position.y = 0.58;
      leftArm.shoulderPivot.rotation.set(0.32 * ease, 0, -0.20);
      rightArm.shoulderPivot.rotation.set(-0.32 * ease, 0, 0.20);
      leftArm.elbowPivot.rotation.x = -0.78 * ease;
      rightArm.elbowPivot.rotation.x = -0.78 * ease;

      if (p >= 1) {
        this.phase = "RUNUP";
        this.phaseTimer = 0;
      }
    } else if (this.phase === "RUNUP") {
      // Giai đoạn 2 (1.04s ở tốc độ Slow-Mo 0.5x = 2.08s thực tế):
      // Chuỗi chạy lấy đà 3 bước + Bước nhảy đệm "Vault Step" + Cắm chân trụ sát bóng + Kéo căng chân sút tối đa ra sau lưng
      const duration = 1.04;
      const p = Math.min(1, this.phaseTimer / duration);
      const ease = p * p * (3 - 2 * p);

      // CẢI TIẾN 1: Kích hoạt 3-sut.mp3 chính xác TRƯỚC 0.5 GIÂY THỰC TẾ so với thời điểm chân chạm bóng!
      // Vì RUNUP đang chạy ở Slow-Mo (preKickTimeScale = 0.5), thời gian thực còn lại tới lúc chạm bóng (p=1) là:
      const remainingRealSec = (duration - this.phaseTimer) / this.preKickTimeScale;
      if (!this.sutAudioFired && remainingRealSec <= 0.50) {
        this.sutAudioFired = true;
        StadiumAudio.playBallStrike();
      }

      // Quỹ đạo chạy đà góc ~38 độ từ (-0.88, 13.55) lao về đặt chân trụ trái sát bên trái quả bóng (-0.26, 11.02)
      const curveArc = Math.sin(p * Math.PI) * -0.22;
      this.cr7.position.x = -0.88 + ease * 0.62 + curveArc;
      this.cr7.position.z = 13.55 - ease * 2.53;
      this.cr7.rotation.y = -0.36 * (1 - Math.pow(p, 1.5));

      if (p < 0.54) {
        // PHẦN 2A (0.00 -> 0.54): 3 bước chạy lấy đà gia tốc mạnh mẽ
        const runP = p / 0.54;
        const stride = Math.sin(runP * Math.PI * 3.0);

        pelvis.position.y = 1.07 + Math.abs(stride) * 0.065;
        pelvis.rotation.y = -stride * 0.18;
        spine.rotation.set(0.26, stride * 0.16, 0);
        headGroup.rotation.set(0.22, 0.10 * (1 - runP), 0);

        leftLeg.hipPivot.rotation.set(stride * 0.85, 0, -0.05);
        rightLeg.hipPivot.rotation.set(-stride * 0.85, 0, 0.05);
        leftLeg.kneePivot.rotation.x = Math.max(0.08, -stride * 1.05);
        rightLeg.kneePivot.rotation.x = Math.max(0.08, stride * 1.05);
        leftLeg.anklePivot.rotation.x = stride * 0.25;
        rightLeg.anklePivot.rotation.x = -stride * 0.25;

        leftArm.shoulderPivot.rotation.set(-stride * 0.72, 0, -0.24);
        rightArm.shoulderPivot.rotation.set(stride * 0.72, 0, 0.24);
        leftArm.elbowPivot.rotation.x = -0.85;
        rightArm.elbowPivot.rotation.x = -0.85;
      } else if (p < 0.74) {
        // PHẦN 2B (0.54 -> 0.74): BƯỚC NHẢY ĐỆM ÁP CHÓT ("THE VAULT STEP")
        // Chân phải đạp bật trên mũi giày nhọn, phóng trọng tâm lên cao, chân trái vươn dài ra trước chuẩn bị cắm trụ, tay trái mở rộng lên cao!
        const vaultP = (p - 0.54) / 0.20;
        const vaultArc = Math.sin(vaultP * Math.PI);

        pelvis.position.y = 1.08 + vaultArc * 0.095; // Bật vọt trọng tâm lên không trung trước khi cắm trụ
        pelvis.rotation.y = -0.15 - vaultP * 0.18;   // Xoay mở hông phải ra sau để nạp lực
        spine.rotation.set(0.26 + vaultP * 0.06, 0.18 * vaultP, 0.08 * vaultP);
        headGroup.rotation.set(0.28, 0, 0); // Mắt nhìn thẳng xuống tâm bóng

        // Chân trụ trái vươn dài về phía trước hướng thẳng tới vị trí sát bên trái quả bóng
        leftLeg.hipPivot.rotation.set(-0.62 * vaultP, 0, -0.10);
        leftLeg.kneePivot.rotation.x = 0.45 * (1 - vaultP * 0.65); // Duỗi dần chân trái ra trước để bước dài cắm trụ
        leftLeg.anklePivot.rotation.x = -0.22 * vaultP; // Mũi giày trái dựng nhẹ để gót giày cắm xuống đất trước

        // Chân phải vừa đạp đất bật lên và bắt đầu kéo ngược ra phía sau
        rightLeg.hipPivot.rotation.set(0.35 + vaultP * 0.60, 0, 0.08);
        rightLeg.kneePivot.rotation.x = 0.25 + vaultP * 0.85;
        rightLeg.anklePivot.rotation.x = 0.35 * vaultP;

        // Cánh tay trái bắt đầu vung cao và mở rộng sang ngang để giữ thăng bằng quán tính
        leftArm.shoulderPivot.rotation.set(-0.35 * vaultP, 0, -0.30 - vaultP * 0.72);
        leftArm.elbowPivot.rotation.x = -0.75 + vaultP * 0.50;
        rightArm.shoulderPivot.rotation.set(0.38 * vaultP, 0, 0.28 + vaultP * 0.22);
        rightArm.elbowPivot.rotation.x = -0.65;
      } else if (p < 0.91) {
        // PHẦN 2C (0.74 -> 0.91): CẮM CHÂN TRỤ SÁT BÓNG & KÉO CHÂN SÚT CỰC XA RA PHÍA SAU LƯNG (MAX HIP EXTENSION)
        const coilP = (p - 0.74) / 0.17;
        const coilEase = Math.sin(coilP * Math.PI * 0.5);

        // Hạ trọng tâm nén lực lên đầu gối chân trụ trái
        pelvis.position.y = 1.08 - coilEase * 0.045;
        pelvis.rotation.y = -0.33 - coilEase * 0.08;
        // Ngực và vai đổ nghiêng đè sát lên trên quả bóng (Trunk Lean Over Ball + Lateral Tilt)
        spine.rotation.set(0.32 + coilEase * 0.05, 0.24 * coilEase, 0.22 * coilEase);
        headGroup.rotation.set(0.32, 0, -0.08 * coilEase);

        // Chân trụ trái cắm chặt xuống mặt cỏ ngay sát quả bóng, gối khuỵu vững chãi chịu lực
        leftLeg.hipPivot.rotation.set(-0.58 + coilEase * 0.06, 0, -0.14);
        leftLeg.kneePivot.rotation.x = 0.16 + coilEase * 0.24;
        leftLeg.anklePivot.rotation.x = -0.16;

        // CHÂN SÚT PHẢI KÉO CĂNG TỐI ĐA RA PHÍA SAU LƯNG (1.32 rad ~ 76 độ) & GẬP SÂU GỐI (1.54 rad ~ 88 độ)
        rightLeg.hipPivot.rotation.set(0.95 + coilEase * 0.37, -0.08 * coilEase, 0.10);
        rightLeg.kneePivot.rotation.x = 1.10 + coilEase * 0.44;
        // Khóa cứng cổ chân phải duỗi thẳng mũi giày nhọn (Rigid Ankle Plantar Flexion)
        rightLeg.anklePivot.rotation.x = 0.35 + coilEase * 0.32;

        // Tay trái vung cao ngang vai mở rộng hết cỡ (Classic CR7 Free-Kick Counter-Balance Silhouette)
        leftArm.shoulderPivot.rotation.set(-0.48, -0.15, -1.02 - coilEase * 0.20);
        leftArm.elbowPivot.rotation.x = -0.22;
        rightArm.shoulderPivot.rotation.set(0.45, 0, 0.52);
        rightArm.elbowPivot.rotation.x = -0.50;
      } else {
        // PHẦN 2D (0.91 -> 1.00): QUẤT ĐÙI & BUNG CẲNG CHÂN NHƯ ROI DA (PROXIMAL-TO-DISTAL WHIP) TỚI ĐIỂM CHẠM BÓNG!
        const snapP = (p - 0.91) / 0.09;
        const snapEase = snapP * snapP;

        // Hông phải xoay gập cực nhanh về phía trước truyền động lượng xuống đùi và mu bàn chân
        pelvis.position.y = 1.035 + snapEase * 0.065;
        pelvis.rotation.y = -0.41 + snapEase * 0.52;
        spine.rotation.set(0.37 - snapEase * 0.08, 0.24 * (1 - snapEase), 0.22 - snapEase * 0.06);
        headGroup.rotation.set(0.32, 0, 0);

        // Chân trụ trái đạp thẳng dần nâng hông lên
        leftLeg.hipPivot.rotation.set(-0.52 + snapEase * 0.38, 0, -0.14);
        leftLeg.kneePivot.rotation.x = 0.40 - snapEase * 0.22;
        leftLeg.anklePivot.rotation.x = -0.16 + snapEase * 0.28;

        // Chân phải quất từ phía sau (1.32) lao vút xuống chạm thẳng vào tâm quả bóng (0.08) tại p = 1.0!
        rightLeg.hipPivot.rotation.set(1.32 - snapEase * 1.24, 0, 0.10 - snapEase * 0.06);
        rightLeg.kneePivot.rotation.x = 1.54 * (1 - snapEase * 0.88);
        // Cổ chân phải KHÓA CỨNG (0.65 rad) để xương mu bàn chân đập thẳng vào tâm bóng không tạo xoáy!
        rightLeg.anklePivot.rotation.x = 0.65;

        leftArm.shoulderPivot.rotation.set(-0.48 + snapEase * 0.30, 0, -1.22 + snapEase * 0.25);
        rightArm.shoulderPivot.rotation.set(0.45 - snapEase * 0.35, 0, 0.52);
      }

      if (p >= 1) {
        this.phase = "KICK";
        this.phaseTimer = 0;
        this.launchBallPhysics();
      }
    } else if (this.phase === "KICK") {
      // Giai đoạn 3 (Tốc độ thực 1.0x): Chân sút khóa cổ chân xuyên qua tâm bóng + Bật nhảy thu chân trụ (Scissor Hop)
      const p = Math.min(1, this.phaseTimer / 0.42);
      const whip = Math.sin(p * Math.PI * 0.5);
      const hop = Math.sin(p * Math.PI) * 0.11; // Bật nhảy cả người lên khỏi mặt cỏ do lực sút cực đại

      pelvis.position.y = 1.10 + hop;
      spine.rotation.x = 0.29 - whip * 0.32;
      spine.rotation.z = 0.16 - whip * 0.24;
      pelvis.rotation.y = 0.11 + whip * 0.22;

      leftLeg.hipPivot.rotation.set(-0.14 + whip * 0.42, 0, -0.12);
      leftLeg.kneePivot.rotation.x = 0.18 + hop * 1.2;
      leftLeg.anklePivot.rotation.x = 0.25 * whip;

      // Follow-through thấp, gọn và dừng đột ngột (Abrupt Compact Follow-Through đặc trưng của Knuckleball)
      rightLeg.hipPivot.rotation.set(0.08 - whip * 0.86, 0, 0.04 - whip * 0.14);
      rightLeg.kneePivot.rotation.x = 0.18 * (1 - whip * 0.5);
      rightLeg.anklePivot.rotation.x = 0.65 - whip * 0.25;

      leftArm.shoulderPivot.rotation.set(-0.18 + whip * 0.55, 0, -0.97 + whip * 0.48);
      rightArm.shoulderPivot.rotation.set(0.10 - whip * 0.45, 0, 0.48);
    } else if (this.phase === "CELEBRATE_RUN") {
      // CẢI TIẾN 3A: Chạy dang tay ăn mừng quanh sân (sau khi camera dừng 1s ở khung thành vẫn còn trọn vẹn 3s chạy dang tay!)
      // Tổng thời gian CELEBRATE_RUN = 1.0s (trong lúc camera dừng ở khung thành) + 3.0s (chạy dang tay trên màn hình chính) = 4.0s
      const runDur = 4.0;
      const p = Math.min(1, this.phaseTimer / runDur);

      // Quỹ đạo chạy vòng cung quanh sân từ (-0.26, 11.02) lượn rộng sang phải (+2.45m), vòng lên rồi lượn về giữa sân
      const angle = p * Math.PI * 1.65;
      const prevAngle = Math.max(0, (this.phaseTimer - animDt) / runDur) * Math.PI * 1.65;
      const curX = -0.26 + Math.sin(angle) * 2.45;
      const curZ = 11.02 - Math.sin(p * Math.PI) * 2.75;
      const prevX = -0.26 + Math.sin(prevAngle) * 2.45;
      const prevZ = 11.02 - Math.sin(Math.max(0, (this.phaseTimer - animDt) / runDur) * Math.PI) * 2.75;

      this.cr7.position.x = curX;
      this.cr7.position.z = curZ;

      const dx = curX - prevX;
      const dz = curZ - prevZ;
      if (Math.hypot(dx, dz) > 0.0001) {
        this.cr7.rotation.y = Math.atan2(-dx, -dz);
      }

      // Nhịp bước chân chạy nước rút sôi động với đôi chân dài +20%
      const stride = Math.sin(this.phaseTimer * Math.PI * 8.0);
      pelvis.position.y = 1.12 + Math.abs(stride) * 0.085;
      pelvis.rotation.y = stride * 0.08;

      const bankAngle = Math.cos(angle) * -0.16;
      spine.rotation.set(0.14, 0, bankAngle);
      spine.scale.set(1.03, 1.0, 1.03);

      headGroup.rotation.set(-0.14, Math.sin(p * Math.PI * 3.0) * 0.36, 0);

      leftLeg.hipPivot.rotation.set(stride * 0.82, 0, -0.06);
      rightLeg.hipPivot.rotation.set(-stride * 0.82, 0, 0.06);
      leftLeg.kneePivot.rotation.x = Math.max(0.06, -stride * 0.95);
      rightLeg.kneePivot.rotation.x = Math.max(0.06, stride * 0.95);
      leftLeg.anklePivot.rotation.x = stride * 0.22;
      rightLeg.anklePivot.rotation.x = -stride * 0.22;

      // HAI TAY DANG RỘNG NGANG VAI NHƯ CÁNH CHIM
      const wingWave = Math.sin(this.phaseTimer * Math.PI * 4.0) * 0.08;
      leftArm.shoulderPivot.position.y = 0.59;
      rightArm.shoulderPivot.position.y = 0.59;
      leftArm.shoulderPivot.rotation.set(0.08, -0.15, -1.36 + wingWave);
      rightArm.shoulderPivot.rotation.set(0.08, 0.15, 1.36 - wingWave);
      leftArm.elbowPivot.rotation.x = -0.14;
      rightArm.elbowPivot.rotation.x = -0.14;

      if (p >= 1) {
        // Kết thúc chạy dang tay -> Chuyển ngay sang animation ăn mừng SIUUUUU & phát 5-siu.mp3
        this.phase = "CELEBRATE_SIU";
        this.phaseTimer = 0;
        StadiumAudio.playSiuCelebration();
      }
    } else if (this.phase === "CELEBRATE_SIU") {
      // CẢI TIẾN 3B & 4: Thực hiện animation ăn mừng SIUUUUU giống CR7 ngoài đời (kèm âm thanh 5-siu.mp3)
      const totalDur = 2.15;
      const p = Math.min(1, this.phaseTimer / totalDur);
      const startX = this.cr7.position.x;

      if (p < 0.16) {
        const prepP = p / 0.16;
        pelvis.position.y = 1.12 - Math.sin(prepP * Math.PI) * 0.11;
        spine.rotation.set(0.18 * (1 - prepP), 0, 0);
        leftLeg.hipPivot.rotation.set(-0.22 * prepP, 0, -0.12);
        rightLeg.hipPivot.rotation.set(0.22 * prepP, 0, 0.12);
        leftLeg.kneePivot.rotation.x = 0.35 * prepP;
        rightLeg.kneePivot.rotation.x = 0.35 * prepP;
        leftLeg.anklePivot.rotation.x = -0.15 * prepP;
        rightLeg.anklePivot.rotation.x = -0.15 * prepP;
        leftArm.shoulderPivot.rotation.set(0.35 * prepP, 0, -0.45);
        rightArm.shoulderPivot.rotation.set(0.35 * prepP, 0, 0.45);
      } else if (p < 0.54) {
        const airP = (p - 0.16) / 0.38;
        const arc = Math.sin(airP * Math.PI);
        pelvis.position.y = 1.14 + arc * 0.92;
        this.cr7.position.x = THREE.MathUtils.lerp(startX, 0.25, 0.08);
        this.cr7.rotation.y = airP * Math.PI;

        leftLeg.hipPivot.rotation.set(-0.35 * arc, 0, -0.18 - airP * 0.1);
        rightLeg.hipPivot.rotation.set(-0.35 * arc, 0, 0.18 + airP * 0.1);
        leftLeg.kneePivot.rotation.x = 0.55 * arc;
        rightLeg.kneePivot.rotation.x = 0.55 * arc;
        leftLeg.anklePivot.rotation.x = 0.32 * arc;
        rightLeg.anklePivot.rotation.x = 0.32 * arc;

        leftArm.shoulderPivot.rotation.set(-1.25 * arc, 0.4 * arc, -0.35);
        rightArm.shoulderPivot.rotation.set(-1.25 * arc, -0.4 * arc, 0.35);
        leftArm.elbowPivot.rotation.x = -0.95 * arc;
        rightArm.elbowPivot.rotation.x = -0.95 * arc;
      } else {
        const landP = Math.min(1, (p - 0.54) / 0.22);
        this.cr7.rotation.y = Math.PI;
        const kneeAbsorb = Math.sin(landP * Math.PI) * 0.14;
        pelvis.position.y = 1.12 - kneeAbsorb * 0.4;
        pelvis.rotation.y = 0;

        spine.rotation.set(-0.14 * landP, 0, 0);
        headGroup.rotation.set(-0.22 * landP, 0, 0);

        leftLeg.hipPivot.rotation.set(-0.08, 0, -0.28);
        rightLeg.hipPivot.rotation.set(-0.08, 0, 0.28);
        leftLeg.kneePivot.rotation.x = kneeAbsorb;
        rightLeg.kneePivot.rotation.x = kneeAbsorb;
        leftLeg.anklePivot.rotation.x = 0;
        rightLeg.anklePivot.rotation.x = 0;

        leftArm.shoulderPivot.rotation.set(0.28 * landP, 0, -0.48 * landP);
        rightArm.shoulderPivot.rotation.set(0.28 * landP, 0, 0.48 * landP);
        leftArm.elbowPivot.rotation.x = -0.1;
        rightArm.elbowPivot.rotation.x = -0.1;
      }

      if (p >= 1) {
        this.resetToStance();
      }
    } else if (this.phase === "DISAPPOINTED") {
      // Đứng lắc đầu thất vọng (1.0s camera dừng ở khung thành + 2.0s đứng lắc đầu thất vọng trên camera chính = 3.0s)
      const disDur = 3.0;
      const p = Math.min(1, this.phaseTimer / disDur);
      const easeIn = Math.min(1, this.phaseTimer / 0.25);

      this.cr7.position.x = -0.26;
      this.cr7.position.z = 11.02;
      this.cr7.rotation.y = -0.12 * easeIn;

      pelvis.position.y = 1.125;
      pelvis.rotation.set(0, 0, 0);
      spine.rotation.set(0.22 * easeIn, 0, -0.04 * easeIn);
      spine.scale.set(1, 0.98, 1);

      const headShake = Math.sin(this.phaseTimer * Math.PI * 5.5) * 0.42 * (1 - p * 0.2);
      headGroup.rotation.set(0.32 * easeIn, headShake, Math.sin(this.phaseTimer * Math.PI * 5.5) * 0.06);

      leftArm.shoulderPivot.position.y = 0.555;
      rightArm.shoulderPivot.position.y = 0.555;
      leftArm.shoulderPivot.rotation.set(0.18 * easeIn, 0, -0.42 * easeIn);
      rightArm.shoulderPivot.rotation.set(0.18 * easeIn, 0, 0.42 * easeIn);
      leftArm.elbowPivot.rotation.x = -0.92 * easeIn;
      rightArm.elbowPivot.rotation.x = -0.92 * easeIn;

      leftLeg.hipPivot.rotation.set(0.04, 0, -0.14);
      rightLeg.hipPivot.rotation.set(-0.06, 0, 0.16);
      leftLeg.kneePivot.rotation.x = 0.04;
      rightLeg.kneePivot.rotation.x = 0.18 * easeIn;
      leftLeg.anklePivot.rotation.x = 0;
      rightLeg.anklePivot.rotation.x = 0;

      if (p >= 1) {
        this.resetToStance();
      }
    }
  },

  /* --------------------------------------------------------------------------
     SHOT LAUNCH, 80% SWEET-SPOT S=100% LOGIC & BALL AERODYNAMICS
     -------------------------------------------------------------------------- */
  triggerShot(customAim = null, customPower = null, customCurve = null) {
    if (this.phase !== "STANCE") return;

    const state = AppStore.state;
    const isHome = state.screen === "HOME";

    const aimX = customAim ? customAim.x : state.aimPoint.x;
    const aimY = customAim ? customAim.y : state.aimPoint.y;
    const power = customPower !== null ? customPower : (state.powerPercent > 5 ? state.powerPercent : 80);
    const metrics = evaluateShotPowerMetrics(power);
    const isSweetSpot = isHome ? true : metrics.isSweetSpot;

    if (!isHome) {
      AppStore.dispatchAction({ type: "SET_POWER", payload: power });
    }

    const speedKmh = isSweetSpot ? 128 : Math.round(88 + (power / 100) * 42);
    const duration = isSweetSpot ? 0.55 : Math.max(0.50, 0.78 - (power / 100) * 0.24);

    let spinX = customCurve !== null ? customCurve : 0;
    if (customCurve === null) {
      if (state.shotStyle === "curve") {
        spinX = aimX >= 0 ? -1.4 : 1.4;
      } else if (state.shotStyle === "knuckle") {
        spinX = (Math.random() - 0.5) * 0.55;
      }
    }

    let targetX = isHome ? (Math.random() > 0.5 ? 2.75 : -2.75) : aimX;
    let targetY = isHome ? 1.92 + Math.random() * 0.28 : aimY;

    let keeperDiveX = 0;
    let keeperDiveY = 1.2;
    let outcomeType = "GOAL";

    if (isHome || isSweetSpot) {
      targetX = Math.max(-3.38, Math.min(3.38, targetX));
      targetY = Math.max(0.32, Math.min(2.26, targetY));
      keeperDiveX = -Math.sign(targetX || 1) * (1.5 + Math.random() * 0.8);
      keeperDiveY = 1.15;
      outcomeType = "GOAL";
    } else {
      targetX += (Math.random() - 0.5) * metrics.scatter * 1.6;
      if (power > 90) {
        targetY += ((power - 88) / 12) * 0.72;
      } else {
        targetY += (Math.random() - 0.5) * metrics.scatter;
      }

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
        const goalRoll = Math.random() * 100;
        if (goalRoll <= metrics.sPercent) {
          outcomeType = "GOAL";
          keeperDiveX = targetX * 0.58;
          keeperDiveY = targetY * 0.75;
        } else {
          outcomeType = "SAVED";
          keeperDiveX = targetX;
          keeperDiveY = targetY;
        }
      }
    }

    this.shotData = {
      active: false,
      startPos: new THREE.Vector3(0, 0.22, 11.0),
      targetPos: new THREE.Vector3(targetX, targetY, -0.88),
      spinX,
      knuckleSeed: Math.random() * 10,
      speedKmh,
      elapsed: 0,
      duration,
      keeperDiveX,
      keeperDiveY,
      willScore: outcomeType === "GOAL",
      isSweetSpot,
      outcomeType
    };

    // Đặt lại cờ âm thanh 3-sut.mp3 (sẽ tự động kích hoạt chính xác trước 0.5s thực tế khi chân chạm bóng)
    this.sutAudioFired = false;
    this.camMode = "DEFAULT";
    this.camHoldTimer = 0;

    // Kích hoạt 2-coi.mp3 ngay lập tức khi kết thúc giữ Space (phát 1.5s, không bị delay bởi slow-mo)
    StadiumAudio.playWhistleOnShotStart();

    // Bắt đầu chuỗi động tác sút ở tốc độ Slow-Mo 0.5x: STEP_CLOSE -> RUNUP -> KICK!
    this.phase = "STEP_CLOSE";
    this.phaseTimer = 0;
  },

  launchBallPhysics() {
    this.shotData.active = true;
    this.shotData.elapsed = 0;
    // Phòng trường hợp chưa kịp kích hoạt 3-sut.mp3
    if (!this.sutAudioFired) {
      this.sutAudioFired = true;
      StadiumAudio.playBallStrike();
    }
    // CẢI TIẾN 5: Ngay từ thời điểm chân cầu thủ chạm quả bóng, góc camera chuyển sang cận cảnh bám theo quả bóng!
    this.camMode = "FOLLOW_BALL";
    this.camHoldTimer = 0;
  },

  updateBallAndKeeper(dt) {
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

    const arcHeight = Math.sin(p * Math.PI) * (0.62 + targetPos.y * 0.22);
    let lateralOffset = Math.sin(p * Math.PI) * spinX;
    if (AppStore.state.shotStyle === "knuckle") {
      // Authentic CR7 Knuckleball mid-air S-wobble (no forward spin, high lateral turbulence)
      lateralOffset += Math.sin(p * Math.PI * 3.4 + knuckleSeed) * 0.32 * Math.sin(p * Math.PI);
    }

    const bx = THREE.MathUtils.lerp(startPos.x, targetPos.x, p) + lateralOffset;
    const by = THREE.MathUtils.lerp(startPos.y, targetPos.y, p) + arcHeight * (1 - p * 0.45);
    const bz = THREE.MathUtils.lerp(startPos.z, targetPos.z, p);

    this.ball.position.set(bx, Math.max(0.22, by), bz);
    if (AppStore.state.shotStyle === "knuckle") {
      this.ball.rotation.x -= dt * 3.5;
      this.ball.rotation.z += Math.sin(p * 18) * dt * 6;
    } else {
      this.ball.rotation.x -= dt * 24;
      this.ball.rotation.y += dt * 16 * spinX;
    }

    // CẢI TIẾN 5: Khi quả bóng bay tới sát trước khung thành (bz <= 0.65), camera dừng lại trước sát khung thành và đứng yên 1.0s!
    if (this.camMode === "FOLLOW_BALL" && bz <= 0.65) {
      this.camMode = "HOLD_AT_GOAL";
      this.camHoldTimer = 0;
      this.camHoldPos.set(bx * 0.72, Math.max(0.95, by + 0.32), 2.85);
      this.camHoldLook.set(targetPos.x * 0.9, Math.max(0.85, targetPos.y * 0.85), -0.65);
    }

    // Update Flight Trail
    for (let i = this.ballTrailMeshes.length - 1; i > 0; i--) {
      this.ballTrailMeshes[i].position.copy(this.ballTrailMeshes[i - 1].position);
      this.ballTrailMeshes[i].material.opacity = (1 - i / this.ballTrailMeshes.length) * 0.6;
    }
    this.ballTrailMeshes[0].position.copy(this.ball.position);
    this.ballTrailMeshes[0].material.opacity = 0.72;

    if (this.keeper) {
      const diveP = Math.min(1, p * 1.18);
      this.keeper.position.x = THREE.MathUtils.lerp(0, this.shotData.keeperDiveX, diveP);
      this.keeper.position.y = Math.sin(diveP * Math.PI) * (this.shotData.keeperDiveY * 0.45);
      const diveDir = Math.sign(this.shotData.keeperDiveX || 1);
      this.keeper.rotation.z = -diveDir * diveP * 1.15;
      this.keeper.userData.leftArmGroup.rotation.z = -2.5 * diveP;
      this.keeper.userData.rightArmGroup.rotation.z = 2.5 * diveP;
    }

    if (p >= 1) {
      this.shotData.active = false;
      if (this.camMode === "FOLLOW_BALL") {
        this.camMode = "HOLD_AT_GOAL";
        this.camHoldTimer = 0;
        this.camHoldPos.set(targetPos.x * 0.72, Math.max(0.95, targetPos.y * 0.75 + 0.25), 2.85);
        this.camHoldLook.set(targetPos.x * 0.9, Math.max(0.85, targetPos.y * 0.85), -0.65);
      }
      this.handleShotOutcome();
    }
  },

  handleShotOutcome() {
    const { outcomeType, speedKmh, targetPos, isSweetSpot } = this.shotData;
    const isHome = AppStore.state.screen === "HOME";

    this.ballTrailMeshes.forEach((m) => (m.material.opacity = 0));

    if (outcomeType === "GOAL") {
      this.netRippleIntensity = 1.1;
      this.netImpactPoint.copy(targetPos);

      // Kích hoạt song song 4-vao.mp3 và 4-cheer.mp3 ngay khi ghi bàn
      StadiumAudio.playGoalAndCheer();

      // Bắt đầu chạy dang tay ăn mừng quanh sân rồi mới chuyển sang SIUUUUU
      this.phase = "CELEBRATE_RUN";
      this.phaseTimer = 0;

      if (!isHome) {
        AppStore.dispatchAction({
          type: "RECORD_SHOT_RESULT",
          payload: { isGoal: true, speedKmh }
        });
        const bannerTitle = isSweetSpot ? "PERFECT 80%! SIUUU!" : "GOAL! SIUUU!";
        const bannerSub = isSweetSpot
          ? `🔥 Mốc Đỏ 80% Hoàn Hảo (P:MAX • A:MAX • S:100%) • ${speedKmh} KM/H`
          : `Cú sút đẳng cấp của ${AppStore.state.playerName} • ${speedKmh} KM/H`;
        UIController.showCenterBanner(bannerTitle, bannerSub, true);
      }
    } else {
      // Kích hoạt 4-nogoal.mp3 ngay khi sút hụt ra ngoài hoặc không vào (no score)
      StadiumAudio.playNoGoal();
      this.ball.position.z = 1.8;
      this.ball.position.x *= 1.25;

      // Đứng lắc đầu thất vọng nếu không ghi bàn
      this.phase = "DISAPPOINTED";
      this.phaseTimer = 0;

      if (!isHome) {
        AppStore.dispatchAction({
          type: "RECORD_SHOT_RESULT",
          payload: { isGoal: false, speedKmh }
        });
        const reason =
          outcomeType === "SAVED"
            ? "Thủ môn cản phá! Hãy giữ Space thả đúng vạch đỏ 80% để đạt S:100%!"
            : outcomeType === "POST"
            ? "Bóng dội xà ngang / cột dọc đáng tiếc!"
            : "Bóng đi vọt xà / chệch cột! Hãy thả nút ở vạch đỏ 80%!";
        UIController.showCenterBanner("KHÔNG VÀO!", reason, false);
      }
    }
  },

  resetToStance() {
    this.phase = "STANCE";
    this.phaseTimer = 0;
    this.sutAudioFired = false;
    this.camMode = "DEFAULT";
    this.camHoldTimer = 0;
    this.shotData.active = false;
    this.ball.position.set(0, 0.22, 11.0);
    this.ball.rotation.set(0, 0, 0);
    this.ballTrailMeshes.forEach((m) => (m.material.opacity = 0));
    if (this.keeper) {
      this.keeper.position.set(0, 0, 0.35);
      this.keeper.rotation.set(0, 0, 0);
    }
    if (AppStore.state.screen === "PENALTY_11M") {
      AppStore.dispatchAction({ type: "SET_POWER", payload: 0 });
    }
    StadiumAudio.checkAndResumeBgm();
    this.applySignatureStance(this.clock.getElapsedTime());
  },

  enterHomeMode() {
    StadiumAudio.stopAllActionSfx();
    StadiumAudio.checkAndResumeBgm();
    this.resetToStance();
    if (this.aimReticle) this.aimReticle.visible = false;
    this.homeLoopTimer = 0.2;
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
    const isCelebrating = this.phase === "CELEBRATE_RUN" || this.phase === "CELEBRATE_SIU";

    // CẢI TIẾN 2 & 5: Toàn bộ thời gian từ lúc nhả Space tới trước khi chân chạm quả bóng (STEP_CLOSE & RUNUP)
    // chạy ở tốc độ Slow-Mo 0.5x (riêng âm thanh vẫn chạy tốc độ thực 1.0x không bị delay!)
    const isPreContactSlowMo = this.phase === "STEP_CLOSE" || this.phase === "RUNUP";
    const animDt = isPreContactSlowMo ? dt * this.preKickTimeScale : dt;

    this.phaseTimer += animDt;

    // Process UI continuous input (Hold-Space Power Charge & 2x Arrow Keys)
    UIController.updatePerFrameInput(dt);

    // 1. Update CR7 Full-Body Animation Sequence
    if (this.phase === "STANCE") {
      this.applySignatureStance(elapsed);

      if (isHome) {
        this.homeLoopTimer += dt;
        // Let CR7 complete his iconic A-stance + Deep Inhale Shoulder Shrug before running up!
        if (this.homeLoopTimer > 2.65) {
          this.homeLoopTimer = 0;
          this.triggerShot();
        }
      }
    } else {
      this.updateDetailedCR7Sequence(animDt);
    }

    // 2. Update Ball & Goalkeeper (full speed 1.0x once ball is launched!)
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
          0.44 *
          this.netRippleIntensity;
        posAttr.setZ(i, orig[i * 3 + 2] - Math.abs(wave));
      }
      posAttr.needsUpdate = true;
      this.netRippleIntensity *= 0.94;
    }

    // 4. Animate Cheering Crowd & Camera Flashes
    if (this.crowdInstanced) {
      const dummy = new THREE.Object3D();
      const excitement = isCelebrating ? 2.5 : 1.0;
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
      this.flashParticles.material.opacity = isCelebrating
        ? 0.68 + Math.sin(elapsed * 36) * 0.32
        : 0.25 + Math.sin(elapsed * 12) * 0.2;
    }

    // 5. Animate Blinking / Pulsing Multi-Ring Aim Reticle
    if (this.aimReticle && this.aimReticle.visible) {
      this.aimReticle.position.x = THREE.MathUtils.lerp(
        this.aimReticle.position.x,
        AppStore.state.aimPoint.x,
        0.38
      );
      this.aimReticle.position.y = THREE.MathUtils.lerp(
        this.aimReticle.position.y,
        AppStore.state.aimPoint.y,
        0.38
      );

      const { outerGroup, innerGroup, crossGroup, centerCore, goldMat, bladeMat, centerMat } =
        this.aimReticle.userData;
      outerGroup.rotation.z = -elapsed * 2.4;
      innerGroup.rotation.z = elapsed * 3.2;

      const pulse = 1 + Math.sin(elapsed * 10) * 0.14;
      crossGroup.scale.set(pulse, pulse, 1);

      const blink = 0.55 + Math.abs(Math.sin(elapsed * 14)) * 0.45;
      goldMat.opacity = blink;
      bladeMat.opacity = 0.65 + Math.sin(elapsed * 18) * 0.35;

      const isNear80 = Math.abs(AppStore.state.powerPercent - 80) <= 4;
      centerMat.color.setHex(isNear80 ? 0x22c55e : elapsed % 0.35 < 0.17 ? 0xff1e1e : 0xf5c542);
      const coreScale = isNear80 ? 1.45 : 1 + Math.sin(elapsed * 16) * 0.25;
      centerCore.scale.set(coreScale, coreScale, 1);
    }

    // 6. CẢI TIẾN 5: HỆ THỐNG CAMERA CẬN CẢNH THEO BÓNG -> DỪNG TRƯỚC KHUNG THÀNH 1 GIÂY -> TRỞ VỀ MẶC ĐỊNH BAN ĐẦU
    const isPortrait = window.innerHeight > window.innerWidth;
    const portraitBackOffset = isPortrait ? 2.5 : 0.0;

    if (this.camMode === "FOLLOW_BALL" && this.ball) {
      // Góc camera cận cảnh di chuyển bám sát theo điểm mốc là quả bóng từ lúc chân chạm bóng đến trước sát khung thành
      const bx = this.ball.position.x;
      const by = this.ball.position.y;
      const bz = this.ball.position.z;

      const closeCamX = bx * 0.78;
      const closeCamY = Math.max(0.82, by + 0.36);
      const closeCamZ = Math.max(2.85, bz + 2.15);

      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, closeCamX, 0.42);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, closeCamY, 0.42);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, closeCamZ, 0.45);
      // Điểm mốc nhìn luôn là tâm quả bóng
      this.camera.lookAt(bx, Math.max(0.35, by), bz - 0.6);
    } else if (this.camMode === "HOLD_AT_GOAL") {
      // Khi tới trước sát khung thành: Camera DỪNG ĐỨNG YÊN hoàn toàn trong đúng 1.0 giây!
      this.camHoldTimer += dt;
      this.camera.position.copy(this.camHoldPos);
      this.camera.lookAt(this.camHoldLook);

      if (this.camHoldTimer >= 1.0) {
        // Đủ 1.0 giây đứng yên trước khung thành -> Trở lại góc camera mặc định ban đầu!
        this.camMode = "DEFAULT";
        this.camHoldTimer = 0;
      }
    } else {
      // Góc camera mặc định ban đầu (nhìn trọn vẹn full người cầu thủ + lia mượt theo cầu thủ khi chạy ăn mừng)
      const followX = isCelebrating && this.cr7 ? this.cr7.position.x * 0.45 : 0;

      if (isHome) {
        const swayX = Math.sin(elapsed * 0.5) * 0.75;
        const targetZ = 18.65 + portraitBackOffset;
        this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, -0.45 + swayX + followX * 0.5, 0.12);
        this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 1.64, 0.12);
        this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetZ, 0.12);
        this.camera.lookAt(followX, 1.14, 2.2);
      } else {
        const cfg = GAME_MODE_FIELD_MAP.PENALTY_11M;
        const targetZ = cfg.cameraOffset.z + portraitBackOffset;
        this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, cfg.cameraOffset.x + followX * 0.4, 0.14);
        this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, cfg.cameraOffset.y, 0.14);
        this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetZ, 0.14);
        this.camera.lookAt(cfg.cameraLookAt.x + followX, cfg.cameraLookAt.y, cfg.cameraLookAt.z);
      }
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
   5. UI CONTROLLER:
      - CẢI TIẾN 5: Rê chuột & Phím mũi tên nhạy x2 (2x Sensitivity)
      - CẢI TIẾN 6: Giữ nút Space (hoặc nút Sút) tích lực chạy nhanh dần tới vạch đỏ 80%
   ============================================================================ */
const UIController = {
  swipeCanvas: null,
  swipeCtx: null,
  isDragging: false,
  dragPoints: [],

  // Hold-Space / Hold-Button Power Charge State
  isChargingPower: false,
  chargeValue: 0,
  chargeDirection: 1,
  heldKeys: { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false },

  init() {
    this.swipeCanvas = document.getElementById("swipe-canvas");
    this.swipeCtx = this.swipeCanvas.getContext("2d");
    this.resizeSwipeCanvas();
    window.addEventListener("resize", () => this.resizeSwipeCanvas());

    AppStore.subscribe((state) => this.renderUI(state));

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

    document.getElementById("btn-back-home").addEventListener("click", () => {
      this.isChargingPower = false;
      AppStore.dispatchAction({ type: "SET_SCREEN", payload: "HOME" });
    });

    document.getElementById("btn-audio-toggle").addEventListener("click", () => {
      StadiumAudio.ensureContext();
      AppStore.dispatchAction({ type: "TOGGLE_AUDIO" });
    });

    document.querySelectorAll(".style-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        AppStore.dispatchAction({
          type: "SET_SHOT_STYLE",
          payload: chip.getAttribute("data-style")
        });
      });
    });

    // CẢI TIẾN 6: Hold-to-Charge on Shoot Button (PC Mouse & Mobile Touch)
    const shootBtn = document.getElementById("btn-shoot-now");
    const startBtnCharge = (e) => {
      e.preventDefault();
      if (AppStore.state.screen !== "PENALTY_11M" || CR7Engine.phase !== "STANCE") return;
      StadiumAudio.ensureContext();
      this.startPowerCharge();
    };
    const releaseBtnCharge = (e) => {
      if (!this.isChargingPower) return;
      e.preventDefault();
      this.releasePowerChargeAndShoot();
    };
    shootBtn.addEventListener("mousedown", startBtnCharge);
    shootBtn.addEventListener("touchstart", startBtnCharge, { passive: false });
    window.addEventListener("mouseup", releaseBtnCharge);
    window.addEventListener("touchend", releaseBtnCharge);

    // CẢI TIẾN 5 & 6: Phím mũi tên nhạy x2 + Giữ phím Space tích lực nhanh dần tới mốc đỏ 80%
    window.addEventListener("keydown", (e) => {
      if (AppStore.state.screen !== "PENALTY_11M") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat && CR7Engine.phase === "STANCE" && !this.isChargingPower) {
          StadiumAudio.ensureContext();
          this.startPowerCharge();
        }
        return;
      }

      if (this.heldKeys.hasOwnProperty(e.code)) {
        e.preventDefault();
        this.heldKeys[e.code] = true;
        // Immediate 2x step on initial key press
        const stepX = 0.72; // 2x sensitivity (was 0.35)
        const stepY = 0.52; // 2x sensitivity (was 0.25)
        const cur = AppStore.state.aimPoint;
        if (e.code === "ArrowLeft") {
          AppStore.dispatchAction({ type: "SET_AIM_POINT", payload: { x: cur.x - stepX, y: cur.y } });
        } else if (e.code === "ArrowRight") {
          AppStore.dispatchAction({ type: "SET_AIM_POINT", payload: { x: cur.x + stepX, y: cur.y } });
        } else if (e.code === "ArrowUp") {
          AppStore.dispatchAction({ type: "SET_AIM_POINT", payload: { x: cur.x, y: cur.y + stepY } });
        } else if (e.code === "ArrowDown") {
          AppStore.dispatchAction({ type: "SET_AIM_POINT", payload: { x: cur.x, y: cur.y - stepY } });
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space" && this.isChargingPower) {
        e.preventDefault();
        this.releasePowerChargeAndShoot();
      }
      if (this.heldKeys.hasOwnProperty(e.code)) {
        this.heldKeys[e.code] = false;
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

    this.setupSwipeAndAimControls();
  },

  startPowerCharge() {
    this.isChargingPower = true;
    this.chargeValue = 0;
    this.chargeDirection = 1;
    document.getElementById("btn-shoot-now").classList.add("charging");
    AppStore.dispatchAction({ type: "SET_POWER", payload: 0 });
  },

  releasePowerChargeAndShoot() {
    this.isChargingPower = false;
    document.getElementById("btn-shoot-now").classList.remove("charging");
    const lockedPower = Math.max(15, this.chargeValue);
    AppStore.dispatchAction({ type: "SET_POWER", payload: lockedPower });
    CR7Engine.triggerShot(AppStore.state.aimPoint, lockedPower, null);
  },

  updatePerFrameInput(dt) {
    if (AppStore.state.screen !== "PENALTY_11M") return;

    // 1. Continuous 2x Arrow Key Reticle Movement
    const moveSpeedX = 6.8 * dt;
    const moveSpeedY = 5.0 * dt;
    let dx = 0, dy = 0;
    if (this.heldKeys.ArrowLeft) dx -= moveSpeedX;
    if (this.heldKeys.ArrowRight) dx += moveSpeedX;
    if (this.heldKeys.ArrowUp) dy += moveSpeedY;
    if (this.heldKeys.ArrowDown) dy -= moveSpeedY;
    if (dx !== 0 || dy !== 0) {
      AppStore.dispatchAction({
        type: "SET_AIM_POINT",
        payload: {
          x: AppStore.state.aimPoint.x + dx,
          y: AppStore.state.aimPoint.y + dy
        }
      });
    }

    // 2. CẢI TIẾN 6: Hold-Space Power Bar Accelerates Toward 80% Red Line
    if (this.isChargingPower && CR7Engine.phase === "STANCE") {
      // Thước đo lực chạy nhanh dần (accelerates progressively as chargeValue approaches 80%-100%)
      const accelSpeed = 48 + Math.pow(this.chargeValue / 100, 1.35) * 145; // % per second
      this.chargeValue += accelSpeed * dt * this.chargeDirection;

      if (this.chargeValue >= 100) {
        this.chargeValue = 100;
        this.chargeDirection = -1; // Bounce back if player holds too long past 100%
      } else if (this.chargeValue <= 0) {
        this.chargeValue = 0;
        this.chargeDirection = 1;
      }

      AppStore.dispatchAction({ type: "SET_POWER", payload: this.chargeValue });
    }
  },

  resizeSwipeCanvas() {
    if (!this.swipeCanvas) return;
    this.swipeCanvas.width = window.innerWidth;
    this.swipeCanvas.height = window.innerHeight;
  },

  setupSwipeAndAimControls() {
    const canvas = this.swipeCanvas;
    let lastMousePt = null;

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
      lastMousePt = pt;
      this.updateAimFromScreenPoint(pt);
    };

    // CẢI TIẾN 5: Rê chuột tự do (không cần giữ chuột) cũng điều khiển hồng tâm với độ nhạy x2!
    const onMove = (e) => {
      if (AppStore.state.screen !== "PENALTY_11M") return;
      const pt = getPoint(e);

      if (this.isDragging) {
        this.dragPoints.push(pt);
        this.updateAimFromScreenPoint(pt);
        this.drawSwipeTrail();
      } else if (!e.touches) {
        // Free mouse hover aiming with 2x sensitivity
        if (lastMousePt) {
          const dScreenX = (pt.x - lastMousePt.x) / window.innerWidth;
          const dScreenY = (lastMousePt.y - pt.y) / window.innerHeight;
          // 2x multiplier (16.8 horizontal range, 9.6 vertical range)
          AppStore.dispatchAction({
            type: "SET_AIM_POINT",
            payload: {
              x: AppStore.state.aimPoint.x + dScreenX * 16.8,
              y: AppStore.state.aimPoint.y + dScreenY * 9.6
            }
          });
        }
      }
      lastMousePt = pt;
    };

    const onEnd = () => {
      if (!this.isDragging) return;
      this.isDragging = false;

      if (this.dragPoints.length >= 4) {
        const first = this.dragPoints[0];
        const last = this.dragPoints[this.dragPoints.length - 1];
        const dy = first.y - last.y;
        const dist = Math.hypot(last.x - first.x, dy);

        // Mobile / Mouse Swipe-to-Shoot from lower half of screen
        if (first.y > window.innerHeight * 0.45 && dy > 45 && dist > 55) {
          const mid = this.dragPoints[Math.floor(this.dragPoints.length / 2)];
          const midExpectedX = (first.x + last.x) / 2;
          const curveAmount = ((mid.x - midExpectedX) / window.innerWidth) * -6.5;
          const swipePower = Math.min(96, Math.max(60, Math.round((dist / (window.innerHeight * 0.38)) * 82)));
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
    // 2x Responsive mapping around screen center so small hand/mouse movements reach all 4 corners fast
    const normX = (pt.x / window.innerWidth - 0.5) * 2.0 * 1.85; // 2x sensitivity gain
    const normY = (0.52 - pt.y / window.innerHeight) * 2.0 * 1.85;
    const goalX = normX * 3.6;
    const goalY = 1.25 + normY * 1.45;

    AppStore.dispatchAction({
      type: "SET_AIM_POINT",
      payload: { x: goalX, y: goalY }
    });
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
      <p style="color:#1A4B9F;font-weight:600;">👉 Hiện tại anh có thể trải nghiệm ngay chế độ <strong>Sút Phạt Penalty 11m</strong> với đầy đủ dáng đứng thương hiệu CR7 và vạch đỏ canh lực 80%!</p>
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
    }, 2050);
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

    document.getElementById("home-high-score").textContent = `KỶ LỤC: ${state.highScore} BÀN`;
    document.getElementById("home-best-streak").textContent = `Chuỗi thắng: ${state.bestStreak}`;

    document.getElementById("hud-player-name").textContent = state.playerName;
    document.getElementById("hud-score").textContent = state.score;
    document.getElementById("hud-streak").textContent = state.streak;
    document.getElementById("hud-speed").innerHTML = `${state.lastSpeedKmh} <small style="font-size:10px">KM/H</small>`;

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

    document.querySelectorAll(".style-chip").forEach((chip) => {
      chip.classList.toggle("active", chip.getAttribute("data-style") === state.shotStyle);
    });

    // Update Power Bar & Live P-A-S Rating Pill
    const pctRound = Math.round(state.powerPercent);
    const pas = state.pasRating || evaluateShotPowerMetrics(pctRound);
    document.getElementById("power-percent-label").textContent =
      pas.isSweetSpot
        ? `🔥 LỰC SÚT: ${pctRound}% (TRÚNG VẠCH ĐỎ 80% -> S: 100%!)`
        : `LỰC SÚT: ${pctRound}% (CANH VẠCH ĐỎ: 80%)`;
    document.getElementById("power-bar-fill").style.width = `${pctRound}%`;

    document.getElementById("pas-p").innerHTML = `P (Lực): <strong>${pas.pText}</strong>`;
    document.getElementById("pas-a").innerHTML = `A (Chính xác): <strong>${pas.aText}</strong>`;
    document.getElementById("pas-s").innerHTML = `S (Ghi bàn): <strong style="color:${
      pas.isSweetSpot ? "#22C55E" : "#F5C542"
    }">${pas.sPercent}%</strong>`;

    document.getElementById("audio-label").textContent = state.audioEnabled ? "CĐV: BẬT" : "CĐV: TẮT";
  }
};

/* ============================================================================
   6. INITIALIZE APPLICATION ON DOM READY
   ============================================================================ */
window.addEventListener("DOMContentLoaded", () => {
  StadiumAudio.init();
  AppStore.init();
  UIController.init();
  CR7Engine.init();
});
