import {mercatorPosition,projectAnchor,sampleSurfaceElevation} from './relief.mjs';

import {Matrix4,Vector3} from './vendor/three.module.js';
import {zoomVisible,isTerrainOccluded,terrainGap} from './marker-visibility.mjs';
import {landmarkIcon} from './map-icons.mjs';

const MAP_LAYERS={all:new Set(['group','site','city','river']),groups:new Set(['group','city','river']),sites:new Set(['site','city','river'])};
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;

export function createAtlasMarkers(map,groups,sites,{onGroup=()=>{},onSite=()=>{},onCity=()=>{},onRiver=()=>{},waterways=[],orientation=[],documentRef=document}={}){
 const entries=[];
 const scaleVisible=entry=>{
  if(entry.type!=='river'||selection?.type==='river'&&selection.id===entry.item.id)return true;
  entry.zoomVisible=zoomVisible(map.getZoom(),entry.item.priority>=90?8:10,entry.zoomVisible);
  return entry.zoomVisible;
 };
 let activeLayer='all',selection=null,hovered=null,preview=null,frame=0,manifest=null,grid=null,occlusionRects=[];
 let familyPlaces=null;
 const inLayer=entry=>familyPlaces ? familyPlaces.has(entry.item.id) : MAP_LAYERS[activeLayer].has(entry.type);
 const labelSizes=new WeakMap();
 const overlay=documentRef.createElement('div');
 overlay.className='atlas-marker-layer';
 overlay.setAttribute('aria-label','Географические отметки атласа');
 (map.getContainer().parentElement??map.getContainer()).append(overlay);
 const previewSvg=documentRef.createElementNS('http://www.w3.org/2000/svg','svg');
 previewSvg.classList.add('atlas-preview-link');previewSvg.setAttribute('aria-hidden','true');previewSvg.setAttribute('hidden','');
 const previewPath=documentRef.createElementNS('http://www.w3.org/2000/svg','path');
 previewSvg.append(previewPath);overlay.append(previewSvg);
 const labelObserver=typeof ResizeObserver==='undefined'?null:new ResizeObserver(observations=>{
  for(const observation of observations){const {width,height}=observation.contentRect;labelSizes.set(observation.target,{width,height});}
  scheduleLabels();
 });

 function make(item,type){
  const anchor=documentRef.createElement('div');
  anchor.className=`atlas-marker-anchor ${type}-marker`;
  anchor.setAttribute('data-marker-id',item.id);

  const hit=documentRef.createElement('button');
  hit.type='button';hit.className='atlas-marker-hit';
  {
   hit.setAttribute('aria-label',`${type==='river'?'Открыть реку':type==='city'?(item.settlementType==='village'?'Открыть селение':'Открыть город'):type==='site'?'Открыть место':'Открыть тухум'}: ${item.name}`);
   hit.setAttribute('aria-pressed','false');
  }

  const visual=documentRef.createElement('span');
  visual.className='atlas-marker-visual';
  if(type==='site'){
   visual.classList.add('site-pin');visual.setAttribute('aria-hidden','true');
   visual.innerHTML=landmarkIcon(item.id);
  }else{visual.classList.add('group-pin');visual.setAttribute('aria-hidden','true');}

  const label=documentRef.createElement('span');
  label.className='atlas-marker-label';label.textContent=item.name;label.setAttribute('aria-hidden','true');
  labelObserver?.observe(label);hit.append(visual,label);anchor.append(hit);
  hit.addEventListener('click',()=>type==='river'?onRiver(item.id):type==='city'?onCity(item.id):type==='site'?onSite(item.id):onGroup(item.id));
  hit.addEventListener('pointerenter',()=>{hovered={type,id:item.id};scheduleLabels();});
  hit.addEventListener('pointerleave',()=>{if(hovered?.type===type&&hovered.id===item.id)hovered=null;scheduleLabels();});
  overlay.append(anchor);
  const entry={anchor,hit,visual,label,item,type,screen:null};entries.push(entry);return entry;
 }

 groups.filter(item=>Array.isArray(item.center)&&item.center.length===2).forEach(item=>make(item,'group'));
 sites.forEach(item=>make(item,'site'));
 orientation.forEach(item=>make(item,'city'));
 waterways.forEach(item=>make(item,'river'));

 function updateLabelVisibility(){
  frame=0;
  const candidates=entries.filter(entry=>{
   if(entry.anchor.hidden||!entry.screen?.visible)return false;
   const focused=entry.hit===documentRef.activeElement||entry.anchor.contains(documentRef.activeElement);
   const selected=selection?.type===entry.type&&selection.id===entry.item.id;
   const isHovered=!map.isMoving()&&((hovered?.type===entry.type&&hovered.id===entry.item.id)||(preview?.type===entry.type&&preview.id===entry.item.id));
   const repeatedPlaceName=entry.type==='group'&&!focused&&!selected&&!isHovered&&entries.some(other=>other.type==='city'&&other.item.name===entry.item.name&&other.screen?.visible&&Math.hypot(other.screen.x-entry.screen.x,other.screen.y-entry.screen.y)<140);
   if(repeatedPlaceName){entry.label.hidden=true;return false;}
   entry.labelZoomVisible=zoomVisible(map.getZoom(),entry.type==='site'?9.5:entry.item.priority>=90?8:10,entry.labelZoomVisible);
   const show=focused||selected||isHovered||entry.type==='group'||entry.type==='city'||(entry.type==='river'?entry.labelZoomVisible:activeLayer==='sites'||entry.labelZoomVisible);
   if(!show){entry.label.hidden=true;return false;}
   entry.label.hidden=false;return true;
  });
  candidates.sort((a,b)=>{
   const score=entry=>(selection?.type===entry.type&&selection.id===entry.item.id?50:0)
    +(entry.hit===documentRef.activeElement||entry.anchor.contains(documentRef.activeElement)?40:0)
    +(!map.isMoving()&&((hovered?.type===entry.type&&hovered.id===entry.item.id)||(preview?.type===entry.type&&preview.id===entry.item.id))?30:0)+(entry.labelVisible?4:0)
    +(activeLayer==='sites'&&entry.type==='site'?20:0)+(entry.type==='city'?25+(entry.item.labelPriority??0)/10:0)+(entry.type==='group'?10:0);
   return score(b)-score(a)||a.item.id.localeCompare(b.item.id);
  });
  const occupied=[],selectedEntry=candidates.find(entry=>selection?.type===entry.type&&selection.id===entry.item.id);
  const mapRect=map.getContainer().getBoundingClientRect();
  for(const entry of candidates){
   let size=labelSizes.get(entry.label);
   if(!size||!size.width||!size.height){const measured=entry.label.getBoundingClientRect();size={width:measured.width,height:measured.height};if(size.width&&size.height)labelSizes.set(entry.label,size);}
   if(!size?.width||!size?.height)continue;
   const labelRect=entry.label.getBoundingClientRect();
   const margin=entry.labelVisible?4:10;
   const rect={left:labelRect.left-margin,right:labelRect.right+margin,top:labelRect.top-margin,bottom:labelRect.bottom+margin};
   const outside=rect.left<mapRect.left+8||rect.right>mapRect.right-8||rect.top<mapRect.top+8||rect.bottom>mapRect.bottom-8;
   if(outside||occlusionRects.some(box=>overlaps(box,rect))){entry.label.hidden=true;entry.labelVisible=false;continue;}
   const keep=entry===selectedEntry||entry.anchor.contains(documentRef.activeElement);
   if(!keep&&occupied.some(box=>overlaps(box,rect))){entry.label.hidden=true;entry.labelVisible=false;continue;}
   occupied.push(rect);entry.labelVisible=true;
  }
 }

 function updatePreviewLink(){
  const entry=preview&&entries.find(item=>item.type===preview.type&&item.item.id===preview.id);
  const origin=preview?.origin;
  if(!entry?.screen?.visible||entry.anchor.hidden||!origin?.isConnected){previewSvg.setAttribute('hidden','');return;}
  const mapRect=overlay.getBoundingClientRect(),buttonRect=origin.getBoundingClientRect();
  const panelRect=origin.closest('.group-choice-panel')?.getBoundingClientRect()??buttonRect;
  const x1=panelRect.right-mapRect.left+8,y1=buttonRect.top-mapRect.top+buttonRect.height/2;
  const x2=entry.screen.x,y2=entry.screen.y;
  if(x2<=x1+20){previewSvg.setAttribute('hidden','');return;}
  const span=x2-x1;
  previewPath.setAttribute('d',`M ${x1} ${y1} C ${x1+span*.35} ${y1}, ${x2-span*.25} ${y2}, ${x2} ${y2}`);
  previewSvg.removeAttribute('hidden');
 }
 function scheduleLabels(){if(frame)return;frame=requestAnimationFrame(updateLabelVisibility);}
 function sync(){
  for(const entry of entries){
   const show=inLayer(entry);
   entry.anchor.hidden=!show||!entry.screen?.visible||!scaleVisible(entry);
   const selected=selection?.type===entry.type&&selection.id===entry.item.id;
   entry.anchor.classList.toggle('is-selected',Boolean(selected));
   entry.anchor.classList.toggle('is-preview',Boolean(preview?.type===entry.type&&preview.id===entry.item.id));
   entry.hit.setAttribute('aria-pressed',String(Boolean(selected)));
   if(!show&&entry.anchor.contains(documentRef.activeElement))documentRef.activeElement.blur?.();
  }
  updatePreviewLink();
  scheduleLabels();
 }
 function updateProjection(matrix,width,height,raised=true,{stride=1,occlusionEnabled=true}={}){
  if(!manifest||!grid||width<=0||height<=0)return;
  const inverse=new Matrix4().fromArray(matrix).invert();
  const [west,north,east,south]=manifest.extent,size=manifest.size;
  const terrainAt=(x,y)=>{
   const column=Math.floor((x-west)/(east-west)*(size-1)),row=Math.floor((y-north)/(south-north)*(size-1));
   if(column<0||row<0||column>=size-1||row>=size-1||grid.inside&&grid.inside[row*(size-1)+column]<128)return null;
   const latitude=Math.atan(Math.sinh(Math.PI*(1-2*y)));
   return sampleSurfaceElevation(manifest,grid,x,y,stride)*(manifest.heightExaggeration??1)/(2*Math.PI*6378137*Math.cos(latitude));
  };
  for(const entry of entries){
   const visibleInLayer=inLayer(entry)&&scaleVisible(entry);
   const base=mercatorPosition(entry.item.center);
   const altitude=raised?sampleSurfaceElevation(manifest,grid,base.x,base.y,stride)*(manifest.heightExaggeration??1)+6:0;
   const position=mercatorPosition(entry.item.center,altitude);
   const screen=projectAnchor(matrix,position,width,height);
   if(visibleInLayer&&raised&&occlusionEnabled&&screen.visible){
    const near=new Vector3(screen.x/width*2-1,1-screen.y/height*2,-1).applyMatrix4(inverse);
    const gap=terrainGap(near,position,terrainAt)/position.meterScale;
    entry.terrainOccluded=isTerrainOccluded(gap,entry.terrainOccluded);
   }else entry.terrainOccluded=false;
   screen.visible=screen.visible&&!entry.terrainOccluded;
   entry.screen={...screen,position,altitude};
   if(screen.visible){
    entry.anchor.style.transform=`translate3d(${screen.x.toFixed(2)}px,${screen.y.toFixed(2)}px,0)`;
    entry.anchor.classList.toggle('label-east',screen.x<112);
    entry.anchor.classList.toggle('label-west',screen.x>width-112);
   }
   entry.anchor.hidden=!visibleInLayer||!screen.visible;
  }
  updatePreviewLink();scheduleLabels();
 }
 function updateFallback(width=map.getContainer().clientWidth,height=map.getContainer().clientHeight){
  for(const entry of entries){
   const point=map.project(entry.item.center),visible=point.x>=0&&point.x<=width&&point.y>=0&&point.y<=height;
   entry.screen={visible,x:point.x,y:point.y,depth:0};
   if(visible){
    entry.anchor.style.transform=`translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0)`;
    entry.anchor.classList.toggle('label-east',point.x<112);
    entry.anchor.classList.toggle('label-west',point.x>width-112);
   }
   entry.anchor.hidden=!inLayer(entry)||!visible||!scaleVisible(entry);
  }
  updatePreviewLink();scheduleLabels();
 }

 map.on('move',scheduleLabels);map.on('moveend',scheduleLabels);map.on('idle',scheduleLabels);map.on('resize',scheduleLabels);
 documentRef.fonts?.ready?.then(scheduleLabels);

 return {
  setFamilyPlaces(ids){familyPlaces=ids?new Set(ids):null;sync();map.triggerRepaint?.();},
  setLayer(next){const layer=MAP_LAYERS[next]?next:'all';if(layer===activeLayer)return;activeLayer=layer;sync();map.triggerRepaint?.();},
  setSelection(next){selection=next?{type:next.type,id:next.id}:null;sync();},
  setPreview(next){preview=next?{type:next.type,id:next.id,origin:next.origin}:null;sync();},
  setRelief(nextManifest,nextGrid){manifest=nextManifest;grid=nextGrid;sync();},
  setOcclusionRects(rects){occlusionRects=rects.map(rect=>({...rect}));scheduleLabels();},
  updateProjection,updateFallback,
  getSelection(){return selection?{...selection}:null;},
  getEntries(){return entries;},
  refreshLabels:scheduleLabels,
  destroy(){
   map.off('move',scheduleLabels);map.off('moveend',scheduleLabels);map.off('idle',scheduleLabels);map.off('resize',scheduleLabels);
   if(frame)cancelAnimationFrame(frame);labelObserver?.disconnect();overlay.remove();entries.length=0;
  },
 };
}
