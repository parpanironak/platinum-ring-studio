(async function(){
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const defaults={gap:.45,profile:'oval',width:1.7,thickness:1.35,end:'right',whole:'angled',detail:'angled',ghost:true,seats:false};
  const params=new URLSearchParams(location.search);
  const number=(key,fallback,min,max)=>{const raw=params.get(key);if(raw===null)return fallback;const n=Number(raw);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
  const choice=(key,allowed,fallback)=>allowed.includes(params.get(key))?params.get(key):fallback;
  let state={gap:number('g',.45,0,4),width:number('w',1.7,1.3,2.6),thickness:number('t',1.35,1,1.9),profile:choice('p',['oval','soft-square','flat','knife'],'oval'),end:choice('e',['left','right'],'right'),whole:choice('v',['angled','front','top'],'angled'),detail:choice('d',['angled','side','back'],'angled'),ghost:params.get('ghost')!=='0',seats:params.get('seats')==='1'};
  const names={oval:'Oval','soft-square':'Soft square',flat:'Flat with rounded edges',knife:'Knife edge'};
  let views=[],metalGeometry,prepared,frame=0,urlTimer=0;
  function writeControls(){
    for(const key of ['gap','width','thickness']){$('#'+key).value=state[key];$('#'+key+'-output').textContent=state[key].toFixed(2)+' mm';$('#'+key).setAttribute('aria-valuetext',state[key].toFixed(2)+' millimetres');}
    $('#profile').value=state.profile;$('#end').value=state.end;$('#ghost').checked=state.ghost;$('#seats').checked=state.seats;
    $('#section-path').setAttribute('d',RingGeometry.sectionPath(state.profile,state.width,state.thickness));$('#section-width').textContent=state.width.toFixed(2)+' mm';$('#section-caption').textContent=names[state.profile]+' section';
    $('#section-svg').setAttribute('aria-label',`${names[state.profile]} cross-section, ${state.width.toFixed(2)} millimetres wide and ${state.thickness.toFixed(2)} millimetres thick`);
    for(const type of ['whole','detail'])$$(`[data-${type}]`).forEach(b=>{const selected=b.dataset[type]===state[type];b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
  }
  function designURL(){
    const u=new URL(location.href);u.search='';
    for(const [key,value] of Object.entries({g:state.gap.toFixed(2),p:state.profile,w:state.width.toFixed(2),t:state.thickness.toFixed(2),e:state.end,v:state.whole,d:state.detail,ghost:state.ghost?'1':'0',seats:state.seats?'1':'0'}))u.searchParams.set(key,value);
    return u.href;
  }
  function remember(){clearTimeout(urlTimer);urlTimer=setTimeout(()=>history.replaceState(null,'',designURL()),180);}
  function requestUpdate(){writeControls();remember();if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;updateModel();});}
  for(const key of ['gap','width','thickness'])$('#'+key).addEventListener('input',e=>{state[key]=Number(e.target.value);requestUpdate();});
  $('#profile').addEventListener('change',e=>{state.profile=e.target.value;requestUpdate();});
  $('#end').addEventListener('change',e=>{state.end=e.target.value;requestUpdate();});
  $('#ghost').addEventListener('change',e=>{state.ghost=e.target.checked;requestUpdate();});
  $('#seats').addEventListener('change',e=>{state.seats=e.target.checked;requestUpdate();});
  for(const type of ['whole','detail'])$$(`[data-${type}]`).forEach(b=>b.addEventListener('click',()=>{state[type]=b.dataset[type];writeControls();remember();views.find(v=>v.type===type)?.fit(true);}));
  $('#reset').addEventListener('click',()=>{state={...defaults};writeControls();updateModel(true);remember();$('#announcement').textContent='Design reset to the original ring spacing and oval band profile.';});
  $('#share').addEventListener('click',async()=>{
    const url=designURL();
    try{await navigator.clipboard.writeText(url);$('#share').textContent='Link copied';$('#announcement').textContent='Design link copied, including your gap and cross-section settings.';setTimeout(()=>$('#share').textContent='Copy design link',2200);}
    catch{$('#share-fallback').hidden=false;$('#share-url').value=url;$('#share-url').focus();$('#share-url').select();$('#announcement').textContent='Select and copy the design link below the page title.';}
  });
  writeControls();
  async function unpack(info){
    const packed=Uint8Array.from(atob(info.data),c=>c.charCodeAt(0));
    const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const bytes=new Uint8Array(await new Response(stream).arrayBuffer()),half=bytes.length/2,words=new Uint16Array(half);
    for(let i=0;i<half;i++)words[i]=bytes[i]|bytes[half+i]<<8;
    const p=new Float32Array(info.vertices*3),f=new Uint16Array(info.triangles*3);
    for(let i=0;i<info.vertices;i++)for(let a=0;a<3;a++)p[3*i+a]=info.bounds[0][a]+words[a*info.vertices+i]/65535*(info.bounds[1][a]-info.bounds[0][a]);
    for(let i=0;i<info.triangles;i++)for(let a=0;a<3;a++)f[3*i+a]=words[3*info.vertices+a*info.triangles+i];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(new THREE.BufferAttribute(f,1));g.rotateX(-Math.PI/2);g.computeVertexNormals();g.computeBoundingBox();return g;
  }
  function studioEnvironment(renderer){
    const studio=new THREE.Scene();studio.background=new THREE.Color(0x15191e);
    studio.add(new THREE.Mesh(new THREE.BoxGeometry(120,120,120),new THREE.MeshBasicMaterial({color:0x2a3039,side:THREE.BackSide})));
    [[-35,28,10,16,58,4],[30,22,14,12,48,5],[0,45,-20,35,16,3],[0,5,-45,22,38,3]].forEach(([x,y,z,w,h,power])=>{const card=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(power)}));card.position.set(x,y,z);card.lookAt(0,0,0);studio.add(card);});
    const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromScene(studio,.06);pmrem.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});return target;
  }
  function makeView(type,geometries){
    const stage=$('#'+type+'-stage'),renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.localClippingEnabled=true;
    renderer.domElement.setAttribute('aria-label',type==='whole'?'Full platinum ring set':'Raised platinum band tip and sapphire setting');stage.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),env=studioEnvironment(renderer);scene.environment=env.texture;
    const platinum=new THREE.MeshStandardMaterial({color:0xc4cbd4,metalness:1,roughness:.21,envMapIntensity:1.05,side:THREE.DoubleSide});
    const sapphire=new THREE.MeshPhysicalMaterial({color:new THREE.Color(0x123d91).convertSRGBToLinear(),metalness:.04,roughness:.12,clearcoat:.35,reflectivity:.6,envMapIntensity:.25,flatShading:true,side:THREE.DoubleSide});
    const referenceMaterial=platinum.clone();referenceMaterial.roughness=.24;
    const diamond=new THREE.MeshPhysicalMaterial({color:0xdbe7ed,metalness:.02,roughness:.035,clearcoat:1,reflectivity:1,envMapIntensity:1.35,transparent:true,opacity:.72,depthWrite:false,flatShading:true,side:THREE.DoubleSide});
    const group=new THREE.Group(),metal=new THREE.Mesh(geometries.metal,platinum),gems=new THREE.Mesh(geometries.sapphires,sapphire);group.add(metal,gems);scene.add(group);
    const engagement=new THREE.Mesh(geometries.engagement,referenceMaterial),center=new THREE.Mesh(geometries.center,diamond);scene.add(engagement,center);
    scene.add(new THREE.HemisphereLight(0xffffff,0x6f7d8d,.65));
    const key=new THREE.DirectionalLight(0xffffff,1.25);key.position.set(15,30,-25);scene.add(key);
    const rim=new THREE.DirectionalLight(0xe7eef8,.6);rim.position.set(-20,25,15);scene.add(rim);
    const camera=new THREE.PerspectiveCamera(34,1,.05,400),controls=new THREE.OrbitControls(camera,renderer.domElement);
    controls.minDistance=3;controls.maxDistance=160;controls.enableDamping=false;controls.enablePan=false;
    let initialized=false;
    const draw=()=>renderer.render(scene,camera);
    function bounds(){
      const b=new THREE.Box3();
      if(type==='whole'){
        b.union(geometries.metal.boundingBox.clone().translate(group.position));
        if(gems.visible)b.union(geometries.sapphires.boundingBox.clone().translate(group.position));
        b.union(geometries.engagement.boundingBox);b.union(geometries.center.boundingBox);
      }else{
        const side=state.end==='left'?-1:1;
        for(const geometry of [geometries.metal,geometries.sapphires]){const p=geometry.attributes.position;for(let i=0;i<p.count;i++)if(side*p.getX(i)>0&&p.getY(i)>=5.5)b.expandByPoint(new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)).add(group.position));}
        b.expandByPoint(new THREE.Vector3(side*5.4,8.3,0));
      }
      return b;
    }
    function presetDirection(){
      const side=state.end==='left'?-1:1;
      return new THREE.Vector3(...(type==='whole'?(state.whole==='front'?[0,.04,-1.8]:state.whole==='top'?[.05,1.8,-.10]:[.65,.85,-1.8]):state.detail==='side'?[side*.12,.10,-1.8]:state.detail==='back'?[side*.35,-.8,-1.4]:[side*.8,.4,-1.5])).normalize();
    }
    function fit(usePreset=false){
      if(!stage.clientWidth||!stage.clientHeight)return;
      const direction=usePreset||!initialized?presetDirection():camera.position.clone().sub(controls.target).normalize();
      const up=new THREE.Vector3(0,1,0),right=new THREE.Vector3().crossVectors(up,direction).normalize(),screenUp=new THREE.Vector3().crossVectors(direction,right).normalize();
      const b=bounds(),target=b.getCenter(new THREE.Vector3()),tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),tanH=tanV*camera.aspect;let distance=0;
      for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const v=new THREE.Vector3(x,y,z).sub(target),depth=v.dot(direction);distance=Math.max(distance,depth+Math.abs(v.dot(right))/tanH,depth+Math.abs(v.dot(screenUp))/tanV);}
      camera.position.copy(target).addScaledVector(direction,distance*(type==='whole'?1.08:1.15));camera.up.copy(up);controls.target.copy(target);controls.update();initialized=true;draw();
    }
    function apply(force=false){
      group.position.z=-RingGeometry.axialShift(state);gems.visible=!state.seats;
      if(type==='detail'){
        const side=state.end==='left'?-1:1,clips=[new THREE.Plane(new THREE.Vector3(side,0,0),0),new THREE.Plane(new THREE.Vector3(0,1,0),-5.5)];
        platinum.clippingPlanes=clips;sapphire.clippingPlanes=clips;referenceMaterial.clippingPlanes=[...clips,new THREE.Plane(new THREE.Vector3(0,-1,0),11)];
        referenceMaterial.transparent=state.ghost;referenceMaterial.opacity=state.ghost?.28:1;referenceMaterial.depthWrite=!state.ghost;referenceMaterial.needsUpdate=true;platinum.needsUpdate=true;sapphire.needsUpdate=true;
        center.visible=false;
        if(apply.lastEnd!==state.end){force=true;apply.lastEnd=state.end;}
      }
      fit(force);
    }
    controls.addEventListener('change',draw);
    const observer=new ResizeObserver(()=>{renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();fit();});observer.observe(stage);
    renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();
    return {type,fit,apply,renderer,camera,controls};
  }
  function updateModel(force=false){
    if(!prepared||!metalGeometry)return;
    metalGeometry.attributes.position.array.set(RingGeometry.deform(prepared,state));metalGeometry.attributes.position.needsUpdate=true;metalGeometry.computeVertexNormals();metalGeometry.computeBoundingBox();metalGeometry.computeBoundingSphere();
    views.forEach(v=>v.apply(force));
    document.body.dataset.ready='true';
  }
  try{
    if(!window.THREE||!THREE.OrbitControls)throw new Error('The 3D library could not load.');
    const response=await fetch('model.json');if(!response.ok)throw new Error('The ring model could not load.');
    const data=await response.json(),geometries={};await Promise.all(['metal','sapphires','engagement','center'].map(async key=>geometries[key]=await unpack(data[key])));
    metalGeometry=geometries.metal;prepared=RingGeometry.prepare(metalGeometry.attributes.position.array);
    views=[makeView('whole',geometries),makeView('detail',geometries)];updateModel(true);$('#loading').hidden=true;
  }catch(error){$('#loading').textContent='Unable to display the 3D rings: '+error.message;$('#loading').setAttribute('role','alert');document.body.dataset.error='true';}
})();
