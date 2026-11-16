import {groups,sites} from './catalog.mjs';

const initialDetails=()=>({name:'',branch:'',placeId:'',placeName:'',note:'',migration:'',archiveNotes:'',visibility:'invite'});
export function createInitialCreateTreeState(){return {open:false,step:'group',selection:{groupId:null,teipId:null},details:initialDetails(),error:null,origins:[],draftReady:false};}

export function validateTreeDetails(details){
 const name=String(details?.name??'').trim();
 if(name.length<2)return 'Укажите название родового древа.';
 if(name.length>100)return 'Название родового древа должно быть не длиннее 100 символов.';
 if(String(details?.branch??'').length>100)return 'Название рода или ветви должно быть не длиннее 100 символов.';
 if(String(details?.note??'').length>1000)return 'Заметка должна быть не длиннее 1000 символов.';
 if(['migration','archiveNotes'].some(key=>String(details?.[key]??'').length>1000))return 'Дополнительные сведения должны быть не длиннее 1000 символов.';
 if(!['invite','link','public'].includes(details?.visibility))return 'Выберите вариант доступа.';
 return null;
}

export function transitionCreateTree(state,event){
 const next={...state,selection:{...state.selection},details:{...state.details},error:null};
 if(event.type==='EDIT_STEP'){
  if(event.step==='group'||event.step==='teip'&&next.selection.groupId||event.step==='details'&&next.selection.teipId)next.step=event.step;
  return next;
 }
 if(event.type==='OPEN'){next.open=true;next.origins=Array.isArray(event.origins)?event.origins:[];next.draftReady=false;
  if(event.groupId){const g=groups.find(x=>x.id===event.groupId);if(!g){next.error='Тухум не найден в каталоге.';next.step='group';return next;} next.selection.groupId=g.id;next.step='teip';}
  if(event.teipId){const g=groups.find(x=>x.id===next.selection.groupId);if(!g?.teips.some(t=>t.id===event.teipId)){next.error='Тейп не относится к выбранному тухуму.';next.step='teip';return next;}next.selection.teipId=event.teipId;next.step='details';}
  return next;
 }
 if(event.type==='CLOSE'){next.open=false;return next;}
 if(event.type==='SELECT_GROUP') {const g=groups.find(x=>x.id===event.id);if(!g){next.error='Тухум не найден в каталоге.';return next;}next.selection={groupId:g.id,teipId:null};next.step='teip';return next;}
 if(event.type==='SELECT_TEIP'){const g=groups.find(x=>x.id===next.selection.groupId);if((event.groupId&&event.groupId!==next.selection.groupId)||!g?.teips.some(t=>t.id===event.id)){next.error='Тейп не относится к выбранному тухуму.';next.step='teip';return next;}next.selection={groupId:g.id,teipId:event.id};next.step='details';return next;}
 if(event.type==='SET_DETAILS'){next.details={...next.details,...event.details};return next;}
 if(event.type==='CONTINUE_DETAILS'){const g=groups.find(x=>x.id===next.selection.groupId);if(!g?.teips.some(t=>t.id===next.selection.teipId)){next.error='Выберите действительные тухум и тейп.';next.step=g?'teip':'group';return next;}const error=validateTreeDetails(next.details);if(error){next.error=error;return next;}next.step='account';return next;}
 if(event.type==='ACCOUNT_PREVIEW_CONFIRMED'){next.step='confirm';return next;}
 if(event.type==='BACK'){next.step=next.step==='teip'?'group':next.step==='details'?'teip':next.step==='account'?'details':next.step==='confirm'?'details':next.step;return next;}
 if(event.type==='PREPARE_DRAFT'){const g=groups.find(x=>x.id===next.selection.groupId);if(!g?.teips.some(t=>t.id===next.selection.teipId)){next.error='Выберите действительные тухум и тейп.';next.step=g?'teip':'group';return next;}const error=validateTreeDetails(next.details);if(error){next.error=error;next.step='details';return next;}next.draftReady=true;next.step='draft';return next;}
 if(event.type==='RESET'){next.step='group';next.selection={groupId:null,teipId:null};next.details=initialDetails();next.draftReady=false;return next;}
 if(event.type==='RESUME')return {...next,open:true};
 return next;
}

export function getCreateTreeContext(state){const group=groups.find(g=>g.id===state.selection.groupId),teip=group?.teips.find(t=>t.id===state.selection.teipId);return {groupId:group?.id??null,teipId:teip?.id??null,groupName:group?.name??'',teipName:teip?.name??'',treeName:state.details.name.trim()};}
export function getPlaceName(id){return sites.find(site=>site.id===id)?.name??'';}
