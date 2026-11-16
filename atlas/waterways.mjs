import * as THREE from './vendor/three.module.js';
import {mercatorPosition,sampleSurfaceElevation} from './relief.mjs';

// Water follows the same DEM as the surface. Widths are display widths, not measurements.
export function addWaterways(scene,manifest,grid,collection,{stride=1}={}){
 const vertices=[];
 const [west,north,east,south]=manifest.extent;
 const inside=point=>{
  const column=Math.floor((point.x-west)/(east-west)*(manifest.size-1));
  const row=Math.floor((point.y-north)/(south-north)*(manifest.size-1));
  return column>=0&&row>=0&&column<manifest.size-1&&row<manifest.size-1&&grid.inside[row*(manifest.size-1)+column]>=128;
 };
 for(const feature of collection?.features??[]){
  const paths=feature.geometry.type==='MultiLineString'?feature.geometry.coordinates:[feature.geometry.coordinates];
  for(const path of paths){
   // Densify long source segments so rivers hug valleys instead of spanning them.
   const points=[];
   for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1];
    const count=Math.max(1,Math.ceil(Math.hypot((b[0]-a[0])*.73,b[1]-a[1])*111000/70));
    for(let j=0;j<count;j++){const t=j/count;points.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
   }
   points.push(path[path.length-1]);
   for(let i=0;i<points.length-1;i++){
    const a=mercatorPosition(points[i]);
    const b=mercatorPosition(points[i+1]);
    if(!inside(a)||!inside(b))continue;
    const length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)continue;
    const width=(feature.properties.displayWidthMeters??65)*(a.meterScale+b.meterScale)*1.5/4;
    const dx=-(b.y-a.y)/length*width,dy=(b.x-a.x)/length*width;
    const corners=[[a.x+dx,a.y+dy,a.z],[a.x-dx,a.y-dy,a.z],[b.x+dx,b.y+dy,b.z],[b.x-dx,b.y-dy,b.z]];
    for(const corner of corners){
     const latitude=Math.atan(Math.sinh(Math.PI*(1-2*corner[1])));
     const meterScale=1/(2*Math.PI*6378137*Math.cos(latitude));
     corner[2]=(sampleSurfaceElevation(manifest,grid,corner[0],corner[1],stride)*(manifest.heightExaggeration??1)+20)*meterScale;
    }
    for(const at of [0,1,2,2,1,3])vertices.push(...corners[at]);
   }
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
  uniforms:{time:{value:0}},
  vertexShader:'varying vec2 p;void main(){p=position.xy*100000.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform float time;varying vec2 p;void main(){float ripple=.5+.5*sin(p.x*1.7+p.y*2.3+time*.45);vec3 water=mix(vec3(.27,.51,.51),vec3(.55,.72,.70),ripple*.25);gl_FragColor=vec4(water,.92);}'
 });
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);return mesh;
}
