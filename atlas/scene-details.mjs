import * as THREE from './vendor/three.module.js';
import {mercatorPosition,sampleReliefElevation} from './relief.mjs';

const stone=new THREE.MeshStandardMaterial({color:'#c4b58b',roughness:.92});
const paleStone=new THREE.MeshStandardMaterial({color:'#e2d5b0',roughness:.85});
const roof=new THREE.MeshStandardMaterial({color:'#766844',roughness:.9});
const dark=new THREE.MeshStandardMaterial({color:'#263c30',roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
const glass=new THREE.MeshStandardMaterial({color:'#8fb3b0',roughness:.46,metalness:.08});
const trim=new THREE.MeshStandardMaterial({color:'#e0d2af',roughness:.6,metalness:.1});

function box(parent,x,y,z,w,h,d,material){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
 mesh.position.set(x,y+h/2,z);parent.add(mesh);return mesh;
}

function historicTower(parent,x,z,height,width){
 const tower=new THREE.Group();tower.position.set(x,0,z);parent.add(tower);
 const shaft=new THREE.Mesh(new THREE.CylinderGeometry(width*.39,width*.59,height,4,1),stone);
 shaft.rotation.y=Math.PI/4;shaft.position.y=height/2;tower.add(shaft);
 // Stone belts, recessed slit windows, an entrance and a stepped roof give
 // the generic tower model readable architectural scale without copying a site.
 for(const fraction of [.18,.48,.78,.94]){
  const beltWidth=width*(.59-.2*fraction)*Math.SQRT2*1.07;
  box(tower,0,height*fraction,0,beltWidth,height*.025,beltWidth,paleStone);
 }
 for(let floor=1;floor<=5;floor++){
  const y=height*floor/6,offset=width*(.59-.2*(floor/6))/Math.SQRT2+2;
  for(const side of [-1,1]){
   box(tower,0,y,side*offset,width*.16,height*.095,5,dark);
   box(tower,side*offset,y,0,5,height*.095,width*.16,dark);
  }
 }
 box(tower,0,height*.105,width*.55/Math.SQRT2+2,width*.2,height*.2,6,dark);
 const roofPlate=new THREE.Mesh(new THREE.BoxGeometry(width*.88,height*.035,width*.88),paleStone);
 roofPlate.position.y=height*.96;tower.add(roofPlate);
 const cap=new THREE.Mesh(new THREE.ConeGeometry(width*.64,height*.16,4),roof);
 cap.rotation.y=Math.PI/4;cap.position.y=height*1.025;tower.add(cap);
 return tower;
}

function buildCity(parent,cityId){
 const block=(x,z,w,h,d,material=paleStone)=>{
  box(parent,x,0,z,w,h,d,material);
  box(parent,x,0,z+d*.51,w*.18,h*.44,3,dark);
 };
 if(cityId==='grozny'){
  // A distinct high-rise silhouette, surrounded by lower urban blocks.
  [92,126,104,78].forEach((height,index)=>{
   const x=(index-1.5)*47;
   block(x,-65,34,height,34,glass);
   box(parent,x,height,-65,37,3,37,trim);
  });
  for(let row=0;row<2;row++)for(let col=0;col<5;col++)block((col-2)*48,60+row*45,34,20+(col%3)*5,30);
  return;
 }
 // Other settlement silhouettes are deliberately schematic massing, not
 // invented portrayals of named monuments or claims about individual buildings.
 const profiles={
  argun:{layout:[[-2,0],[-1,0],[0,0],[1,0],[2,0],[-1,1],[0,1],[1,1]],height:[38,52,66,48,34],width:38,depth:30},
  gudermes:{layout:[[-3,0],[-2,0],[-1,0],[0,0],[1,0],[2,0],[3,0],[-1,1],[1,1]],height:[27,34,42,31],width:42,depth:34},
  shali:{layout:[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]],height:[21,28,32,24],width:35,depth:32},
  'urus-martan':{layout:[[-3,-1],[-2,-1],[-1,-1],[0,-1],[1,-1],[2,-1],[-2,1],[-1,1],[0,1],[1,1]],height:[18,24,29,20],width:32,depth:29},
  kurchaloy:{layout:[[0,-2],[-1,-1],[0,-1],[1,-1],[-2,0],[-1,0],[0,0],[1,0],[2,0],[-1,1],[0,1],[1,1],[0,2]],height:[19,25,31,23],width:30,depth:27},
 };
 const profile=profiles[cityId]??profiles.shali;
 profile.layout.forEach(([col,row],index)=>{
  const height=profile.height[index%profile.height.length];
  const x=col*(profile.width+12),z=row*(profile.depth+12);
  block(x,z,profile.width,height,profile.depth,index%4===0?stone:paleStone);
  if(index%3===0){
   const roof=new THREE.Mesh(new THREE.ConeGeometry(profile.width*.35,8,4),trim);
   roof.position.set(x,height+4,z);parent.add(roof);
  }
 });
}

function lowHouse(parent,x,z,width=280,height=150){
 box(parent,x,-18,z,width+55,36,width*.78+55,stone);
 box(parent,x,0,z,width,height,width*.78,paleStone);
 // A low four-sided roof and dark doorway share the existing roof/stone batch.
 const cap=new THREE.Mesh(new THREE.ConeGeometry(width*.62,height*.38,4),roof);
 cap.rotation.y=Math.PI/4;cap.position.set(x,height+height*.18,z);parent.add(cap);
 box(parent,x-width*.2,16,z+width*.39,width*.14,height*.34,5,dark);
}

function buildPlace(parent,siteId){
 if(siteId==='ushkaloi'){
  // Two paired towers sit over a narrow stone shelf, suggesting the cliff
  // setting without drawing a fabricated rock arch.
  box(parent,0,-35,75,1120,70,620,stone);
  historicTower(parent,-225,0,1320,255);
  historicTower(parent,225,0,1320,255);
  box(parent,0,0,185,520,180,180,paleStone);
 }else if(siteId==='phakoch'){
  // Low perimeter walls frame an open courtyard, with corner towers set back.
  box(parent,0,-35,70,1500,70,1150,stone);
  historicTower(parent,-520,-340,930,220);historicTower(parent,520,-340,900,215);
  historicTower(parent,-520,480,820,205);historicTower(parent,520,480,900,215);
  box(parent,0,20,-340,820,190,80,paleStone);
  // Split the entrance wall into two sections so the courtyard gate stays open.
  box(parent,-345,20,480,520,190,90,paleStone);box(parent,345,20,480,520,190,90,paleStone);
 }else if(siteId==='sharoi-complex'){
  box(parent,0,-35,80,1320,70,980,stone);
  const towers=[[-360,-270,1320,235],[-90,-230,1060,210],[240,-265,1450,245],[-260,75,940,195],[110,65,1160,205],[390,100,820,185]];
  for(const [x,z,h,w] of towers)historicTower(parent,x,z,h,w);
  box(parent,-120,0,330,560,260,180,paleStone);box(parent,280,0,330,340,190,170,stone);
 }else if(siteId==='nikaroi'){
  box(parent,0,-35,70,1120,70,820,stone);
  historicTower(parent,-260,0,1220,245);historicTower(parent,110,-120,940,205);historicTower(parent,350,130,760,185);
  box(parent,-110,0,310,370,210,190,paleStone);
 }else{
  // Khoi is a low cluster: small roofed houses gather around one taller tower.
  box(parent,0,-35,70,1380,70,1030,stone);
  historicTower(parent,0,-80,1160,235);
  lowHouse(parent,-390,-330,290,155);lowHouse(parent,30,-390,320,175);
  lowHouse(parent,390,-270,270,145);lowHouse(parent,-290,300,315,165);lowHouse(parent,190,330,280,140);
 }
}

function conformMeshesToRelief(group,manifest,grid,center,verticalScale,multiplier){
 if(!Array.isArray(center)||center.length<2)return;
 const [longitude,latitude]=center;
 const centerElevation=sampleReliefElevation(manifest,grid,center);
 const radius=6378137,degree=180/Math.PI,cosLatitude=Math.cos(latitude*Math.PI/180);
 const position=new THREE.Vector3();
 group.updateMatrixWorld(true);
 group.traverse(object=>{
  if(!object.isMesh)return;
  object.getWorldPosition(position);
  group.worldToLocal(position);
  const lng=longitude+(position.x*multiplier)/(radius*cosLatitude)*degree;
  const lat=latitude+(position.z*multiplier)/radius*degree;
  const elevation=sampleReliefElevation(manifest,grid,[lng,lat]);
  object.position.y+=(elevation-centerElevation)/(multiplier*verticalScale);
 });
 group.updateMatrixWorld(true);
}

export function bakeLocalGeometry(geometry,worldMatrix,origin=new THREE.Vector3()){
 const transform=new THREE.Matrix4().makeTranslation(-origin.x,-origin.y,-origin.z).multiply(worldMatrix);
 const result=geometry.clone().toNonIndexed();result.applyMatrix4(transform);return result;
}

export function addLandmarkModels(scene,manifest,grid,landmarks,sceneOrigin=new THREE.Vector3()){
 const models=[];
 for(const site of landmarks){
  const group=new THREE.Group();
  const center=site.center??site.coordinates;
  const city=site.kind==='city';
  const modelScale=city?[8,10,8]:[.3,.3,.3];
  const multiplier=city?2:1.4;
  const content=new THREE.Group();content.scale.set(...modelScale);group.add(content);
  if(city)buildCity(content,site.id);
  else buildPlace(content,site.id);
  const origin=mercatorPosition(center,sampleReliefElevation(manifest,grid,center));
  group.position.set(origin.x,origin.y,origin.z);
  group.rotation.x=Math.PI/2;
  group.scale.setScalar(origin.meterScale*multiplier);
  conformMeshesToRelief(group,manifest,grid,center,modelScale[1],multiplier);
  group.userData.id=site.id;scene.add(group);models.push(group);
 }
 // Static details share six material batches instead of a draw call per window.
 scene.updateMatrixWorld(true);
 const batches=new Map(),sourceGeometries=new Set();
 for(const model of models)model.traverse(object=>{
  if(!object.isMesh)return;
  const geometry=bakeLocalGeometry(object.geometry,object.matrixWorld,sceneOrigin);
  const batch=batches.get(object.material)??{positions:[],normals:[]};
  batch.positions.push(geometry.getAttribute('position').array);
  batch.normals.push(geometry.getAttribute('normal').array);
  batches.set(object.material,batch);sourceGeometries.add(object.geometry);geometry.dispose();
 });
 const merged=new THREE.Group();
 merged.position.copy(sceneOrigin);
 for(const [material,batch] of batches){
  const join=arrays=>{const result=new Float32Array(arrays.reduce((sum,array)=>sum+array.length,0));let offset=0;for(const array of arrays){result.set(array,offset);offset+=array.length;}return result;};
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(join(batch.positions),3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(join(batch.normals),3));
  merged.add(new THREE.Mesh(geometry,material));
 }
 for(const model of models)scene.remove(model);
 for(const geometry of sourceGeometries)geometry.dispose();
 scene.add(merged);return [merged];
}

export function addWoodland(scene,manifest,grid){
 const instances=[];
 const [west,north,east,south]=manifest.extent;
 let seed=7801;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let attempt=0;attempt<9500&&instances.length<2200;attempt++){
  const u=random(),v=random();
  const row=Math.min(manifest.size-2,Math.floor(v*(manifest.size-1))),column=Math.min(manifest.size-2,Math.floor(u*(manifest.size-1)));
  if(grid.inside[row*(manifest.size-1)+column]<128)continue;
  const raw=grid.data[row*manifest.size+column];
  if(raw<400||raw>2150||random()<(raw-400)/2400)continue;
  const x=west+(east-west)*u,y=north+(south-north)*v;
  const lat=Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI,lng=x*360-180;
  const point=mercatorPosition([lng,lat],sampleReliefElevation(manifest,grid,[lng,lat]));
  instances.push({point,size:65+random()*110,shade:random()});
 }
 const geometry=new THREE.ConeGeometry(1,1,5);
 const material=new THREE.MeshStandardMaterial({color:'#31552d',roughness:1});
 const trees=new THREE.InstancedMesh(geometry,material,instances.length);
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 instances.forEach(({point,size,shade},index)=>{
  dummy.position.set(point.x,point.y,point.z+size*point.meterScale);
  dummy.rotation.set(Math.PI/2,shade*Math.PI,0);
  dummy.scale.set(size*.6*point.meterScale,size*2*point.meterScale,size*.6*point.meterScale);
  dummy.updateMatrix();trees.setMatrixAt(index,dummy.matrix);
  color.setHSL(.24+shade*.04,.26,.22+shade*.12);trees.setColorAt(index,color);
 });
 trees.instanceMatrix.needsUpdate=true;
 trees.userData.maxCount=instances.length;
 scene.add(trees);return trees;
}

// Retained temporarily for the terrain-scene import contract. Elevation-derived
// flow lines are not hydrographic data and must not be drawn as rivers.
export function addDrainage(scene,manifest,grid){
 void scene;void manifest;void grid;
 return [];
}

export function disposeSceneDetails(scene){
 const geometries=new Set(),materials=new Set();
 scene.traverse(object=>{
  if(object.geometry)geometries.add(object.geometry);
  if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);
 });
 for(const geometry of geometries)geometry.dispose();
 for(const material of materials)material.dispose();
}
