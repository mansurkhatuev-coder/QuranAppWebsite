const ORIGINAL_CORNERS=[[44.12,44.56],[46.94,44.56],[46.94,42.38],[44.12,42.38]];
const HOUR=60_000;

// The map becomes the focus as a visitor approaches a place.
export function cloudOpacityForZoom(zoom){
 return .23*Math.max(0,Math.min(1,(10.8-zoom)/2.3));
}

export function createAtmosphere(map,{sourceId='atlas-cloud-shadows',documentRef=document,windowRef=window}={}){
 const layerId=`${sourceId}-layer`;
 const reducedMotion=windowRef.matchMedia('(prefers-reduced-motion: reduce)');
 const onVisibilityChange=()=>setVisible(!documentRef.hidden);
 let enabled=false;
 let pageVisible=!documentRef.hidden;
 let timer=null;
 let disposed=false;
 let startedAt=0;
 let source=null;

 try{
  map.addSource(sourceId,{type:'image',url:new URL('./assets/atmosphere/cloud-shadow.webp',import.meta.url).href,coordinates:ORIGINAL_CORNERS});
  map.addLayer({id:layerId,type:'raster',source:sourceId,layout:{visibility:'visible'},paint:{'raster-opacity':.09,'raster-fade-duration':0,'raster-resampling':'linear'}});
  source=map.getSource(sourceId);
 }catch(error){
  console.warn('Cloud shadow layer is unavailable',error);
 }

 function updateCoordinates(now=Date.now()){
  if(!source||!enabled||!pageVisible||reducedMotion.matches||disposed)return;
  const elapsed=Math.max(0,now-startedAt);
  const longitudeShift=(elapsed/HOUR)*.08;
  const latitudeShift=(elapsed/HOUR)*-.035;
  source.setCoordinates(ORIGINAL_CORNERS.map(([longitude,latitude])=>[longitude+longitudeShift,latitude+latitudeShift]));
 }
 function stop(){if(timer!==null){windowRef.clearInterval(timer);timer=null;}}
 function start(){
  stop();
  if(!source||!enabled||!pageVisible||reducedMotion.matches||disposed)return;
  if(!startedAt)startedAt=Date.now();
  updateCoordinates();
  timer=windowRef.setInterval(()=>updateCoordinates(),250);
 }
 function setEnabled(value){
  enabled=Boolean(value);
  if(!source)return false;
  map.setLayoutProperty(layerId,'visibility',enabled?'visible':'none');
  if(enabled&&!startedAt)startedAt=Date.now();
  if(enabled)start();else stop();
  return enabled;
 }
 function setVisible(value){pageVisible=Boolean(value);if(pageVisible)start();else stop();}
 function onMotionPreference(){if(reducedMotion.matches)stop();else if(enabled)start();}
 reducedMotion.addEventListener('change',onMotionPreference);
 documentRef.addEventListener('visibilitychange',onVisibilityChange);

 return {
  setEnabled,
  setVisible,
  isEnabled:()=>enabled,
  destroy(){disposed=true;stop();reducedMotion.removeEventListener('change',onMotionPreference);documentRef.removeEventListener('visibilitychange',onVisibilityChange);if(map.getLayer(layerId))map.removeLayer(layerId);if(map.getSource(sourceId))map.removeSource(sourceId);},
 };
}
