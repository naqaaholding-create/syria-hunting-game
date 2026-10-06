/* رحلة صيد — World & cinematic environment layer */
(function(){
  let started=false, ambience=null, tracks=[], birds=[], grass=[], mountainRing=null;
  const rand=(a,b)=>a+Math.random()*(b-a);

  function mat(color,rough=1){
    return new THREE.MeshStandardMaterial({color,roughness:rough});
  }

  function addMountainRing(){
    if(!(typeof scene!=="undefined"&&scene)||mountainRing) return;
    mountainRing=new THREE.Group();
    for(let i=0;i<18;i++){
      const h=rand(8,25), r=rand(22,42);
      const m=new THREE.Mesh(new THREE.ConeGeometry(r*.45,h,7),mat(0x263a2b));
      const a=i/18*Math.PI*2;
      m.position.set(Math.cos(a)*105,h/2-1,Math.sin(a)*105);
      m.rotation.y=rand(0,Math.PI);
      mountainRing.add(m);
    }
    scene.add(mountainRing);
  }

  function addSky(){
    if(!(typeof scene!=="undefined"&&scene)||scene.userData.skyAdded) return;
    const g=new THREE.SphereGeometry(170,32,16);
    const m=new THREE.MeshBasicMaterial({color:0x7d927f,side:THREE.BackSide,depthWrite:false});
    const sky=new THREE.Mesh(g,m);
    sky.userData.sky=true;
    scene.add(sky);
    scene.userData.skyAdded=true;
  }

  function addGrass(){
    if(!(typeof scene!=="undefined"&&scene)||scene.userData.grassAdded) return;
    for(let i=0;i<280;i++){
      const g=new THREE.Group();
      const blade=new THREE.Mesh(new THREE.ConeGeometry(.035,.45,3),mat(i%3?0x31522e:0x49633b));
      blade.position.y=.22;
      g.add(blade);
      g.position.set(rand(-85,85),0,rand(-75,75));
      g.rotation.y=rand(0,Math.PI*2);
      g.scale.y=rand(.5,1.7);
      scene.add(g); grass.push(g);
    }
    scene.userData.grassAdded=true;
  }

  function addTrail(){
    if(!(typeof scene!=="undefined"&&scene)||scene.userData.trailAdded) return;
    const curve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(-80,.03,65),new THREE.Vector3(-40,.04,28),
      new THREE.Vector3(-18,.05,12),new THREE.Vector3(5,.04,-8),
      new THREE.Vector3(35,.05,-25),new THREE.Vector3(72,.04,-48)
    ]);
    const pts=curve.getPoints(80);
    const geo=new THREE.BufferGeometry().setFromPoints(pts);
    const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0x7c704f,transparent:true,opacity:.5}));
    scene.add(line);
    scene.userData.trailAdded=true;
  }

  function addTracks(){
    if(!(typeof scene!=="undefined"&&scene)||scene.userData.tracksAdded) return;
    for(let i=0;i<28;i++){
      const g=new THREE.CircleGeometry(.09,8);
      const m=new THREE.MeshBasicMaterial({color:0x252a22,transparent:true,opacity:.42,depthWrite:false});
      const t=new THREE.Mesh(g,m);
      t.rotation.x=-Math.PI/2;
      t.position.set(-12+i*.62,.055,18+i*.25+Math.sin(i*.8)*1.2);
      scene.add(t); tracks.push(t);
    }
    scene.userData.tracksAdded=true;
  }

  function addBirds(){
    if(!(typeof scene!=="undefined"&&scene)||scene.userData.birdsAdded) return;
    for(let i=0;i<8;i++){
      const b=new THREE.Group();
      const body=new THREE.Mesh(new THREE.SphereGeometry(.13,7,6),mat(0x202722));
      body.scale.set(1.4,.65,.7); b.add(body);
      const wing=new THREE.Mesh(new THREE.ConeGeometry(.16,.42,5),mat(0x151b17));
      wing.rotation.z=Math.PI/2; wing.position.y=.03; wing.position.x=.12; b.add(wing);
      b.position.set(rand(-60,60),rand(9,18),rand(-60,60));
      scene.add(b); birds.push({g:b,phase:rand(0,Math.PI*2)});
    }
    scene.userData.birdsAdded=true;
  }

  function setupWorld(){
    if(!(typeof THREE!=="undefined"&&THREE)||!(typeof scene!=="undefined"&&scene)) return;
    addSky(); addMountainRing(); addGrass(); addTrail(); addTracks(); addBirds();
  }

  function startAmbience(){
    if(ambience || !window.AudioContext) return;
    try{
      const C=window.AudioContext||window.webkitAudioContext;
      const ctx=new C(), master=ctx.createGain(), osc=ctx.createOscillator();
      master.gain.value=.018; osc.type="sine"; osc.frequency.value=118;
      osc.connect(master); master.connect(ctx.destination); osc.start();
      ambience={ctx,master,osc};
    }catch(e){}
  }

  function stopAmbience(){
    if(!ambience) return;
    try{ambience.master.gain.exponentialRampToValueAtTime(.0001,ambience.ctx.currentTime+1);ambience.osc.stop(ambience.ctx.currentTime+1)}catch(e){}
    ambience=null;
  }

  function worldTick(t){
    if((typeof scene!=="undefined"&&scene)){
      grass.forEach((g,i)=>{g.rotation.z=Math.sin(t*.001+i)*.035});
      birds.forEach((b,i)=>{
        b.g.position.x+=.012+Math.sin(t*.0004+b.phase)*.004;
        b.g.position.z+=Math.cos(t*.0005+b.phase)*.006;
        b.g.rotation.y=Math.sin(t*.0005+b.phase)*.35;
        if(b.g.position.x>90)b.g.position.x=-90;
      });
      if((typeof dog!=="undefined"&&dog) && (typeof active!=="undefined"&&active)){
        dog.rotation.y=Math.sin(t*.002)*.12;
        dog.position.y=Math.abs(Math.sin(t*.008))*.025;
      }
    }
    requestAnimationFrame(worldTick);
  }

  const oldInit=window.init3D;
  window.init3D=function(){
    oldInit();
    setTimeout(setupWorld,350);
  };

  const oldStart=window.startTrip;
  window.startTrip=function(){
    oldStart();
    started=true;
    startAmbience();
    setTimeout(setupWorld,100);
  };

  const oldDog=(typeof dog!=="undefined"&&dog)Cmd;
  (typeof dog!=="undefined"&&dog)Cmd=function(c){
    oldDog(c);
    if(c==="ابحث"||c==="تتبع") tracks.forEach((x,i)=>x.material.opacity=.18+.02*i);
  };

  requestAnimationFrame(worldTick);
})();
