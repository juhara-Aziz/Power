import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm";

const video = document.querySelector("#video");
const canvas = document.querySelector("#fx");
const ctx = canvas.getContext("2d");
const startPanel = document.querySelector("#startPanel");
const winnerPanel = document.querySelector("#winnerPanel");
const winnerText = document.querySelector("#winnerText");
const scoreEls = [document.querySelector("#score1"), document.querySelector("#score2")];
const statusEls = [document.querySelector("#status1"), document.querySelector("#status2")];

let landmarker, stream, running=false, lastVideoTime=-1, lastTs=0;
let scores=[0,0], cooldown=0, projectiles=[], particles=[], flashes=[];
const players=[makePlayer(0),makePlayer(1)];

function makePlayer(side){return {side, hands:[], energy:0, charging:false, shield:false, chargePoint:null, lastAttack:0};}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

async function setup(){
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
  landmarker = await HandLandmarker.createFromOptions(vision,{
    baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",delegate:"GPU"},
    runningMode:"VIDEO",numHands:4,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5
  });
}
async function start(){
  if(!landmarker) await setup();
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:false});
  video.srcObject=stream; await video.play(); resize();
  startPanel.classList.add("hidden"); running=true; requestAnimationFrame(loop);
}
function resize(){canvas.width=video.videoWidth||1280;canvas.height=video.videoHeight||720}
window.addEventListener("resize",resize);

document.querySelector("#startBtn").onclick=()=>start().catch(e=>alert("Camera could not be opened: "+e.message));
document.querySelector("#restartBtn").onclick=()=>location.reload();
document.addEventListener("keydown",e=>{if(e.key==="Escape") location.reload();});

function handCenter(h){let x=0,y=0;for(const p of h){x+=p.x;y+=p.y}return {x:1-x/ h.length,y:y/h.length};}
function palmOpen(h){
  // Approximate open-palm test using fingertip distance from wrist.
  const wrist=h[0], tips=[8,12,16,20];
  return tips.filter(i=>Math.hypot(h[i].x-wrist.x,h[i].y-wrist.y)>.18).length>=3;
}
function classify(results){
  players[0].hands=[]; players[1].hands=[];
  for(const h of results.landmarks||[]){
    const c=handCenter(h), player=c.x<.5?players[0]:players[1];
    player.hands.push({landmarks:h,center:c,open:palmOpen(h)});
  }
}
function drawHandGlow(p){
  for(const h of p.hands){
    const x=h.center.x*canvas.width,y=h.center.y*canvas.height;
    ctx.beginPath();ctx.arc(x,y,28+Math.sin(performance.now()/100)*5,0,Math.PI*2);
    ctx.strokeStyle=p.side===0?"#5d7cffaa":"#ff5a73aa";ctx.lineWidth=2;ctx.shadowBlur=24;ctx.shadowColor=ctx.strokeStyle;ctx.stroke();ctx.shadowBlur=0;
  }
}
function chargePoint(p){
  if(p.hands.length<2)return null;
  return {x:(p.hands[0].center.x+p.hands[1].center.x)/2*canvas.width,y:(p.hands[0].center.y+p.hands[1].center.y)/2*canvas.height};
}
function spawnCharge(p,pt,dt){
  const r=18+p.energy*.72;
  for(let i=0;i<Math.ceil(dt*.08*(1+p.energy/30));i++){
    const a=Math.random()*Math.PI*2, d=r*(.7+Math.random()*1.5);
    particles.push({x:pt.x+Math.cos(a)*d,y:pt.y+Math.sin(a)*d,vx:-Math.cos(a)*(15+Math.random()*40),vy:-Math.sin(a)*(15+Math.random()*40),life:.5+Math.random()*.6,max:1,size:1+Math.random()*3,side:p.side});
  }
}
function blast(p,pt){
  projectiles.push({owner:p.side,x:pt.x,y:pt.y,target:p.side?canvas.width*.18:canvas.width*.82,r:18,life:0});
  for(let i=0;i<55;i++){const a=Math.random()*Math.PI*2,s=80+Math.random()*400;particles.push({x:pt.x,y:pt.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.55,max:1,size:2+Math.random()*5,side:p.side});}
  flashes.push({life:.35,max:.35});
  p.energy=0;p.charging=false;p.chargePoint=null;p.lastAttack=performance.now();
}
function updatePlayer(p,dt){
  const cp=chargePoint(p), now=performance.now();
  p.shield=p.hands.length===1 && p.hands[0].open && now-p.lastAttack>700;
  if(cp && p.hands.length>=2 && now-p.lastAttack>900){
    p.charging=true;p.chargePoint=cp;p.energy=clamp(p.energy+dt*38,0,100);
    spawnCharge(p,cp,dt);
    if(p.energy>=100)blast(p,cp);
  }else if(!cp){p.charging=false;p.energy=lerp(p.energy,0,dt*4);p.chargePoint=null}
  statusEls[p.side].textContent=p.shield?"SHIELD":p.charging?`CHARGING ${Math.round(p.energy)}%`:"READY";
}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){
    const q=projectiles[i], dir=Math.sign(q.target-q.x);
    q.x+=dir*(360+q.r*3)*dt;q.life+=dt;q.r+=20*dt;
    const target=players[q.owner?0:1], shield=target.shield;
    const targetX=q.owner?canvas.width*.82:canvas.width*.18;
    if(shield && Math.abs(q.x-targetX)<70){
      impact(q.x,canvas.height*.5,true);projectiles.splice(i,1);continue;
    }
    if((dir>0&&q.x>targetX)||(dir<0&&q.x<targetX)||q.life>3){impact(targetX,canvas.height*.5,false);if(q.life<=3)scores[q.owner]++;projectiles.splice(i,1);updateScores();}
  }
}
function impact(x,y,blocked){
  flashes.push({life:blocked?.2:.45,max:blocked?.2:.45});
  for(let i=0;i<(blocked?35:90);i++){const a=Math.random()*Math.PI*2,s=blocked?90+Math.random()*180:120+Math.random()*500;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.3+Math.random()*.7,max:1,size:2+Math.random()*6,side:blocked?0:1});}
  if(!blocked && scores.some(s=>s>=5))endGame(scores[0]>=5?0:1);
}
function updateScores(){scoreEls[0].textContent=scores[0];scoreEls[1].textContent=scores[1];}
function endGame(w){running=false;if(stream)stream.getTracks().forEach(t=>t.stop());winnerText.textContent=`PLAYER ${w+1} WINS`;winnerPanel.classList.remove("hidden");}
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  players.forEach(p=>{
    drawHandGlow(p);
    if(p.shield && p.hands[0]){
      const c=p.hands[0].center,x=c.x*canvas.width,y=c.y*canvas.height;
      const g=ctx.createRadialGradient(x,y,15,x,y,125);g.addColorStop(0,"#ffffff22");g.addColorStop(.65,p.side===0?"#5274ff55":"#ff4e6655");g.addColorStop(1,"transparent");
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,125+Math.sin(performance.now()/120)*8,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=p.side===0?"#7190ff":"#ff7085";ctx.lineWidth=3;ctx.shadowBlur=25;ctx.shadowColor=ctx.strokeStyle;ctx.beginPath();ctx.arc(x,y,105+Math.sin(performance.now()/100)*6,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
    }
    if(p.charging&&p.chargePoint){
      const {x,y}=p.chargePoint,r=20+p.energy*.8;
      const g=ctx.createRadialGradient(x,y,1,x,y,r*1.6);g.addColorStop(0,"#fff");g.addColorStop(.12,p.side===0?"#72a1ff":"#ff7185");g.addColorStop(.45,p.side===0?"#3766ff88":"#ff2d4f88");g.addColorStop(1,"transparent");
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r*1.6,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
    }
  });
  for(const q of projectiles){const g=ctx.createRadialGradient(q.x,q.y,1,q.x,q.y,q.r*2.2);g.addColorStop(0,"#fff");g.addColorStop(.15,q.owner?"#ff4562":"#5f86ff");g.addColorStop(1,"transparent");ctx.fillStyle=g;ctx.beginPath();ctx.arc(q.x,q.y,q.r*2.2,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(q.x,q.y,q.r*.65,0,Math.PI*2);ctx.fill();}
  for(let i=particles.length-1;i>=0;i--){const a=particles[i];a.x+=a.vx/60;a.y+=a.vy/60;a.life-=1/60;ctx.globalAlpha=Math.max(0,a.life/a.max);ctx.fillStyle=a.side===0?"#7da0ff":"#ff6f83";ctx.beginPath();ctx.arc(a.x,a.y,a.size,0,Math.PI*2);ctx.fill();if(a.life<=0)particles.splice(i,1)}ctx.globalAlpha=1;
  if(flashes.length){ctx.fillStyle="#ffffff";ctx.globalAlpha=Math.min(1,flashes[0].life*3);ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalAlpha=1;flashes[0].life-=1/60;if(flashes[0].life<=0)flashes.shift();}
}
function loop(ts){
  if(!running)return;const dt=Math.min(.033,(ts-lastTs)/1000||.016);lastTs=ts;
  if(video.readyState>=2&&video.currentTime!==lastVideoTime){lastVideoTime=video.currentTime;const res=landmarker.detectForVideo(video,performance.now());classify(res);}
  updatePlayer(players[0],dt);updatePlayer(players[1],dt);updateProjectiles(dt);draw();requestAnimationFrame(loop);
}
