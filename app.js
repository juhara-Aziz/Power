const video = document.querySelector('#video');
const canvas = document.querySelector('#fx');
const ctx = canvas.getContext('2d');

const startBtn = document.querySelector('#startBtn');
const startPanel = document.querySelector('#startPanel');
const winnerPanel = document.querySelector('#winnerPanel');
const winnerText = document.querySelector('#winnerText');

const scoreEls = [
  document.querySelector('#score1'),
  document.querySelector('#score2')
];

const statusEls = [
  document.querySelector('#status1'),
  document.querySelector('#status2')
];

let HandLandmarker;
let FilesetResolver;
let landmarker;
let stream;

let running = false;
let lastVideoTime = -1;
let lastTs = 0;

let scores = [0, 0];

let projectiles = [];
let particles = [];
let flashes = [];


// ============================================================
// PLAYER
// ============================================================

function makePlayer(side) {
  return {
    side,

    hands: [],

    energy: 0,

    charging: false,

    shield: false,

    chargePoint: null,

    lastAttack: 0,

    // Smooth tracking
    smoothPoint: null
  };
}

const players = [
  makePlayer(0),
  makePlayer(1)
];


// ============================================================
// HELPERS
// ============================================================

const clamp = (v, a, b) =>
  Math.max(a, Math.min(b, v));

const lerp = (a, b, t) =>
  a + (b - a) * t;


// ============================================================
// MEDIAPIPE SETUP
// ============================================================

async function setup() {

  const version = '0.10.14';

  const cdn =
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}`;

  const mod = await import(cdn);

  FilesetResolver = mod.FilesetResolver;
  HandLandmarker = mod.HandLandmarker;

  const resolver =
    await FilesetResolver.forVisionTasks(
      `${cdn}/wasm`
    );

  landmarker =
    await HandLandmarker.createFromOptions(
      resolver,
      {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',

          delegate: 'CPU'
        },

        runningMode: 'VIDEO',

        numHands: 4,

        minHandDetectionConfidence: 0.5,

        minHandPresenceConfidence: 0.5,

        minTrackingConfidence: 0.5
      }
    );
}


// ============================================================
// START CAMERA
// ============================================================

async function start() {

  try {

    startBtn.disabled = true;
    startBtn.textContent = 'LOADING...';

    await setup();

    if (!navigator.mediaDevices?.getUserMedia) {

      throw new Error(
        'Camera requires HTTPS. Open the GitHub Pages URL.'
      );

    }

    startBtn.textContent =
      'REQUESTING CAMERA...';

    stream =
      await navigator.mediaDevices.getUserMedia({

        video: {
          facingMode: 'user',

          width: {
            ideal: 1280
          },

          height: {
            ideal: 720
          }
        },

        audio: false

      });

    video.srcObject = stream;

    await video.play();

    resize();

    startPanel.classList.add('hidden');

    running = true;

    lastTs = performance.now();

    requestAnimationFrame(loop);

  }

  catch (e) {

    console.error(e);

    startBtn.disabled = false;

    startBtn.textContent = 'TRY AGAIN';

    alert(
      'تعذر تشغيل اللعبة.\n\n' +
      (e?.message || e) +
      '\n\nافتحي F12 ثم Console إذا استمرت المشكلة.'
    );

  }
}

startBtn.onclick = start;

document
  .querySelector('#restartBtn')
  .onclick = () => location.reload();


// ============================================================
// RESIZE
// ============================================================

function resize() {

  canvas.width =
    video.videoWidth || 1280;

  canvas.height =
    video.videoHeight || 720;

}

window.onresize = resize;


// ============================================================
// HAND CENTER
// IMPORTANT:
// NO X FLIP HERE
// ============================================================

function center(h) {

  let x = 0;
  let y = 0;

  for (const p of h) {

    x += p.x;
    y += p.y;

  }

  return {

    x: x / h.length,

    y: y / h.length

  };

}


// ============================================================
// PALM OPEN DETECTION
// ============================================================

function openPalm(h) {

  const wrist = h[0];

  const tips = [
    8,
    12,
    16,
    20
  ];

  return tips.filter(i => {

    return Math.hypot(
      h[i].x - wrist.x,
      h[i].y - wrist.y
    ) > 0.18;

  }).length >= 3;

}


// ============================================================
// CLASSIFY HANDS
// ============================================================

function classify(result) {

  players[0].hands = [];
  players[1].hands = [];

  const landmarks =
    result?.landmarks || [];

  const handedness =
    result?.handednesses || [];


  for (
    let i = 0;
    i < landmarks.length;
    i++
  ) {

    const h = landmarks[i];

    const c = center(h);

    const open = openPalm(h);

    const label =
      handedness[i]?.[0]?.categoryName
        ?.toLowerCase() || '';


    const hand = {

      center: c,

      open,

      label,

      landmarks: h

    };


    /*
     * IMPORTANT
     *
     * The camera is displayed as a mirror.
     *
     * Therefore we assign players based on
     * the visual screen position.
     */

    const player =
      c.x < 0.5
        ? players[0]
        : players[1];


    player.hands.push(hand);

  }


  /*
   * Sort hands consistently
   */

  players.forEach(player => {

    player.hands.sort(
      (a, b) => {

        if (a.label === 'left')
          return -1;

        if (b.label === 'left')
          return 1;

        return 0;

      }
    );

  });

}


// ============================================================
// CHARGE POINT
// ============================================================

function chargePoint(player) {

  if (player.hands.length < 2)
    return null;


  const a =
    player.hands[0].center;

  const b =
    player.hands[1].center;


  const x =
    ((a.x + b.x) / 2) *
    canvas.width;


  const y =
    ((a.y + b.y) / 2) *
    canvas.height;


  return {
    x,
    y
  };

}


// ============================================================
// PARTICLES
// ============================================================

function particlesAt(
  x,
  y,
  n,
  side,
  speed = 300
) {

  for (let i = 0; i < n; i++) {

    const a =
      Math.random() *
      Math.PI *
      2;


    const s =
      speed *
      (0.3 + Math.random());


    particles.push({

      x,
      y,

      vx:
        Math.cos(a) * s,

      vy:
        Math.sin(a) * s,

      life:
        0.3 +
        Math.random() * 0.7,

      size:
        2 +
        Math.random() * 5,

      side

    });

  }

}


// ============================================================
// ATTACK
// ============================================================

function blast(player, point) {

  projectiles.push({

    owner: player.side,

    x: point.x,

    target:
      player.side
        ? canvas.width * 0.18
        : canvas.width * 0.82,

    r: 18,

    life: 0

  });


  particlesAt(
    point.x,
    point.y,
    80,
    player.side,
    500
  );


  flashes.push(0.35);


  player.energy = 0;

  player.charging = false;

  player.chargePoint = null;

  player.lastAttack =
    performance.now();

}


// ============================================================
// PLAYER UPDATE
// ============================================================

function updatePlayer(
  player,
  dt
) {

  const cp =
    chargePoint(player);

  const now =
    performance.now();


  /*
   * SHIELD
   */

  player.shield =
    player.hands.length === 1 &&
    player.hands[0].open &&
    now - player.lastAttack > 700;


  /*
   * CHARGING
   */

  if (
    cp &&
    now - player.lastAttack > 900
  ) {

    player.charging = true;


    /*
     * Smooth charge position
     */

    if (!player.smoothPoint) {

      player.smoothPoint = {
        x: cp.x,
        y: cp.y
      };

    }


    player.smoothPoint.x =
      lerp(
        player.smoothPoint.x,
        cp.x,
        0.18
      );


    player.smoothPoint.y =
      lerp(
        player.smoothPoint.y,
        cp.y,
        0.18
      );


    player.chargePoint =
      player.smoothPoint;


    player.energy =
      clamp(
        player.energy +
        dt * 38,

        0,

        100
      );


    if (player.energy >= 100) {

      blast(
        player,
        player.chargePoint
      );

    }

  }

  else if (!cp) {

    player.charging = false;

    player.energy =
      lerp(
        player.energy,
        0,
        dt * 4
      );

    player.chargePoint = null;

    player.smoothPoint = null;

  }


  /*
   * STATUS
   */

  statusEls[player.side].textContent =

    player.shield
      ? 'SHIELD'

      : player.charging
        ? `CHARGING ${Math.round(player.energy)}%`

        : 'READY';

}


// ============================================================
// IMPACT
// ============================================================

function impact(
  x,
  y,
  blocked
) {

  flashes.push(
    blocked
      ? 0.2
      : 0.45
  );


  particlesAt(
    x,
    y,

    blocked
      ? 35
      : 120,

    blocked
      ? 0
      : 1,

    blocked
      ? 180
      : 600
  );


  if (
    !blocked &&
    scores.some(s => s >= 5)
  ) {

    endGame(
      scores[0] >= 5
        ? 0
        : 1
    );

  }

}


// ============================================================
// PROJECTILES
// ============================================================

function updateProjectiles(dt) {

  for (
    let i = projectiles.length - 1;
    i >= 0;
    i--
  ) {

    const q =
      projectiles[i];


    const dir =
      Math.sign(
        q.target - q.x
      );


    q.x +=
      dir *
      (360 + q.r * 3) *
      dt;


    q.life += dt;

    q.r +=
      20 * dt;


    const target =
      players[
        q.owner
          ? 0
          : 1
      ];


    const tx =
      q.owner
        ? canvas.width * 0.82
        : canvas.width * 0.18;


    if (
      target.shield &&
      Math.abs(q.x - tx) < 70
    ) {

      impact(
        q.x,
        canvas.height * 0.5,
        true
      );

      projectiles.splice(i, 1);

      continue;

    }


    if (
      (dir > 0 && q.x > tx) ||
      (dir < 0 && q.x < tx) ||
      q.life > 3
    ) {

      impact(
        tx,
        canvas.height * 0.5,
        false
      );


      if (q.life <= 3) {

        scores[q.owner]++;

        scoreEls[q.owner]
          .textContent =
          scores[q.owner];

      }


      projectiles.splice(i, 1);

    }

  }

}


// ============================================================
// END GAME
// ============================================================

function endGame(winner) {

  running = false;


  if (stream) {

    stream
      .getTracks()
      .forEach(
        track => track.stop()
      );

  }


  winnerText.textContent =
    `PLAYER ${winner + 1} WINS`;


  winnerPanel
    .classList
    .remove('hidden');

}


// ============================================================
// LIGHTNING
// ============================================================

function drawLightning(
  x,
  y,
  radius,
  color,
  seed
) {

  ctx.save();

  ctx.strokeStyle = color;

  ctx.lineWidth = 2;

  ctx.shadowBlur = 18;

  ctx.shadowColor = color;

  ctx.globalAlpha = 0.8;


  for (let k = 0; k < 3; k++) {

    ctx.beginPath();

    let px = x;
    let py = y;


    const angle =
      seed +
      k * Math.PI * 2 / 3;


    ctx.moveTo(px, py);


    for (
      let i = 0;
      i < 6;
      i++
    ) {

      const r =
        radius *
        (0.3 + i / 7);


      const jitter =
        (Math.random() - 0.5) *
        25;


      px =
        x +
        Math.cos(angle) *
        r +
        jitter;


      py =
        y +
        Math.sin(angle) *
        r +
        jitter;


      ctx.lineTo(
        px,
        py
      );

    }

    ctx.stroke();

  }


  ctx.restore();

}


// ============================================================
// CHARGE VFX
// ============================================================

function drawChargeEffect(
  player,
  time
) {

  if (
    !player.charging ||
    !player.chargePoint
  )
    return;


  const x =
    player.chargePoint.x;

  const y =
    player.chargePoint.y;


  const energy =
    player.energy / 100;


  const mainColor =
    player.side
      ? '#ff3158'
      : '#35a8ff';


  const brightColor =
    player.side
      ? '#ffd1d9'
      : '#d8f4ff';


  const pulse =
    Math.sin(time * 0.006) * 0.5 + 0.5;


  // ==========================================================
  // OUTER AURA
  // ==========================================================

  const auraRadius =
    45 +
    energy * 90 +
    pulse * 8;


  const aura =
    ctx.createRadialGradient(
      x,
      y,
      5,
      x,
      y,
      auraRadius
    );


  aura.addColorStop(
    0,
    '#ffffff'
  );

  aura.addColorStop(
    0.15,
    brightColor
  );

  aura.addColorStop(
    0.38,
    mainColor + 'bb'
  );

  aura.addColorStop(
    0.7,
    mainColor + '35'
  );

  aura.addColorStop(
    1,
    'transparent'
  );


  ctx.fillStyle = aura;

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    auraRadius,
    0,
    Math.PI * 2
  );

  ctx.fill();


  // ==========================================================
  // ENERGY CORE
  // ==========================================================

  const coreRadius =
    12 +
    energy * 25 +
    pulse * 4;


  const core =
    ctx.createRadialGradient(
      x,
      y,
      1,
      x,
      y,
      coreRadius
    );


  core.addColorStop(
    0,
    '#ffffff'
  );

  core.addColorStop(
    0.25,
    '#ffffff'
  );

  core.addColorStop(
    0.5,
    brightColor
  );

  core.addColorStop(
    0.75,
    mainColor
  );

  core.addColorStop(
    1,
    'transparent'
  );


  ctx.fillStyle = core;

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    coreRadius,
    0,
    Math.PI * 2
  );

  ctx.fill();


  // ==========================================================
  // ROTATING ENERGY RINGS
  // ==========================================================

  ctx.save();

  ctx.strokeStyle =
    mainColor;

  ctx.lineWidth = 3;

  ctx.shadowBlur = 20;

  ctx.shadowColor =
    mainColor;


  for (
    let i = 0;
    i < 4;
    i++
  ) {

    const radius =
      30 +
      energy * 45 +
      i * 16;


    ctx.globalAlpha =
      0.7 -
      i * 0.12;


    ctx.beginPath();

    ctx.arc(
      x,
      y,
      radius,
      time * 0.002 * (i % 2 ? -1 : 1) +
        i,

      time * 0.002 * (i % 2 ? -1 : 1) +
        i +
        Math.PI * 1.35
    );


    ctx.stroke();

  }


  ctx.restore();


  // ==========================================================
  // LIGHTNING
  // ==========================================================

  drawLightning(
    x,
    y,
    80 + energy * 50,
    brightColor,
    time * 0.004
  );


  // ==========================================================
  // ENERGY PARTICLES
  // ==========================================================

  for (
    let i = 0;
    i < 18;
    i++
  ) {

    const angle =
      time * 0.0015 +
      i * Math.PI * 2 / 18;


    const radius =
      45 +
      Math.sin(
        time * 0.003 + i
      ) * 18 +
      energy * 55;


    const px =
      x +
      Math.cos(angle) *
      radius;


    const py =
      y +
      Math.sin(angle) *
      radius;


    ctx.fillStyle =
      brightColor;


    ctx.shadowBlur = 15;

    ctx.shadowColor =
      mainColor;


    ctx.beginPath();

    ctx.arc(
      px,
      py,
      2 + energy * 3,
      0,
      Math.PI * 2
    );

    ctx.fill();

  }


  ctx.shadowBlur = 0;


  // ==========================================================
  // HIGH ENERGY BURST
  // ==========================================================

  if (energy > 0.75) {

    ctx.save();

    ctx.globalAlpha =
      (energy - 0.75) * 2;


    ctx.strokeStyle =
      brightColor;

    ctx.lineWidth = 2;

    ctx.shadowBlur = 25;

    ctx.shadowColor =
      mainColor;


    for (
      let i = 0;
      i < 12;
      i++
    ) {

      const angle =
        i *
        Math.PI *
        2 /
        12;


      const r1 =
        55 +
        Math.sin(time * 0.005 + i) * 8;


      const r2 =
        r1 +
        25 +
        energy * 30;


      ctx.beginPath();

      ctx.moveTo(
        x +
        Math.cos(angle) *
        r1,

        y +
        Math.sin(angle) *
        r1
      );


      ctx.lineTo(
        x +
        Math.cos(angle) *
        r2,

        y +
        Math.sin(angle) *
        r2
      );


      ctx.stroke();

    }


    ctx.restore();

  }

}


// ============================================================
// DRAW
// ============================================================

function draw() {

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );


  /*
   * IMPORTANT
   *
   * Mirror the canvas so the effect follows
   * the user's visual camera position.
   */

  ctx.save();

  ctx.translate(
    canvas.width,
    0
  );

  ctx.scale(
    -1,
    1
  );


  // ==========================================================
  // HAND MARKERS
  // ==========================================================

  players.forEach(player => {

    for (const hand of player.hands) {

      const x =
        hand.center.x *
        canvas.width;


      const y =
        hand.center.y *
        canvas.height;


      const color =
        player.side
          ? '#ff5a73'
          : '#5d7cff';


      // Glow ring

      ctx.strokeStyle =
        color;

      ctx.lineWidth = 3;

      ctx.shadowBlur = 15;

      ctx.shadowColor =
        color;


      ctx.beginPath();

      ctx.arc(
        x,
        y,
        32,
        0,
        Math.PI * 2
      );

      ctx.stroke();


      ctx.shadowBlur = 0;


      // Center point

      ctx.fillStyle =
        '#ffffff';


      ctx.beginPath();

      ctx.arc(
        x,
        y,
        5,
        0,
        Math.PI * 2
      );

      ctx.fill();


      // Label

      ctx.save();

      ctx.scale(
        -1,
        1
      );


      ctx.font =
        'bold 14px Arial';

      ctx.fillStyle =
        color;

      ctx.textAlign =
        'center';


      ctx.fillText(

        hand.label === 'left'
          ? 'LEFT'
          : hand.label === 'right'
            ? 'RIGHT'
            : 'HAND',

        -x,

        y - 42

      );


      ctx.restore();

    }


    // ========================================================
    // SHIELD
    // ========================================================

    if (
      player.shield &&
      player.hands[0]
    ) {

      const c =
        player.hands[0].center;


      const x =
        c.x *
        canvas.width;


      const y =
        c.y *
        canvas.height;


      const color =
        player.side
          ? '#ff7085'
          : '#7190ff';


      ctx.strokeStyle =
        color;

      ctx.lineWidth = 5;

      ctx.shadowBlur = 30;

      ctx.shadowColor =
        color;


      ctx.beginPath();

      ctx.arc(
        x,
        y,
        110,
        0,
        Math.PI * 2
      );

      ctx.stroke();


      ctx.shadowBlur = 0;

    }


    // ========================================================
    // CHARGE
    // ========================================================

    drawChargeEffect(
      player,
      performance.now()
    );

  });


  // ==========================================================
  // PROJECTILES
  // ==========================================================

  for (
    const q of projectiles
  ) {

    const color =
      q.owner
        ? '#ff4562'
        : '#5f86ff';


    const gradient =
      ctx.createRadialGradient(
        q.x,
        canvas.height * 0.5,
        1,
        q.x,
        canvas.height * 0.5,
        q.r * 2
      );


    gradient.addColorStop(
      0,
      '#ffffff'
    );

    gradient.addColorStop(
      0.3,
      color
    );

    gradient.addColorStop(
      1,
      'transparent'
    );


    ctx.fillStyle =
      gradient;


    ctx.shadowBlur = 30;

    ctx.shadowColor =
      color;


    ctx.beginPath();

    ctx.arc(
      q.x,
      canvas.height * 0.5,
      q.r * 2,
      0,
      Math.PI * 2
    );

    ctx.fill();


    ctx.shadowBlur = 0;

  }


  // ==========================================================
  // PARTICLES
  // ==========================================================

  for (
    let i = particles.length - 1;
    i >= 0;
    i--
  ) {

    const p =
      particles[i];


    p.x +=
      p.vx / 60;

    p.y +=
      p.vy / 60;


    p.life -=
      1 / 60;


    ctx.globalAlpha =
      Math.max(
        0,
        p.life
      );


    ctx.fillStyle =
      p.side
        ? '#ff6f83'
        : '#7da0ff';


    ctx.shadowBlur = 10;


    ctx.beginPath();

    ctx.arc(
      p.x,
      p.y,
      p.size,
      0,
      Math.PI * 2
    );

    ctx.fill();


    if (
      p.life <= 0
    ) {

      particles.splice(
        i,
        1
      );

    }

  }


  ctx.globalAlpha = 1;

  ctx.shadowBlur = 0;


  // ==========================================================
  // FLASH
  // ==========================================================

  if (
    flashes.length
  ) {

    ctx.fillStyle =
      '#ffffff';


    ctx.globalAlpha =
      Math.min(
        1,
        flashes[0] * 3
      );


    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    ctx.globalAlpha = 1;


    flashes[0] -=
      1 / 60;


    if (
      flashes[0] <= 0
    ) {

      flashes.shift();

    }

  }


  ctx.restore();

}


// ============================================================
// MAIN LOOP
// ============================================================

function loop(ts) {

  if (!running)
    return;


  const dt =
    Math.min(
      0.033,
      (ts - lastTs) / 1000 || 0.016
    );


  lastTs = ts;


  if (
    video.readyState >= 2 &&
    video.currentTime !== lastVideoTime
  ) {

    lastVideoTime =
      video.currentTime;


    const result =
      landmarker.detectForVideo(
        video,
        performance.now()
      );


    classify(result);

  }


  updatePlayer(
    players[0],
    dt
  );


  updatePlayer(
    players[1],
    dt
  );


  updateProjectiles(
    dt
  );


  draw();


  requestAnimationFrame(
    loop
  );

}
