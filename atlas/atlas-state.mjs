export function createInitialState(){
 return {
  view:'overview',groupId:null,teipId:null,placeId:null,cityId:null,riverId:null,
  selectedEntity:null,layer:'groups',catalogMode:'groups',
  query:'',groupFilter:'',sheet:'peek',panelScrollTop:0,introDismissed:false,
  mapOnly:false,searchReturnView:'overview',
 };
}

// One contextual slot. Retained history IDs never decide which panel is visible.
export function contextPanel(state){
 const field={place:'placeId',city:'cityId',river:'riverId',group:'groupId',teip:'teipId'}[state.view];
 const kind=field||['search','places','explore'].includes(state.view)?state.view:'none';
 return {kind,id:field?state[field]??null:null};
}

const validLayers=new Set(['all','groups','sites']);
const validSheets=new Set(['peek','half','full']);
const copy=state=>({...state,selectedEntity:state.selectedEntity?{...state.selectedEntity}:null});

export function transition(state,event){
 const next=copy(state);
 switch(event.type){
  case 'SELECT_RIVER':
   return {...next,view:'river',riverId:event.id,placeId:null,selectedEntity:{type:'river',id:event.id},sheet:validSheets.has(event.sheet)?event.sheet:next.sheet,introDismissed:true};
  case 'SELECT_CITY':
   return {...next,view:'city',cityId:event.id,placeId:null,selectedEntity:{type:'city',id:event.id},sheet:validSheets.has(event.sheet)?event.sheet:next.sheet,introDismissed:true};
  case 'SELECT_GROUP':
   return {...next,view:'group',query:'',groupId:event.id,groupFilter:'',teipId:null,placeId:null,catalogMode:'groups',layer:'groups',selectedEntity:{type:'group',id:event.id},sheet:validSheets.has(event.sheet)?event.sheet:next.sheet,introDismissed:true};
  case 'SELECT_TEIP':
   return {...next,view:'teip',query:'',groupId:event.groupId??next.groupId,teipId:event.id,placeId:null,selectedEntity:(event.groupId??next.groupId)?{type:'group',id:event.groupId??next.groupId}:null,sheet:validSheets.has(event.sheet)?event.sheet:next.sheet,introDismissed:true};
  case 'SELECT_PLACE':
   return {...next,view:'place',placeId:event.id,layer:next.layer==='groups'?'all':next.layer,catalogMode:'groups',selectedEntity:{type:'site',id:event.id},sheet:validSheets.has(event.sheet)?event.sheet:next.sheet,introDismissed:true};
  case 'GO_TO_GROUP':
   return {...next,view:event.id?'group':'explore',query:'',groupId:event.id??null,teipId:null,placeId:null,selectedEntity:event.id?{type:'group',id:event.id}:null,layer:event.id?'groups':'all',catalogMode:'groups',introDismissed:true};
  case 'SET_LAYER':{
   const layer=validLayers.has(event.layer)?event.layer:'all';
   const leavesEntity=layer==='groups'&&['place','city','river','places'].includes(next.view);
   const incompatible=next.selectedEntity&&(layer==='groups'&&next.selectedEntity.type==='site'||layer==='sites'&&next.selectedEntity.type==='group');
   return {...next,view:layer==='sites'?'places':leavesEntity?'explore':next.view,query:layer==='sites'?'':next.query,layer,catalogMode:layer==='sites'?'sites':'groups',groupId:leavesEntity?null:next.groupId,teipId:leavesEntity?null:next.teipId,selectedEntity:incompatible||leavesEntity?null:next.selectedEntity,placeId:layer==='sites'||leavesEntity?null:next.placeId};
  }
  case 'OPEN_SEARCH':
   return {...next,searchReturnView:next.view,view:'search',introDismissed:true};
  case 'SET_QUERY':
   return {...next,query:String(event.query??'')};
  case 'CLOSE_SEARCH':
   return {...next,view:next.searchReturnView==='search'?'explore':next.searchReturnView,query:''};
  case 'SET_SHEET':
   return {...next,sheet:validSheets.has(event.sheet)?event.sheet:next.sheet};
  case 'SET_PANEL_SCROLL':
   return {...next,panelScrollTop:Math.max(0,Number(event.value)||0)};
  case 'DISMISS_INTRO':
   return {...next,introDismissed:true,view:'explore',query:'',groupFilter:'',groupId:null,teipId:null,placeId:null,cityId:null,riverId:null,selectedEntity:null,layer:'groups',catalogMode:'groups'};
  case 'ENTER_MAP_ONLY':
   return {...next,mapOnly:true};
  case 'EXIT_MAP_ONLY':
   return {...next,mapOnly:false};
  case 'GO_HOME':
   return createInitialState();
  case 'RESTORE_ENTRY':
   return restoreEntry(event.entry);
  default:
   return state;
 }
}

export function restoreEntry(entry){
 const source=entry?.state??entry??{};
 const initial=createInitialState();
 const restored={...initial};
 for(const key of Object.keys(initial)){
  if(key in source)restored[key]=source[key];
 }
 restored.selectedEntity=source.selectedEntity?{type:source.selectedEntity.type,id:source.selectedEntity.id}:null;
 return restored;
}
