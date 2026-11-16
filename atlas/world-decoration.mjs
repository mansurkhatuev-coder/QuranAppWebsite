export function makeGraticule(){
 const features=[];
 for(let longitude=-180;longitude<180;longitude+=15){
  const coordinates=[];for(let latitude=-80;latitude<=80;latitude+=2)coordinates.push([longitude,latitude]);
  features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates}});
 }
 for(let latitude=-75;latitude<=75;latitude+=15){
  const coordinates=[];for(let longitude=-180;longitude<=180;longitude+=2)coordinates.push([longitude,latitude]);
  features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates}});
 }
 return {type:'FeatureCollection',features};
}

export async function addWorldCaptions(map){
 const captions=[
  ['ЕВРОПА',[17,52],'world'],['АЗИЯ',[91,42],'world'],['АФРИКА',[21,9],'world'],
  ['Атлантический океан',[-34,18],'world'],['Индийский океан',[77,-23],'world'],['Тихий океан',[159,-6],'world'],
  ['Чёрное море',[34.5,43],'regional'],['Каспийское море',[51.1,41.8],'regional'],
  ['Средиземное море',[19,35],'regional'],['КАВКАЗ',[43.7,42.3],'regional'],
  ['ЧЕЧНЯ',[45.8,43.05],'home'],
 ];
 const family=getComputedStyle(document.documentElement).getPropertyValue('--atlas-serif').trim()||'serif';
 await document.fonts?.ready;
 const features=[];
 captions.forEach(([name,center,scale],index)=>{
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  context.font=`500 ${scale==='world'?28:25}px ${family}`;
  canvas.width=Math.ceil(context.measureText(name).width)+26;canvas.height=58;
  context.font=`${scale==='regional'?'italic ':''}500 ${scale==='world'?28:25}px ${family}`;
  context.textAlign='center';context.textBaseline='middle';context.lineWidth=2;
  context.strokeStyle='#102d2780';context.strokeText(name,canvas.width/2,29);
  context.fillStyle=scale==='home'?'#f0d39a':scale==='world'?'#e0d8bc':'#d3d6c0';context.fillText(name,canvas.width/2,29);
  const id=`atlas-caption-${index}`;map.addImage(id,context.getImageData(0,0,canvas.width,canvas.height),{pixelRatio:2});
  features.push({type:'Feature',properties:{image:id,scale},geometry:{type:'Point',coordinates:center}});
 });
 map.addSource('atlas-world-captions',{type:'geojson',data:{type:'FeatureCollection',features}});
 for(const [scale,minzoom,maxzoom] of [['world',0,3.8],['regional',3,6.4],['home',0,5.4]]){
  map.addLayer({id:`atlas-${scale}-captions`,type:'symbol',source:'atlas-world-captions',minzoom,maxzoom,
   filter:['==',['get','scale'],scale],layout:{'icon-image':['get','image'],'icon-size':1,'icon-allow-overlap':scale==='home','icon-padding':20,
    'icon-anchor':scale==='home'?'left':'center','icon-offset':scale==='home'?[10,0]:[0,0],
    'icon-pitch-alignment':scale==='home'?'viewport':'map','icon-rotation-alignment':scale==='home'?'viewport':'map'},
   paint:{'icon-opacity':scale==='home'?1:.75}});
 }
}
