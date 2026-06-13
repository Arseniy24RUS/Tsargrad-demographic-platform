import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

const container = document.getElementById('estateThree');
const dimensionPlan = document.getElementById('estateDimensionPlan');
let scene, camera, renderer, controls, estateGroup, dimensionLayer, currentModel = null, defaultView = null;
let mainHouseBounds = null, cameraFitBounds = null, viewBounds = null, fullSceneBounds = null, sizeObserver = null;
let fitSettleTimers = [], fitRafIds = [];
let lastCanvasSize = { w: 0, h: 0, dpr: 0, visualW: 0, visualH: 0, visualScale: 1 };
let fitCount = 0, lastFitReason = 'not-fitted', fenceGateCount = 0, dimensionLabelCount = 0, dimensionSvgLabelCount = 0, dimension3dLabelCount = 0, dimensionArrowCount = 0, dimensionsVisible = false;
let dimensionEndCapCount = 0, dimensionGroundLabelCount = 0, dimensionWhiteLabelCount = 0, dimensionHeightLinePresent = false;
let treeCount = 0, treeCollisionCount = 0, minTreeClearanceM = 0;
let roofDetailMeshCount = 0, lastDimensionTogglePreservedCamera = true, currentElderLayout = null;
let siteDimensions = null;
const VIEW_VERSION = '20260613-estate-groundplan1';
const ROOF_POLICY = 'faceted-opaque-no-shadow-receive';
const DIMENSION_OVERLAY_MODE = 'ground-plan';
const DOOR_METRICS = {
  widthM: 1.05,
  heightM: 2.15,
  leafWidthM: 0.90,
  leafHeightM: 2.05
};
const WINDOW_METRICS = {
  widthM: 1.35,
  heightM: 1.40,
  sillHeightM: 0.88,
  sideWidthM: 1.18,
  sideHeightM: 1.26
};
const COLORS = {
  teal: 0x145b61,
  deep: 0x0b3438,
  gold: 0xd4a537,
  goldSoft: 0xefd39a,
  cream: 0xf4efe4,
  wall: 0xfffbf1,
  glass: 0x9fd0df,
  roof: 0xb07a2a,
  grass: 0x8fae78,
  path: 0xd5c2a1,
  elder: 0x6aa7c7,
  extra: 0xc7baa0
};

function init(){
  if(!container) return;
  if(!supportsWebGL()){
    container.parentElement?.classList.add('estate-three-fallback-active');
    const fallback=container.parentElement?.querySelector('.estate-three-fallback');
    if(fallback) fallback.textContent='трёхмерный режим недоступен, показана расчётная схема';
    return;
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8f0df);
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
  renderer.setPixelRatio(currentDpr());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 90;
  controls.maxPolarAngle = Math.PI * 0.48;
  applySafeInitialView();

  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x617d73, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 2.15);
  sun.position.set(-15, 24, 18);
  sun.castShadow = true;
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  const warm = new THREE.PointLight(0xffd27e, 0.65, 35);
  warm.position.set(5, 8, -6);
  scene.add(warm);

  estateGroup = new THREE.Group();
  scene.add(estateGroup);
  resize(false, 'init');
  installResizeGuards();
  animate();

  window.Estate3D = { update, resetView, setDimensionsVisible, getViewState };
  container.parentElement?.classList.add('estate-three-ready');
  if(window._estateModel) update(window._estateModel.m, window._estateModel.p);
}
function supportsWebGL(){
  try{
    const canvas=document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  }catch(_){
    return false;
  }
}
function installResizeGuards(){
  const onResize = reason => handleLayoutChange(reason);
  window.addEventListener('resize', ()=>onResize('window.resize'));
  window.addEventListener('orientationchange', ()=>onResize('orientationchange'));
  window.addEventListener('pageshow', ()=>onResize('pageshow'));
  window.addEventListener('focus', ()=>onResize('window.focus'));
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) onResize('visibilitychange'); });
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', ()=>onResize('visualViewport.resize'));
    window.visualViewport.addEventListener('scroll', ()=>onResize('visualViewport.scroll'));
  }
  if('ResizeObserver' in window){
    sizeObserver = new ResizeObserver(()=>onResize('ResizeObserver'));
    sizeObserver.observe(container);
  }
  if(document.fonts?.ready){
    document.fonts.ready.then(()=>onResize('fonts.ready')).catch(()=>{});
  }
}
function currentDpr(){
  return Math.min(2, window.devicePixelRatio || 1);
}
function currentVisualMetrics(){
  const vv = window.visualViewport;
  return {
    visualW: vv?.width || window.innerWidth || 0,
    visualH: vv?.height || window.innerHeight || 0,
    visualScale: vv?.scale || 1
  };
}
function handleLayoutChange(reason){
  const changed = resize(false, reason);
  if(currentModel && changed) scheduleSettleFits(reason);
}
function applySafeInitialView(){
  if(!camera || !controls) return;
  camera.position.set(24, 18, -25);
  controls.target.set(0, 2.2, 0);
  camera.near = 0.1;
  camera.far = 220;
  camera.updateProjectionMatrix();
  controls.update();
}

function material(color, roughness=0.72, metalness=0.02){
  return new THREE.MeshStandardMaterial({color, roughness, metalness});
}
let roofTileTexture = null;
function getRoofTileTexture(){
  if(roofTileTexture) return roofTileTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,256,256);
  ctx.strokeStyle = 'rgba(60,34,14,.18)';
  ctx.lineWidth = 2;
  for(let y=22;y<256;y+=24){
    ctx.beginPath();
    ctx.moveTo(0,y);
    ctx.lineTo(256,y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.26)';
  ctx.lineWidth = 1;
  for(let y=34;y<256;y+=24){
    ctx.beginPath();
    ctx.moveTo(0,y);
    ctx.lineTo(256,y);
    ctx.stroke();
  }
  roofTileTexture = new THREE.CanvasTexture(canvas);
  roofTileTexture.wrapS = THREE.RepeatWrapping;
  roofTileTexture.wrapT = THREE.RepeatWrapping;
  roofTileTexture.repeat.set(4, 7);
  roofTileTexture.colorSpace = THREE.SRGBColorSpace;
  return roofTileTexture;
}
function shadeColor(color, factor){
  return new THREE.Color(color).multiplyScalar(factor);
}
function roofMaterial(color, shade=1, textured=true){
  const mat = new THREE.MeshStandardMaterial({
    color: shadeColor(color, shade),
    roughness:0.68,
    metalness:0.02,
    map:textured ? getRoofTileTexture() : null,
    flatShading:true
  });
  mat.side = THREE.FrontSide;
  mat.transparent = false;
  mat.opacity = 1;
  mat.depthTest = true;
  mat.depthWrite = true;
  return mat;
}
function roofFace(points, mat, role=''){
  const positions = [];
  const uvs = [];
  const tri = points.length === 3 ? [0,1,2] : [0,1,2,0,2,3];
  const uvBase = points.length === 3 ? [[0,0],[1,0],[0.5,1]] : [[0,0],[1,0],[1,1],[0,1]];
  tri.forEach(i=>{
    positions.push(points[i].x, points[i].y, points[i].z);
    uvs.push(uvBase[i][0], uvBase[i][1]);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.userData.roofPolicy = ROOF_POLICY;
  mesh.userData.roofDetail = true;
  if(role) mesh.userData.fitRole = role;
  return mesh;
}
function box(w,h,d, mat, x=0,y=0,z=0, role=''){
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  mesh.position.set(x,y+h/2,z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if(role) mesh.userData.fitRole = role;
  return mesh;
}
function line(points, color=COLORS.deep){
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const obj = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, depthTest:false, depthWrite:false }));
  obj.renderOrder = 40;
  return obj;
}
function gableRoof(w,d,h,color, role=''){
  const hw=w/2, hd=d/2;
  const g = new THREE.Group();
  g.userData.roofPolicy = ROOF_POLICY;
  const p0 = new THREE.Vector3(-hw,0,-hd), p1 = new THREE.Vector3(hw,0,-hd), p2 = new THREE.Vector3(0,h,-hd);
  const p3 = new THREE.Vector3(-hw,0,hd), p4 = new THREE.Vector3(hw,0,hd), p5 = new THREE.Vector3(0,h,hd);
  g.add(roofFace([p1,p2,p5,p4], roofMaterial(color,1.06,true), role));
  g.add(roofFace([p0,p3,p5,p2], roofMaterial(color,0.88,true), role));
  g.add(roofFace([p0,p2,p1], roofMaterial(color,0.78,false), role));
  g.add(roofFace([p3,p4,p5], roofMaterial(color,0.70,false), role));
  const fasciaMat = roofMaterial(0x7e541d,0.92,false);
  const ridge = box(0.24,0.22,d+0.36,fasciaMat,0,h-0.04,0,role);
  const leftEave = box(0.22,0.22,d+0.50,fasciaMat,-hw+0.02,0.02,0,role);
  const rightEave = box(0.22,0.22,d+0.50,fasciaMat,hw-0.02,0.02,0,role);
  const frontFascia = box(w+0.40,0.24,0.20,fasciaMat,0,0.02,-hd,role);
  const rearFascia = box(w+0.40,0.24,0.20,fasciaMat,0,0.02,hd,role);
  [ridge,leftEave,rightEave,frontFascia,rearFascia].forEach(mesh=>{
    mesh.receiveShadow = false;
    mesh.userData.roofPolicy = ROOF_POLICY;
    mesh.userData.roofDetail = true;
  });
  g.add(ridge,leftEave,rightEave,frontFascia,rearFascia);
  return g;
}
function facadeNormal(rot){
  return new THREE.Vector3(-Math.sin(rot), 0, -Math.cos(rot)).normalize();
}
function offsetFacadePosition(x,y,z, rot, outward=0){
  const n = facadeNormal(rot);
  return { x:x + n.x * outward, y, z:z + n.z * outward };
}
function facadeBox(w,h,d, mat, x,y,z, rot=0, outward=0, role=''){
  const pos = offsetFacadePosition(x,y,z,rot,outward);
  const mesh = box(w,h,d,mat,pos.x,pos.y,pos.z,role);
  mesh.rotation.y = rot;
  return mesh;
}
function facadeOrientation(rot){
  const n = facadeNormal(rot);
  if(n.z < -0.7) return 'front';
  if(n.z > 0.7) return 'rear';
  return n.x < 0 ? 'left' : 'right';
}
function windowPanel(x,y,z, rot=0, scale=1, role='mainHouse', variant='front'){
  const baseW = variant === 'side' ? WINDOW_METRICS.sideWidthM : WINDOW_METRICS.widthM;
  const baseH = variant === 'side' ? WINDOW_METRICS.sideHeightM : WINDOW_METRICS.heightM;
  const frameW = baseW * scale;
  const frameH = baseH * scale;
  const normal = facadeNormal(rot);
  const orientation = facadeOrientation(rot);
  const frame = facadeBox(frameW,frameH,0.08, material(0xffffff,0.35), x,y,z,rot,0,role);
  const glass = facadeBox(frameW-0.20*scale,frameH-0.24*scale,0.09, material(COLORS.glass,0.25,0.05), x,y+0.10*scale,z,rot,0.016,role);
  const mullionV = facadeBox(0.065*scale,frameH-0.24*scale,0.10, material(0xffffff,0.42), x,y+0.10*scale,z,rot,0.032,role);
  const mullionH = facadeBox(frameW-0.22*scale,0.055*scale,0.10, material(0xffffff,0.42), x,y+frameH*0.50,z,rot,0.036,role);
  const sill = facadeBox(frameW+0.26*scale,0.08*scale,0.22, material(0xd8c49f,0.72), x,y-0.08*scale,z,rot,0.075,role);
  [frame,glass,mullionV,mullionH,sill].forEach((mesh,index)=>{
    mesh.userData.windowPanel = true;
    mesh.userData.windowPart = ['frame','glass','mullionV','mullionH','sill'][index];
    mesh.userData.windowOrientation = orientation;
    mesh.userData.windowNormal = {x:normal.x,y:normal.y,z:normal.z};
  });
  const g = new THREE.Group();
  g.userData.windowPanelGroup = true;
  g.userData.windowOrientation = orientation;
  g.add(frame,glass,mullionV,mullionH,sill);
  return g;
}
function entryDoor(x,y,z, role='mainHouse'){
  const casing = facadeBox(DOOR_METRICS.widthM+0.20,DOOR_METRICS.heightM+0.18,0.12, material(0xf4efe4,0.55), x,y,z,0,0,role);
  const door = facadeBox(DOOR_METRICS.leafWidthM,DOOR_METRICS.leafHeightM,0.13, material(0x725735,0.72), x,y+0.04,z,0,0.050,role);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.07,16,12), material(COLORS.gold,0.42,0.22));
  const handlePos = offsetFacadePosition(x+0.31, y+1.08, z, 0, 0.16);
  handle.position.set(handlePos.x, handlePos.y, handlePos.z);
  handle.castShadow = true;
  handle.userData.fitRole = role;
  const g = new THREE.Group();
  g.add(casing, door, handle);
  return g;
}
function makeLabel(text, colorHex, width=3.0, height=1.0){
  const canvas = document.createElement('canvas');
  canvas.width = 720; canvas.height = 220;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const lines = text.split('\n');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(246,242,232,0.82)';
  ctx.lineWidth = 8;
  ctx.fillStyle = '#111514';
  ctx.font = '800 42px Arial, sans-serif';
  ctx.strokeText(lines[0] || '', 360, 82);
  ctx.fillText(lines[0] || '', 360, 82);
  ctx.font = '900 48px Arial, sans-serif';
  ctx.fillStyle = '#' + colorHex.toString(16).padStart(6,'0');
  ctx.strokeText(lines[1] || '', 360, 148);
  ctx.fillText(lines[1] || '', 360, 148);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true}));
  spr.scale.set(width,height,1);
  return spr;
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function disposeObject(obj){
  obj.traverse?.(o=>{
    o.geometry?.dispose?.();
    if(o.material){
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      materials.forEach(mat=>{
        mat.map?.dispose?.();
        mat.dispose?.();
      });
    }
  });
}
function clearGroup(g){
  while(g.children.length){
    const obj=g.children.pop();
    disposeObject(obj);
  }
}

function update(m,p){
  if(!estateGroup) return;
  currentModel = {m,p};
  clearGroup(estateGroup);
  dimensionLayer = new THREE.Group();
  dimensionLayer.visible = false;
  fenceGateCount = 0;
  dimensionLabelCount = 0;
  dimensionSvgLabelCount = 0;
  dimension3dLabelCount = 0;
  dimensionArrowCount = 0;
  dimensionEndCapCount = 0;
  dimensionGroundLabelCount = 0;
  dimensionWhiteLabelCount = 0;
  dimensionHeightLinePresent = false;
  treeCount = 0;
  treeCollisionCount = 0;
  minTreeClearanceM = 0;
  roofDetailMeshCount = 0;
  siteDimensions = {
    widthM:m.siteWidthM,
    depthM:m.siteDepthM,
    areaM2:m.siteAreaM2,
    setbackM:p.minSetbackM
  };
  buildEstateScene(estateGroup, m, p);
  estateGroup.add(dimensionLayer);
  dimensionLayer.visible = dimensionsVisible;
  estateGroup.updateWorldMatrix(true, true);
  mainHouseBounds = computeBounds(obj=>obj.userData.fitRole === 'mainHouse');
  cameraFitBounds = computeBounds(obj=>obj.userData.fitRole === 'mainHouse' || obj.userData.fitRole === 'elderHouse') || mainHouseBounds;
  fullSceneBounds = computeBounds(obj=>obj.isMesh || obj.isSprite || obj.isLine);
  resize(false, 'update');
  fitDefaultView('update');
  scheduleSettleFits('update');
}
function buildEstateScene(root, m, p){
  const siteW = m.siteWidthM;
  const siteD = m.siteDepthM;
  const halfW = siteW / 2;
  const halfD = siteD / 2;
  const ground = box(siteW,0.10,siteD, material(COLORS.grass,0.95), 0,-0.10,0);
  ground.receiveShadow = true;
  root.add(ground);
  const lawn = box(siteW-1.2,0.08,siteD-1.2, material(0xa8bf8e,0.98), 0,-0.07,0);
  lawn.receiveShadow = true;
  root.add(lawn);
  root.add(box(siteW+5,0.10,2.4, material(0x6e6a5f,0.9), 0,-0.06,-halfD-1.35));

  const main = makeMainHouse(m,p);
  root.add(main);
  const mainD = m.mainHouseDepthM;
  const pathLen = Math.max(2, halfD - mainD/2 - 0.4);
  root.add(box(2.2,0.08,pathLen, material(COLORS.path,0.9), 0,-0.04,-halfD + pathLen/2));
  const court = new THREE.Mesh(new THREE.CircleGeometry(Math.min(2.8, m.mainHouseWidthM*0.25),48), material(0xddc8a6,0.95));
  court.rotation.x = -Math.PI/2;
  court.position.set(0,0.02,-mainD/2-0.6);
  court.receiveShadow=true;
  root.add(court);

  let elderLayout = null;
  if(m.elderLivingAreaM2 > 0){
    elderLayout = elderPlacement(m);
    root.add(makeElderHouse(m,p,elderLayout));
    addElderPath(root, elderLayout, m);
  }
  currentElderLayout = elderLayout;
  addFence(root, siteW, siteD, elderLayout);
  addTrees(root, siteW, siteD, m, elderLayout);
  addGarden(root, siteW, siteD, m.mainHouseWidthM, m.mainHouseDepthM);
  addDimensionOverlay(dimensionLayer, m, p, elderLayout);
  renderDimensionPlan(m, p, elderLayout);
}
function makeMainHouse(m,p){
  const g = new THREE.Group();
  const w = m.mainHouseWidthM;
  const d = m.mainHouseDepthM;
  const floors = Math.max(1, Math.min(4, p.floors));
  const floorH = p.floorHeightM;
  const h = floors * floorH;
  const roofH = Math.max(1.25, Math.min(2.4, w * 0.12));
  g.add(box(w+0.65,0.28,d+0.65, material(0xcab899,0.78), 0,0,0,'mainHouse'));
  g.add(box(w,h,d, material(COLORS.wall,0.72), 0,0.28,0,'mainHouse'));
  const roof = gableRoof(w+1.0,d+1.0,roofH,COLORS.roof,'mainHouse');
  roof.position.y = h + 0.28;
  g.add(roof);
  addZoneBands(g, m, w, d, h);
  addMainHouseWindows(g, w, d, floors, floorH, h);
  const frontZ = -d/2 - 0.06;
  g.add(entryDoor(0,0.28,frontZ,'mainHouse'));
  g.add(box(2.6,0.16,1.25, material(0xd9c29a,0.86), 0,0.02,frontZ-0.58,'mainHouse'));
  g.add(box(2.2,0.10,0.62, material(0xc3ab82,0.86), 0,0.00,frontZ-1.20,'mainHouse'));
  const chimney = box(0.42,1.25,0.42, material(0x7b4f34,0.72), w*0.18,h+0.55,0.12,'mainHouse');
  chimney.rotation.y = 0.05;
  g.add(chimney);
  const label = makeLabel(`основной дом\n${Math.round(m.mainLivingAreaM2)} м² · ${floors} эт.`, COLORS.teal, 4.0, 1.15);
  label.position.set(0, h+roofH+1.1, -d*0.10);
  g.add(label);
  return g;
}
function addZoneBands(g, m, w, d, h){
  const frontZ = -d/2 - 0.072;
  const y = h + 0.03;
  const segments = [
    {share:0.34,color:COLORS.teal},
    {share:Math.min(0.30,0.10 + m.childModules*0.045),color:COLORS.gold},
    {share:m.elderAreaM2 > 0 ? 0.14 : 0.06,color:COLORS.elder},
    {share:m.extraAreaModule > 0.5 ? 0.18 : 0.10,color:COLORS.extra}
  ];
  const total = segments.reduce((sum,s)=>sum+s.share,0);
  let x = -w/2;
  segments.forEach(seg=>{
    const sw = w * seg.share / total;
    g.add(box(sw,0.20,0.09, material(seg.color,0.62), x+sw/2,y,frontZ,'mainHouse'));
    x += sw;
  });
  const rearStrip = box(w*0.42,0.18,0.10, material(COLORS.goldSoft,0.7), w*0.23,h*0.55,d/2+0.06,'mainHouse');
  g.add(rearStrip);
}
function addMainHouseWindows(g, w, d, floors, floorH, h){
  const frontZ = -d/2 - 0.07;
  const backZ = d/2 + 0.07;
  const count = Math.max(3, Math.min(6, Math.floor(w/2)));
  for(let floor=0; floor<floors; floor++){
    const y = 0.28 + floor*floorH + WINDOW_METRICS.sillHeightM;
    for(let i=0;i<count;i++){
      const x = -w*0.40 + (count===1?0:i*(w*0.80/(count-1)));
      if(Math.abs(x) < 0.85 && floor===0) continue;
      g.add(windowPanel(x,y,frontZ,0,1.0,'mainHouse','front'));
    }
    for(let i=0;i<Math.max(2,Math.floor(count*0.6));i++){
      const x = -w*0.32 + i*(w*0.64/Math.max(1,Math.floor(count*0.6)-1));
      g.add(windowPanel(x,y,backZ,Math.PI,0.94,'mainHouse','back'));
    }
    g.add(windowPanel(-w/2-0.07,y,0,Math.PI/2,1.0,'mainHouse','side'));
    g.add(windowPanel(w/2+0.07,y,0,-Math.PI/2,1.0,'mainHouse','side'));
  }
  const attic = box(Math.max(1.35,w*0.18),0.86,0.12, material(COLORS.glass,0.3), 0,h+0.46,frontZ,'mainHouse');
  g.add(attic);
}
function elderPlacement(m){
  const gap = 4.0;
  const x = -m.mainHouseWidthM/2 - gap - m.elderHouseWidthM/2;
  const z = Math.max(0.2, m.mainHouseDepthM*0.10);
  return { x, z, w:m.elderHouseWidthM, d:m.elderHouseDepthM };
}
function makeElderHouse(m,p,layout){
  const g = new THREE.Group();
  g.position.set(layout.x,0,layout.z);
  const h = p.floorHeightM * 0.92;
  const roofH = 1.05;
  g.add(box(layout.w+0.45,0.22,layout.d+0.45, material(0xcab899,0.78), 0,0,0,'elderHouse'));
  g.add(box(layout.w,h,layout.d, material(0xf1fbff,0.72), 0,0.22,0,'elderHouse'));
  const roof = gableRoof(layout.w+0.72,layout.d+0.72,roofH,0x6a8ea4,'elderHouse');
  roof.position.y = h+0.22;
  g.add(roof);
  const frontZ = -layout.d/2 - 0.06;
  g.add(entryDoor(-layout.w*0.22,0.22,frontZ,'elderHouse'));
  g.add(windowPanel(layout.w*0.22,0.22+0.82,frontZ,0,0.90,'elderHouse','front'));
  g.add(windowPanel(layout.w/2+0.06,0.22+0.82,0,Math.PI/2,0.86,'elderHouse','side'));
  g.add(box(1.8,0.12,0.9, material(0xd9c29a,0.86), -layout.w*0.22,0.02,frontZ-0.45,'elderHouse'));
  const label = makeLabel(`прародители\n${Math.round(m.elderLivingAreaM2)} м²`, COLORS.elder, 3.3, 1.05);
  label.position.set(0,h+roofH+0.95,0);
  g.add(label);
  return g;
}
function addElderPath(root, layout, m){
  const pathMat = material(COLORS.path,0.9);
  const midX = layout.x/2;
  root.add(box(Math.abs(layout.x)+1.4,0.07,1.05,pathMat,midX,-0.035,-m.mainHouseDepthM/2-0.1));
  root.add(box(1.05,0.07,Math.abs(layout.z)+m.mainHouseDepthM/2+0.7,pathMat,layout.x,-0.035,(layout.z-m.mainHouseDepthM/2)/2));
}
function addFence(root, siteW, siteD, elderLayout){
  const halfW = siteW/2, halfD = siteD/2;
  const mainGate = 4.8;
  const elderGate = elderLayout ? 3.2 : 0;
  fenceGateCount = elderLayout ? 2 : 1;
  addFenceRun(root, -halfW, -halfD, -mainGate/2, -halfD);
  addFenceRun(root, mainGate/2, -halfD, halfW, -halfD);
  addFenceRun(root, -halfW, halfD, halfW, halfD);
  if(elderLayout){
    const gateZ = THREE.MathUtils.clamp(elderLayout.z, -halfD+4, halfD-4);
    addFenceRun(root, -halfW, -halfD, -halfW, gateZ-elderGate/2);
    addFenceRun(root, -halfW, gateZ+elderGate/2, -halfW, halfD);
    root.add(box(0.22,0.95,elderGate*0.72, material(COLORS.gold,0.58), -halfW,0,gateZ));
  }else{
    addFenceRun(root, -halfW, -halfD, -halfW, halfD);
  }
  addFenceRun(root, halfW, -halfD, halfW, halfD);
  root.add(box(mainGate*0.76,0.95,0.22, material(COLORS.gold,0.58), 0,0,-halfD));
}
function addFenceRun(root, x1,z1,x2,z2){
  const len = Math.hypot(x2-x1,z2-z1);
  if(len < 0.4) return;
  const mat = material(0xd7bc82,0.7);
  const angle = Math.atan2(z2-z1,x2-x1);
  const midX = (x1+x2)/2, midZ = (z1+z2)/2;
  const rail1 = box(len,0.09,0.10,mat,midX,0.36,midZ);
  rail1.rotation.y = -angle;
  const rail2 = box(len,0.08,0.10,mat,midX,0.62,midZ);
  rail2.rotation.y = -angle;
  root.add(rail1,rail2);
  const steps = Math.max(1, Math.floor(len/1.7));
  for(let i=0;i<=steps;i++){
    const t = i/steps;
    const x = x1 + (x2-x1)*t;
    const z = z1 + (z2-z1)*t;
    root.add(box(0.16,0.95,0.16,mat,x,0,z));
  }
}
function rectClearance(x,z,rect, radius){
  const dx = Math.max(Math.abs(x - rect.x) - rect.w/2, 0);
  const dz = Math.max(Math.abs(z - rect.z) - rect.d/2, 0);
  return Math.hypot(dx,dz) - radius;
}
function treeCandidateClearance(x,z,exclusions,radius){
  if(!exclusions.length) return Infinity;
  return Math.min(...exclusions.map(rect=>rectClearance(x,z,rect,radius)));
}
function addTrees(root, siteW, siteD, m, elderLayout){
  const trunkMat = material(0x80633c,0.8);
  const leafMat = material(0x4c7a47,0.85);
  const halfW = siteW/2, halfD = siteD/2;
  const treeRadius = 1.05;
  const mainD = m.mainHouseDepthM;
  const pathLen = Math.max(2, halfD - mainD/2 - 0.4);
  const exclusions = [
    {x:0,z:0,w:m.mainHouseWidthM + 2.4,d:m.mainHouseDepthM + 2.4},
    {x:0,z:-halfD + pathLen/2,w:3.4,d:pathLen + 1.4},
    {x:0,z:-mainD/2-0.6,w:Math.min(6.0, m.mainHouseWidthM*0.58),d:4.0},
    {x:Math.min(siteW/2-4, m.mainHouseWidthM/2+3.8),z:-m.mainHouseDepthM/2+1.35,w:3.6,d:3.0}
  ];
  if(elderLayout){
    exclusions.push(
      {x:elderLayout.x,z:elderLayout.z,w:elderLayout.w + 2.8,d:elderLayout.d + 2.8},
      {x:elderLayout.x/2,z:-m.mainHouseDepthM/2-0.1,w:Math.abs(elderLayout.x)+2.4,d:2.2},
      {x:elderLayout.x,z:(elderLayout.z-m.mainHouseDepthM/2)/2,w:2.2,d:Math.abs(elderLayout.z)+m.mainHouseDepthM/2+2.0}
    );
  }
  const edgeX = Math.max(1.55, Math.min(3.2, halfW - 1.25));
  const edgeZ = Math.max(1.85, Math.min(3.4, halfD - 1.25));
  const pts = [
    [-halfW+edgeX, halfD-edgeZ],
    [halfW-edgeX, halfD-edgeZ],
    [-halfW+edgeX, -halfD+edgeZ+1.2],
    [halfW-edgeX, -halfD+edgeZ+1.2],
    [-halfW+edgeX, 0],
    [halfW-edgeX, 0],
    [-halfW*0.48, halfD-edgeZ],
    [halfW*0.48, halfD-edgeZ],
    [-halfW*0.72, halfD*0.32],
    [halfW*0.72, halfD*0.32]
  ];
  minTreeClearanceM = Infinity;
  pts.forEach(([x,z],i)=>{
    const insideLot = x > -halfW + treeRadius && x < halfW - treeRadius && z > -halfD + treeRadius && z < halfD - treeRadius;
    const clearance = treeCandidateClearance(x,z,exclusions,treeRadius);
    if(!insideLot || clearance < 0.35) return;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.22,1.35,14), trunkMat);
    trunk.position.set(x,0.68,z);
    trunk.castShadow=true;
    trunk.userData.tree = true;
    root.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.85+(i%2)*0.12,24,18), leafMat);
    crown.position.set(x,1.72,z);
    crown.castShadow=true;
    crown.receiveShadow=true;
    crown.userData.tree = true;
    root.add(crown);
    treeCount += 1;
    if(clearance < 0) treeCollisionCount += 1;
    minTreeClearanceM = Math.min(minTreeClearanceM, clearance);
  });
  if(!Number.isFinite(minTreeClearanceM)) minTreeClearanceM = 0;
}
function addGarden(root, siteW, siteD, houseW, houseD){
  const bedMat = material(0x785335,0.92);
  const green = material(0x5f8f4e,0.85);
  const x = Math.min(siteW/2-4, houseW/2+3.8);
  const z0 = -houseD/2 + 0.6;
  for(let i=0;i<3;i++){
    root.add(box(2.1,0.10,0.42,bedMat,x,0.02,z0+i*0.75));
    root.add(box(1.85,0.06,0.24,green,x,0.12,z0+i*0.75));
  }
}
function addDimensionOverlay(layer, m, p, elderLayout){
  if(!layer) return;
  const siteW = m.siteWidthM, siteD = m.siteDepthM;
  const halfW = siteW/2, halfD = siteD/2;
  const yGround = 0.16;
  const houseFrontZ = -m.mainHouseDepthM/2 - 0.55;
  const houseRightX = m.mainHouseWidthM/2 + 0.72;
  addDimensionLine(layer, new THREE.Vector3(-halfW+0.9,yGround,-halfD+1.05), new THREE.Vector3(halfW-0.9,yGround,-halfD+1.05), `${formatPlanNumber(siteW)} м`, {scale:1.42, labelSide:'front'});
  addDimensionLine(layer, new THREE.Vector3(halfW-1.05,yGround,-halfD+0.9), new THREE.Vector3(halfW-1.05,yGround,halfD-0.9), `${formatPlanNumber(siteD)} м`, {scale:1.42, labelSide:'right'});
  addDimensionLine(layer, new THREE.Vector3(-m.mainHouseWidthM/2,yGround,houseFrontZ), new THREE.Vector3(m.mainHouseWidthM/2,yGround,houseFrontZ), `${formatPlanNumber(m.mainHouseWidthM)} м`, {scale:1.30, labelSide:'front', guideToZ:-m.mainHouseDepthM/2});
  addDimensionLine(layer, new THREE.Vector3(houseRightX,yGround,-m.mainHouseDepthM/2), new THREE.Vector3(houseRightX,yGround,m.mainHouseDepthM/2), `${formatPlanNumber(m.mainHouseDepthM)} м`, {scale:1.30, labelSide:'right', guideToX:m.mainHouseWidthM/2});
  addDimensionLine(layer, new THREE.Vector3(-m.mainHouseWidthM/2-0.85,yGround,-siteD/2+p.minSetbackM), new THREE.Vector3(-m.mainHouseWidthM/2-0.85,yGround,-m.mainHouseDepthM/2), `отступ ${p.minSetbackM.toFixed(0)} м`, {scale:1.02, labelSide:'left'});

  if(elderLayout){
    addDimensionLine(layer, new THREE.Vector3(elderLayout.x-elderLayout.w/2,yGround,elderLayout.z-elderLayout.d/2-0.55), new THREE.Vector3(elderLayout.x+elderLayout.w/2,yGround,elderLayout.z-elderLayout.d/2-0.55), `${formatPlanNumber(elderLayout.w)} м`, {scale:1.05, labelSide:'front', guideToZ:elderLayout.z-elderLayout.d/2});
    addDimensionLine(layer, new THREE.Vector3(elderLayout.x+elderLayout.w/2+0.55,yGround,elderLayout.z-elderLayout.d/2), new THREE.Vector3(elderLayout.x+elderLayout.w/2+0.55,yGround,elderLayout.z+elderLayout.d/2), `${formatPlanNumber(elderLayout.d)} м`, {scale:1.02, labelSide:'right'});
  }
  const floors = Math.max(1, Math.min(4, p.floors));
  const roofH = Math.max(1.25, Math.min(2.4, m.mainHouseWidthM * 0.12));
  const houseHeight = floors * p.floorHeightM + 0.28 + roofH;
  addDimensionLine(layer, new THREE.Vector3(-m.mainHouseWidthM/2-1.15,0.05,-m.mainHouseDepthM/2-0.36), new THREE.Vector3(-m.mainHouseWidthM/2-1.15,houseHeight,-m.mainHouseDepthM/2-0.36), `высота ${formatPlanNumber(houseHeight)} м`, {scale:1.02, vertical:true});
}
function makeDimensionLabelTexture(text, scale=0.85){
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 210;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(246,242,232,0.72)';
  ctx.lineWidth = 9;
  ctx.fillStyle = '#111514';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 76px Arial, sans-serif';
  ctx.strokeText(text, 450, 105);
  ctx.fillText(text, 450, 105);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function makeGroundDimensionLabel(text, scale=0.85, angle=0){
  const tex = makeDimensionLabelTexture(text, scale);
  const mat = new THREE.MeshBasicMaterial({map:tex, transparent:true, depthTest:false, depthWrite:false, side:THREE.DoubleSide});
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.7*scale,1.28*scale), mat);
  mesh.rotation.x = -Math.PI/2;
  mesh.rotation.z = -angle;
  mesh.renderOrder = 62;
  mesh.userData.dimensionLabel = true;
  mesh.userData.dimensionGroundLabel = true;
  dimensionGroundLabelCount += 1;
  return mesh;
}
function makeVerticalDimensionLabel(text, scale=0.85){
  const tex = makeDimensionLabelTexture(text, scale);
  const mat = new THREE.MeshBasicMaterial({map:tex, transparent:true, depthTest:false, depthWrite:false, side:THREE.DoubleSide});
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2*scale,0.95*scale), mat);
  mesh.rotation.y = -Math.PI * 0.10;
  mesh.renderOrder = 62;
  mesh.userData.dimensionLabel = true;
  mesh.userData.dimensionHeightLabel = true;
  return mesh;
}
function addEndCap(layer, point, dir, scale=1, vertical=false){
  const cap = vertical ? new THREE.Vector3(0.82*scale,0,0) : new THREE.Vector3(-dir.z,0,dir.x).normalize().multiplyScalar(0.52*scale);
  const a = point.clone().sub(cap);
  const b = point.clone().add(cap);
  const obj = line([a,b],0x111514);
  obj.renderOrder = 58;
  obj.userData.dimensionEndCap = true;
  layer.add(obj);
  dimensionEndCapCount += 1;
  dimensionArrowCount += 1;
}
function addDimensionGuide(layer, from, to){
  const obj = line([from,to],0x111514);
  obj.renderOrder = 42;
  obj.material.opacity = 0.62;
  obj.material.transparent = true;
  obj.userData.dimensionGuide = true;
  layer.add(obj);
}
function dimensionLabelPosition(a,b,dir,options){
  const mid = a.clone().add(b).multiplyScalar(0.5);
  if(options.vertical) return mid.add(new THREE.Vector3(-1.05,0,0));
  const normal = new THREE.Vector3(-dir.z,0,dir.x).normalize();
  const side = options.labelSide || 'front';
  const sign = side === 'right' ? -1 : side === 'left' ? 1 : side === 'back' ? -1 : 1;
  return mid.add(normal.multiplyScalar(0.82 * sign));
}
function addDimensionLine(layer, a, b, text, options={}){
  const scale = options.scale || 1;
  const mainLine = line([a,b],0x111514);
  mainLine.userData.dimensionLine = true;
  mainLine.userData.dimensionVertical = Boolean(options.vertical);
  layer.add(mainLine);
  const dir = b.clone().sub(a);
  if(dir.length() > 0.001){
    const norm = dir.clone().normalize();
    addEndCap(layer, a, norm, scale, Boolean(options.vertical));
    addEndCap(layer, b, norm, scale, Boolean(options.vertical));
    if(Number.isFinite(options.guideToZ)){
      addDimensionGuide(layer, new THREE.Vector3(a.x,a.y,options.guideToZ), a);
      addDimensionGuide(layer, new THREE.Vector3(b.x,b.y,options.guideToZ), b);
    }
    if(Number.isFinite(options.guideToX)){
      addDimensionGuide(layer, new THREE.Vector3(options.guideToX,a.y,a.z), a);
      addDimensionGuide(layer, new THREE.Vector3(options.guideToX,b.y,b.z), b);
    }
  }
  const angle = Math.atan2(dir.z, dir.x);
  const label = options.vertical ? makeVerticalDimensionLabel(text, scale) : makeGroundDimensionLabel(text, scale, angle);
  label.position.copy(dimensionLabelPosition(a,b,dir.clone().normalize(),options));
  layer.add(label);
  dimension3dLabelCount += 1;
  dimensionLabelCount = dimension3dLabelCount;
  if(options.vertical) dimensionHeightLinePresent = true;
}
function formatPlanNumber(value, digits=1){
  return Number(value).toLocaleString('ru-RU', {maximumFractionDigits:digits, minimumFractionDigits:digits});
}
function renderDimensionPlan(m, p, elderLayout){
  if(!dimensionPlan) return;
  if(DIMENSION_OVERLAY_MODE !== 'svg-plan'){
    dimensionSvgLabelCount = 0;
    dimensionPlan.innerHTML = '';
    dimensionPlan.classList.remove('active');
    dimensionPlan.setAttribute('aria-hidden', 'true');
    return;
  }
  const viewW = 1000, viewH = 620;
  const margin = 86;
  const siteW = Math.max(1,m.siteWidthM), siteD = Math.max(1,m.siteDepthM);
  const scale = Math.min((viewW - margin*2) / siteW, (viewH - margin*2) / siteD);
  const centerX = viewW/2, centerY = viewH/2 + 8;
  const sx = x => centerX + x * scale;
  const sy = z => centerY + z * scale;
  const rect = (x,z,w,d,cls) => `<rect class="${cls}" x="${sx(x-w/2).toFixed(1)}" y="${sy(z-d/2).toFixed(1)}" width="${(w*scale).toFixed(1)}" height="${(d*scale).toFixed(1)}" rx="4" />`;
  const lineSvg = (x1,z1,x2,z2,cls) => `<line class="${cls}" x1="${sx(x1).toFixed(1)}" y1="${sy(z1).toFixed(1)}" x2="${sx(x2).toFixed(1)}" y2="${sy(z2).toFixed(1)}" />`;
  const rawLine = (x1,y1,x2,y2,cls) => `<line class="${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`;
  const label = (x,y,text,small=false) => {
    const w = Math.max(78, text.length * (small ? 10.5 : 13.5) + 26);
    const h = small ? 30 : 38;
    dimensionSvgLabelCount += 1;
    return `<g class="plan-label-group"><rect class="plan-label-bg" x="${(x-w/2).toFixed(1)}" y="${(y-h/2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="8" /><text class="plan-label${small?' small':''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${text}</text></g>`;
  };
  const halfW = siteW/2, halfD = siteD/2;
  const siteLeft = sx(-halfW), siteRight = sx(halfW), siteTop = sy(-halfD), siteBottom = sy(halfD);
  const mainW = m.mainHouseWidthM, mainD = m.mainHouseDepthM;
  const mainLeft = sx(-mainW/2), mainRight = sx(mainW/2), mainTop = sy(-mainD/2), mainBottom = sy(mainD/2);
  const topDimY = Math.max(34, siteTop - 46);
  const rightDimX = Math.min(viewW - 36, siteRight + 52);
  const houseDimY = Math.max(siteTop + 34, mainTop - 34);
  const houseDepthX = Math.max(38, mainLeft - 46);
  const setbackLeft = sx(-halfW + p.minSetbackM);
  const setbackTop = sy(-halfD + p.minSetbackM);
  const setbackW = Math.max(0, (siteW - p.minSetbackM*2) * scale);
  const setbackD = Math.max(0, (siteD - p.minSetbackM*2) * scale);
  dimensionSvgLabelCount = 0;
  const parts = [];
  parts.push(`<defs><marker id="estatePlanArrow" markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto-start-reverse"><path d="M0,0 L9,4.5 L0,9 z" fill="#111514"/></marker></defs>`);
  parts.push(rect(0,0,siteW,siteD,'plan-site'));
  parts.push(`<rect class="plan-setback" x="${setbackLeft.toFixed(1)}" y="${setbackTop.toFixed(1)}" width="${setbackW.toFixed(1)}" height="${setbackD.toFixed(1)}" rx="3" />`);
  parts.push(lineSvg(0,-halfD,0,-mainD/2-0.6,'plan-path'));
  if(elderLayout){
    parts.push(lineSvg(elderLayout.x,-mainD/2,0,-mainD/2,'plan-path'));
    parts.push(lineSvg(elderLayout.x,elderLayout.z,elderLayout.x,-mainD/2,'plan-path'));
  }
  parts.push(rect(0,0,mainW,mainD,'plan-house'));
  if(elderLayout) parts.push(rect(elderLayout.x,elderLayout.z,elderLayout.w,elderLayout.d,'plan-elder'));
  parts.push(rawLine(siteLeft,siteTop,siteLeft,topDimY,'plan-guide'), rawLine(siteRight,siteTop,siteRight,topDimY,'plan-guide'));
  parts.push(rawLine(siteLeft,topDimY,siteRight,topDimY,'plan-dim'), label((siteLeft+siteRight)/2,topDimY-24,`${formatPlanNumber(siteW)} м`));
  parts.push(rawLine(siteRight,siteTop,rightDimX,siteTop,'plan-guide'), rawLine(siteRight,siteBottom,rightDimX,siteBottom,'plan-guide'));
  parts.push(rawLine(rightDimX,siteTop,rightDimX,siteBottom,'plan-dim'), label(rightDimX+4,(siteTop+siteBottom)/2,`${formatPlanNumber(siteD)} м`));
  parts.push(rawLine(mainLeft,mainTop,mainLeft,houseDimY,'plan-guide'), rawLine(mainRight,mainTop,mainRight,houseDimY,'plan-guide'));
  parts.push(rawLine(mainLeft,houseDimY,mainRight,houseDimY,'plan-dim'), label((mainLeft+mainRight)/2,houseDimY-22,`${formatPlanNumber(mainW)} м`,true));
  parts.push(rawLine(mainLeft,mainTop,houseDepthX,mainTop,'plan-guide'), rawLine(mainLeft,mainBottom,houseDepthX,mainBottom,'plan-guide'));
  parts.push(rawLine(houseDepthX,mainTop,houseDepthX,mainBottom,'plan-dim'), label(houseDepthX,(mainTop+mainBottom)/2,`${formatPlanNumber(mainD)} м`,true));
  parts.push(rawLine(siteLeft,siteTop,siteLeft,mainTop,'plan-dim'), label(siteLeft+48,(siteTop+mainTop)/2,`отступ ${formatPlanNumber(p.minSetbackM,0)} м`,true));
  if(elderLayout){
    const elderLeft = sx(elderLayout.x-elderLayout.w/2), elderRight = sx(elderLayout.x+elderLayout.w/2), elderY = sy(elderLayout.z+elderLayout.d/2)+32;
    parts.push(rawLine(elderLeft,elderY,elderRight,elderY,'plan-dim'), label((elderLeft+elderRight)/2,elderY+22,`${formatPlanNumber(elderLayout.w)} м`,true));
  }
  parts.push(rawLine(sx(-2.4),siteTop,sx(2.4),siteTop,'plan-gate'));
  if(elderLayout) parts.push(rawLine(siteLeft,sy(elderLayout.z-1.6),siteLeft,sy(elderLayout.z+1.6),'plan-gate'));
  parts.push(label(siteLeft+86,siteTop+34,`${formatPlanNumber(p.siteAreaSotka,0)} сот.`,true));
  parts.push(label((mainLeft+mainRight)/2,(mainTop+mainBottom)/2,'основной дом',true));
  if(elderLayout) parts.push(label(sx(elderLayout.x),sy(elderLayout.z),'прародители',true));
  dimensionPlan.innerHTML = parts.join('');
  dimensionPlan.classList.toggle('active', dimensionsVisible);
  dimensionPlan.setAttribute('aria-hidden', dimensionsVisible ? 'false' : 'true');
  dimensionLabelCount = dimensionSvgLabelCount;
}

function computeBounds(predicate){
  const bounds = new THREE.Box3();
  const tmp = new THREE.Box3();
  estateGroup.updateWorldMatrix(true, true);
  estateGroup.traverse(obj=>{
    if(predicate(obj)){
      tmp.setFromObject(obj);
      if(!tmp.isEmpty()) bounds.union(tmp);
    }
  });
  return bounds.isEmpty() ? null : bounds;
}
function resetView(){
  if(!camera || !controls) return;
  if(currentModel && estateGroup){
    resize(false, 'reset');
    fitDefaultView('reset');
    scheduleSettleFits('reset');
    return;
  }
  applySafeInitialView();
}
function currentCameraState(){
  return camera && controls ? {
    camera:camera.position.clone(),
    target:controls.target.clone(),
    distance:camera.position.distanceTo(controls.target)
  } : null;
}
function sameCameraState(a,b){
  if(!a || !b) return false;
  return a.camera.distanceTo(b.camera) < 0.001 &&
    a.target.distanceTo(b.target) < 0.001 &&
    Math.abs(a.distance - b.distance) < 0.001;
}
function setDimensionsVisible(visible){
  const before = currentCameraState();
  dimensionsVisible = Boolean(visible);
  if(dimensionLayer) dimensionLayer.visible = dimensionsVisible;
  if(dimensionPlan){
    const showPlan = dimensionsVisible && DIMENSION_OVERLAY_MODE === 'svg-plan';
    dimensionPlan.classList.toggle('active', showPlan);
    dimensionPlan.setAttribute('aria-hidden', showPlan ? 'false' : 'true');
  }
  if(currentModel){
    clearScheduledFits();
    renderDimensionPlan(currentModel.m, currentModel.p, currentElderLayout);
    controls?.update();
  }
  lastDimensionTogglePreservedCamera = sameCameraState(before, currentCameraState());
}
function clearScheduledFits(){
  fitSettleTimers.forEach(timer=>window.clearTimeout(timer));
  fitRafIds.forEach(id=>window.cancelAnimationFrame(id));
  fitSettleTimers = [];
  fitRafIds = [];
}
function runSettledFit(reason){
  if(!currentModel) return;
  resize(false, reason);
  fitDefaultView(reason);
}
function scheduleSettleFits(reason='settle'){
  if(!currentModel) return;
  clearScheduledFits();
  const raf1 = window.requestAnimationFrame(()=>{
    const raf2 = window.requestAnimationFrame(()=>runSettledFit(`${reason}:2raf`));
    fitRafIds.push(raf2);
  });
  fitRafIds.push(raf1);
  [120, 500, 1200].forEach(ms=>{
    fitSettleTimers.push(window.setTimeout(()=>runSettledFit(`${reason}:${ms}ms`), ms));
  });
}
function boxCorners(bounds){
  const min = bounds.min, max = bounds.max;
  return [
    new THREE.Vector3(min.x,min.y,min.z), new THREE.Vector3(max.x,min.y,min.z),
    new THREE.Vector3(min.x,max.y,min.z), new THREE.Vector3(max.x,max.y,min.z),
    new THREE.Vector3(min.x,min.y,max.z), new THREE.Vector3(max.x,min.y,max.z),
    new THREE.Vector3(min.x,max.y,max.z), new THREE.Vector3(max.x,max.y,max.z)
  ];
}
function fitDistanceForBounds(bounds, target, direction, verticalFov, horizontalFov, fill){
  const forward = direction.clone().normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), forward).normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  const tanH = Math.tan(horizontalFov / 2) * fill.x;
  const tanV = Math.tan(verticalFov / 2) * fill.y;
  let distance = 0;
  boxCorners(bounds).forEach(point=>{
    const local = point.clone().sub(target);
    const depthOffset = local.dot(forward);
    const x = Math.abs(local.dot(right));
    const y = Math.abs(local.dot(up));
    distance = Math.max(distance, depthOffset + x / Math.max(0.01, tanH), depthOffset + y / Math.max(0.01, tanV));
  });
  return distance;
}
function fitDefaultView(reason='fit'){
  const sourceBounds = cameraFitBounds || mainHouseBounds;
  if(!camera || !controls || !sourceBounds) return;
  const bounds = sourceBounds.clone();
  bounds.expandByVector(new THREE.Vector3(0.65, 0.45, 0.65));
  const size = new THREE.Vector3();
  bounds.getSize(size);
  viewBounds = bounds.clone();

  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.1, camera.aspect || 1));
  const maxDim = Math.max(size.x, size.z, size.y * 1.35, 6);
  const target = bounds.getCenter(new THREE.Vector3());
  target.y = Math.max(0.9, target.y - size.y * 0.12);
  const direction = new THREE.Vector3(0.62, 0.44, -0.66).normalize();
  const fill = camera.aspect < 0.85 ? {x:0.90, y:0.80} : camera.aspect < 1.05 ? {x:0.90, y:0.82} : {x:0.96, y:0.89};
  const fitDistance = fitDistanceForBounds(bounds, target, direction, verticalFov, horizontalFov, fill);
  const distance = Math.max(8.5, Math.min(70, fitDistance));
  const position = target.clone().add(direction.multiplyScalar(distance));
  defaultView = { position, target };
  fitCount += 1;
  lastFitReason = reason;
  camera.position.copy(position);
  controls.target.copy(target);
  controls.minDistance = Math.max(4.5, distance * 0.32);
  controls.maxDistance = Math.max(32, distance * 1.9, maxDim * 2.4);
  camera.near = 0.1;
  camera.far = Math.max(180, distance + maxDim * 5);
  camera.updateProjectionMatrix();
  controls.update();
}
function projectedBox(bounds){
  if(!bounds || !camera) return null;
  const corners = boxCorners(bounds).map(point=>point.project(camera));
  const left = Math.min(...corners.map(p=>(p.x + 1) / 2));
  const right = Math.max(...corners.map(p=>(p.x + 1) / 2));
  const top = Math.min(...corners.map(p=>(1 - p.y) / 2));
  const bottom = Math.max(...corners.map(p=>(1 - p.y) / 2));
  return {left,right,top,bottom,width:right-left,height:bottom-top};
}
function getViewState(){
  if(!camera || !controls || !defaultView) return null;
  const visual = currentVisualMetrics();
  const model = currentModel?.m;
  const mainBox = projectedBox(mainHouseBounds);
  return {
    version:VIEW_VERSION,
    roofPolicy:ROOF_POLICY,
    roofMeshCount:countRoofMeshes(),
    roofDetailMeshCount:countRoofDetailMeshes(),
    roofReceiveShadowCount:countRoofReceiveShadowMeshes(),
    fitCount,
    lastFitReason,
    floors:currentModel?.p?.floors || 0,
    dimensionOverlayVisible:dimensionsVisible,
    dimensionOverlayMode:DIMENSION_OVERLAY_MODE,
    dimensionLabelCount,
    dimensionSvgLabelCount,
    dimension3dLabelCount,
    dimensionArrowCount,
    dimensionEndCapCount,
    dimensionGroundLabelCount,
    dimensionWhiteLabelCount,
    dimensionHeightLinePresent,
    lastDimensionTogglePreservedCamera,
    fenceGateCount,
    mainDoorCount:1,
    separateElderHouse:Boolean(model?.separateElderHouse),
    elderHousePresent:Boolean(model?.elderLivingAreaM2),
    treeCount,
    treeCollisionCount,
    minTreeClearanceM,
    siteDimensions,
    mainHouseBoundsSize: mainHouseBounds ? mainHouseBounds.getSize(new THREE.Vector3()) : null,
    buildingFootprintM2:model?.buildingFootprintM2 || 0,
    mainFootprintM2:model?.mainFootprintM2 || 0,
    elderFootprintM2:model?.elderFootprintM2 || 0,
    camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z},
    target:{x:controls.target.x,y:controls.target.y,z:controls.target.z},
    defaultCamera:{x:defaultView.position.x,y:defaultView.position.y,z:defaultView.position.z},
    defaultTarget:{x:defaultView.target.x,y:defaultView.target.y,z:defaultView.target.z},
    distance:camera.position.distanceTo(controls.target),
    canvas:{width:lastCanvasSize.w,height:lastCanvasSize.h,aspect:camera.aspect},
    canvasCssSize:{width:container?.clientWidth || 0,height:container?.clientHeight || 0},
    dpr:currentDpr(),
    visualViewport:visual,
    screenBox:mainBox,
    mainHouseScreenBox:mainBox,
    cameraFitScreenBox:projectedBox(cameraFitBounds),
    viewScreenBox:projectedBox(viewBounds),
    doorMetrics:DOOR_METRICS,
    windowMetrics:WINDOW_METRICS,
    windowOrientationDiagnostics:windowOrientationDiagnostics(),
    dimensionLayerVisible:Boolean(dimensionLayer?.visible)
  };
}
function windowOrientationDiagnostics(){
  const main = currentModel?.m;
  const depth = main?.mainHouseDepthM || 0;
  const frontFaceZ = -depth / 2;
  const rearFaceZ = depth / 2;
  const tmp = new THREE.Vector3();
  const diag = {
    frontPanels:0,
    rearPanels:0,
    sidePanels:0,
    frontNormalZ:null,
    rearNormalZ:null,
    frontGlassMaxZ:null,
    rearGlassMinZ:null,
    frontFaceZ,
    rearFaceZ,
    frontGlassOutside:true,
    rearGlassOutside:true
  };
  if(!estateGroup || !depth) return diag;
  estateGroup.updateMatrixWorld(true);
  estateGroup.traverse(obj=>{
    if(!obj.isMesh || !obj.userData.windowPanel || obj.userData.fitRole !== 'mainHouse') return;
    const part = obj.userData.windowPart;
    const orientation = obj.userData.windowOrientation;
    const normal = obj.userData.windowNormal || {};
    if(part === 'frame'){
      if(orientation === 'front') diag.frontPanels += 1;
      else if(orientation === 'rear') diag.rearPanels += 1;
      else diag.sidePanels += 1;
    }
    if(part !== 'glass') return;
    obj.getWorldPosition(tmp);
    if(orientation === 'front'){
      diag.frontNormalZ = normal.z;
      diag.frontGlassMaxZ = diag.frontGlassMaxZ === null ? tmp.z : Math.max(diag.frontGlassMaxZ, tmp.z);
      if(!(tmp.z < frontFaceZ)) diag.frontGlassOutside = false;
    } else if(orientation === 'rear'){
      diag.rearNormalZ = normal.z;
      diag.rearGlassMinZ = diag.rearGlassMinZ === null ? tmp.z : Math.min(diag.rearGlassMinZ, tmp.z);
      if(!(tmp.z > rearFaceZ)) diag.rearGlassOutside = false;
    }
  });
  return diag;
}
function countRoofMeshes(){
  let count = 0;
  estateGroup?.traverse(obj=>{ if(obj.userData.roofPolicy === ROOF_POLICY) count += 1; });
  return count;
}
function countRoofDetailMeshes(){
  let count = 0;
  estateGroup?.traverse(obj=>{ if(obj.userData.roofDetail === true) count += 1; });
  roofDetailMeshCount = count;
  return count;
}
function countRoofReceiveShadowMeshes(){
  let count = 0;
  estateGroup?.traverse(obj=>{ if(obj.userData.roofPolicy === ROOF_POLICY && obj.receiveShadow) count += 1; });
  return count;
}
function resize(refit=false, reason='resize'){
  if(!container || !renderer || !camera) return false;
  const w = Math.max(240, container.clientWidth || 800);
  const h = Math.max(240, container.clientHeight || 560);
  const dpr = currentDpr();
  const visual = currentVisualMetrics();
  renderer.setPixelRatio(dpr);
  renderer.setSize(w,h,false);
  const changed =
    Math.abs(w - lastCanvasSize.w) > 2 ||
    Math.abs(h - lastCanvasSize.h) > 2 ||
    Math.abs(dpr - lastCanvasSize.dpr) > 0.01 ||
    Math.abs(visual.visualW - lastCanvasSize.visualW) > 2 ||
    Math.abs(visual.visualH - lastCanvasSize.visualH) > 2 ||
    Math.abs(visual.visualScale - lastCanvasSize.visualScale) > 0.01;
  lastCanvasSize = { w, h, dpr, ...visual };
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  if(refit && changed) scheduleSettleFits(reason);
  return changed;
}
function animate(){
  requestAnimationFrame(animate);
  controls?.update();
  renderer?.render(scene,camera);
}

init();
