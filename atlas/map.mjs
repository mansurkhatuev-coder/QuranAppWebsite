import {Map,setWorkerUrl} from './vendor/maplibre-gl.mjs';
import {groups,sites} from './catalog.mjs';
import {createCameraController,focusCenterAtAltitude} from './camera.mjs';
import {createAtlasMarkers} from './markers.mjs';
import {computeLayoutMode,computeOverviewCamera} from './viewport.mjs';
import {createTerrainSceneLayer} from './terrain-scene.mjs';
import {mercatorPosition,computeProjectedFit,sampleReliefElevation} from './relief.mjs';
import {createAtlasStyle,addWorldContext,addCosmosBackground,addRegionalHydrology} from './map-style.mjs';
import {addCosmosOverlay} from './cosmos-overlay.mjs';
import {getWorldView} from './world-view.mjs';
import {settlements} from './settlements.mjs';
import {rivers} from './rivers.mjs';
import {createAtlasZoom} from './zoom-focus.mjs';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const readBounds=feature=>{
 let west=180,south=90,east=-180,north=-90;
 const visit=value=>{
  if(Array.isArray(value)&&value.length>=2&&typeof value[0]==='number'&&typeof value[1]==='number'){
   west=Math.min(west,value[0]);east=Math.max(east,value[0]);south=Math.min(south,value[1]);north=Math.max(north,value[1]);return;
  }
  if(Array.isArray(value))value.forEach(visit);
 };
 visit(feature?.geometry?.coordinates);
 return west<east&&south<north?[[west,south],[east,north]]:null;
};

function makeOutsideMask(boundary){
 const polygons=boundary.geometry.type==='Polygon'?[boundary.geometry.coordinates]:boundary.geometry.coordinates;
 const bounds=readBounds(boundary),[[west,south],[east,north]]=bounds;
 const padLongitude=Math.max(10,(east-west)*2),padLatitude=Math.max(6,(north-south)*2);
 const outer=[[west-padLongitude,south-padLatitude],[east+padLongitude,south-padLatitude],[east+padLongitude,north+padLatitude],[west-padLongitude,north+padLatitude],[west-padLongitude,south-padLatitude]];
 const signedArea=ring=>ring.reduce((sum,point,index)=>{const next=ring[(index+1)%ring.length];return sum+(next[0]-point[0])*(next[1]+point[1]);},0);
 const outerSign=Math.sign(signedArea(outer));
 const holes=polygons.map(polygon=>{const ring=polygon[0];return Math.sign(signedArea(ring))===outerSign?[...ring].reverse():ring;});
 return {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[outer,...holes]}};
}

export async function createAtlas({onHome=()=>{},onGroup=()=>{},onSite=()=>{},onCity=()=>{},onRiver=()=>{},onStatus=()=>{},onCameraInput=()=>{},onCameraSettled=()=>{},onResize=()=>{}}={}){
 setWorkerUrl(new URL('./vendor/maplibre-gl-worker.mjs',import.meta.url).href);
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const layout=()=>computeLayoutMode({width:innerWidth,height:innerHeight});
 const initialPitch=()=>innerHeight<600?32:innerWidth<900?35:46;
 const terrainSource={type:'raster-dem',tiles:[new URL('./data/terrain/{z}/{x}/{y}.png',location.href).href.replaceAll('%7B','{').replaceAll('%7D','}')],encoding:'terrarium',tileSize:256,minzoom:5,maxzoom:10,bounds:[44.4,42.35,46.75,44.2],attribution:'AWS Terrain Tiles'};
 const style=createAtlasStyle(terrainSource);
 const modestGPU=navigator.deviceMemory<=4 || navigator.connection?.saveData===true;
 const map=new Map({pixelRatio:Math.min(devicePixelRatio,modestGPU?1.5:2),container:'map',style,center:[45.8,43.05],zoom:7.3,pitch:initialPitch(),bearing:-17,minZoom:0,maxZoom:12.3,maxPitch:60,attributionControl:false,renderWorldCopies:false,canvasContextAttributes:{antialias:!modestGPU}});
 map.setCenterClampedToGround(false);
 const zoomBy=createAtlasZoom(map,{reducedMotion:()=>reduce.matches});
 const terrainConfig=()=>({source:'terrain-dem',exaggeration:1.8});
 let terrainEnabled=true,mapStatus='loading',boundary=null,bounds=null,ready=false,fallbackMode=false,activeLayer='groups',currentPadding={left:0,right:0,top:0,bottom:0};
 let reliefManifest=null,reliefGrid=null,reliefLayer=null,diagnostic=null,framePoints=[],homeFitRemaining=0,homeFitScheduled=false,homeFitVersion=0,lastFitDiagnostic=null,pendingReadyReport=null;
 const mapErrors=[];let regionalWaterways=null;
 let pendingCameraAction=null,resolveReady;
 const readyPromise=new Promise(resolve=>{resolveReady=resolve;});
 const cities=settlements.map(item=>({...item,center:item.coordinates,kind:'city'}));
 const markers=createAtlasMarkers(map,groups,sites,{onGroup,onSite,onCity,onRiver,waterways:rivers,orientation:cities});
 let cosmosOverlayCleanup=()=>{},mapDestroyed=false;
 const camera=createCameraController(map,{reducedMotion:reduce,initialTerrainEnabled:true,initialRememberedPitch:initialPitch(),maxPitch:60,onTerrainMode:enabled=>{
  terrainEnabled=enabled;reliefLayer?.setRaised(enabled);
  if(fallbackMode&&ready)map.setTerrain(enabled?terrainConfig():null);
 }});

 function report(status,text){
  const rank={loading:0,ready:1,degraded:2,unavailable:3};
  if(rank[status]<rank[mapStatus])return;
  mapStatus=status;onStatus(status,text);
 }
 function setPadding(padding){
  const next={left:padding?.left??0,right:padding?.right??0,top:padding?.top??0,bottom:padding?.bottom??0};
  if(Object.keys(next).every(key=>next[key]===currentPadding[key]))return;
  currentPadding=next;
  camera.setPadding(currentPadding);
 }
 function focusCoordinate(center,zoom,padding=currentPadding){
  const action=()=>{
   homeFitRemaining=0;homeFitVersion++;
   let elevation=0;
   if(reliefManifest&&reliefGrid&&terrainEnabled&&!fallbackMode){
    const latitude=Math.atan(Math.sinh(Math.PI*(1-reliefManifest.extent[1]-reliefManifest.extent[3])))*180/Math.PI;
    const liftScale=mercatorPosition([center[0],latitude]).meterScale/mercatorPosition(center).meterScale;
    elevation=sampleReliefElevation(reliefManifest,reliefGrid,center)-(reliefManifest.baseElevationMeters??-1800)*liftScale;
   }
   const target=elevation?focusCenterAtAltitude(center,elevation,map.getBearing(),map.getPitch()):center;
   camera.focus({center:target,zoom,padding,elevation:0});
  };
  if(ready)action();else pendingCameraAction=action;
 }
 function fitOverview({animate=false}={}){
  homeFitVersion++;
  const journey=animate&&map.getZoom()<5.4;
  const {pitch,fitPitch,centerOnBounds,zoomOffset,minZoom}=computeOverviewCamera({width:innerWidth,height:innerHeight,terrainEnabled});
  const mobile=layout().panel==='bottom';
  if(bounds&&reliefManifest&&!fallbackMode){
   const [west,north,east,south]=reliefManifest.extent,angle=17*Math.PI/180;
   const spanX=(east-west)*Math.cos(angle)+(south-north)*Math.sin(angle);
   const spanY=((south-north)*Math.cos(angle)+(east-west)*Math.sin(angle))*Math.cos(pitch*Math.PI/180);
   const width=Math.max(60,innerWidth-currentPadding.left-currentPadding.right-48);
   const height=Math.max(60,innerHeight-currentPadding.top-currentPadding.bottom-48);
   const zoom=clamp(Math.log2(Math.min(width/spanX,height/spanY)/512),4.7,10);
   camera.overview({center:[(bounds[0][0]+bounds[1][0])/2,(bounds[0][1]+bounds[1][1])/2],zoom,bearing:-17,pitch,padding:currentPadding,immediate:!animate,journey});
  }else if(bounds&&map.cameraForBounds){
   const fitted=map.cameraForBounds(bounds,{bearing:-17,pitch:fitPitch,padding:currentPadding});
   if(fitted){const center=centerOnBounds?[(bounds[0][0]+bounds[1][0])/2,(bounds[0][1]+bounds[1][1])/2]:fitted.center;camera.overview({...fitted,center,zoom:Math.max(minZoom,(fitted.zoom??7.8)+zoomOffset),bearing:-17,pitch,padding:currentPadding,immediate:!animate,journey});}
   else camera.overview({center:mobile?[45.67,43.08]:[45.58,43.09],zoom:7.65,bearing:-17,pitch,padding:currentPadding});
  }else camera.overview({center:mobile?[45.67,43.08]:[45.58,43.09],zoom:7.65,bearing:-17,pitch,padding:currentPadding});
  homeFitRemaining=fallbackMode?0:10;map.triggerRepaint();
 }
 function refineOverview(matrix,width,height){
  const finish=()=>{homeFitRemaining=0;if(pendingReadyReport){report(...pendingReadyReport);pendingReadyReport=null;}};
  if(!homeFitRemaining){finish();return;}
  if(homeFitScheduled||map.isMoving())return;
  const fit=computeProjectedFit(matrix,framePoints,width,height,currentPadding,innerWidth<900?13:24);
  if(!fit){finish();return;}
  const target=[(width+currentPadding.left-currentPadding.right)/2,(height+currentPadding.top-currentPadding.bottom)/2];
  lastFitDiagnostic={padding:currentPadding,remaining:homeFitRemaining,scale:fit.scale,center:fit.center,target,bounds:fit.bounds};
  if(Math.abs(1-fit.scale)<.015&&Math.hypot(fit.center[0]-target[0],fit.center[1]-target[1])<3){finish();return;}
  const zoom=clamp(map.getZoom()+Math.log2(clamp(fit.scale,.65,1.6)),4.7,10);
  const needsZoom=Math.abs(1-fit.scale)>.015;
  const shift=[fit.center[0]-target[0],fit.center[1]-target[1]];
  homeFitRemaining--;homeFitScheduled=true;
  const version=homeFitVersion;
  requestAnimationFrame(()=>{
   homeFitScheduled=false;if(version!==homeFitVersion){map.triggerRepaint();return;}if(map.isMoving())return;
   if(needsZoom)map.jumpTo({zoom});else map.panBy(shift,{duration:0});
   map.triggerRepaint();
  });
 }
 function updateMarkers(){markers.setLayer(activeLayer);document.body.dataset.mapLayer=activeLayer;}
 function addFallbackBoundary(){
  if(!boundary||map.getSource('chechnya'))return;
  map.addSource('chechnya',{type:'geojson',data:boundary});
  map.addSource('outside',{type:'geojson',data:makeOutsideMask(boundary)});
  map.addLayer({id:'outside-mask',type:'fill',source:'outside',paint:{'fill-color':'#15372f','fill-opacity':1}});
  map.addLayer({id:'fallback-boundary',type:'line',source:'chechnya',paint:{'line-color':'#d9c88e','line-width':1.2,'line-opacity':.78}});
 }
 function addRegionalContext(){
  if(!boundary||map.getSource('chechnya-native'))return;
  map.addSource('chechnya-native',{type:'geojson',data:boundary});
  map.addLayer({id:'chechnya-native-fill',type:'fill',source:'chechnya-native',paint:{'fill-color':'#d2c995','fill-opacity':['interpolate',['linear'],['zoom'],1,.12,4,.08,5.4,.03,6.2,0]}});
  map.addLayer({id:'chechnya-native-outline',type:'line',source:'chechnya-native',paint:{'line-color':'#d9c88e','line-width':['interpolate',['linear'],['zoom'],1,.7,4,1,5.5,1.5,7,0],'line-opacity':['interpolate',['linear'],['zoom'],1,.84,4,.78,5.5,.52,6.8,0]}});
  map.addSource('atlas-home-point',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[45.8,43.05]}}});
  map.addLayer({id:'atlas-home-glow',type:'circle',source:'atlas-home-point',maxzoom:5.4,paint:{'circle-radius':13,'circle-color':'#d9bc7b','circle-opacity':.4,'circle-blur':.8}});
  map.addLayer({id:'atlas-home-beacon',type:'circle',source:'atlas-home-point',maxzoom:5.4,paint:{'circle-radius':4,'circle-color':'#e5c68b','circle-stroke-color':'#fff0c8','circle-stroke-width':1.5}});
  map.on('click','atlas-home-beacon',onHome);
  map.on('mouseenter','atlas-home-beacon',()=>{map.getCanvas().style.cursor='pointer';});
  map.on('mouseleave','atlas-home-beacon',()=>{map.getCanvas().style.cursor='';});
 }
 function activateFallback(reason='Объёмная карта недоступна · включён рельефный режим'){
  fallbackMode=true;map.setCenterClampedToGround(true);
  if(reliefLayer&&map.getLayer(reliefLayer.id))map.removeLayer(reliefLayer.id);
  reliefLayer=null;
  if(map.getLayer('fallback-relief'))map.setLayoutProperty('fallback-relief','visibility','visible');
  if(map.getLayer('fallback-hillshade'))map.setLayoutProperty('fallback-hillshade','visibility','visible');
  addFallbackBoundary();
  if(terrainEnabled)map.setTerrain(terrainConfig());
  report('degraded',reason);
 }
 function projectFallbackMarkers(){
  const canvas=map.getCanvas(),width=canvas.clientWidth,height=canvas.clientHeight;
  markers.updateFallback(width,height);
 }
 function finishSetup(status='ready',message='Объёмный атлас Чечни · локальная сцена'){
  if(ready)return;
  ready=true;updateMarkers();fitOverview();
  if(pendingCameraAction){const action=pendingCameraAction;pendingCameraAction=null;action();}
  if(fallbackMode)report(status,message);else pendingReadyReport=[status,message];
  resolveReady();
 }

 let previousWorldMode=null;
 function syncWorldView(){
  const view=getWorldView(map.getZoom());
  document.body.dataset.worldView=view.mode;document.body.dataset.mapZoom=map.getZoom().toFixed(3);
  if(previousWorldMode!==view.mode){previousWorldMode=view.mode;if(map.isMoving())map.once('moveend',onResize);else onResize();}
  document.body.dataset.mapProjection=view.projection;
  const markerLayer=document.querySelector('.atlas-marker-layer');
  if(markerLayer)markerLayer.style.visibility=view.projection==='mercator'?'':'hidden';
  reliefLayer?.setVisible?.(view.reliefVisible);
  reliefLayer?.setReliefFactor(terrainEnabled?view.reliefFactor:0);
  return view;
 }

 async function loadRelief(){
  const manifestResponse=await fetch('./data/relief/manifest.json');
  if(!manifestResponse.ok)throw new Error(`Relief manifest returned HTTP ${manifestResponse.status}`);
  const loadedManifest=await manifestResponse.json();
  // Keep one shared depth for the wall, underside, camera and marker projection.
  reliefManifest={...loadedManifest,baseElevationMeters:Math.max(-1000,loadedManifest.baseElevationMeters??-1800)};
  const heightsResponse=await fetch('./data/relief/heights.f32');
  if(!heightsResponse.ok)throw new Error(`Relief grid returned HTTP ${heightsResponse.status}`);
  const buffer=await heightsResponse.arrayBuffer();
  if(buffer.byteLength!==reliefManifest.size*reliefManifest.size*4)throw new Error('Relief height grid has an unexpected byte length');
  const cellsResponse=await fetch('./data/relief/cells.u8');
  if(!cellsResponse.ok)throw new Error(`Relief clipping cells returned HTTP ${cellsResponse.status}`);
  const cellBuffer=await cellsResponse.arrayBuffer();
  if(cellBuffer.byteLength!==(reliefManifest.size-1)**2)throw new Error('Relief clipping cells have an unexpected byte length');
  reliefGrid={size:reliefManifest.size,data:new Float32Array(buffer),inside:new Uint8Array(cellBuffer)};
  const pointAt=(x,y,height)=>{
   const lat=Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI;
   return mercatorPosition([x*360-180,lat],height);
  };
  framePoints=reliefManifest.boundary.flatMap(([x,y,height])=>[pointAt(x,y,height*reliefManifest.heightExaggeration),pointAt(x,y,reliefManifest.baseElevationMeters)]);
  for(let row=0;row<reliefManifest.size-1;row+=12)for(let column=0;column<reliefManifest.size-1;column+=12){
   if(reliefGrid.inside[row*(reliefManifest.size-1)+column]<128)continue;
   const [west,north,east,south]=reliefManifest.extent;
   framePoints.push(pointAt(west+(east-west)*column/(reliefManifest.size-1),north+(south-north)*row/(reliefManifest.size-1),reliefGrid.data[row*reliefManifest.size+column]*reliefManifest.heightExaggeration));
  }
  markers.setRelief(reliefManifest,reliefGrid);
  const landmarks=[...cities.filter(city=>city.kind==='city'),...sites.map(site=>({...site,kind:'tower'}))];
  reliefLayer=createTerrainSceneLayer({
   manifest:reliefManifest,grid:reliefGrid,
   maskUrl:new URL('./data/relief/boundary-mask.png',import.meta.url).href,
   cloudUrl:new URL('./assets/atmosphere/cloud-shadow.webp',import.meta.url).href,
   landmarks,waterways:regionalWaterways,
   onFrame:(matrix,width,height,raised,frameInfo)=>{markers.updateProjection(matrix,width,height,raised,frameInfo);refineOverview(matrix,width,height);},
   onStatus:(status,error)=>{
    if(status==='ready'){
     if(map.getLayer('fallback-relief'))map.setLayoutProperty('fallback-relief','visibility','none');
     if(map.getLayer('fallback-hillshade'))map.setLayoutProperty('fallback-hillshade','visibility','none');
     map.setTerrain(null);
     finishSetup();
    }else if(status==='degraded')activateFallback(error?.message??'Маска рельефа не загрузилась · включён облегчённый вид');
   },
  });
  map.addLayer(reliefLayer);
  syncWorldView();
  map.triggerRepaint();
 }

 async function loadMap(){
  addWorldContext(map);
  addCosmosBackground(map).catch(error=>console.warn('Cosmos background setup was skipped',error));
  addCosmosOverlay(map).then(cleanup=>{if(mapDestroyed)cleanup();else cosmosOverlayCleanup=cleanup;});
  syncWorldView();
  try{const response=await fetch('./data/world/rivers-caucasus.geojson');if(response.ok){regionalWaterways=await response.json();addRegionalHydrology(map,regionalWaterways);}}catch(error){console.warn('Local Caucasus river file is not installed yet',error);}
  try{
   const response=await fetch('./data/chechnya.geojson');
   if(response.ok){boundary=await response.json();bounds=readBounds(boundary);addRegionalContext();}
   else report('degraded','Граница региона недоступна');
  }catch{report('degraded','Граница региона недоступна');}
  try{await loadRelief();}
  catch(error){console.error('Atlas relief setup failed',error);activateFallback();finishSetup('degraded','Облегчённый рельеф · локальные данные');}
 }

 map.once('load',()=>{loadMap().catch(error=>{console.error('Atlas map setup failed',error);activateFallback();finishSetup('degraded','Облегчённый рельеф · каталог работает');});});
 map.on('error',event=>{
  const message=event.error?.message??'';if(mapErrors.length>=32)mapErrors.shift();mapErrors.push(message||'Неизвестная ошибка MapLibre');
  if(/WebGL|context lost/i.test(message))report('unavailable','Карта недоступна · каталог работает');
  else if(mapStatus==='loading'||mapStatus==='ready')report('degraded','Рельеф доступен частично');
 });
 map.on('rotate',()=>{const needle=document.querySelector('.north-needle');if(needle)needle.style.transform=`rotate(${-map.getBearing()}deg)`;});
 // MapLibre already interrupts camera easing when a gesture starts. stop()
 // here would reset the very input handler that just received that gesture.
 for(const eventName of ['dragstart','rotatestart','zoomstart','pitchstart','boxzoomstart'])map.on(eventName,event=>{if(event.originalEvent){homeFitRemaining=0;homeFitVersion++;onCameraInput(event);}});
 map.on('moveend',()=>onCameraSettled(camera.capture()));
 map.on('render',()=>{if(fallbackMode)projectFallbackMarkers();});
 const observer=new ResizeObserver(()=>{map.resize();onResize();});observer.observe(document.getElementById('map'));

 function installMarkerDiagnostic(){
  if(!new URLSearchParams(location.search).has('debugAnchors'))return null;
  const panel=document.createElement('output');panel.className='atlas-anchor-debug';panel.setAttribute('aria-label','Отклонение географических меток от координат');document.body.append(panel);
  let frame=0,lastRenderTime=null,lastFrameStats=null;
  const movingFrameGaps=[];
  const beginFrameSample=()=>{movingFrameGaps.length=0;lastRenderTime=null;};
  const sampleFrame=()=>{
   if(!map.isMoving()){lastRenderTime=null;return;}
   const now=performance.now();
   if(lastRenderTime!==null){movingFrameGaps.push(now-lastRenderTime);if(movingFrameGaps.length>180)movingFrameGaps.shift();}
   lastRenderTime=now;
  };
  const currentFrameStats=()=>{
   if(!movingFrameGaps.length)return null;
   const sorted=[...movingFrameGaps].sort((a,b)=>a-b),mean=movingFrameGaps.reduce((sum,gap)=>sum+gap,0)/movingFrameGaps.length;
   return {samples:movingFrameGaps.length,fps:Math.round(1000/mean),p95ms:Math.round(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))])};
  };
  const frameStats=()=>currentFrameStats()??lastFrameStats;
  const finishFrameSample=()=>{if(movingFrameGaps.length>=3)lastFrameStats=currentFrameStats();lastRenderTime=null;};
  const measure=id=>{
   const entry=markers.getEntries().find(item=>item.item.id===id);
   if(!entry||!entry.screen)return null;
   if(entry.anchor.hidden)return {id,visible:false,residualX:null,residualY:null};
   const pin=entry.visual.getBoundingClientRect(),expected=entry.screen;
   if(!pin.width||!pin.height)return {id,visible:false,residualX:null,residualY:null};
   return {id,visible:true,residualX:pin.left+pin.width/2-expected.x,residualY:pin.top+pin.height/2-expected.y,position:getComputedStyle(entry.anchor).position,transform:getComputedStyle(entry.anchor).transform};
  };
  const refresh=()=>{
   if(frame)return;frame=requestAnimationFrame(()=>{
    frame=0;
    const rows=markers.getEntries().map(entry=>{
     const result=measure(entry.item.id);
     return result?.visible?`${result.id}: Δ${result.residualX.toFixed(2)}, ${result.residualY.toFixed(2)} px`:'';
    }).filter(Boolean);
    panel.textContent=`ЯКОРЯ · zoom ${map.getZoom().toFixed(2)} · pitch ${map.getPitch().toFixed(0)}° · bearing ${map.getBearing().toFixed(0)}°\n${rows.join('  |  ')}${mapErrors.length?`\nMapLibre: ${mapErrors.slice(-2).join(' · ')}`:''}${lastFitDiagnostic?`\nКАДР ${JSON.stringify(lastFitDiagnostic)}`:''}${frameStats()?`\nКАДРЫ ${JSON.stringify(frameStats())}`:''}`;
   });
  };
  map.on('movestart',beginFrameSample);map.on('moveend',finishFrameSample);map.on('move',refresh);map.on('idle',refresh);map.on('resize',refresh);map.on('render',sampleFrame);map.on('render',refresh);
  return {
   ids:markers.getEntries().map(entry=>entry.item.id),getErrors:()=>[...mapErrors],getFrameStats:frameStats,refresh,measure,
   camera({bearing=map.getBearing(),pitch=map.getPitch(),zoom=map.getZoom()}={}){map.jumpTo({center:map.getCenter(),bearing,pitch:Math.min(pitch,layout().pitchLimit),zoom});},
   remove(){if(frame)cancelAnimationFrame(frame);map.off('movestart',beginFrameSample);map.off('moveend',finishFrameSample);map.off('move',refresh);map.off('idle',refresh);map.off('resize',refresh);map.off('render',sampleFrame);map.off('render',refresh);panel.remove();},
  };
 }

 const api={
  ready:readyPromise,captureCamera:()=>camera.capture(),restoreCamera:(snapshot,padding)=>camera.restore(snapshot,{padding:padding??currentPadding}),setPadding,
  setPitchLimit(limit){map.setMaxPitch?.(limit);camera.setPitchLimit(limit);},getPitch:()=>camera.getPitch(),isReady:()=>ready,resize:()=>map.resize(),
  home(padding=currentPadding){if(padding)setPadding(padding);const action=()=>fitOverview({animate:true});if(ready)action();else pendingCameraAction=action;},
  zoom(amount){if(!ready)return;zoomBy(amount,{duration:300,reducedMotion:reduce.matches});},
  setLayer(next){activeLayer=['all','groups','sites'].includes(next)?next:'all';updateMarkers();diagnostic?.refresh();},
  setSelection:selection=>markers.setSelection(selection),
  setGroupPreview:(id,origin)=>markers.setPreview(id?{type:'group',id,origin}:null),
  setLabelOcclusion:rects=>markers.setOcclusionRects(rects),
  setGroup(id,{focus=true,padding=currentPadding}={}){const group=groups.find(item=>item.id===id);markers.setSelection(group?{type:'group',id}:null);if(group?.center&&focus)focusCoordinate(group.center,9.15,padding);},
  focusCity(id,{focus=true,padding=currentPadding}={}){const city=settlements.find(item=>item.id===id);if(city&&focus)focusCoordinate(city.coordinates,9.5,padding);},
  focusRiver(id,{focus=true,padding=currentPadding}={}){const river=rivers.find(item=>item.id===id);if(river&&focus)focusCoordinate(river.center,9.3,padding);},
  getWorldView:()=>getWorldView(map.getZoom()),
  goWorld(){
   if(!ready){pendingCameraAction=()=>api.goWorld();return;}
   homeFitRemaining=0;homeFitVersion++;
   const width=innerWidth-currentPadding.left-currentPadding.right,height=innerHeight-currentPadding.top-currentPadding.bottom;
   const zoom=Math.round(clamp(Math.log2(Math.min(width*.82,height*.8)/190),.6,1.8)*100)/100;
   document.body.dataset.worldTargetZoom=zoom.toFixed(3);
   camera.overview({center:[45.8,43.05],zoom,pitch:0,bearing:0,padding:currentPadding});
  },
  focusSite(id,{focus=true,padding=currentPadding}={}){const site=sites.find(item=>item.id===id);if(!site)return;markers.setSelection({type:'site',id});if(focus)focusCoordinate(site.center,10.2,padding);},
  toggleTerrain(){if(!ready)return terrainEnabled;return camera.toggleTerrain();},
  rotateBy:degrees=>camera.rotateBy(degrees),resetNorth:()=>camera.resetNorth(),setPitch:value=>camera.setPitch(value),
  setAtmosphere:enabled=>reliefLayer?.setClouds(Boolean(enabled)),setPageVisible:visible=>reliefLayer?.setPageVisible(Boolean(visible)),
  installMarkerDiagnostic,
  getDebugErrors:()=>[...mapErrors],
  destroy(){mapDestroyed=true;cosmosOverlayCleanup();observer.disconnect();if(reliefLayer&&map.getLayer(reliefLayer.id))map.removeLayer(reliefLayer.id);markers.destroy();diagnostic?.remove();map.remove();},
 };

 map.on('zoom',syncWorldView);

 diagnostic=installMarkerDiagnostic();if(diagnostic)window.__drewoAtlasDiagnostic=diagnostic;
 return api;
}
