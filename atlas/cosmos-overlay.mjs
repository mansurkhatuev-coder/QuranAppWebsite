const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function cosmosOpacity(zoom){
 const value=Number.isFinite(Number(zoom))?Number(zoom):7;
 return value>=3?0:.82*clamp((3-value)/1.5,0,1);
}

export function createStarfield(seed,count=220){
 let state=Number(seed)>>>0;
 const random=()=>{
  state=(Math.imul(state,1664525)+1013904223)>>>0;
  return state/4294967296;
 };
 const total=Math.max(0,Math.min(1200,Math.floor(Number(count)||0)));
 return Array.from({length:total},()=>{
  const x=random(),y=random(),size=.35+random()*1.15,alpha=.18+random()*.58,value=random();
  return {x,y,size,alpha,depth:value>.94?2:value>.68?1:0};
 });
}

export function getGlobeDisc(map,width,height){
 const canvasWidth=Number(width),canvasHeight=Number(height);
 if(!Number.isFinite(canvasWidth)||!Number.isFinite(canvasHeight)||!(canvasWidth>0)||!(canvasHeight>0))return null;
 try{
  const zoom=Number(map.getZoom());
  const center=map.getCenter();
  const longitude=Number(center?.lng??center?.[0]),latitude=Number(center?.lat??center?.[1]);
  const pitch=typeof map.getPitch==='function'?Number(map.getPitch()):0;
  const bearing=typeof map.getBearing==='function'?Number(map.getBearing()):0;
  if(!Number.isFinite(zoom)||!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(pitch)||pitch<0||pitch>90||!Number.isFinite(bearing))return null;
  const projected=map.project([longitude,latitude]);
  if(!Number.isFinite(projected?.x)||!Number.isFinite(projected?.y))return null;
  const radians=value=>value*Math.PI/180;
  const radius=512*2**zoom/(2*Math.PI);
  if(!Number.isFinite(radius)||radius<=0)return null;
  const tilt=radius*Math.sin(radians(pitch));
  return {
   x:projected.x+Math.sin(radians(bearing))*tilt,
   y:projected.y+Math.cos(radians(bearing))*tilt,
   radius,
  };
 }catch{return null;}
}

export async function addCosmosOverlay(map){
 let canvas=null,frame=0,disposed=false;
 try{
  const container=map.getContainer();
  canvas=document.createElement('canvas');canvas.className='atlas-cosmos-overlay';canvas.setAttribute('aria-hidden','true');
  container.append(canvas);
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Canvas 2D context is unavailable');
  let width=0,height=0,scale=1;
  const stars=createStarfield(41,420);
  const documentRef=globalThis.document;
  const windowRef=globalThis.window;
  const motionPreference=windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion=Boolean(motionPreference?.matches);
  const onMotionPreference=event=>{reducedMotion=Boolean(event.matches);scheduleDraw();};
  const onVisibilityChange=()=>{if(!documentRef?.hidden)scheduleDraw();};
  const resize=()=>{
   const box=container.getBoundingClientRect();
   const nextWidth=Math.max(1,Math.round(box.width)),nextHeight=Math.max(1,Math.round(box.height));
   const nextScale=Math.min(2,Math.max(1,windowRef?.devicePixelRatio||1));
   if(nextWidth===width&&nextHeight===height&&nextScale===scale)return;
   width=nextWidth;height=nextHeight;scale=nextScale;
   canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
   canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
   context.setTransform(scale,0,0,scale,0,0);
  };
  const drawStars=()=>{
   const bearing=Number(map.getBearing?.())||0;
   context.save();context.globalCompositeOperation='screen';
   for(const star of stars){
    const drift=reducedMotion?0:(bearing/360)*.004*(star.depth+1);
    const normalizedX=((star.x+drift)%1+1)%1;
    const depthScale=star.depth===2?1.2:star.depth===1?.9:.7;
    context.globalAlpha=star.alpha*(star.depth===2?.78:star.depth===1?.58:.42);
    context.fillStyle=star.depth===2?'#e8e9da':'#bad6d0';
    if(star.depth===2&&star.size>.9){
     const x=normalizedX*width,y=star.y*height,radius=star.size*4;
     const glow=context.createRadialGradient(x,y,0,x,y,radius);
     glow.addColorStop(0,'rgba(231,224,190,.3)');glow.addColorStop(1,'rgba(150,196,190,0)');
     context.fillStyle=glow;context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.fill();
     context.fillStyle='#f3e8cd';
    }
    context.beginPath();context.arc(normalizedX*width,star.y*height,star.size*depthScale,0,Math.PI*2);context.fill();
   }
   context.restore();
  };
  const draw=()=>{
   frame=0;
   if(disposed||!canvas||documentRef?.hidden)return;
   resize();context.clearRect(0,0,width,height);
   const opacity=cosmosOpacity(map.getZoom());
   const disc=getGlobeDisc(map,width,height);
   if(opacity<=0||!disc){canvas.style.opacity='0';return;}
   context.globalCompositeOperation='source-over';context.globalAlpha=1;
   drawStars();
   // Erase star pixels around the globe without drawing a disc or halo.
   context.globalCompositeOperation='destination-out';context.fillStyle='#000';
   context.beginPath();context.arc(disc.x,disc.y,disc.radius*1.4+20,0,Math.PI*2);context.fill();
   context.globalCompositeOperation='source-over';context.globalAlpha=1;
   canvas.style.opacity=String(opacity);
  };
  const scheduleDraw=()=>{if(frame||disposed)return;frame=requestAnimationFrame(draw);};
  map.on('render',scheduleDraw);map.on('resize',scheduleDraw);
  documentRef?.addEventListener?.('visibilitychange',onVisibilityChange);
  motionPreference?.addEventListener?.('change',onMotionPreference);
  resize();draw();
  return ()=>{
   if(disposed)return;disposed=true;
   if(frame)cancelAnimationFrame(frame);
   map.off('render',scheduleDraw);map.off('resize',scheduleDraw);
   documentRef?.removeEventListener?.('visibilitychange',onVisibilityChange);
   motionPreference?.removeEventListener?.('change',onMotionPreference);
   canvas?.remove();canvas=null;
  };
 }catch(error){
  disposed=true;canvas?.remove();
  console.warn('Local cosmos overlay is unavailable; keeping the map sky',error);
  return ()=>{};
 }
}
