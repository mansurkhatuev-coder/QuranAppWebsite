import * as THREE from './vendor/three.module.js';
import {mercatorPosition,projectAnchor,sampleReliefElevation,sampleSurfaceElevation} from './relief.mjs';
import {addLandmarkModels,addWoodland,disposeSceneDetails} from './scene-details.mjs';
import {cloudOpacityForZoom} from './atmosphere.mjs';

import {addWaterways} from './waterways.mjs';

const EARTH_CIRCUMFERENCE=2*Math.PI*6378137;
const latFromMercator=y=>Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI;
export function readRenderMatrix(renderInput,legacyMatrix){
 const legacyProjection=legacyMatrix?.defaultProjectionData?.mainMatrix??legacyMatrix?.defaultProjectionData?.fallbackMatrix;
 const matrix=legacyProjection??(legacyMatrix?.length===16?legacyMatrix:null)??legacyMatrix?.modelViewProjectionMatrix??renderInput?.defaultProjectionData?.mainMatrix??renderInput?.defaultProjectionData?.fallbackMatrix??renderInput?.modelViewProjectionMatrix;
 if(!matrix||matrix.length!==16)throw new TypeError('MapLibre custom render input has no 4Г—4 projection matrix');
 return matrix;
}
const pointAt=(manifest,row,column,elevation)=>{
 const [west,north,east,south]=manifest.extent;
 const u=column/(manifest.size-1),v=row/(manifest.size-1);
 const x=west+(east-west)*u,y=north+(south-north)*v;
 const latitude=latFromMercator(y),scale=1/(EARTH_CIRCUMFERENCE*Math.cos(latitude*Math.PI/180));
 return {x,y,z:elevation*manifest.heightExaggeration*scale,u,v};
};

export function projectReliefPoint(matrix,lngLat,manifest,grid,width,height){
 const sampledElevation=sampleReliefElevation(manifest,grid,lngLat);
 const position=mercatorPosition(lngLat,sampledElevation);
 return {...projectAnchor(matrix,position,width,height),position,sampledElevation};
}

export {sampleSurfaceElevation} from './relief.mjs';
export const undersideElevation=manifest=>(manifest.baseElevationMeters??-1800)/(manifest.heightExaggeration??1.8);

export function buildWallVertices(manifest,grid=null,{stride=1}={}){
 const edge=manifest?.boundary;
 if(!Array.isArray(edge)||edge.length<3)throw new TypeError('Relief boundary needs at least three sampled points');
 const exaggeration=Number(manifest.heightExaggeration??1.8),baseElevation=Number(manifest.baseElevationMeters??-1800);
 const vertices=new Float32Array(edge.length*18);
 let offset=0;
 const worldPoint=([x,y,elevation],base=false)=>{
  const latitude=latFromMercator(y),meterScale=1/(EARTH_CIRCUMFERENCE*Math.cos(latitude*Math.PI/180));
  const height=grid?sampleSurfaceElevation(manifest,grid,x,y,stride):elevation;
  return [x,y,(base?baseElevation:height*exaggeration)*meterScale];
 };
 for(let index=0;index<edge.length;index++){
  const current=edge[index],next=edge[(index+1)%edge.length];
  const topA=worldPoint(current),bottomA=worldPoint(current,true),topB=worldPoint(next),bottomB=worldPoint(next,true);
  for(const point of [topA,bottomA,topB,topB,bottomA,bottomB]){
   vertices.set(point,offset);offset+=3;
  }
 }
 return vertices;
}

export function buildSurfaceGeometry(manifest,grid,{stride=1,baseElevation=null,clipCells=true}={}){
 const size=manifest?.size;
 const samples=grid?.data??grid;
 const inside=grid?.inside??null;
 if(!Number.isInteger(size)||size<2||samples?.length!==size*size)throw new TypeError('Relief grid dimensions do not match its manifest');
 if(inside&&inside.length!==(size-1)*(size-1))throw new TypeError('Relief clipping cells do not match the grid dimensions');
 if(!Number.isInteger(stride)||stride<1)throw new RangeError('Grid stride must be a positive integer');
 const axis=[];for(let value=0;value<size-1;value+=stride)axis.push(value);if(axis.at(-1)!==size-1)axis.push(size-1);
 const count=axis.length,positions=new Float32Array(count*count*3),uvs=new Float32Array(count*count*2),elevations=new Float32Array(count*count),cloudUvs=new Float32Array(count*count*2);
 let cursor=0,uvCursor=0,heightCursor=0;
 for(const actualRow of axis){
  const v=actualRow/(size-1);
  for(const actualColumn of axis){
   const u=actualColumn/(size-1),raw=baseElevation===null?samples[actualRow*size+actualColumn]:baseElevation;
   const point=pointAt(manifest,actualRow,actualColumn,raw);
   const cloudBounds=[44.12,44.56,46.94,42.38].map((value,index)=>index%2===0?(value+180)/360:(1-Math.asinh(Math.tan(value*Math.PI/180))/Math.PI)/2);
   const cloudU=(point.x-cloudBounds[0])/(cloudBounds[2]-cloudBounds[0]);
   const cloudV=(point.y-cloudBounds[1])/(cloudBounds[3]-cloudBounds[1]);
   positions[cursor++]=point.x;positions[cursor++]=point.y;positions[cursor++]=point.z;
   uvs[uvCursor]=u;cloudUvs[uvCursor++]=cloudU;
   uvs[uvCursor]=1-v;cloudUvs[uvCursor++]=1-cloudV;
   elevations[heightCursor++]=raw;
  }
 }
 const indices=[];
 for(let row=0;row<count-1;row++)for(let column=0;column<count-1;column++){
  const cellRow=Math.min(size-2,Math.floor((axis[row]+axis[row+1])/2));
  const cellColumn=Math.min(size-2,Math.floor((axis[column]+axis[column+1])/2));
  if(clipCells&&inside&&inside[cellRow*(size-1)+cellColumn]<128)continue;
  const a=row*count+column,b=a+1,c=a+count,d=c+1;
  indices.push(a,b,c,b,d,c);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
 geometry.setAttribute('aCloudUv',new THREE.BufferAttribute(cloudUvs,2));
 geometry.setAttribute('aElevation',new THREE.BufferAttribute(elevations,1));
 geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices),1));
 geometry.computeVertexNormals();
 return geometry;
}

function makeSurfaceMaterial(maskTexture,cloudTexture){
 return new THREE.ShaderMaterial({
  polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,
  uniforms:{uMask:{value:maskTexture},uCloudMap:{value:cloudTexture},uCloudShift:{value:new THREE.Vector2()},uLightDirection:{value:new THREE.Vector3(-.55,-.38,.74).normalize()},uClouds:{value:1}},
  vertexShader:`
   attribute float aElevation;
   attribute vec2 aCloudUv;
   varying vec2 vUv;
   varying vec2 vCloudUv;
   varying vec3 vNormal;
   varying float vElevation;
   void main(){
    vUv=uv;
    vCloudUv=aCloudUv;
    vNormal=normalize(normal);
    vElevation=aElevation;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
   }
  `,
  fragmentShader:`
   uniform sampler2D uMask;
   uniform sampler2D uCloudMap;
   uniform vec2 uCloudShift;
   uniform vec3 uLightDirection;
   uniform float uClouds;
   varying vec2 vUv;
   varying vec2 vCloudUv;
   varying vec3 vNormal;
   varying float vElevation;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
   vec3 ramp(float h){
    vec3 low=vec3(.25,.32,.17),green=vec3(.30,.37,.19),forest=vec3(.19,.29,.16),stone=vec3(.57,.50,.34),high=vec3(.72,.66,.51);
    if(h<400.0)return mix(low,green,smoothstep(0.0,400.0,h));
    if(h<1250.0)return mix(green,forest,smoothstep(400.0,1250.0,h));
    if(h<2250.0)return mix(forest,stone,smoothstep(1250.0,2250.0,h));
    return mix(stone,high,smoothstep(2250.0,3600.0,h));
   }
   void main(){
    float inside=texture2D(uMask,vUv).r;
    if(inside<0.48)discard;
    vec3 n=normalize(vNormal);
    float diffuse=max(dot(n,normalize(uLightDirection)),0.0);
    float ambient=0.36+0.77*diffuse;
    float slope=1.0-abs(n.z);
    vec3 color=ramp(vElevation);
   // Fine, restrained albedo variation keeps the broad northern plateau from
   // reading as a single flat color without inventing relief geometry.
   float detail=noise(vUv*630.0)*.45+noise(vUv*1300.0)*.35+noise(vUv*92.0)*.20;
   float folds=noise(vUv*vec2(210.0,360.0))*.65+noise(vUv*vec2(470.0,760.0))*.35;
   float dryRidge=smoothstep(.68,.91,folds)*smoothstep(180.0,1100.0,vElevation);
    color=mix(color,vec3(.63,.54,.34),smoothstep(.23,.76,slope)*.65);
    color=mix(color,vec3(.43,.39,.25),dryRidge*.16);
    float snow=smoothstep(2350.0,3250.0,vElevation+noise(vUv*140.0)*380.0)*(.35+.65*abs(n.z));
    color=mix(color,vec3(.93,.91,.81),snow*.96);
    color*=.79+detail*.35;
    color*=mix(vec3(.64,.81,.78),vec3(1.23,1.09,.79),diffuse)*ambient;
    float cloud=texture2D(uCloudMap,vCloudUv+uCloudShift).a*uClouds;
    color*=1.0-cloud*.22;
    gl_FragColor=vec4(pow(max(color,vec3(0.0)),vec3(.85)),1.0);
   }
  `,
  side:THREE.DoubleSide,
 });
}

function makeCliffMaterial(manifest){
 const [west,north,east,south]=manifest.extent;
 const latitude=latFromMercator((north+south)/2);
 return new THREE.ShaderMaterial({side:THREE.DoubleSide,
  uniforms:{uRockOrigin:{value:new THREE.Vector3((west+east)/2,(north+south)/2,0)},uWorldMeters:{value:EARTH_CIRCUMFERENCE*Math.cos(latitude*Math.PI/180)}},
  vertexShader:`uniform vec3 uRockOrigin;uniform float uWorldMeters;varying vec3 p;varying vec3 n;
   void main(){p=(position-uRockOrigin)*uWorldMeters;n=normalize(normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`varying vec3 p;varying vec3 n;
   float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
   void main(){
    float horizontal=dot(p.xy,vec2(.81,.58));
    vec2 rock=vec2(horizontal,p.z);
    float weather=noise(rock/4100.0)*.65+noise(rock/1700.0)*.35;
    float layers=noise(vec2(horizontal/7200.0,p.z/1400.0+noise(rock/6000.0)*.6));
    vec3 color=mix(vec3(.17,.19,.15),vec3(.34,.32,.25),weather);
    color*=.88+.18*layers;
    float diffuse=max(dot(normalize(n),normalize(vec3(-.55,-.38,.74))),0.0);
    color*=mix(vec3(.65,.77,.76),vec3(1.13,1.02,.82),diffuse)*(.68+.32*diffuse);
    gl_FragColor=vec4(color,1.0);
   }`,
 });
}

function addAtmospherePlanes(scene,manifest,mask,cloud){
 const [west,north,east,south]=manifest.extent;
 const centerX=(west+east)/2,centerY=(north+south)/2;
 const latitude=latFromMercator(centerY);
 const base=(manifest.baseElevationMeters??-1800)/(EARTH_CIRCUMFERENCE*Math.cos(latitude*Math.PI/180));
 const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{mask:{value:mask}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D mask;varying vec2 vUv;
  float maskAt(vec2 uv){if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)return 0.0;return texture2D(mask,uv).r;}
  void main(){
   vec2 uv=(vUv-.5)*1.2+.5;
   float a=0.0;for(int x=-2;x<=2;x++)for(int y=-2;y<=2;y++){a+=maskAt(uv+vec2(float(x),float(y))*.018);}
   gl_FragColor=vec4(.035,.055,.04,a/25.0*.34);
  }`,
 });
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry((east-west)*1.2,(south-north)*1.2),shadowMaterial);
 shadow.rotation.x=Math.PI;shadow.position.set(centerX+.00007,centerY+.00010,base+.000003);scene.add(shadow);
 const cloudMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
  uniforms:{cloud:{value:cloud},shift:{value:new THREE.Vector2()},opacity:{value:.23}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D cloud;uniform vec2 shift;uniform float opacity;varying vec2 vUv;void main(){
   float edge=smoothstep(0.0,.14,vUv.x)*smoothstep(0.0,.14,1.0-vUv.x)*smoothstep(0.0,.18,vUv.y)*smoothstep(0.0,.18,1.0-vUv.y);
   vec2 drift=vUv+shift;
   float broad=texture2D(cloud,drift).a;
   float wisps=texture2D(cloud,drift+vec2(sin(drift.y*48.0)*.012,0.0)).a;
   float filament=smoothstep(.35,.78,broad*.56+wisps*.44);
   float a=filament*edge*opacity*.72;
   gl_FragColor=vec4(.85,.85,.72,a);
  }`,
 });
 const clouds=new THREE.Mesh(new THREE.PlaneGeometry((east-west)*1.2,(south-north)*.7),cloudMaterial);
 clouds.rotation.x=Math.PI;clouds.position.set(centerX,centerY+(south-north)*.23,.00023);scene.add(clouds);
 const mistMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
  uniforms:{cloud:{value:cloud},shift:{value:new THREE.Vector2()},opacity:{value:.11}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D cloud;uniform vec2 shift;uniform float opacity;varying vec2 vUv;void main(){
   float edge=smoothstep(0.0,.22,vUv.x)*smoothstep(0.0,.22,1.0-vUv.x)*smoothstep(0.0,.28,vUv.y)*smoothstep(0.0,.28,1.0-vUv.y);
   float wisp=texture2D(cloud,vUv+shift).a;
   gl_FragColor=vec4(.78,.82,.73,smoothstep(.18,.75,wisp)*edge*opacity);
  }`,
 });
 const mist=new THREE.Mesh(new THREE.PlaneGeometry((east-west)*1.12,(south-north)*.55),mistMaterial);
 mist.rotation.x=Math.PI;mist.position.set(centerX,centerY+(south-north)*.29,.000055);scene.add(mist);
 const baseMist=new THREE.Mesh(new THREE.PlaneGeometry((east-west)*1.28,(south-north)*.56),mistMaterial);
 baseMist.rotation.x=Math.PI;baseMist.position.set(centerX,centerY+(south-north)*.43,base+.000006);scene.add(baseMist);
 return {clouds,shadow,mist,baseMist,cloudMaterial,mistMaterial};
}

function makeUndersideMaterial(maskTexture){
 return new THREE.ShaderMaterial({
  uniforms:{uMask:{value:maskTexture}},side:THREE.DoubleSide,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D uMask;varying vec2 vUv;void main(){if(texture2D(uMask,vUv).r<0.48)discard;gl_FragColor=vec4(0.16,0.19,0.15,1.0);}`,
 });
}

function buildBoundaryRimVertices(manifest){
 const points=manifest.boundary;
 const vertices=new Float32Array(points.length*3);
 for(let index=0;index<points.length;index++){
  const [x,y,elevation]=points[index];
  const latitude=latFromMercator(y),scale=1/(EARTH_CIRCUMFERENCE*Math.cos(latitude*Math.PI/180));
  vertices.set([x,y,elevation*manifest.heightExaggeration*scale],index*3);
 }
 return vertices;
}

export function createTerrainSceneLayer({manifest,grid,maskUrl,cloudUrl,landmarks=[],waterways=null,onFrame=()=>{},onStatus=()=>{},documentRef=globalThis.document,windowRef=globalThis.window}){
 let renderer=null,scene=null,camera=null,texture=null,cloudTexture=null,geometries=[],materials=[],disposed=false,topGeometries=[],topMeshes=[],undersideMesh=null,wallMeshes=[],raised=true,clouds=true,cloudTimer=null,cloudStartedAt=0,pageVisible=true,resizeListener=null,maskReady=false,firstFrameReported=false;
 let activeStride=2,layerVisible=true,reliefFactor=1,riverMeshes=[],riverGroup=null;
 const projectionTransform=new THREE.Matrix4(),projected=new THREE.Matrix4(),renderProjection=new THREE.Matrix4();
 const sceneOrigin=new THREE.Vector3((manifest.extent[0]+manifest.extent[2])/2,(manifest.extent[1]+manifest.extent[3])/2,0);
 const originTransform=new THREE.Matrix4().makeTranslation(sceneOrigin.x,sceneOrigin.y,sceneOrigin.z);
 const centerLatitude=latFromMercator((manifest.extent[1]+manifest.extent[3])/2);
 const lift=-(manifest.baseElevationMeters??-1800)/(EARTH_CIRCUMFERENCE*Math.cos(centerLatitude*Math.PI/180));
 let atmosphericPlanes=null,sceneDetails=[],landmarkModels=[],rimMesh=null,woodland=null,lodZoomListener=null;
 const updateCloudUniform=()=>{
  const uniform=materials[0]?.uniforms?.uCloudShift?.value;
  if(!uniform)return;
  const elapsed=(Date.now()-cloudStartedAt)/60000;
  uniform.set(-elapsed*.0008,elapsed*.00022);
  atmosphericPlanes?.cloudMaterial.uniforms.shift.value.set(-elapsed*.003,elapsed*.001);
  atmosphericPlanes?.mistMaterial.uniforms.shift.value.set(elapsed*.0015,-elapsed*.0005);
 };
 const stopCloudTimer=()=>{if(cloudTimer!==null){windowRef?.clearInterval?.(cloudTimer);cloudTimer=null;}};
 const startCloudTimer=()=>{
  stopCloudTimer();
  if(!windowRef?.setInterval||!clouds||!pageVisible||!layerVisible||windowRef.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||disposed)return;
  cloudTimer=windowRef.setInterval(()=>{updateCloudUniform();thisMap?.triggerRepaint?.();},900);
 };
 let thisMap=null;
 const layer={
  id:'atlas-raised-relief',type:'custom',renderingMode:'3d',
  onAdd(map,gl){
   this.map=map;thisMap=map;cloudStartedAt=Date.now();pageVisible=!documentRef?.hidden;
   renderer=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true,alpha:false,powerPreference:'high-performance'});
   renderer.autoClear=false;
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   camera=new THREE.Camera();scene=new THREE.Scene();
   const ambient=new THREE.HemisphereLight('#e6e1c6','#21362c',1.4);
   scene.add(ambient);
   const key=new THREE.DirectionalLight('#ffe0a0',2.7);
   key.position.set(-.55,-.38,.74);scene.add(key);
   const loader=new THREE.TextureLoader();
   texture=loader.load(maskUrl,()=>{if(!disposed){texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;maskReady=true;map.triggerRepaint();}},undefined,error=>onStatus('degraded',error));
   cloudTexture=loader.load(cloudUrl,()=>{if(!disposed){cloudTexture.colorSpace=THREE.NoColorSpace;cloudTexture.generateMipmaps=true;cloudTexture.minFilter=THREE.LinearMipmapLinearFilter;cloudTexture.magFilter=THREE.LinearFilter;cloudTexture.needsUpdate=true;map.triggerRepaint();}},undefined,()=>{});
   const top=buildSurfaceGeometry(manifest,grid,{clipCells:false});
   const topOverview=buildSurfaceGeometry(manifest,grid,{stride:2,clipCells:false});
   const topMobile=buildSurfaceGeometry(manifest,grid,{stride:3,clipCells:false});
   const underside=buildSurfaceGeometry(manifest,grid,{baseElevation:undersideElevation(manifest),stride:8,clipCells:false});
   const topMaterial=makeSurfaceMaterial(texture,cloudTexture);
   const undersideMaterial=makeUndersideMaterial(texture);
   const wallGeometries=[1,2,3].map(stride=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(buildWallVertices(manifest,grid,{stride}),3));
    geometry.computeVertexNormals();return geometry;
   });
   const wallMaterial=makeCliffMaterial(manifest);
   geometries=[top,topOverview,topMobile,underside,...wallGeometries];materials=[topMaterial,undersideMaterial,wallMaterial];
   undersideMesh=new THREE.Mesh(underside,undersideMaterial);wallMeshes=wallGeometries.map(geometry=>new THREE.Mesh(geometry,wallMaterial));
   topGeometries=[top,topOverview,topMobile];topMeshes=topGeometries.map(geometry=>new THREE.Mesh(geometry,topMaterial));
   scene.add(undersideMesh);wallMeshes.forEach(mesh=>scene.add(mesh));topMeshes.forEach(mesh=>scene.add(mesh));
   let detailLod=false;
   resizeListener=()=>{
    const mobile=Boolean(windowRef?.matchMedia?.('(max-width: 899px)')?.matches);
    const zoom=map.getZoom();
    detailLod=detailLod?zoom>9.0:zoom>9.3;
    const index=mobile?(detailLod?1:2):(detailLod?0:1);activeStride=[1,2,3][index];
    topMeshes.forEach((mesh,at)=>{mesh.visible=at===index;});
    riverMeshes.forEach((mesh,at)=>{mesh.visible=at===index;});
    wallMeshes.forEach((mesh,at)=>{mesh.visible=raised&&at===index;});
    if(woodland)woodland.count=Math.min(woodland.userData.maxCount,mobile?700:2200);
    map.triggerRepaint();
   };
   windowRef?.addEventListener?.('resize',resizeListener);resizeListener();
   lodZoomListener=resizeListener;map.on('zoom',lodZoomListener);
   atmosphericPlanes=addAtmospherePlanes(scene,manifest,texture,cloudTexture);
   woodland=addWoodland(scene,manifest,grid);
   riverGroup=new THREE.Group();scene.add(riverGroup);
   riverMeshes=[1,2,3].map(stride=>addWaterways(riverGroup,manifest,grid,waterways,{stride}));
   landmarkModels=addLandmarkModels(scene,manifest,grid,landmarks,sceneOrigin);
   sceneDetails=[...landmarkModels,woodland,riverGroup];
   // Keep GPU vertex coordinates near zero; world-space Float32 loses metre-scale details.
   for(const geometry of geometries)geometry.translate(-sceneOrigin.x,-sceneOrigin.y,-sceneOrigin.z);
   wallMaterial.uniforms.uRockOrigin.value.sub(sceneOrigin);
   for(const mesh of riverMeshes)mesh.geometry.translate(-sceneOrigin.x,-sceneOrigin.y,-sceneOrigin.z);
   atmosphericPlanes.clouds.position.sub(sceneOrigin);atmosphericPlanes.shadow.position.sub(sceneOrigin);atmosphericPlanes.mist.position.sub(sceneOrigin);atmosphericPlanes.baseMist.position.sub(sceneOrigin);
   for(const detail of sceneDetails)if(detail!==woodland&&detail!==riverGroup)detail.position.sub(sceneOrigin);
   const instanceMatrix=new THREE.Matrix4();
   for(let at=0;at<woodland.userData.maxCount;at++){woodland.getMatrixAt(at,instanceMatrix);instanceMatrix.elements[12]-=sceneOrigin.x;instanceMatrix.elements[13]-=sceneOrigin.y;instanceMatrix.elements[14]-=sceneOrigin.z;woodland.setMatrixAt(at,instanceMatrix);}
   woodland.instanceMatrix.needsUpdate=true;
   resizeListener();
   startCloudTimer();
   onStatus('loading');
  },
  render(glOrInput,legacyMatrix){
   if(!renderer||!camera||disposed||!layerVisible)return;
   const canvas=this.map.getCanvas();
   if(canvas.clientWidth<=0||canvas.clientHeight<=0)return;
   const matrix=readRenderMatrix(glOrInput,legacyMatrix);
   projectionTransform.makeTranslation(0,0,lift*reliefFactor);
   projectionTransform.elements[10]=reliefFactor;
   projected.fromArray(matrix).multiply(projectionTransform);
   renderProjection.copy(projected).multiply(originTransform);
   camera.projectionMatrix.copy(renderProjection);
   for(const riverMesh of riverMeshes)riverMesh.material.uniforms.time.value=windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?0:(Date.now()-cloudStartedAt)/1000;
   camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
   camera.matrixWorld.identity();camera.matrixWorldInverse.identity();
   if(atmosphericPlanes){
    const opacity=cloudOpacityForZoom(this.map.getZoom());
    atmosphericPlanes.cloudMaterial.uniforms.opacity.value=opacity;
    atmosphericPlanes.mistMaterial.uniforms.opacity.value=opacity*.48;
    if(materials[0]?.uniforms?.uClouds)materials[0].uniforms.uClouds.value=clouds?opacity/.23:0;
   }
   landmarkModels.forEach(model=>{model.visible=reliefFactor>.12&&this.map.getZoom()>=8.35;});
   // The overview trees are schematic; hide them before their simple geometry
   // becomes conspicuous when inspecting individual places.
   if(woodland)woodland.visible=reliefFactor>.12&&this.map.getZoom()<10.4;
   renderer.resetState();
   renderer.render(scene,camera);
   renderer.resetState();
   if(maskReady&&!firstFrameReported){firstFrameReported=true;onStatus('ready');}
   if(clouds&&pageVisible&&!windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)updateCloudUniform();
   onFrame(projected.elements,canvas.clientWidth,canvas.clientHeight,raised,{stride:activeStride,occlusionEnabled:reliefFactor>.15});
  },
  setVisible(value){
   const visible=Boolean(value);if(layerVisible===visible)return;
   layerVisible=visible;if(visible)startCloudTimer();else stopCloudTimer();this.map?.triggerRepaint();
  },
  setRaised(value){this.setReliefFactor(value?1:0);},
  setReliefFactor(value){
   const factor=Math.max(0,Math.min(1,Number(value)||0));if(Math.abs(factor-reliefFactor)<.0001)return;
   reliefFactor=factor;raised=factor>.001;
   if(undersideMesh)undersideMesh.visible=raised;
   wallMeshes.forEach((mesh,index)=>{mesh.visible=raised&&topMeshes[index].visible;});
   if(atmosphericPlanes){atmosphericPlanes.shadow.visible=raised;atmosphericPlanes.clouds.visible=raised&&clouds;atmosphericPlanes.mist.visible=raised&&clouds;atmosphericPlanes.baseMist.visible=raised&&clouds;}
   for(const detail of sceneDetails)detail.visible=factor>.12;
   this.map?.triggerRepaint();
  },
  setClouds(value){
   clouds=Boolean(value);
   if(!cloudStartedAt)cloudStartedAt=Date.now();
   const uniform=materials[0]?.uniforms?.uClouds;
   if(uniform)uniform.value=clouds?1:0;
   if(atmosphericPlanes){atmosphericPlanes.clouds.visible=clouds&&raised;atmosphericPlanes.mist.visible=clouds&&raised;atmosphericPlanes.baseMist.visible=clouds&&raised;}
   startCloudTimer();this.map?.triggerRepaint();
  },
  setPageVisible(value){pageVisible=Boolean(value);if(pageVisible){startCloudTimer();this.map?.triggerRepaint();}else stopCloudTimer();},
  onRemove(){
   disposed=true;
   stopCloudTimer();
   if(resizeListener)windowRef?.removeEventListener?.('resize',resizeListener);
   if(lodZoomListener)this.map?.off('zoom',lodZoomListener);
   if(scene)disposeSceneDetails(scene);
   texture?.dispose();cloudTexture?.dispose();renderer?.dispose();
   geometries=[];materials=[];scene?.clear();renderer=null;scene=null;camera=null;topGeometries=[];topMeshes=[];undersideMesh=null;wallMeshes=[];sceneDetails=[];atmosphericPlanes=null;rimMesh=null;woodland=null;lodZoomListener=null;
  },
 };
 return layer;
}
