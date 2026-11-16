export const WORLD_VIEW_THRESHOLDS=Object.freeze({
 world:4.6,
 transitionStart:4.6,
 transitionEnd:5.4,
 regionStart:6.4,
 placeStart:8.5,
});

export function getWorldView(zoom){
 const value=Number.isFinite(Number(zoom))?Number(zoom):7.3;
 const mode=value<=WORLD_VIEW_THRESHOLDS.world?'world':value<WORLD_VIEW_THRESHOLDS.transitionEnd?'transition':value<WORLD_VIEW_THRESHOLDS.regionStart?'caucasus':value<WORLD_VIEW_THRESHOLDS.placeStart?'region':'place';
 const projection=value<=WORLD_VIEW_THRESHOLDS.transitionStart?'globe':value>=WORLD_VIEW_THRESHOLDS.transitionEnd?'mercator':'transition';
 const rise=Math.max(0,Math.min(1,(value-WORLD_VIEW_THRESHOLDS.transitionEnd)/(WORLD_VIEW_THRESHOLDS.regionStart-WORLD_VIEW_THRESHOLDS.transitionEnd)));
 return Object.freeze({
  zoom:value,mode,projection,
  reliefFactor:rise*rise*(3-2*rise),
  reliefVisible:value>WORLD_VIEW_THRESHOLDS.transitionEnd,
  raised:value>=WORLD_VIEW_THRESHOLDS.regionStart,
  landmarksVisible:value>=WORLD_VIEW_THRESHOLDS.regionStart,
 });
}

export const ATLAS_PROJECTION_EXPRESSION=Object.freeze([
 'interpolate',['linear'],['zoom'],
 WORLD_VIEW_THRESHOLDS.transitionStart,'globe',
 WORLD_VIEW_THRESHOLDS.transitionEnd,'mercator',
]);
