const video=document.querySelector('#video'),canvas=document.querySelector('#fx'),ctx=canvas.getContext('2d');
const startBtn=document.querySelector('#startBtn'),startPanel=document.querySelector('#startPanel'),winnerPanel=document.querySelector('#winnerPanel'),winnerText=document.querySelector('#winnerText');
const scoreEls=[document.querySelector('#score1'),document.querySelector('#score2')],statusEls=[document.querySelector('#status1'),document.querySelector('#status2')];
let HandLandmarker,FilesetResolver,landmarker,stream,running=false,lastVideoTime=-1,lastTs=0,scores=[0,0],projectiles=[],particles=[],flashes=[];
const players=[makePlayer(0),makePlayer(1)];
function makePlayer(side){
  return {
    side,
    hands: [],
    energy: 0,
    charging: false,
    shield: false,
    chargePoint: null,
    lastAttack: 0
  }
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;

async function setup(){
  const version='0.10.14',cdn=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}`;
  const mod=await import(cdn);
  FilesetResolver=mod.FilesetResolver;HandLandmarker=mod.HandLandmarker;
  const resolver=await FilesetResolver.forVisionTasks(`${cdn}/wasm`);
  landmarker=await HandLandmarker.createFromOptions(resolver,{baseOptions:{
    modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    delegate:'CPU'},runningMode:'VIDEO',numHands:4,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5});
}
async function start(){
  try{
    startBtn.disabled=true;startBtn.textContent='LOADING...';
    await setup();
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera requires HTTPS. Open the GitHub Pages URL.');
    startBtn.textContent='REQUESTING CAMERA...';
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});
    video.srcObject=stream;await video.play();resize();startPanel.classList.add('hidden');running=true;lastTs=performance.now();requestAnimationFrame(loop);
  }catch(e){
    console.error(e);startBtn.disabled=false;startBtn.textContent='TRY AGAIN';
    alert('تعذر تشغيل اللعبة.\n\n'+(e?.message||e)+'\n\nافتحي F12 ثم Console إذا استمرت المشكلة.');
  }
}
startBtn.onclick=start;document.querySelector('#restartBtn').onclick=()=>location.reload();
function resize(){canvas.width=video.videoWidth||1280;canvas.height=video.videoHeight||720}window.onresize=resize;
function center(h){let x=0,y=0;for(const p of h){x+=p.x;y+=p.y}return{x:1-x/h.length,y:y/h.length}}
function openPalm(h){const w=h[0],tips=[8,12,16,20];return tips.filter(i=>Math.hypot(h[i].x-w.x,h[i].y-w.y)>.18).length>=3}
function classify(r) {
  players[0].hands = [];
  players[1].hands = [];

  const landmarks = r?.landmarks || [];
  const handedness = r?.handednesses || [];

  for (let i = 0; i < landmarks.length; i++) {
    const h = landmarks[i];

    const c = center(h);
    const open = openPalm(h);

    const label =
      handedness[i]?.[0]?.categoryName?.toLowerCase() || '';

    const hand = {
      center: c,
      open,
      label
    };

    // نستخدم مكان اليد فقط لتحديد اللاعب
    // لكن نحتفظ بمعلومة Left / Right من MediaPipe
    const player = c.x < 0.5 ? players[0] : players[1];

    player.hands.push(hand);
  }

  // ترتيب اليدين داخل كل لاعب
  players.forEach(player => {
    player.hands.sort((a, b) => {
      if (a.label === 'left') return -1;
      if (b.label === 'left') return 1;
      return 0;
    });
  });
}


function chargePoint(p){if(p.hands.length<2)return null;return{x:(p.hands[0].center.x+p.hands[1].center.x)/2*canvas.width,y:(p.hands[0].center.y+p.hands[1].center.y)/2*canvas.height}}
function particlesAt(x,y,n,side,speed=300){for(let i=0;i<n;i++){let a=Math.random()*Math.PI*2,s=speed*(.3+Math.random());particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.3+Math.random()*.7,size:2+Math.random()*5,side})}}
function blast(p,pt){projectiles.push({owner:p.side,x:pt.x,target:p.side?canvas.width*.18:canvas.width*.82,r:18,life:0});particlesAt(pt.x,pt.y,55,p.side,400);flashes.push(.35);p.energy=0;p.charging=false;p.chargePoint=null;p.lastAttack=performance.now()}
function updatePlayer(p,dt){const cp=chargePoint(p),now=performance.now();p.shield=p.hands.length===1&&p.hands[0].open&&now-p.lastAttack>700;
if(cp&&now-p.lastAttack>900){p.charging=true;p.chargePoint=cp;p.energy=clamp(p.energy+dt*38,0,100);if(p.energy>=100)blast(p,cp)}
else if(!cp){p.charging=false;p.energy=lerp(p.energy,0,dt*4);p.chargePoint=null}
statusEls[p.side].textContent=p.shield?'SHIELD':p.charging?`CHARGING ${Math.round(p.energy)}%`:'READY'}
function impact(x,y,blocked){flashes.push(blocked?.2:.45);particlesAt(x,y,blocked?35:90,blocked?0:1,blocked?180:500);if(!blocked&&scores.some(s=>s>=5))endGame(scores[0]>=5?0:1)}
function updateProjectiles(dt){for(let i=projectiles.length-1;i>=0;i--){let q=projectiles[i],dir=Math.sign(q.target-q.x);q.x+=dir*(360+q.r*3)*dt;q.life+=dt;q.r+=20*dt;let target=players[q.owner?0:1],tx=q.owner?canvas.width*.82:canvas.width*.18;
if(target.shield&&Math.abs(q.x-tx)<70){impact(q.x,canvas.height*.5,true);projectiles.splice(i,1);continue}
if((dir>0&&q.x>tx)||(dir<0&&q.x<tx)||q.life>3){impact(tx,canvas.height*.5,false);if(q.life<=3){scores[q.owner]++;scoreEls[q.owner].textContent=scores[q.owner]}projectiles.splice(i,1)}}}
function endGame(w){running=false;if(stream)stream.getTracks().forEach(t=>t.stop());winnerText.textContent=`PLAYER ${w+1} WINS`;winnerPanel.classList.remove('hidden')}

function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);players.forEach(p=>{for (const h of p.hands) {
  const x = h.center.x * canvas.width;
  const y = h.center.y * canvas.height;

  const color = p.side ? '#ff5a73' : '#5d7cff';

  // دائرة حول اليد
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowBlur = 15;
  ctx.shadowColor = color;

  ctx.beginPath();
  ctx.arc(x, y, 32, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 0;

  // نقطة في مركز اليد
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();

  // اسم اليد
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';

  ctx.fillText(
    h.label === 'left' ? 'LEFT' :
    h.label === 'right' ? 'RIGHT' :
    'HAND',
    x,
    y - 42
  );
}

                                                                                  if(p.shield&&p.hands[0]){let c=p.hands[0].center,x=c.x*canvas.width,y=c.y*canvas.height;ctx.strokeStyle=p.side?'#ff7085':'#7190ff';ctx.lineWidth=4;ctx.shadowBlur=25;ctx.shadowColor=ctx.strokeStyle;ctx.beginPath();ctx.arc(x,y,110,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0}
if(p.charging&&p.chargePoint){let{x,y}=p.chargePoint,r=20+p.energy*.8,g=ctx.createRadialGradient(x,y,1,x,y,r*1.7);g.addColorStop(0,'#fff');g.addColorStop(.2,p.side?'#ff7185':'#72a1ff');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r*1.7,0,Math.PI*2);ctx.fill()}})
for(const q of projectiles){ctx.fillStyle='#fff';ctx.shadowBlur=30;ctx.shadowColor=q.owner?'#ff4562':'#5f86ff';ctx.beginPath();ctx.arc(q.x,canvas.height*.5,q.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0}
for(let i=particles.length-1;i>=0;i--){let a=particles[i];a.x+=a.vx/60;a.y+=a.vy/60;a.life-=1/60;ctx.globalAlpha=Math.max(0,a.life);ctx.fillStyle=a.side?'#ff6f83':'#7da0ff';ctx.beginPath();ctx.arc(a.x,a.y,a.size,0,Math.PI*2);ctx.fill();if(a.life<=0)particles.splice(i,1)}ctx.globalAlpha=1;
if(flashes.length){ctx.fillStyle='#fff';ctx.globalAlpha=Math.min(1,flashes[0]*3);ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalAlpha=1;flashes[0]-=1/60;if(flashes[0]<=0)flashes.shift()}}
function loop(ts){if(!running)return;let dt=Math.min(.033,(ts-lastTs)/1000||.016);lastTs=ts;if(video.readyState>=2&&video.currentTime!==lastVideoTime){lastVideoTime=video.currentTime;classify(landmarker.detectForVideo(video,performance.now()))}updatePlayer(players[0],dt);updatePlayer(players[1],dt);updateProjectiles(dt);draw();requestAnimationFrame(loop)}
