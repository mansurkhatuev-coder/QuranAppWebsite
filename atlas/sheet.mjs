const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const snapOrder=['peek','half','full'];

export function getSheetStops({height,safeTop=0,safeBottom=0}){
 const peek=120+safeBottom;
 const full=Math.max(peek+88,height-safeTop-72);
 const half=clamp(height*.46,peek+64,full-64);
 const adjustedHalf=half>peek&&half<full?half:(peek+full)/2;
 return {peek,half:adjustedHalf,full};
}

export function chooseSheetSnap(height,velocity,stops){
 const entries=snapOrder.map(key=>[key,stops[key]]).filter(([,value],index,array)=>Number.isFinite(value)&&(!index||value>array[index-1][1]));
 if(!entries.length)return 'peek';
 const current=entries.reduce((best,next)=>Math.abs(next[1]-height)<Math.abs(best[1]-height)?next:best,entries[0]);
 if(velocity>.55)return entries.find(([,value])=>value>height)?.[0]??entries.at(-1)[0];
 if(velocity<-.55)return [...entries].reverse().find(([,value])=>value<height)?.[0]??entries[0][0];
 return current[0];
}

export function createBottomSheet({shell,panel,handle,getLayout,onSnap=()=>{},windowRef=window}){
 let pointerId=null;
 let startY=0;
 let startHeight=0;
 let samples=[];
 let dragging=false;
 let suppressClick=false;
 let suppressClickTimer=null;

 const stops=()=>getSheetStops({height:windowRef.innerHeight,safeTop:getLayout().safeInsets.top,safeBottom:getLayout().safeInsets.bottom});
 const setHeight=value=>{
  const available=stops();
  shell.style.setProperty('--sheet-drag-height',`${clamp(value,available.peek,available.full)}px`);
 };
 const finish=snap=>{
  const activePointer=pointerId;
  pointerId=null;dragging=false;samples=[];
  if(activePointer!==null&&handle.hasPointerCapture?.(activePointer))handle.releasePointerCapture(activePointer);
  shell.classList.remove('is-sheet-dragging');
  shell.style.removeProperty('--sheet-drag-height');
  suppressClick=true;
  windowRef.clearTimeout(suppressClickTimer);
  suppressClickTimer=windowRef.setTimeout(()=>{suppressClick=false;},120);
  onSnap(snap);
 };
 const onPointerDown=event=>{
  if(event.button!==undefined&&event.button!==0)return;
  if(getLayout().panel!=='bottom')return;
  pointerId=event.pointerId;startY=event.clientY;startHeight=panel.getBoundingClientRect().height;
  samples=[{time:event.timeStamp,height:startHeight}];dragging=false;
  handle.setPointerCapture?.(pointerId);
 };
 const onPointerMove=event=>{
  if(event.pointerId!==pointerId)return;
  const height=startHeight+startY-event.clientY;
  if(Math.abs(event.clientY-startY)>5){dragging=true;shell.classList.add('is-sheet-dragging');}
  if(dragging){event.preventDefault();setHeight(height);}
  samples.push({time:event.timeStamp,height});
  if(samples.length>4)samples.shift();
 };
 const onPointerUp=event=>{
  if(event.pointerId!==pointerId)return;
  const height=panel.getBoundingClientRect().height;
  const first=samples[0],last=samples.at(-1);
  const seconds=Math.max(1,last.time-first.time);
  const velocity=(last.height-first.height)/seconds;
  if(dragging){event.preventDefault();finish(chooseSheetSnap(height,velocity,stops()));}
  else{pointerId=null;samples=[];}
 };
 const onPointerCancel=event=>{if(event.pointerId===pointerId)finish(chooseSheetSnap(startHeight,0,stops()));};
 const onClick=()=>{if(suppressClick)return;const current=shell.dataset.sheet||'peek';onSnap(snapOrder[(snapOrder.indexOf(current)+1)%snapOrder.length]);};
 const onKeyDown=event=>{
  const current=shell.dataset.sheet||'peek';
  const index=snapOrder.indexOf(current);
  if(event.key==='ArrowUp'&&index<snapOrder.length-1){event.preventDefault();onSnap(snapOrder[index+1]);}
  if(event.key==='ArrowDown'&&index>0){event.preventDefault();onSnap(snapOrder[index-1]);}
  if(event.key==='Home'){event.preventDefault();onSnap('peek');}
  if(event.key==='End'){event.preventDefault();onSnap('full');}
 };

 handle.addEventListener('pointerdown',onPointerDown);
 handle.addEventListener('pointermove',onPointerMove);
 handle.addEventListener('pointerup',onPointerUp);
 handle.addEventListener('pointercancel',onPointerCancel);
 handle.addEventListener('lostpointercapture',onPointerCancel);
 handle.addEventListener('click',onClick);
 handle.addEventListener('keydown',onKeyDown);
 return {cancel(){if(pointerId!==null)finish(shell.dataset.sheet||'peek');},destroy(){this.cancel();handle.removeEventListener('pointerdown',onPointerDown);handle.removeEventListener('pointermove',onPointerMove);handle.removeEventListener('pointerup',onPointerUp);handle.removeEventListener('pointercancel',onPointerCancel);handle.removeEventListener('lostpointercapture',onPointerCancel);handle.removeEventListener('click',onClick);handle.removeEventListener('keydown',onKeyDown);}};
}
