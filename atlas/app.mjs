import {groups,sites,searchCatalog} from './catalog.mjs';
import {getPlaceMedia,imageFor} from './media.mjs';
import {createInitialState,transition,restoreEntry,contextPanel} from './atlas-state.mjs?v=f3463c6';
import {settlements} from './settlements.mjs';
import {rivers} from './rivers.mjs';
import {createBottomSheet,getSheetStops} from './sheet.mjs';
import {computeLayoutMode,measureViewport} from './viewport.mjs?v=f3463c6';
import {completeAtlasEntrance} from './entry-motion.mjs';
import {createWindAmbience} from './ambient-audio.mjs';

const $=selector=>document.querySelector(selector);
const shell=$('#atlas-shell');
const state=createInitialState();
const runtime={mapStatus:'loading'};
let atlas=null;
let publicSummary=null;
let sheetController=null;
let currentEntry=null;
let previousState=null;
let searchReturnFocus=null;
let measureFrame=0;
let routeCounter=0;
let lastViewport=null;
let lastMapSize=null;
const icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const escapeRoute=value=>encodeURIComponent(value??'');
const teipCountLabel=count=>`${count} ${count%10===1&&count%100!==11?'тейп':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'тейпа':'тейпов'}`;
const statusLabel={loading:'Загрузка рельефа',ready:'Атлас готов',degraded:'Облегчённый рельеф',unavailable:'Карта недоступна · каталог работает'};
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
let atmosphereEnabled=!motionPreference.matches;
const windAmbience=createWindAmbience();

function toast(message){
 const element=$('#toast');
 element.textContent=message;
 element.classList.add('visible');
 clearTimeout(toast.timer);
 toast.timer=setTimeout(()=>element.classList.remove('visible'),3000);
}

function setMapStatus(status){
 runtime.mapStatus=status in statusLabel?status:'degraded';
 const element=$('#map-status');
 element.replaceChildren();
 const dot=document.createElement('span');
 dot.className='small-dot';
 element.append(dot,document.createTextNode(statusLabel[runtime.mapStatus]));
 document.body.dataset.mapStatus=runtime.mapStatus;
 completeAtlasEntrance(document.body,runtime.mapStatus);
 document.querySelectorAll('.camera-rail button').forEach(button=>{
  button.disabled=runtime.mapStatus==='unavailable'&&button.id!=='view-toggle';
 });
}

function currentRoute(value=state){
 if(value.view==='group')return `#/group/${escapeRoute(value.groupId)}`;
 if(value.view==='teip')return `#/teip/${escapeRoute(value.groupId)}/${escapeRoute(value.teipId)}`;
 if(value.view==='place')return `#/place/${escapeRoute(value.placeId)}`;
 if(value.view==='river')return `#/river/${escapeRoute(value.riverId)}`;
 if(value.view==='city')return `#/city/${escapeRoute(value.cityId)}`;
 if(value.view==='places')return '#/places';
 if(value.view==='explore')return '#/roots';
 if(value.view==='search')return '#/search';
 return '#/';
}

function routeState(hash){
 const parts=(hash||'').replace(/^#\/?/,'').split('/').filter(Boolean);
 const next=createInitialState();
 if(computeLayoutMode({width:innerWidth,height:innerHeight}).panel==='bottom'){
  if(['roots','places'].includes(parts[0]))next.sheet='half';
  if(parts[0]==='search')next.sheet='full';
 }
 if(parts[0]==='group'&&groups.some(group=>group.id===parts[1]))return transition(next,{type:'SELECT_GROUP',id:parts[1]});
 if(parts[0]==='teip'){
  const group=groups.find(item=>item.id===parts[1]);
  if(group&&group.teips.some(teip=>teip.id===parts[2]))return transition(next,{type:'SELECT_TEIP',groupId:group.id,id:parts[2]});
 }
 if(parts[0]==='place'&&sites.some(site=>site.id===parts[1]))return transition(next,{type:'SELECT_PLACE',id:parts[1]});
 if(parts[0]==='river'&&rivers.some(river=>river.id===parts[1]))return transition(next,{type:'SELECT_RIVER',id:parts[1]});
 if(parts[0]==='city'&&settlements.some(city=>city.id===parts[1]))return transition(next,{type:'SELECT_CITY',id:parts[1]});
 if(parts[0]==='places')return transition(next,{type:'SET_LAYER',layer:'sites'});
 if(parts[0]==='roots')return transition(next,{type:'DISMISS_INTRO'});
 if(parts[0]==='search')return transition(next,{type:'OPEN_SEARCH'});
 return next;
}

function makeEntry(next,index,returnFocusId=null){
 return {id:`atlas-${++routeCounter}`,index,state:restoreEntry(next),camera:atlas?.captureCamera()??null,returnFocusId,manuallyMoved:false};
}

function replaceCurrentEntry(){
 if(!currentEntry)return;
 currentEntry={...currentEntry,state:restoreEntry(state),camera:atlas?.captureCamera()??currentEntry.camera,manuallyMoved:currentEntry.manuallyMoved||false};
 const existing=history.state??{};
 history.replaceState({...existing,atlasEntry:currentEntry},'',currentRoute());
}

function saveViewState(){
 if(!currentEntry)return;
 currentEntry={...currentEntry,state:restoreEntry(state),camera:atlas?.captureCamera()??currentEntry.camera};
 if(history.state?.atlasEntry?.id===currentEntry.id){
  history.replaceState({...history.state,atlasEntry:currentEntry},'',currentRoute());
 }
}

function route(event,{returnFocusId=null,afterRender=null,replace=false}={}){
 if(event.type==='GO_HOME'||event.type==='EXIT_MAP_ONLY'||event.type==='SET_LAYER')clearFamilyMarkers();
 previousState=restoreEntry(state);
 const next=transition(state,event);
 const resetPanelScroll=['GO_HOME','SELECT_GROUP','SELECT_TEIP','SELECT_PLACE','GO_TO_GROUP','SET_LAYER','DISMISS_INTRO'].includes(event.type);
 if(replace){
  Object.assign(state,next);
  render();
  if(resetPanelScroll)$('#catalog-body').scrollTop=0;
  currentEntry={...currentEntry,state:restoreEntry(state),camera:atlas?.captureCamera()??currentEntry?.camera};
  if(currentEntry)history.replaceState({...history.state,atlasEntry:currentEntry},'',currentRoute());
 }else{
  saveViewState();
  Object.assign(state,next);
  const index=(currentEntry?.index??0)+1;
  currentEntry=makeEntry(state,index,returnFocusId);
  history.pushState({atlasEntry:currentEntry},'',currentRoute());
  render();
  if(resetPanelScroll)$('#catalog-body').scrollTop=0;
 }
 afterRender?.();
 scheduleViewport();
 const plannedEntry=currentEntry?.id;
 requestAnimationFrame(()=>{if(currentEntry?.id===plannedEntry)synchronizeAtlas(event);});
}

function setSheet(next){
 if(!['peek','half','full'].includes(next))return;
 state.sheet=next;
 shell.dataset.sheet=next;
 $('#sheet-handle').setAttribute('aria-expanded',String(next!=='peek'));
 $('#sheet-handle').setAttribute('aria-label',next==='full'?'Свернуть каталог':next==='half'?'Развернуть каталог полностью':'Развернуть каталог');
 if(currentEntry){currentEntry.state=restoreEntry(state);saveViewState();}
 scheduleViewport();
}

function visibleCameraState(){
 const mode=lastViewport?.mode?.panel??computeLayoutMode({width:innerWidth,height:innerHeight}).panel;
 return runtime.mapStatus!=='unavailable'&&(mode==='side'||state.sheet!=='full')&&!state.mapOnly;
}

function synchronizeAtlas(event={}){
 if(!atlas)return;
 atlas.setLayer(state.layer);
 atlas.setSelection(state.selectedEntity);
 if(event.type==='SELECT_RIVER'&&state.riverId&&visibleCameraState())atlas.focusRiver(state.riverId,{focus:true,padding:lastViewport?.padding});
 if(event.type==='SELECT_CITY'&&state.cityId&&visibleCameraState())atlas.focusCity(state.cityId,{focus:true,padding:lastViewport?.padding});
 if(event.type==='SELECT_GROUP'&&state.groupId){
  if(visibleCameraState())atlas.setGroup(state.groupId,{focus:true,padding:lastViewport?.padding});
  else atlas.setGroup(state.groupId,{focus:false});
 }
 if(event.type==='SELECT_PLACE'&&state.placeId){
  const shouldFocus=(lastViewport?.mode?.panel??computeLayoutMode({width:innerWidth,height:innerHeight}).panel)==='side';
  atlas.focusSite(state.placeId,{focus:shouldFocus,padding:lastViewport?.padding});
 }
 if(event.type==='GO_HOME')atlas.home(lastViewport?.padding);
 if(event.type==='SET_SHEET'&&state.view==='place'&&state.sheet==='peek'&&state.placeId){
  atlas.focusSite(state.placeId,{focus:true,padding:lastViewport?.padding});
 }
 document.body.classList.toggle('is-exploring',state.introDismissed||state.view!=='overview');
 document.body.classList.toggle('has-place',['place','city','river'].includes(state.view));
 shell.classList.toggle('has-place',['place','city','river'].includes(state.view));
}

function row({title,index,meta,action,tower=false,branch=false,id}){
 const button=document.createElement('button');
 button.className='catalog-row';
 button.type='button';
 if(id)button.id=id;
 const number=document.createElement('span');
 number.className='row-number';
 if(tower||branch){number.innerHTML=icon(tower?'tower':'branch');number.classList.add('row-tree');}
 else number.textContent=String(index+1).padStart(2,'0');
 const label=document.createElement('span');
 label.className='row-title';
 label.textContent=title;
 const small=document.createElement('span');
 small.className='row-meta';
 small.textContent=meta||'';
 const arrow=document.createElement('span');
 arrow.className='row-arrow';
 arrow.innerHTML=icon('arrow');
 button.append(number,label,small,arrow);
 button.addEventListener('click',action);
 return button;
}

function breadcrumb(label,action){
 const button=document.createElement('button');
 button.type='button';
 button.innerHTML=`${icon('back')}<span></span>`;
 button.querySelector('span').textContent=label;
 button.addEventListener('click',action);
 return button;
}

function currentGroup(){return groups.find(group=>group.id===state.groupId)??null;}
function currentTeip(){return currentGroup()?.teips.find(teip=>teip.id===state.teipId)??null;}

function renderAggregateDashboard({group=null,teip=null,settlement=null,panel=$('#aggregate-dashboard')}={}){
 panel.replaceChildren();
 const metrics=[];
 if(teip){
  const linked=sites.filter(site=>site.group===group.id && site.teipId===teip.id);
  if(linked.length)metrics.push(['Исторические места',linked.length]);
 }else if(settlement){
  const linked=sites.filter(site=>site.settlementId===settlement.id);
  if(linked.length)metrics.push(['Исторические объекты',linked.length]);
 }else if(group){
  metrics.push(['Тейпы в каталоге',group.teips.length]);
  const places=sites.filter(site=>site.group===group.id);
  if(places.length)metrics.push(['Места в каталоге тухума',places.length]);
  const villages=new Set(places.map(place=>place.settlementId).filter(Boolean));
  if(villages.size)metrics.push(['Селения с объектами каталога',villages.size]);
 }else{
  metrics.push(['Тухумы',groups.length],['Записи о тейпах',groups.reduce((n,g)=>n+g.teips.length,0)],['Исторические места',sites.length]);
 }
 const scope=teip?`teip/${group.id}/${teip.id}`:group?`group/${group.id}`:settlement?`city/${settlement.id}`:'project';
 const published=publicSummary?.scopes?.[scope];
 if(published){
  for(const [key,label] of Object.entries({trees:'Родословные с согласием семьи',people:'Записи о людях',teips:'Представленные тейпы',settlements:'Родовые селения'})){
   if(published[key])metrics.push([label,published[key]]);
  }
  for(const [depth,count] of Object.entries(published.depth??{}))metrics.push([`Древ с глубиной ${depth} поколений`,count]);
 }
 if(settlement && !metrics.length){panel.hidden=true;return;}
 const grid=document.createElement('div');
 grid.className='aggregate-grid';
 for(const [label,value] of metrics){
  const card=document.createElement('article');card.className='aggregate-metric';
  const name=document.createElement('span');name.className='aggregate-metric-label';name.textContent=label;
  const amount=document.createElement('strong');amount.className='aggregate-metric-value';amount.textContent=value;
  card.append(name,amount);grid.append(card);
 }
 const note=document.createElement('p');note.className='aggregate-privacy';
 note.textContent=published?`Сводка на ${publicSummary.date}. Размеры выборок показаны интервалами.`:teip?'В каталоге пока нет подтверждённых связей этого тейпа с родовыми селениями.':'Принадлежность тейпов и привязки мест уточняются.';
 panel.append(grid,note);
 panel.hidden=false;
}

function makePlacePicture(media,{className='',sizes='(min-width: 900px) 340px, 100vw',loading='lazy'}={}){
 const picture=document.createElement('picture');
 picture.className=className;
 const source=document.createElement('source');
 source.type='image/webp';source.srcset=media.webpSrcset;source.sizes=sizes;
 const image=document.createElement('img');
 image.src=imageFor(media);image.alt=media.alt;image.loading=loading;
 image.width=media.width??1536;image.height=media.height??1024;
 picture.append(source,image);
 return {picture,image};
}

function renderBreadcrumbs(){
 const crumbs=$('#breadcrumbs');
 crumbs.replaceChildren();
 const group=currentGroup();
 const teip=currentTeip();
 if(state.view==='teip'&&group){
  crumbs.append(breadcrumb(group.name,()=>route({type:'GO_TO_GROUP',id:group.id},{returnFocusId:`catalog-row-${group.id}`})));
  const label=document.createElement('span');label.className='current';label.textContent=teip?.name??'Тейп';crumbs.append(label);
 }else if(state.view==='group'&&group){
  crumbs.append(breadcrumb('Тухумы',()=>route({type:'GO_TO_GROUP',id:null},{returnFocusId:'catalog-layer-groups'})));
  const label=document.createElement('span');label.className='current';label.textContent=group.name;crumbs.append(label);
 }
}

function renderRows(){
 const list=$('#catalog-list');
 const summary=$('#aggregate-dashboard');
 const empty=$('#catalog-empty');
 const searchResults=$('#search-results');
 const query=state.query.trim();
 list.replaceChildren();
 list.hidden=false;
 summary.replaceChildren();
 summary.hidden=true;
 empty.hidden=true;
 searchResults.replaceChildren();
 searchResults.hidden=true;
 const group=currentGroup();
 const teip=currentTeip();
 let count='';
 $('#catalog-label').textContent=state.view==='group'&&group?group.name:state.view==='teip'&&teip?teip.name:state.view==='search'?'Поиск по атласу':state.catalogMode==='sites'?'Места':'Тухумы';

 if(state.view==='teip'&&teip){
  $('#count').textContent='';
  list.hidden=true;
  renderAggregateDashboard({group,teip});
  return;
 }

 if(state.view==='search'){
  list.hidden=true;
  searchResults.hidden=false;
  if(!query){
   const hint=document.createElement('p');
   hint.className='no-results';
   hint.textContent='Введите название тухума, тейпа или места.';
   searchResults.append(hint);
   $('#count').textContent='';
   return;
  }
  const results=searchCatalog(query);
  if(!results.length){
   const message=document.createElement('div');message.className='no-results';message.textContent='Совпадений пока нет. Попробуйте другое название.';searchResults.append(message);
  }
  results.forEach(match=>{
   const button=document.createElement('button');button.type='button';button.className='search-result';button.id=`search-result-${match.type}-${match.id}`;
   const label=document.createElement('span');label.textContent=match.label;
   const type=document.createElement('small');type.textContent=match.type;
   button.append(label,type);
   button.addEventListener('click',()=>{
    if(match.type==='Река')route({type:'SELECT_RIVER',id:match.id,sheet:lastViewport?.mode?.panel==='bottom'?'half':state.sheet});
    else if(match.type==='Город'||match.type==='Селение')openCity(match.id);
    else if(match.type==='Место')route({type:'SELECT_PLACE',id:match.id,sheet:lastViewport?.mode?.panel==='bottom'?'full':state.sheet},{returnFocusId:button.id});
    else if(match.type==='Тейп')route({type:'SELECT_TEIP',groupId:match.group,id:match.id,sheet:lastViewport?.mode?.panel==='bottom'?'half':state.sheet},{returnFocusId:button.id});
    else openGroup(match.id,{focusTargetId:button.id});
   });
   searchResults.append(button);
  });
  $('#count').textContent=results.length?`${results.length} найдено`:'';
  return;
 }

 if(state.view==='places'||state.catalogMode==='sites'){
  count=`${sites.length} мест`;
  sites.forEach((site,index)=>list.append(row({title:site.name,index,tower:true,meta:site.kind,id:`catalog-row-${site.id}`,action:()=>openSite(site.id)})));
 }else if(group){
  count=teipCountLabel(group.teips.length);
  renderAggregateDashboard({group});
  if(group.teips.length){
   const label=document.createElement('label');label.className='teip-filter';label.textContent='Найти тейп в тухуме';
   const input=document.createElement('input');input.type='search';input.placeholder='Название тейпа';input.value=state.groupFilter;label.append(input);list.append(label);
   const rows=group.teips.map((item,index)=>{const button=row({title:item.name,index,meta:'',id:`catalog-row-${item.id}`,action:()=>route({type:'SELECT_TEIP',id:item.id},{returnFocusId:`catalog-row-${item.id}`})});list.append(button);return {button,name:item.name.toLocaleLowerCase('ru')};});
   const noMatch=document.createElement('p');noMatch.className='catalog-filter-empty';noMatch.textContent='Тейпы с таким названием не найдены.';list.append(noMatch);
   const filter=()=>{const q=input.value.trim().toLocaleLowerCase('ru');let visibleCount=0;for(const item of rows){item.button.hidden=!item.name.includes(q);if(!item.button.hidden)visibleCount++;}noMatch.hidden=visibleCount>0;count=teipCountLabel(visibleCount);$('#count').textContent=count;};
   input.addEventListener('input',()=>{state.groupFilter=input.value;filter();saveViewState();});filter();
  }
  else{
   list.hidden=true;
   empty.hidden=false;
   empty.querySelector('p').textContent='В каталоге пока нет тейпов этого тухума.';
  }
 }else{
  count=`${groups.length} тухумов`;
  if(state.view==='overview'||state.view==='explore')renderAggregateDashboard();
  groups.forEach(item=>list.append(row({title:item.name,branch:true,meta:teipCountLabel(item.teips.length),id:`catalog-row-${item.id}`,action:()=>openGroup(item.id)})));
 }
 $('#count').textContent=count;
}

function renderPlace(){
 const detail=$('#place-detail');
 const slot=contextPanel(state);
 const place=slot.kind==='place'?sites.find(item=>item.id===slot.id):null;
 const photo=$('#photo-dialog');
 if(photo.open&&photo.dataset.placeId!==place?.id)photo.close();
 $('#explorer').classList.toggle('has-place',Boolean(place));
 detail.replaceChildren();
 if(!place){detail.hidden=true;return;}
 const media=getPlaceMedia(place.id);
 const toolbar=document.createElement('div');toolbar.className='detail-toolbar';
 const back=document.createElement('button');back.type='button';back.className='detail-back';back.innerHTML=`${icon('back')}<span>Назад</span>`;back.addEventListener('click',goBack);
 const peekTitle=document.createElement('span');peekTitle.className='detail-peek-title';peekTitle.textContent=place.name;
 const close=document.createElement('button');close.type='button';close.className='detail-close';close.setAttribute('aria-label','Закрыть карточку');close.innerHTML=`Закрыть ${icon('close')}`;close.addEventListener('click',goBack);
 toolbar.append(back,peekTitle,close);
 const figure=document.createElement('figure');figure.className='detail-photo';
 if(media){
  const {picture,image}=makePlacePicture(media,{className:'detail-photo-picture',sizes:'(min-width: 900px) 340px, 100vw',loading:'eager'});
  image.className='detail-photo-image';image.style.objectPosition=media.focalPoint;
  image.addEventListener('error',()=>{figure.replaceChildren();figure.classList.add('photo-missing');const missing=document.createElement('span');missing.textContent='Изображение недоступно';figure.append(missing);});
  figure.append(picture);
  const expand=document.createElement('button');expand.type='button';expand.className='detail-photo-button';expand.setAttribute('aria-label','Увеличить иллюстрацию');expand.innerHTML=icon('search');expand.addEventListener('click',openPhoto);figure.append(expand);
 }else{figure.classList.add('photo-missing');const missing=document.createElement('span');missing.textContent='Изображение недоступно';figure.append(missing);}
 const content=document.createElement('div');content.className='detail-content';
 const area=document.createElement('span');area.className='micro';area.textContent=place.area;
 const title=document.createElement('h2');title.textContent=place.fullName;
 const meta=document.createElement('div');meta.className='detail-meta';meta.innerHTML=`${icon('tower')}<span></span>`;meta.querySelector('span').textContent=place.kind;
 const note=document.createElement('p');note.className='detail-note';note.textContent='Точка на карте приблизительная. Иллюстрация создана ИИ. ';
 const source=document.createElement('a');source.href=place.source;source.textContent='Сведения об объекте';source.rel='noreferrer';source.target='_blank';note.append(source);
 const showMap=document.createElement('button');showMap.type='button';showMap.className='detail-map-action';showMap.id='show-place-map';showMap.innerHTML=`<span>Показать на карте</span>${icon('arrow')}`;showMap.addEventListener('click',()=>{setSheet('peek');atlas?.focusSite(place.id,{focus:true,padding:lastViewport?.padding});scheduleViewport();});
 content.append(area,title,meta,note,showMap);
 detail.append(toolbar,figure,content);
 detail.scrollTop=0;
 detail.hidden=false;
}

function render(){
 shell.dataset.sheet=state.sheet;
 document.body.dataset.mapLayer=state.layer;
 shell.classList.toggle('map-only',state.mapOnly);
 document.body.classList.toggle('is-exploring',state.introDismissed||state.view!=='overview');
 document.body.classList.toggle('has-place',['place','city','river'].includes(state.view));
 document.querySelectorAll('[data-layer]').forEach(button=>{
  const selected=(state.layer==='sites'&&button.dataset.layer==='sites')||(state.layer!=='sites'&&button.dataset.layer==='groups');
  button.classList.toggle('selected',selected);
  button.setAttribute('aria-pressed',String(selected));
 });
 renderBreadcrumbs();
 renderRows();
 renderPlace();
 if(state.view==='city')renderCity();
 if(state.view==='river')renderCity(rivers.find(item=>item.id===state.riverId),true);
 $('#search').value=state.query;
 const searchActive=state.view==='search';
 $('#search-field').classList.toggle('is-active',searchActive);
 shell.classList.toggle('is-searching',searchActive);
 $('.catalog-heading').hidden=searchActive;
 $('#search-toggle').setAttribute('aria-label',searchActive?'Закрыть поиск':'Поиск по атласу');
 $('#map-only').setAttribute('aria-pressed',String(state.mapOnly));
 $('#map-only').querySelector('span').textContent=state.mapOnly?'Вернуть интерфейс':'Только карта';
 $('#search-toggle').querySelector('span').textContent=searchActive?'Закрыть поиск':'Поиск';
 $('#search-toggle use').setAttribute('href',searchActive?'#i-close':'#i-search');
 const activeTab=state.view==='overview'?'atlas':state.layer==='sites'?'places':'roots';
 document.querySelectorAll('[data-tab]').forEach(button=>{
  const active=button.dataset.tab===activeTab;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
 $('#sheet-handle').setAttribute('aria-expanded',String(state.sheet!=='peek'));
 $('#pitch-slider').max=String(lastViewport?.mode?.pitchLimit??60);
 if(atlas){atlas.setLayer(state.layer);atlas.setSelection(state.selectedEntity);}
}

function renderCity(city=settlements.find(item=>item.id===state.cityId),isRiver=false){
 if(!city)return;
 const detail=$('#place-detail');detail.replaceChildren();detail.hidden=false;
 $('#explorer').classList.add('has-place');shell.classList.add('has-place');document.body.classList.add('has-place');
 const toolbar=document.createElement('div');toolbar.className='detail-toolbar';
 const back=document.createElement('button');back.type='button';back.className='detail-back';back.textContent='← Назад';back.addEventListener('click',goBack);
 const close=document.createElement('button');close.type='button';close.className='detail-close';close.textContent='Закрыть';close.addEventListener('click',goBack);toolbar.append(back,close);
 const content=document.createElement('div');content.className='detail-content city-content';
 const kicker=document.createElement('span');kicker.className='micro';kicker.textContent=isRiver?'Река':city.settlementType==='village'?'Селение':'Город';
 const title=document.createElement('h2');title.textContent=city.name;
 const coordinates=city.coordinates??city.center;
 const location=document.createElement('p');location.className='detail-meta';location.textContent=`${coordinates[1].toFixed(4)}° с. ш. · ${coordinates[0].toFixed(4)}° в. д.`;
 const source=document.createElement('a');source.href=city.sourceRefs?.[0]??city.source;source.target='_blank';source.rel='noreferrer';source.className='city-source';source.textContent=isRiver?'Источник русла ↗':'Источник координат';
 const create=document.createElement('button');create.type='button';create.className='context-create-tree';create.textContent='Создать родовое древо →';create.addEventListener('click',()=>document.querySelector('#create-tree').click());
 content.append(kicker,title,location,source,create);if(!isRiver){
  const panel=document.createElement('section');
  renderAggregateDashboard({settlement:city,panel});
  content.append(panel);
 }
 detail.append(toolbar,content);detail.scrollTop=0;
}

function focusTarget(id){
 if(!id)return;
 requestAnimationFrame(()=>{
  const target=document.getElementById(id);
  if(target&&!target.hidden&&target.getClientRects().length)target.focus({preventScroll:true});
  else $('#breadcrumbs').querySelector('button')?.focus({preventScroll:true});
 });
}

function goBack(){
 if((currentEntry?.index??0)>0){history.back();return;}
 if(state.view==='place'){
  const group=sites.find(item=>item.id===state.placeId)?.group;
  route(group?{type:'SELECT_GROUP',id:group}:{type:'SET_LAYER',layer:'sites'},{replace:true});
  return;
 }
 if(state.view==='teip'){route({type:'GO_TO_GROUP',id:state.groupId},{replace:true});return;}
 if(state.view==='group'){route({type:'GO_TO_GROUP',id:null},{replace:true});return;}
 route({type:'GO_HOME'},{replace:true});
}

function captureHistoryTarget(returnFocusId){
 saveViewState();
 const index=(currentEntry?.index??0)+1;
 currentEntry=makeEntry(state,index,returnFocusId);
}

function restoreFromHistory(entry,{preserveCamera=false,returnFocusId=null}={}){
 if(!entry?.state){stateTransitionFromHash();return;}
 Object.assign(state,restoreEntry(entry.state));
 currentEntry=entry;
 render();
 atlas?.setLayer(state.layer);
 atlas?.setSelection(state.selectedEntity);
 if(!preserveCamera&&entry.camera)atlas?.restoreCamera(entry.camera,lastViewport?.padding);
 else if(preserveCamera)saveViewState();
 synchronizeAtlas();
 focusTarget(returnFocusId??entry.returnFocusId);
 scheduleViewport();
}

function stateTransitionFromHash(){
 Object.assign(state,routeState(location.hash));
 render();
 synchronizeAtlas({type:state.view==='group'?'SELECT_GROUP':state.view==='place'?'SELECT_PLACE':'RESTORE_ENTRY'});
 scheduleViewport();
}

window.addEventListener('popstate',event=>{
 clearFamilyMarkers();
 const outgoing=currentEntry;
 const entry=event.state?.atlasEntry;
 const backwards=entry&&outgoing&&entry.index<outgoing.index;
 const preserveCamera=Boolean(backwards&&outgoing.state?.view==='place'&&outgoing.manuallyMoved);
 restoreFromHistory(entry,{preserveCamera,returnFocusId:backwards?outgoing.returnFocusId:null});
});

function openPhoto(){
 const place=sites.find(item=>item.id===state.placeId);
 const media=getPlaceMedia(place?.id);
 if(!place||!media)return;
 const image=$('#photo-view-image');
 $('#photo-view-source').srcset=media.full??'';
 image.src=imageFor(media);
 image.alt=media.alt;
 image.width=media.width??1536;
 image.height=media.height??1024;
 $('#photo-view-caption').textContent=place.fullName+' · Иллюстрация, созданная ИИ';
 $('#photo-dialog').dataset.placeId=place.id;
 $('#photo-dialog').showModal();
 $('#photo-close').focus();
}

function updateLayout(){
 measureFrame=0;
 const previousPanel=lastViewport?.mode?.panel??null;
 const mapElement=$('#map');
 const mapSize={width:mapElement.clientWidth,height:mapElement.clientHeight};
 const mode=computeLayoutMode(mapSize);
 const mapResized=lastMapSize&&(Math.abs(mapSize.width-lastMapSize.width)>1||Math.abs(mapSize.height-lastMapSize.height)>1);
 lastMapSize=mapSize;
 const visual=window.visualViewport;
 const elements=[$('#topbar'),$('#intro'),$('#overview-group-dock'),$('#explorer'),$('#camera-rail'),$('#map-topline'),$('#featured-place'),$('#view-menu').hidden?null:$('#view-menu')].filter(element=>{
  if(!element||element.hidden)return false;
  if(element.id==='camera-rail'&&state.view==='overview'&&mode.panel==='bottom')return false;
  const style=getComputedStyle(element),rect=element.getBoundingClientRect();
  return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&rect.width>0&&rect.height>0;
 });
 let measured=measureViewport({mapElement,occupiedElements:elements,visualViewport:visual,windowRef:window,documentRef:document});
 shell.classList.toggle('compact-map',measured.compactRequired);
 if(measured.compactRequired){
  measured=measureViewport({mapElement,occupiedElements:elements,visualViewport:visual,windowRef:window,documentRef:document});
 }
 lastViewport=measured;
 atlas?.setLabelOcclusion(elements.map(element=>{
  const rect=element.getBoundingClientRect();
  return {left:rect.left-8,top:rect.top-8,right:rect.right+8,bottom:rect.bottom+8};
 }));
 shell.dataset.layout=measured.mode.panel;
 $('#pitch-slider').max=String(measured.mode.pitchLimit);
 atlas?.setPitchLimit(measured.mode.pitchLimit);
 const pitch=Math.round(Math.min(atlas?.getPitch?.()??Number($('#pitch-slider').value),measured.mode.pitchLimit));
 $('#pitch-slider').value=String(pitch);
 $('#pitch-value').textContent=`${pitch}°`;
 atlas?.setPadding(measured.padding);
 if(atlas?.isReady?.()){
  atlas.resize();
  const viewportChanged=Boolean(mapResized||previousPanel&&previousPanel!==measured.mode.panel);
  if(viewportChanged&&!currentEntry?.manuallyMoved){
   if(state.view==='overview')atlas.home(measured.padding);
   else if(state.view==='river'&&state.riverId&&measured.mode.panel==='side')atlas.focusRiver(state.riverId,{focus:true,padding:measured.padding});
   else if(state.view==='city'&&state.cityId&&measured.mode.panel==='side')atlas.focusCity(state.cityId,{focus:true,padding:measured.padding});
   else if(state.view==='place'&&state.placeId&&measured.mode.panel==='side')atlas.focusSite(state.placeId,{focus:true,padding:measured.padding});
   else if(['group','teip'].includes(state.view)&&state.groupId&&measured.mode.panel==='side')atlas.setGroup(state.groupId,{focus:true,padding:measured.padding});
  }
 }
}

function scheduleViewport(){
 if(measureFrame)return;
 measureFrame=requestAnimationFrame(updateLayout);
}

function homeAfterViewportMeasure(){
 scheduleViewport();
 requestAnimationFrame(()=>atlas?.home(lastViewport?.padding));
}

function openSearch(triggerId=document.activeElement?.id){
 if($('#explorer').classList.contains('catalog-collapsed'))$('#catalog-toggle').click();
 if(state.view==='search'){$('#search').focus();return;}
 route({type:'OPEN_SEARCH'},{
  returnFocusId:triggerId==='search'?'catalog-label':triggerId||'search-toggle',
  afterRender:()=>{
   if(sheetGeometry().panel==='bottom')setSheet('full');
   $('#search').focus();
  },
 });
}

function openGroup(id,{focusTargetId=null}={}){
 if(!groups.some(group=>group.id===id))return;
 const sheet=lastViewport?.mode?.panel==='bottom'?'half':state.sheet;
 route({type:'SELECT_GROUP',id,sheet},{returnFocusId:focusTargetId??`catalog-row-${id}`});
}

function openSite(id,{focusTargetId=null}={}){
 if(!sites.some(site=>site.id===id))return;
 if(!$('#exit-family-map').hidden)route({type:'EXIT_MAP_ONLY'},{replace:true});
 const sheet=lastViewport?.mode?.panel==='bottom'?'full':state.sheet;
 route({type:'SELECT_PLACE',id,sheet},{returnFocusId:focusTargetId??`catalog-row-${id}`});
}

function openCity(id){
 if(!settlements.some(city=>city.id===id))return;
 if(!$('#exit-family-map').hidden)route({type:'EXIT_MAP_ONLY'},{replace:true});
 route({type:'SELECT_CITY',id,sheet:lastViewport?.mode?.panel==='bottom'?'half':state.sheet});
}

function applyPitch(value){
 const next=atlas?.setPitch(Number(value));
 if(next!==undefined)$('#pitch-value').textContent=`${Math.round(next)}°`;
}

function setAtmosphere(next){
 atmosphereEnabled=Boolean(next)&&!motionPreference.matches;
 atlas?.setAtmosphere(atmosphereEnabled);
 $('#motion-toggle').setAttribute('aria-pressed',String(atmosphereEnabled));
}

async function showFamilyMap(){
 clearFamilyMarkers();
 try {
  const {openFamilyView}=await import('./family-view.mjs?v=3');
  await openFamilyView({dialog:$('#family-map'),
   showMarkers:marks=>{
    if(!atlas){toast('Карта пока недоступна');return;}
    route({type:'ENTER_MAP_ONLY'},{replace:true});
    atlas.setFamilyPlaces(marks);
    $('#exit-family-map').hidden=false;
    const first=marks[0].id;
    if(settlements.some(place=>place.id===first))atlas.focusCity(first);
    else atlas.focusSite(first);
   },
   showPlace:place=>{if(place.coordinates)openCity(place.id);else openSite(place.id);},
   showTeip:(group,teip)=>route({type:'SELECT_TEIP',groupId:group.id,id:teip.id,sheet:'half'})
  });
 }catch{toast('Семейная карта сейчас недоступна');}
}
$('#family-view').addEventListener('click',()=>{
 $('#view-menu').hidden=true;$('#view-toggle').setAttribute('aria-expanded','false');
 void showFamilyMap();
});
function clearFamilyMarkers(){
 if($('#exit-family-map').hidden)return;
 atlas?.setFamilyPlaces(null);$('#exit-family-map').hidden=true;
}
$('#exit-family-map').addEventListener('click',()=>route({type:'GO_HOME'},{replace:true}));
window.addEventListener('pagehide',()=>{
 clearFamilyMarkers();
 if($('#family-map').open)$('#family-map').close();
 $('#family-map .family-places').replaceChildren();
});
const familyEntry=location.hash==='#/family';
$('#brand-home').addEventListener('click',()=>route({type:'GO_HOME'},{replace:true}));
$('#return-chechnya').addEventListener('click',()=>route({type:'GO_HOME'},{replace:true}));
$('#world-view').addEventListener('click',()=>{if(currentEntry)currentEntry.manuallyMoved=true;$('#view-menu').hidden=true;$('#view-toggle').setAttribute('aria-expanded','false');scheduleViewport();requestAnimationFrame(()=>atlas?.goWorld());});
$('#search-toggle').addEventListener('click',()=>state.view==='search'?goBack():openSearch('search-toggle'));
$('#search').addEventListener('focus',()=>{if(state.view!=='search')openSearch();});
$('#search').addEventListener('input',event=>route({type:'SET_QUERY',query:event.target.value},{replace:true}));
$('#search').addEventListener('keydown',event=>{
 if(event.isComposing||!['Enter','ArrowDown'].includes(event.key))return;
 const first=$('#search-results .search-result');
 if(!first)return;
 event.preventDefault();
 if(event.key==='Enter')first.click();
 else first.focus();
});
$('#sheet-handle').addEventListener('click',()=>{});
$('#catalog-return').addEventListener('click',goBack);
$('#catalog-toggle').addEventListener('click',event=>{
 const collapsed=$('#explorer').classList.toggle('catalog-collapsed');
 event.currentTarget.setAttribute('aria-expanded',String(!collapsed));
 event.currentTarget.setAttribute('aria-label',collapsed?'Развернуть каталог':'Свернуть каталог');
 event.currentTarget.querySelector('span').textContent=collapsed?'+':'−';
 scheduleViewport();
});
$('#catalog-back').addEventListener('click',()=>{
 if(state.view==='group'&&currentGroup()?.teips.length===0){goBack();return;}
 route({type:'GO_TO_GROUP',id:state.groupId},{returnFocusId:`catalog-row-${state.groupId}`});
});
document.querySelectorAll('[data-layer]').forEach(button=>button.addEventListener('click',()=>{
 const selected=button.dataset.layer;
 route({type:'SET_LAYER',layer:selected},{replace:true});
}));
for(const button of document.querySelectorAll('[data-tab=roots],[data-tab=places]')){
 button.addEventListener('click',()=>{
  const roots=button.dataset.tab==='roots';
  if($('#explorer').classList.contains('catalog-collapsed'))$('#catalog-toggle').click();
  if(state.view===(roots?'explore':'places'))return;
  route(roots?{type:'DISMISS_INTRO'}:{type:'SET_LAYER',layer:'sites'},{
   returnFocusId:button.id||null,
   afterRender:()=>{
    if(sheetGeometry().panel==='bottom')setSheet('half');
    focusTarget('catalog-label');
   },
  });
 });
}
document.querySelector('[data-tab=atlas]').addEventListener('click',()=>route({type:'GO_HOME'},{replace:true}));
$('#featured-place').addEventListener('click',()=>openSite('ushkaloi',{focusTargetId:'featured-place'}));
$('#reset-north').addEventListener('click',()=>atlas?.resetNorth());
$('#zoom-in').addEventListener('click',()=>atlas?.zoom(1));
$('#zoom-out').addEventListener('click',()=>atlas?.zoom(-1));
$('#rotate-left').addEventListener('click',()=>atlas?.rotateBy(-15));
$('#rotate-right').addEventListener('click',()=>atlas?.rotateBy(15));
$('#home-view').addEventListener('click',()=>{
 if(currentEntry)currentEntry.manuallyMoved=false;
 $('#view-menu').hidden=true;
 $('#view-toggle').setAttribute('aria-expanded','false');
 homeAfterViewportMeasure();
});
$('#view-toggle').addEventListener('click',event=>{
 const menu=$('#view-menu');menu.hidden=!menu.hidden;event.currentTarget.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)$('#view-close').focus();scheduleViewport();
});
$('#view-close').addEventListener('click',()=>{$('#view-menu').hidden=true;$('#view-toggle').setAttribute('aria-expanded','false');$('#view-toggle').focus();scheduleViewport();});
$('#pitch-slider').addEventListener('input',event=>applyPitch(event.target.value));
$('#terrain-toggle').addEventListener('click',event=>{
 const enabled=atlas?.toggleTerrain()??false;
 event.currentTarget.setAttribute('aria-pressed',String(enabled));
 $('#pitch-slider').value=String(Math.round(atlas?.getPitch?.()??0));
 $('#pitch-value').textContent=`${Math.round(atlas?.getPitch?.()??0)}°`;
});
$('#motion-toggle').addEventListener('click',()=>setAtmosphere(!atmosphereEnabled));
$('#sound-toggle').addEventListener('click',async event=>{
 const button=event.currentTarget;
 button.disabled=true;
 try{button.setAttribute('aria-pressed',String(await windAmbience.setEnabled(!windAmbience.isEnabled())));}
 catch{toast('Звук недоступен в этом браузере');}
 finally{button.disabled=false;}
});
$('#map-only').addEventListener('click',()=>{
 route({type:state.mapOnly?'EXIT_MAP_ONLY':'ENTER_MAP_ONLY'},{replace:true});
 $('#view-menu').hidden=false;$('#view-toggle').setAttribute('aria-expanded','true');scheduleViewport();
});
$('#about').addEventListener('click',()=>{
 $('#dialog-content').innerHTML='<h2>О Древе</h2><p>Семьи собирают родословные в редакторе. В атласе можно найти тейп, увидеть рельеф и открыть карточку исторического места. Каталог неполный, классификация тейпов предварительная.</p><div class="dialog-list"><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Высоты местности<small>Локальная ограниченная копия Terrain Tiles</small></a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Граница региона<small>© OpenStreetMap contributors</small></a></div>';
 $('#info-dialog').showModal();
});
$('#info-dialog .dialog-close').addEventListener('click',()=>$('#info-dialog').close());
$('#photo-close').addEventListener('click',()=>$('#photo-dialog').close());
$('#info-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close();});
$('#photo-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close();});
$('#photo-dialog').addEventListener('close',()=>focusTarget('show-place-map'));
$('#info-dialog').addEventListener('close',()=>focusTarget('about'));
document.addEventListener('keydown',event=>{
 if(document.querySelector('dialog[open]'))return;
 if(event.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();openSearch();}
 if(event.key==='Escape'){
  if($('#photo-dialog').open||$('#info-dialog').open)return;
  if(!$('#view-menu').hidden){$('#view-menu').hidden=true;$('#view-toggle').setAttribute('aria-expanded','false');scheduleViewport();return;}
  if(state.view==='search'){if((currentEntry?.index??0)>0)history.back();else route({type:'CLOSE_SEARCH'},{replace:true});return;}
  if(['place','city','river','teip','group'].includes(state.view)){goBack();return;}
  if(state.mapOnly){route({type:'EXIT_MAP_ONLY'},{replace:true});return;}
 }
});

const sheetGeometry=()=>{
 const style=getComputedStyle(document.documentElement);
 const safeInsets={top:parseFloat(style.getPropertyValue('--safe-inset-top'))||0,bottom:parseFloat(style.getPropertyValue('--safe-inset-bottom'))||0};
 return {panel:lastViewport?.mode?.panel??computeLayoutMode({width:innerWidth,height:innerHeight}).panel,safeInsets};
};
sheetController=createBottomSheet({shell,panel:$('#explorer'),handle:$('#sheet-handle'),getLayout:sheetGeometry,onSnap:setSheet});

window.addEventListener('resize',scheduleViewport,{passive:true});
window.visualViewport?.addEventListener('resize',scheduleViewport,{passive:true});
document.addEventListener('visibilitychange',()=>atlas?.setPageVisible(!document.hidden));
motionPreference.addEventListener('change',event=>{setAtmosphere(!event.matches);});

Object.assign(state,routeState(location.hash));
currentEntry=makeEntry(state,0,null);
if(familyEntry)void showFamilyMap();
history.replaceState({...history.state,atlasEntry:currentEntry},'',currentRoute());
render();
scheduleViewport();

fetch('./data/public-summary.json',{cache:'no-cache'}).then(response=>{
 if(!response.ok)throw new Error('summary unavailable');
 return response.json();
}).then(summary=>{
 if(summary.version!==1 || !summary.scopes)return;
 publicSummary=summary;
 if(state.view==='city')renderCity();
 if(['overview','explore','group','teip'].includes(state.view))renderAggregateDashboard({group:currentGroup(),teip:currentTeip()});
}).catch(()=>{});

try{
 const {createAtlas}=await import('./map.mjs?v=family-2');
 atlas=await createAtlas({
  onHome:()=>route({type:'GO_HOME'},{replace:true}),
  onGroup:id=>openGroup(id),
  onSite:id=>openSite(id),
  onCity:id=>openCity(id),
  onRiver:id=>route({type:'SELECT_RIVER',id,sheet:lastViewport?.mode?.panel==='bottom'?'half':state.sheet}),
  onStatus:setMapStatus,
  onCameraInput:()=>{
   currentEntry&&(currentEntry.manuallyMoved=true);
   saveViewState();
  },
  onCameraSettled:()=>{
   saveViewState();
   if(atlas){const pitch=Math.round(atlas.getPitch());$('#pitch-slider').value=String(pitch);$('#pitch-value').textContent=`${pitch}°`;}
  },
  onResize:scheduleViewport,
 });
 atlas.setAtmosphere(atmosphereEnabled);
 atlas.ready.then(()=>{
  atlas.setLayer(state.layer);atlas.setSelection(state.selectedEntity);
  scheduleViewport();
  requestAnimationFrame(()=>{
  if(state.view==='group'&&state.groupId)atlas.setGroup(state.groupId,{focus:true,padding:lastViewport?.padding});
  else if(state.view==='river'&&state.riverId)atlas.focusRiver(state.riverId,{focus:lastViewport?.mode?.panel==='side',padding:lastViewport?.padding});
  else if(state.view==='city'&&state.cityId)atlas.focusCity(state.cityId,{focus:lastViewport?.mode?.panel==='side',padding:lastViewport?.padding});
  else if(state.view==='place'&&state.placeId){atlas.focusSite(state.placeId,{focus:lastViewport?.mode?.panel==='side',padding:lastViewport?.padding});if(lastViewport?.mode?.panel==='bottom')setSheet('full');}
  else if(state.view==='teip'&&state.groupId)atlas.setGroup(state.groupId,{focus:false});
  if(state.view==='overview'&&!currentEntry?.manuallyMoved)homeAfterViewportMeasure();
  else scheduleViewport();
  });
 });
}catch(error){
 console.error('Atlas initialization failed',error);
 setMapStatus('unavailable');
 $('#map').style.background='url(./assets/relief-overview.webp) center/cover';
}

document.addEventListener('visibilitychange',()=>{if(!document.hidden)saveViewState();});
