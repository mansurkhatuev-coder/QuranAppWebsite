import {ATLAS_PROJECTION_EXPRESSION} from './world-view.mjs';
import {makeGraticule,addWorldCaptions} from './world-decoration.mjs';
import {createWorldRasterSources} from './world-raster.mjs';

export function createAtlasStyle(terrainSource){
 return {
  version:8,
  projection:{type:ATLAS_PROJECTION_EXPRESSION},
  sky:{'sky-color':'#071a20','horizon-color':'#426d6a','fog-color':'#263b36','atmosphere-blend':['interpolate',['linear'],['zoom'],0,.55,3,.7,4.6,.4,5.4,0]},
  sources:{elevation:terrainSource,'terrain-dem':{...terrainSource}},
  layers:[
   {id:'base',type:'background',paint:{'background-color':'#183b3d'}},
   {id:'fallback-relief',type:'color-relief',source:'elevation',layout:{visibility:'none'},paint:{'color-relief-color':['interpolate',['linear'],['elevation'],0,'#607b59',250,'#718760',500,'#7c9068',850,'#899772',1200,'#9da17b',1650,'#b0ad88',2200,'#c5bd9e',2900,'#d8d1b4',3800,'#e8e2ce'],'color-relief-opacity':1}},
   {id:'fallback-hillshade',type:'hillshade',source:'elevation',layout:{visibility:'none'},paint:{'hillshade-exaggeration':.66,'hillshade-shadow-color':'#253d30','hillshade-highlight-color':'#f1e9cf','hillshade-accent-color':'#53674a','hillshade-illumination-direction':318}},
  ],
 };
}

export async function addCosmosBackground(map,{textureUrl=new URL('./assets/atmosphere/cosmos-tile.png',import.meta.url).href}={}){
 try{
  const response=await fetch(textureUrl);
  if(!response.ok)throw new Error(`Cosmos tile returned HTTP ${response.status}`);
  const bitmap=await createImageBitmap(await response.blob());
  if(!map.hasImage?.('atlas-cosmos'))map.addImage('atlas-cosmos',bitmap,{pixelRatio:1});
  bitmap.close?.();
  if(!map.getLayer('base'))return false;
  map.setPaintProperty('base','background-pattern','atlas-cosmos');
  map.setPaintProperty('base','background-opacity',['interpolate',['linear'],['zoom'],0,.96,3,.88,4.6,.5,5.4,0]);
  return true;
 }catch(error){
  console.warn('Local cosmos texture is unavailable; keeping the atlas background color',error);
  return false;
 }
}

export function addWorldContext(map,{baseUrl=new URL('./data/world/',import.meta.url).href}={}){
 const rasterSources=createWorldRasterSources(baseUrl);
 const sources={
  'atlas-land-detail':new URL('land-50m.geojson',baseUrl).href,
  'atlas-rivers-global':new URL('rivers-50m.geojson',baseUrl).href,
  'atlas-rivers-context':new URL('rivers-context.geojson',baseUrl).href,
 };
 try{
  map.addSource('atlas-world-physical',rasterSources.global);
  map.addSource('atlas-caucasus-detail',rasterSources.caucasus);
  map.addSource('atlas-caucasus-close',rasterSources.caucasusClose);
  map.addSource('atlas-caucasus-context-elevation',rasterSources.caucasusTerrain);
  map.addSource('atlas-land-detail',{type:'geojson',data:sources['atlas-land-detail'],maxzoom:5});
  map.addSource('atlas-rivers-global',{type:'geojson',data:sources['atlas-rivers-global'],maxzoom:5});
  map.addSource('atlas-rivers-context',{type:'geojson',data:sources['atlas-rivers-context'],maxzoom:6});
  map.addLayer({id:'atlas-world-physical',type:'raster',source:'atlas-world-physical',paint:{'raster-fade-duration':0,'raster-opacity':1,'raster-resampling':'linear','raster-contrast':.08,'raster-saturation':.04}});
  map.addLayer({id:'atlas-caucasus-detail',type:'raster',source:'atlas-caucasus-detail',paint:{'raster-fade-duration':320,'raster-opacity':1,'raster-resampling':'linear'}});
  map.addLayer({id:'atlas-caucasus-close',type:'raster',source:'atlas-caucasus-close',paint:{'raster-fade-duration':180,'raster-opacity':1,'raster-resampling':'linear'}});
  map.addLayer({id:'atlas-caucasus-context-hillshade',type:'hillshade',source:'atlas-caucasus-context-elevation',minzoom:6.85,maxzoom:14,paint:{'hillshade-exaggeration':['interpolate',['linear'],['zoom'],6.85,.12,7.5,.24,9,.32,12,.38],'hillshade-shadow-color':'#294034','hillshade-highlight-color':'#d0c496','hillshade-accent-color':'#72694d','hillshade-illumination-direction':318,'hillshade-illumination-anchor':'map'}});
  map.addLayer({id:'atlas-nearby-hillshade',type:'hillshade',source:'elevation',minzoom:8.4,maxzoom:14,paint:{'hillshade-exaggeration':['interpolate',['linear'],['zoom'],8.4,0,9,.18,10,.26,12,.3],'hillshade-shadow-color':'#344735','hillshade-highlight-color':'#dfd0a8','hillshade-accent-color':'#756e4f','hillshade-illumination-direction':318,'hillshade-illumination-anchor':'map'}});
  map.addLayer({id:'atlas-land-detail',type:'fill',source:'atlas-land-detail',paint:{'fill-color':'#536d57','fill-opacity':.055}});
  map.addLayer({id:'atlas-coast-engraving',type:'line',source:'atlas-land-detail',maxzoom:6.4,paint:{'line-color':'#c9c59c','line-opacity':.2,'line-width':['interpolate',['linear'],['zoom'],0,.35,4,.65,6,.9]}});
  map.addSource('atlas-graticule',{type:'geojson',data:makeGraticule()});
  map.addLayer({id:'atlas-graticule',type:'line',source:'atlas-graticule',maxzoom:6,paint:{'line-color':'#c5bb95','line-width':.6,'line-opacity':['interpolate',['linear'],['zoom'],0,.12,3,.15,5,.045,6,0]}});
  map.addLayer({id:'atlas-rivers-global',type:'line',source:'atlas-rivers-global',minzoom:1.5,paint:{'line-color':'#82a9a2','line-opacity':.72,'line-width':['interpolate',['linear'],['zoom'],1.5,.45,4,.85,5.5,1.35]}});
  map.addLayer({id:'atlas-rivers-context-halo',type:'line',source:'atlas-rivers-context',minzoom:3.6,maxzoom:5.8,paint:{'line-color':'#70aaa7','line-opacity':['interpolate',['linear'],['zoom'],3.6,.06,4.5,.15,5.35,.09,5.8,0],'line-width':['interpolate',['linear'],['zoom'],3.6,1.1,4.7,2.7,5.5,3.4]}});
  map.addLayer({id:'atlas-rivers-context',type:'line',source:'atlas-rivers-context',minzoom:3.6,maxzoom:5.8,paint:{'line-color':'#a2c9bf','line-opacity':['interpolate',['linear'],['zoom'],3.6,.16,4.5,.42,5.35,.2,5.8,0],'line-width':['interpolate',['linear'],['zoom'],3.6,.45,4.7,.9,5.5,1.25]}});
 }catch(error){
  console.warn('Natural Earth world base is unavailable; keeping the local atlas background',error);
  for(const id of ['atlas-rivers-context','atlas-rivers-context-halo','atlas-graticule','atlas-coast-engraving','atlas-rivers-global','atlas-land-detail','atlas-nearby-hillshade','atlas-caucasus-context-hillshade','atlas-caucasus-close','atlas-caucasus-detail','atlas-world-physical'])if(map.getLayer(id))map.removeLayer(id);
  for(const id of ['atlas-graticule','atlas-rivers-context','atlas-rivers-global','atlas-land-detail','atlas-caucasus-context-elevation','atlas-caucasus-close','atlas-caucasus-detail','atlas-world-physical'])if(map.getSource(id))map.removeSource(id);
  return false;
 }
 if(typeof document!=='undefined')addWorldCaptions(map).catch(error=>console.warn('World captions unavailable',error));
 return true;
}

export function addRegionalHydrology(map,data){
 if(!data?.features?.length||map.getSource('atlas-rivers-regional'))return false;
 try{
  map.addSource('atlas-rivers-regional',{type:'geojson',data,maxzoom:12,lineMetrics:true});
  map.addLayer({id:'atlas-rivers-regional',type:'line',source:'atlas-rivers-regional',minzoom:4.2,paint:{
   'line-color':'#8eb5b2','line-opacity':['interpolate',['linear'],['zoom'],4.2,.5,5.5,.72,9,.9],
   'line-width':['interpolate',['linear'],['zoom'],4.2,.65,5.5,1.05,8,1.6,11,2.1],
  }});
  return true;
 }catch(error){
  console.warn('Regional river paths are unavailable; keeping Natural Earth world waterways',error);
  if(map.getLayer('atlas-rivers-regional'))map.removeLayer('atlas-rivers-regional');
  if(map.getSource('atlas-rivers-regional'))map.removeSource('atlas-rivers-regional');
  return false;
 }
}
