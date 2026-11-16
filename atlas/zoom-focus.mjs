export const CHECHNYA_ZOOM_FOCUS=Object.freeze([45.8,43.05]);

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const radians=value=>value*Math.PI/180;

function asCoordinate(value){
 if(Array.isArray(value))return value;
 if(typeof value?.toArray==='function')return value.toArray();
 if(Number.isFinite(value?.lng)&&Number.isFinite(value?.lat))return [value.lng,value.lat];
 return null;
}

function distanceKm(a,b){
 const dLat=radians(b[1]-a[1]),dLng=radians(b[0]-a[0]);
 const h=Math.sin(dLat/2)**2+Math.cos(radians(a[1]))*Math.cos(radians(b[1]))*Math.sin(dLng/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

export function createAtlasZoom(map,{focus=CHECHNYA_ZOOM_FOCUS,minZoom=0,maxZoom=12.3,wheelZoomRate=.0045,trackpadZoomRate=.02,reducedMotion=false,focusRadiusKm=70}={}){
 map.scrollZoom.disable();
 map.scrollZoom.enable({around:'center'});
 map.scrollZoom.setWheelZoomRate(wheelZoomRate);
 map.scrollZoom.setZoomRate(trackpadZoomRate);

 let zoomStart=null,programmaticZoomPending=false;
 const motionIsReduced=()=>typeof reducedMotion==='function'?Boolean(reducedMotion()):Boolean(reducedMotion);
 const onZoomStart=event=>{
  if(!event?.originalEvent&&!programmaticZoomPending)return;
  zoomStart=map.getZoom();
 };
 const onZoomEnd=()=>{
  if(zoomStart===null)return;
  const delta=map.getZoom()-zoomStart;
  zoomStart=null;
  programmaticZoomPending=false;
  if(Math.abs(delta)<.015)return;
  const center=asCoordinate(map.getCenter?.());
  if(!center||distanceKm(center,focus)<=focusRadiusKm||typeof map.easeTo!=='function')return;
  map.easeTo({center:focus,duration:motionIsReduced()?0:700});
 };
 const onDirectPan=event=>{
  if(!event?.originalEvent)return;
  zoomStart=null;
  programmaticZoomPending=false;
 };
 map.on?.('zoomstart',onZoomStart);
 map.on?.('zoomend',onZoomEnd);
 map.on?.('dragstart',onDirectPan);

 return (amount,{duration=300,reducedMotion:reduceForAction}={})=>{
  const currentZoom=map.getZoom(),zoom=clamp(currentZoom+amount,minZoom,maxZoom);
  if(Math.abs(zoom-currentZoom)<.001)return;
  // Keep the current view as the immediate zoom anchor. After zooming, the
  // shared zoomend handler returns a panned-away view to Chechnya.
  programmaticZoomPending=true;
  map.zoomTo(zoom,{around:map.getCenter?.()??focus,duration:(reduceForAction??motionIsReduced())?0:duration});
  if(zoomStart===null)programmaticZoomPending=false;
 };
}
