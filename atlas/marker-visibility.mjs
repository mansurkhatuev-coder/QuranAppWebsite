// Separate enter/exit thresholds prevent a label blinking on a zoom boundary.
export function zoomVisible(zoom,threshold,previous=false,band=.14){
 return previous?zoom>=threshold-band:zoom>=threshold+band;
}

export function isTerrainOccluded(gapMeters,previous=false){
 return previous?gapMeters>8:gapMeters>30;
}

// Points and sample heights share the original Mercator coordinate system.
export function terrainGap(near,anchor,sample,steps=48){
 let gap=0;
 for(let at=1;at<steps;at++){
  const t=at/steps;
  const x=near.x+(anchor.x-near.x)*t,y=near.y+(anchor.y-near.y)*t,z=near.z+(anchor.z-near.z)*t;
  const height=sample(x,y);
  if(Number.isFinite(height))gap=Math.max(gap,height-z);
 }
 return gap;
}
