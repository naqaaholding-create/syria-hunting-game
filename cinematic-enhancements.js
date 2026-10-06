/* رحلة صيد — Cinematic Free Build v1
   Adds: hidden prey revealed only on dog discovery, cinematic camera,
   time-of-day lighting, procedural weather particles, animal reaction,
   and a more film-like arrival/discovery sequence.
*/
(function(){
  const originalDogCmd = window.dogCmd;
  const originalStartTrip = window.startTrip;
  let hiddenSpecies = null;
  let preySpeed = 0.018;
  let preyFleeing = false;
  let weatherParticles = null;
  let cinematicCamera = null;
  let cinematicUntil = 0;
  let cinematicMode = false;

  function ensureCinematicCamera(){
    if(!(typeof scene!=="undefined"&&scene) || !(typeof cam!=="undefined"&&cam) || !window.THREE) return;
    if(cinematicCamera) return;
    cinematicCamera = {
      savedPos: new THREE.Vector3(),
      savedQuat: new THREE.Quaternion(),
      target: new THREE.Vector3()
    };
  }

  function film(title, sub, seconds, mode){
    const e=document.getElementById("cinematic");
    if(!e) return;
    document.getElementById("cinTitle").textContent=title;
    document.getElementById("cinSub").textContent=sub;
    e.classList.add("show");
    ensureCinematicCamera();
    if((typeof cam!=="undefined"&&cam) && cinematicCamera){
      cinematicCamera.savedPos.copy(cam.position);
      cinematicCamera.savedQuat.copy(cam.quaternion);
      cinematicMode=true;
      cinematicUntil=performance.now()+seconds*1000;
      if(mode==="arrival"){
        cam.position.x += 4;
        cam.position.y += 4;
        cam.position.z += 8;
      } else if(mode==="discovery"){
        cam.position.x += 2.8;
        cam.position.y += 2.2;
        cam.position.z += 5.5;
      }
      if((typeof animal!=="undefined"&&animal) && animal.visible) cinematicCamera.target.copy(animal.position);
      else cinematicCamera.target.set(cam.position.x,1,cam.position.z-8);
    }
    clearTimeout(window.__filmTimer);
    window.__filmTimer=setTimeout(()=>e.classList.remove("show"),seconds*1000);
  }

  window.cinematic = function(title, sub){
    film(title, sub, 3.2, title.indexOf("اكتشاف")>=0 ? "discovery" : "arrival");
  };

  window.startTrip = function(){
    if(!s.region || !s.area){ toast("حدد المحافظة والمنطقة أولًا"); show("tripView","navTrip"); return; }
    hiddenSpecies=null;
    originalStartTrip();
    setTimeout(()=>{
      film("الوصول إلى "+s.area, s.region+" • وقت محلي حي • مراقبة الرياح والضوء",4.0,"arrival");
    },80);
  };

  window.dogCmd = function(command){
    if(command==="ثبت" && typeof active!=="undefined" && active){
      if(typeof tracking!=="undefined" && tracking>=50){
        const wildlifeByArea={"ذيبين":["حجل","أرنب بري","حمام بري","ثعلب"],"جبل العرب":["حجل","أرنب بري","ثعلب","غزال"],"اللجاة الشرقية":["حجل","أرنب بري","ثعلب"],"البادية":["غزال","أرنب بري","ثعلب","ذئب"],"الجزيرة":["أرنب بري","حمام بري","ثعلب"]}; const pool=wildlifeByArea[s.area]||prey; hiddenSpecies=pool[Math.floor(Math.random()*pool.length)];
        originalDogCmd(command);
        if((typeof animal!=="undefined"&&animal)){
          animal.visible=true;
          animal.scale.setScalar(hiddenSpecies==="غزال"?1.8:hiddenSpecies==="ذئب"?1.25:1);
        }
        document.getElementById("msg").textContent=s.dog+" ثبت على أثر حي. اقترب بحذر؛ نوع الطريدة مخفي حتى لحظة الاقتراب.";
        film("اكتشاف الأثر",s.dog+" ثبت في المكان… هناك حركة في الأمام.",3.5,"discovery");
        return;
      }
    }
    originalDogCmd(command);
  };

  window.fire = function(){
    if(!found){ toast("لا توجد طريدة مكتشفة"); return; }
    const name=hiddenSpecies || "حيوان بري";
    const reward=name==="غزال"?950:name==="ذئب"?600:420;
    s.coins+=reward; save();
    found=false; preyFleeing=true; hiddenSpecies=null;
    if(animal) animal.visible=false;
    film("لحظة الحسم","تم التعرف على الطريدة عند الاقتراب: "+name,3.2,"discovery");
    document.getElementById("msg").textContent="تمت إصابة "+name+" بنجاح. النتيجة محفوظة.";
  };

  function createWeatherParticles(){
    if(!(typeof scene!=="undefined"&&scene) || !window.THREE || weatherParticles) return;
    const count=900;
    const p=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      p[i*3]=(Math.random()-.5)*150;
      p[i*3+1]=Math.random()*45;
      p[i*3+2]=(Math.random()-.5)*150;
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.BufferAttribute(p,3));
    const m=new THREE.PointsMaterial({color:0xdfe8df,size:.08,transparent:true,opacity:.0});
    weatherParticles=new THREE.Points(g,m);
    scene.add(weatherParticles);
  }

  function updateWeatherParticles(){
    if(!weatherParticles || !weatherParticles.geometry) return;
    const arr=weatherParticles.geometry.attributes.position.array;
    const rainy=weatherCode>=51 && weatherCode<=67 || weatherCode>=80 && weatherCode<=82;
    const snowy=weatherCode>=71 && weatherCode<=77;
    weatherParticles.material.opacity=rainy?.45:snowy?.7:0;
    weatherParticles.material.size=snowy?.16:.055;
    for(let i=0;i<arr.length;i+=3){
      arr[i+1]-=rainy?.55:.12;
      arr[i]+=rainy?.025:0;
      if(arr[i+1]<0) arr[i+1]=45;
    }
    weatherParticles.geometry.attributes.position.needsUpdate=true;
  }

  function cinematicTick(){
    if((typeof renderer!=="undefined"&&renderer) && (typeof scene!=="undefined"&&scene) && (typeof cam!=="undefined"&&cam)){
      createWeatherParticles();
      updateWeatherParticles();

      const now=performance.now();
      if(cinematicMode && cinematicCamera){
        const remain=cinematicUntil-now;
        if(remain>0){
          if(animal && animal.visible){
            if(preyFleeing){
              animal.position.x += Math.sin(now*.0021)*preySpeed;
              animal.position.z += Math.cos(now*.0017)*preySpeed;
            }
            cinematicCamera.target.lerp(animal.position,.04);
            cam.lookAt(cinematicCamera.target.x,cinematicCamera.target.y+0.5,cinematicCamera.target.z);
          }
        }else{
          cam.position.lerp(cinematicCamera.savedPos,.08);
          cam.quaternion.slerp(cinematicCamera.savedQuat,.08);
          if(cam.position.distanceTo(cinematicCamera.savedPos)<.08){
            cinematicMode=false;
          }
        }
      }
    }
    requestAnimationFrame(cinematicTick);
  }

  function realLightTick(){
    if(!(typeof sunLight!=="undefined"&&sunLight) || !(typeof scene!=="undefined"&&scene)) return;
    const d=new Date();
    const h=d.getHours()+d.getMinutes()/60;
    const daylight=Math.max(0,Math.sin(((h-6)/12)*Math.PI));
    sunLight.intensity=.25+2.05*daylight;
    sunLight.color.set(daylight<.18?0x8da8c5:daylight<.45?0xe1b878:0xfff0c2);
    scene.background.set(daylight<.10?0x07101b:daylight<.28?0x34485b:daylight<.55?0x7d8e82:0x8da88b);
    if(scene.fog) scene.fog.color.copy(scene.background);
  }

  setInterval(realLightTick,1000);
  requestAnimationFrame(cinematicTick);
  window.addEventListener("load",()=>setTimeout(realLightTick,500));
})();
