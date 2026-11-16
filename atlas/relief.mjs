const EARTH_CIRCUMFERENCE=2*Math.PI*6378137;
const MAX_LATITUDE=85.0511287798066;

export function mercatorPosition(lngLat,elevationMeters=0){
 if(!Array.isArray(lngLat)||lngLat.length<2)throw new TypeError('lngLat must be [longitude, latitude]');
 const [longitude,latitude]=lngLat.map(Number);
 const elevation=Number(elevationMeters);
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||!Number.isFinite(elevation))throw new TypeError('Geographic position and elevation must be finite');
 const clampedLatitude=Math.max(-MAX_LATITUDE,Math.min(MAX_LATITUDE,latitude));
 const radians=clampedLatitude*Math.PI/180;
 const x=(longitude+180)/360;
 const y=(1-Math.asinh(Math.tan(radians))/Math.PI)/2;
 const meterScale=1/(EARTH_CIRCUMFERENCE*Math.cos(radians));
 return {x,y,z:elevation*meterScale,elevationMeters:elevation,meterScale};
}

export function sampleGridElevation(grid,u,v){
 const size=Number(grid?.size);
 const data=grid?.data;
 if(!Number.isInteger(size)||size<2||!data||data.length!==size*size)throw new TypeError('Elevation grid must have size >= 2 and size² samples');
 if(!Number.isFinite(u)||!Number.isFinite(v))throw new TypeError('Grid coordinates must be finite');
 const x=Math.max(0,Math.min(size-1,u*(size-1)));
 const y=Math.max(0,Math.min(size-1,v*(size-1)));
 const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(size-1,x0+1),y1=Math.min(size-1,y0+1);
 const fx=x-x0,fy=y-y0;
 const a=Number(data[y0*size+x0]),b=Number(data[y0*size+x1]);
 const c=Number(data[y1*size+x0]),d=Number(data[y1*size+x1]);
 return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
}

export function sampleReliefElevation(manifest,grid,lngLat,exaggeration=manifest?.heightExaggeration??1){
 const extent=manifest?.extent;
 if(!Array.isArray(extent)||extent.length!==4)throw new TypeError('Relief manifest extent must be [west,north,east,south]');
 const [west,north,east,south]=extent;
 if(!(east>west&&south>north))throw new RangeError('Relief manifest extent is invalid');
 const [longitude,latitude]=lngLat.map(Number);
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude))throw new TypeError('Geographic position must be finite');
 const world=mercatorPosition([longitude,latitude],0);
 const u=(world.x-west)/(east-west),v=(world.y-north)/(south-north);
 return sampleGridElevation(grid,u,v)*Number(exaggeration);
}

export function projectAnchor(matrix,position,width,height){
 if(!matrix||matrix.length!==16)throw new TypeError('Camera matrix must contain 16 values');
 if(!position||![position.x,position.y,position.z].every(Number.isFinite))throw new TypeError('World position must be finite');
 if(!(width>0&&height>0))throw new RangeError('Viewport dimensions must be positive');
 const x=position.x,y=position.y,z=position.z;
 const clipX=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12];
 const clipY=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13];
 const clipZ=matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14];
 const clipW=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];
 if(!Number.isFinite(clipW)||clipW<=0)return {visible:false,x:0,y:0,depth:1};
 const ndcX=clipX/clipW,ndcY=clipY/clipW,depth=clipZ/clipW;
 const visible=ndcX>=-1&&ndcX<=1&&ndcY>=-1&&ndcY<=1&&depth>=-1&&depth<=1;
 return {visible,x:(ndcX+1)*width/2,y:(1-ndcY)*height/2,depth};
}

export function computeProjectedFit(matrix,points,width,height,padding,margin=24){
 const projected=points.map(point=>projectAnchor(matrix,point,width,height));
 const xs=projected.map(point=>point.x),ys=projected.map(point=>point.y);
 const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
 const availableWidth=width-padding.left-padding.right-margin*2;
 const availableHeight=height-padding.top-padding.bottom-margin*2;
 if(!points.length||availableWidth<=0||availableHeight<=0||right<=left||bottom<=top)return null;
 return {center:[(left+right)/2,(top+bottom)/2],scale:Math.min(availableWidth/(right-left),availableHeight/(bottom-top)),bounds:{left,right,top,bottom}};
}

export function sampleSurfaceElevation(manifest,grid,x,y,stride=1){
 const [west,north,east,south]=manifest.extent,size=manifest.size;
 const gx=Math.max(0,Math.min(size-1,(x-west)/(east-west)*(size-1)));
 const gy=Math.max(0,Math.min(size-1,(y-north)/(south-north)*(size-1)));
 const lastStart=Math.floor((size-2)/stride)*stride;
 const x0=Math.min(Math.floor(gx/stride)*stride,lastStart),y0=Math.min(Math.floor(gy/stride)*stride,lastStart);
 const x1=Math.min(size-1,x0+stride),y1=Math.min(size-1,y0+stride);
 const fx=(gx-x0)/(x1-x0),fy=(gy-y0)/(y1-y0),data=grid.data??grid;
 const a=data[y0*size+x0],b=data[y0*size+x1],c=data[y1*size+x0],d=data[y1*size+x1];
 return fx+fy<=1?a+(b-a)*fx+(c-a)*fy:d+(c-d)*(1-fx)+(b-d)*(1-fy);
}

