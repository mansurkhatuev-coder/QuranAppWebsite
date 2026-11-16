const DEFAULT_PITCH=44;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const centerArray=center=>typeof center?.toArray==='function'?center.toArray():[...center];

// Aim the optical axis through an elevated custom-layer point. This keeps that
// point centred as zoom changes, without relying on native terrain elevation.
export function focusCenterAtAltitude([longitude,latitude],elevation,bearing,pitch){
 if(!elevation||!pitch)return [longitude,latitude];
 const latitudeRadians=latitude*Math.PI/180;
 const x=(longitude+180)/360,y=(1-Math.asinh(Math.tan(latitudeRadians))/Math.PI)/2;
 const delta=elevation/(2*Math.PI*6378137*Math.cos(latitudeRadians))*Math.tan(pitch*Math.PI/180);
 const heading=bearing*Math.PI/180;
 const targetX=x+Math.sin(heading)*delta,targetY=y-Math.cos(heading)*delta;
 return [targetX*360-180,Math.atan(Math.sinh(Math.PI*(1-2*targetY)))*180/Math.PI];
}

export function createCameraController(map,{
 reducedMotion,
 onTerrainMode=()=>{},
 initialTerrainEnabled=map.getPitch()>0,
 initialRememberedPitch=initialTerrainEnabled?(map.getPitch()||DEFAULT_PITCH):DEFAULT_PITCH,
 maxPitch=60,
}={}){
 let terrainEnabled=Boolean(initialTerrainEnabled);
 let rememberedElevation=map.getCenterElevation?.()??0;
 let rememberedPitch=clamp(initialRememberedPitch,0,maxPitch);
 const duration=(preferred=420)=>reducedMotion?.matches?0:preferred;
 const stop=()=>map.stop();
 const currentView=()=>({
  center:centerArray(map.getCenter()),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch(),elevation:map.getCenterElevation?.()??0,
 });

 return {
  capture(){
   return {...currentView(),terrainEnabled,rememberedPitch,rememberedElevation};
  },
  restore(snapshot,{padding}={}){
   stop();
   if(terrainEnabled!==snapshot.terrainEnabled){
    terrainEnabled=Boolean(snapshot.terrainEnabled);
    onTerrainMode(terrainEnabled);
   }
   rememberedElevation=snapshot.rememberedElevation??snapshot.elevation??0;
   rememberedPitch=clamp(snapshot.rememberedPitch??snapshot.pitch??DEFAULT_PITCH,0,maxPitch);
   map.easeTo({
    center:snapshot.center,zoom:snapshot.zoom,bearing:snapshot.bearing,
    pitch:terrainEnabled?clamp(snapshot.pitch,0,maxPitch):0,elevation:terrainEnabled?(snapshot.elevation??0):0,
    ...(padding?{padding}:{}),duration:duration(650),
   });
  },
  rotateBy(degrees){stop();map.rotateTo(map.getBearing()+degrees,{duration:duration()});},
  resetNorth(){stop();map.rotateTo(0,{duration:duration()});},
  getBearing(){return map.getBearing();},
  getPitch(){return map.getPitch();},
  stop,
  setPadding(padding){map.setPadding?.(padding);},
  setPitchLimit(limit){
   maxPitch=clamp(limit,0,60);
   rememberedPitch=clamp(rememberedPitch,0,maxPitch);
   if(terrainEnabled&&map.getPitch()>maxPitch)map.easeTo({pitch:maxPitch,duration:duration(320)});
   return maxPitch;
  },
  focus(options){
   stop();
   rememberedElevation=options.elevation??map.getCenterElevation?.()??0;
   map.easeTo({...options,elevation:terrainEnabled?rememberedElevation:0,bearing:map.getBearing(),pitch:terrainEnabled?map.getPitch():0,duration:duration(900)});
  },
  overview(options){
   stop();
   const pitch=terrainEnabled?clamp(options.pitch??DEFAULT_PITCH,0,maxPitch):0;
   if(terrainEnabled)rememberedPitch=pitch;rememberedElevation=0;
    const {immediate,journey,...view}=options;
    map.easeTo({...view,elevation:0,bearing:options.bearing??-17,pitch,duration:immediate?0:duration(journey?1600:900)});
  },
  setPitch(pitch){
   stop();
   const next=clamp(pitch,0,maxPitch);
   if(terrainEnabled)rememberedPitch=next;
   map.easeTo({pitch:terrainEnabled?next:0,duration:duration(320)});
   return terrainEnabled?next:0;
  },
  toggleTerrain(){
   stop();
   if(terrainEnabled){rememberedPitch=clamp(map.getPitch(),0,maxPitch);rememberedElevation=map.getCenterElevation?.()??0;}
   terrainEnabled=!terrainEnabled;
   onTerrainMode(terrainEnabled);
   map.easeTo({pitch:terrainEnabled?rememberedPitch:0,elevation:terrainEnabled?rememberedElevation:0,duration:duration(420)});
   return terrainEnabled;
  },
  isTerrainEnabled(){return terrainEnabled;},
 };
}
