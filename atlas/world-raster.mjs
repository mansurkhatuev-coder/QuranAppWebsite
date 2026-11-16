export const CAUCASUS_DETAIL_BOUNDS=Object.freeze([30,35,60,55]);
export const CAUCASUS_CLOSE_BOUNDS=Object.freeze([40,39,51,48]);

const tileTemplate=(base,path)=>new URL(path,base).href.replaceAll('%7B','{').replaceAll('%7D','}');

export function createWorldRasterSources(baseUrl=new URL('./data/world/',import.meta.url).href){
 return Object.freeze({
  global:Object.freeze({type:'raster',tiles:[tileTemplate(baseUrl,'physical/{z}/{x}/{y}.jpg')],tileSize:512,minzoom:0,maxzoom:4,attribution:'Natural Earth'}),
  caucasus:Object.freeze({type:'raster',tiles:[tileTemplate(baseUrl,'caucasus/{z}/{x}/{y}.jpg')],tileSize:512,minzoom:5,maxzoom:6,bounds:CAUCASUS_DETAIL_BOUNDS,attribution:'Natural Earth'}),
  caucasusClose:Object.freeze({type:'raster',tiles:[tileTemplate(baseUrl,'caucasus-close/{z}/{x}/{y}.jpg')],tileSize:512,minzoom:7,maxzoom:8,bounds:CAUCASUS_CLOSE_BOUNDS,attribution:'Natural Earth'}),
  caucasusTerrain:Object.freeze({type:'raster-dem',tiles:[tileTemplate(baseUrl,'terrain-context/{z}/{x}/{y}.png')],tileSize:256,minzoom:7,maxzoom:8,bounds:CAUCASUS_CLOSE_BOUNDS,encoding:'terrarium',attribution:'AWS Terrain Tiles'}),
 });
}
