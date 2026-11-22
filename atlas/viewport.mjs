export function computeLayoutMode({width,height}){
 const landscapeToolPanel=width>=600&&height<600&&width>height;
 const panel=width>=900||landscapeToolPanel?'side':'bottom';
 return {panel,pitchLimit:width<900||height<600?55:60};
}

export function computeOverviewCamera({width,height,terrainEnabled=true}){
 const mode=computeLayoutMode({width,height});
 const mobile=mode.panel==='bottom',shortLandscape=!mobile&&height<600;
 const pitch=terrainEnabled?Math.min(mobile?35:shortLandscape?32:46,mode.pitchLimit):0;
 return {pitch,fitPitch:0,centerOnBounds:true,zoomOffset:0,minZoom:4.7};
}

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const uniqueSorted=values=>[...new Set(values)].sort((a,b)=>a-b);
const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;

export function computeSidePadding({width,height,safeInsets={},leftDock,rightDock=null,topDock=null,bottomDock=null,gap=16,minFreeWidth=240,minFreeHeight=180}){
 const safeLeft=clamp(safeInsets.left??0,0,width);
 const safeRight=clamp(width-(safeInsets.right??0),safeLeft,width);
 const safeTop=clamp(safeInsets.top??0,0,height);
 const safeBottom=clamp(height-(safeInsets.bottom??0),safeTop,height);
 const left=Math.round(clamp(leftDock?leftDock.right+gap:safeLeft+gap,safeLeft,safeRight));
 const right=Math.round(clamp(rightDock?width-rightDock.left+gap:width-safeRight+gap,0,width-left));
 const top=Math.round(clamp(topDock?topDock.bottom+gap:safeTop+gap,safeTop,safeBottom));
 const bottom=Math.round(clamp(bottomDock?height-bottomDock.top+gap:height-safeBottom+gap,0,height-top));
 const freeRect={left,top,right:width-right,bottom:height-bottom,width:width-left-right,height:height-top-bottom};
 const mapVisibleHeightPercent=height?Math.round(freeRect.height/height*100):0;
 const compactRequired=freeRect.width<minFreeWidth||freeRect.height<minFreeHeight;
 return {padding:{left,right,top,bottom},freeRect,mapVisibleHeightPercent,compactRequired};
}

export function computeViewport({width,height,safeInsets={},occupiedRects=[],mode='side',minFreeWidth=240,minFreeHeight=180}){
 const safe={
  left:clamp(safeInsets.left??0,0,width),
  top:clamp(safeInsets.top??0,0,height),
  right:clamp(width-(safeInsets.right??0),0,width),
  bottom:clamp(height-(safeInsets.bottom??0),0,height),
 };
 safe.right=Math.max(safe.left,safe.right);
 safe.bottom=Math.max(safe.top,safe.bottom);
 const obstacles=occupiedRects.map(rect=>({
  left:clamp(rect.left,safe.left,safe.right),
  top:clamp(rect.top,safe.top,safe.bottom),
  right:clamp(rect.right,safe.left,safe.right),
  bottom:clamp(rect.bottom,safe.top,safe.bottom),
 })).filter(rect=>rect.right>rect.left&&rect.bottom>rect.top);

 const xs=uniqueSorted([safe.left,safe.right,...obstacles.flatMap(rect=>[rect.left,rect.right])]);
 const ys=uniqueSorted([safe.top,safe.bottom,...obstacles.flatMap(rect=>[rect.top,rect.bottom])]);
 let best={left:safe.left,top:safe.top,right:safe.right,bottom:safe.bottom};
 let bestArea=0;
 for(let leftIndex=0;leftIndex<xs.length-1;leftIndex++){
  for(let rightIndex=leftIndex+1;rightIndex<xs.length;rightIndex++){
   const left=xs[leftIndex],right=xs[rightIndex];
   for(let topIndex=0;topIndex<ys.length-1;topIndex++){
    for(let bottomIndex=topIndex+1;bottomIndex<ys.length;bottomIndex++){
     const top=ys[topIndex],bottom=ys[bottomIndex];
     const candidate={left,top,right,bottom};
     if(obstacles.some(obstacle=>intersects(candidate,obstacle)))continue;
     const area=(right-left)*(bottom-top);
     if(area>bestArea){best=candidate;bestArea=area;}
    }
   }
  }
 }

 const blockers=obstacles.filter(rect=>(rect.right-rect.left)/(safe.right-safe.left||1)>=.72).map(rect=>[rect.top,rect.bottom]).sort((a,b)=>a[0]-b[0]);
 let maxClearHeight=0;
 let cursor=safe.top;
 for(const [top,bottom] of blockers){
  if(top>cursor)maxClearHeight=Math.max(maxClearHeight,top-cursor);
  cursor=Math.max(cursor,bottom);
 }
 maxClearHeight=Math.max(maxClearHeight,safe.bottom-cursor);

 const freeRect={left:best.left,top:best.top,right:best.right,bottom:best.bottom,width:best.right-best.left,height:best.bottom-best.top};
 const clearHeight=Math.max(0,maxClearHeight);
 const mapVisibleHeightPercent=height?Math.round(clearHeight/height*100):0;
 const compactRequired=freeRect.width<minFreeWidth||freeRect.height<minFreeHeight||(mode==='bottom'&&height>0&&clearHeight<height*.55);
 const panelGap=16;
 const padding={
  left:Math.round(freeRect.left+(freeRect.left>safe.left?panelGap:0)),
  right:Math.round(Math.max(0,width-freeRect.right)+(freeRect.right<safe.right?panelGap:0)),
  top:Math.round(freeRect.top+(freeRect.top>safe.top?panelGap:0)),
  bottom:Math.round(Math.max(0,height-freeRect.bottom)+(freeRect.bottom<safe.bottom?panelGap:0)),
 };
 return {padding,freeRect,compactRequired,mapVisibleHeightPercent};
}

export function measureViewport({mapElement,occupiedElements=[],visualViewport=window.visualViewport,windowRef=window,documentRef=document}){
 const mapRect=mapElement.getBoundingClientRect();
 const stylesFor=element=>windowRef.getComputedStyle(element);
 const visible=element=>element&&!element.hidden&&element.getAttribute('aria-hidden')!=='true'&&stylesFor(element).display!=='none'&&stylesFor(element).visibility!=='hidden';
 const occupiedRects=occupiedElements.filter(visible).map(element=>{
  const rect=element.getBoundingClientRect();
  return {left:rect.left-mapRect.left,top:rect.top-mapRect.top,right:rect.right-mapRect.left,bottom:rect.bottom-mapRect.top};
 });
 const visualWidth=visualViewport?.width??windowRef.innerWidth;
 const visualHeight=visualViewport?.height??windowRef.innerHeight;
 const mode=computeLayoutMode({width:visualWidth,height:visualHeight});
 const styles=stylesFor(documentRef.documentElement);
 const safeInsets={
  top:parseFloat(styles.getPropertyValue('--safe-inset-top'))||0,
  right:parseFloat(styles.getPropertyValue('--safe-inset-right'))||0,
  bottom:parseFloat(styles.getPropertyValue('--safe-inset-bottom'))||0,
  left:parseFloat(styles.getPropertyValue('--safe-inset-left'))||0,
 };
 let result=computeViewport({width:mapRect.width,height:mapRect.height,safeInsets,occupiedRects,mode:mode.panel});
 if(mode.panel==='side'){
  const relativeRect=element=>{
   if(!visible(element))return null;
   const rect=element.getBoundingClientRect();
   if(rect.width<=0||rect.height<=0)return null;
   return {left:rect.left-mapRect.left,top:rect.top-mapRect.top,right:rect.right-mapRect.left,bottom:rect.bottom-mapRect.top};
  };
  const leftPanel=relativeRect(occupiedElements.find(element=>element?.id==='explorer'));
  const intro=relativeRect(occupiedElements.find(element=>element?.id==='intro'));
  const overviewDock=relativeRect(occupiedElements.find(element=>element?.id==='overview-group-dock'));
  const leftContent=leftPanel??overviewDock??intro;
  if(leftContent){
   const leftDock={...leftContent,right:Math.max(leftContent.right,intro?.right??0)};
   const rightDockIds=overviewDock?['camera-rail','view-menu']:['featured-place','view-menu'];
   const rightDocks=rightDockIds.map(id=>relativeRect(occupiedElements.find(element=>element?.id===id))).filter(rect=>rect&&rect.left>leftDock.right).sort((a,b)=>a.left-b.left);
   const topDock=relativeRect(occupiedElements.find(element=>element?.id==='topbar'));
   const bottomDock=overviewDock?{top:mapRect.height-Math.max(safeInsets.bottom,28)}:null;
   const sideResult=computeSidePadding({width:mapRect.width,height:mapRect.height,safeInsets,leftDock,rightDock:rightDocks[0]??null,topDock,bottomDock});
   if(!sideResult.compactRequired)result=sideResult;
  }else{
   const topDock=relativeRect(occupiedElements.find(element=>element?.id==='topbar'));
   const rightDocks=['featured-place','view-menu'].map(id=>relativeRect(occupiedElements.find(element=>element?.id===id))).filter(rect=>rect).sort((a,b)=>a.left-b.left);
   const bottomDock=visualHeight<500?{top:mapRect.height-34}:null;
   const sideResult=computeSidePadding({width:mapRect.width,height:mapRect.height,safeInsets,topDock,rightDock:rightDocks[0]??null,bottomDock});
   if(!sideResult.compactRequired)result=sideResult;
  }
 }
 return {...result,mode};
}
