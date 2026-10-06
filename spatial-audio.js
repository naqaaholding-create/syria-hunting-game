/* رحلة صيد — Continuous spatial audio layer v2 */
(function(){
  const sources = new Map();
  let ctx = null, master = null, listener = null, lastStep = 0, lastWild = 0;

  function initAudio(){
    if(ctx) { if(ctx.state === "suspended") ctx.resume().catch(()=>{}); return true; }
    try{
      const C = window.AudioContext || window.webkitAudioContext;
      if(!C) return false;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      listener = ctx.listener;
      return true;
    }catch(e){ return false; }
  }

  function setListener(){
    if(!ctx || !listener || typeof cam === "undefined" || !cam) return;
    const p = cam.position, q = cam.quaternion;
    const f = new THREE.Vector3(0,0,-1).applyQuaternion(q);
    const u = new THREE.Vector3(0,1,0).applyQuaternion(q);
    if(listener.positionX){ listener.positionX.value=p.x; listener.positionY.value=p.y; listener.positionZ.value=p.z; listener.forwardX.value=f.x; listener.forwardY.value=f.y; listener.forwardZ.value=f.z; listener.upX.value=u.x; listener.upY.value=u.y; listener.upZ.value=u.z; }
    else { listener.setPosition(p.x,p.y,p.z); listener.setOrientation(f.x,f.y,f.z,u.x,u.y,u.z); }
  }

  function ensureSource(id, obj, kind){
    if(!ctx || !obj) return null;
    let s = sources.get(id);
    if(s) return s;
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = kind === "animal" ? 4 : 2.5;
    p.rolloffFactor = kind === "animal" ? 1.35 : 1.1;
    p.maxDistance = 90;
    const gain = ctx.createGain();
    gain.gain.value = kind === "animal" ? 0.045 : 0.025;
    p.connect(gain); gain.connect(master);
    const osc = ctx.createOscillator();
    osc.type = kind === "animal" ? "sine" : "triangle";
    osc.frequency.value = kind === "animal" ? 170 : 115;
    osc.connect(p); osc.start();
    s={p,gain,osc,obj,kind};
    sources.set(id,s);
    return s;
  }

  function updateSource(s){
    if(!s || !s.obj || !s.obj.visible) { if(s) s.gain.gain.value=0; return; }
    const p=s.obj.position;
    s.gain.gain.value = s.kind==="animal" ? 0.045 : 0.025;
    if(s.p.positionX){ s.p.positionX.value=p.x; s.p.positionY.value=p.y+0.6; s.p.positionZ.value=p.z; }
    else s.p.setPosition(p.x,p.y+0.6,p.z);
  }

  function pulse(obj, kind, freq, volume, duration){
    if(!initAudio() || !obj) return;
    const p=ctx.createPanner(); p.panningModel="HRTF"; p.distanceModel="inverse"; p.refDistance=2; p.rolloffFactor=1.15; p.maxDistance=100;
    const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,ctx.currentTime); g.gain.exponentialRampToValueAtTime(volume,ctx.currentTime+0.015); g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+duration);
    const o=ctx.createOscillator(); o.type=kind==="shot"?"sawtooth":"triangle"; o.frequency.setValueAtTime(freq,ctx.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(45,freq*.45),ctx.currentTime+duration);
    o.connect(p); p.connect(g); g.connect(master);
    const x=obj.position; if(p.positionX){p.positionX.value=x.x;p.positionY.value=x.y+.5;p.positionZ.value=x.z}else p.setPosition(x.x,x.y+.5,x.z);
    o.start(); o.stop(ctx.currentTime+duration+.03);
  }

  function tick(now){
    if(!ctx && typeof active!=="undefined" && active) initAudio();
    if(ctx){
      if(ctx.state==="suspended") ctx.resume().catch(()=>{});
      setListener();
      updateSource(ensureSource("dog", typeof dog!=="undefined"?dog:null,"dog"));
      updateSource(ensureSource("animal", typeof animal!=="undefined"?animal:null,"animal"));
      const moving = typeof active!=="undefined" && active && typeof cam!=="undefined" && (Math.abs((keys.w?1:0)-(keys.s?1:0))+Math.abs((keys.d?1:0)-(keys.a?1:0))+Math.abs(joy.x)+Math.abs(joy.y)>0.1);
      if(moving && now-lastStep>430){ pulse(typeof player!=="undefined"?player:null,"step",120,0.018,.12); lastStep=now; }
      if(typeof animal!=="undefined" && animal && animal.visible && now-lastWild>5200){ pulse(animal,"animal",180,0.035,.55); lastWild=now; }
    }
    requestAnimationFrame(tick);
  }

  window.spatialAudioInit=initAudio;
  window.spatialAudioShot=function(){ pulse(typeof animal!=="undefined"&&animal&&animal.visible?animal:(typeof player!=="undefined"?player:null),"shot",95,0.18,.65); };
  window.spatialAudioAnimal=function(){ pulse(typeof animal!=="undefined"?animal:null,"animal",190,0.04,.5); };
  window.spatialAudioTick=()=>{};
  window.addEventListener("pointerdown",initAudio,{once:false,passive:true});
  window.addEventListener("keydown",initAudio,{once:false,passive:true});
  requestAnimationFrame(tick);
})();