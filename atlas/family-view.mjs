import {groups,settlementsIndex,matchingTeips,isFamilyPlace} from './family-geography.mjs?v=places-1';
import {readFamilySession} from '../drewo/waydean-preview-family-auth.mjs?v=verified-family-1';
import {callFamilyTreeAction} from '../drewo/waydean-preview-family-api.mjs?v=family-places-1';

// The handoff contains only catalog identifiers. Names, dates and coordinates of people stay in the editor.
const key = 'drewo-atlas:family-view';
const pendingChecks = new WeakMap();
const placeKey = mark => `${mark.id}:${mark.kind}`;
export async function openFamilyView({dialog,showPlace,showTeip,showMarkers}) {
 const check = {};
 pendingChecks.set(dialog,check);
 const isCurrent = () => dialog.open && pendingChecks.get(dialog) === check;
 const list = dialog.querySelector('.family-places');
 const status = dialog.querySelector('[role=status]');
 const form = dialog.querySelector('.family-place-form');
 const select = form.elements.place;
 list.replaceChildren();
 form.hidden = true;
 form.onsubmit = null;
 status.textContent = 'Проверяем семейный вход…';
 if (!dialog.open) dialog.showModal();
 try {
  const data = JSON.parse(sessionStorage.getItem(key) || 'null');
  if (!data || !/^drewo(?:-[a-z0-9-]+)?$/.test(data.dir)) throw new Error('Откройте «Мой род в атласе» из статистики своего древа.');
  const token = readFamilySession(sessionStorage,data.dir);
  if (!token) throw new Error('Для просмотра войдите в семейное древо.');
  const request = payload => callFamilyTreeAction('family-places',payload,{
   endpoint:window.SUPABASE_CONFIG.publishDrewoUrl,treeDir:data.dir,sessionToken:token
  });
  const response = await request({});
  if (!isCurrent()) return;
  let saved = response.places.filter(isFamilyPlace);
  let temporary = Array.isArray(data.places) ? data.places.filter(isFamilyPlace) : [];
  let canEdit = response.canEdit === true;
  let saving = false;
  function disableChanges(disabled) {
   for (const field of form.elements) field.disabled = disabled;
   for (const button of list.querySelectorAll('[data-remove-place]')) button.disabled = disabled;
  }
  async function changePlace(mark,present,onlyHere=false) {
   if (saving || (!onlyHere && !canEdit)) return;
   saving=true;disableChanges(true);
   status.textContent='Сохраняем отметки…';
   try {
    if (!onlyHere) {
     const result=await request({mark:{id:mark.id,kind:mark.kind,present}});
     if (!isCurrent()) return;
     saved=result.places.filter(isFamilyPlace);
     canEdit=result.canEdit===true;
    }
    temporary=temporary.filter(place=>placeKey(place)!==placeKey(mark));
    if (Array.isArray(data.places) && data.places.length!==temporary.length) {
     data.places=temporary;
     try { sessionStorage.setItem(key,JSON.stringify(data)); } catch { /* Browser storage is optional. */ }
    }
    render();
   } catch(error) {
    if (isCurrent()) {
     if (error.code === 'WAYDEAN_FAMILY_AUTH_REQUIRED') {
      saved=[];temporary=[];canEdit=false;
      list.replaceChildren();form.hidden=true;
     }
     status.textContent=error.message || 'Не удалось изменить отметку.';
    }
   } finally {
    if (isCurrent()) {saving=false;disableChanges(false);}
   }
  }
  function render() {
   list.replaceChildren();
   for (const group of groups) {
    for (const teip of group.teips.filter(t => data.teips?.includes(group.id+'/'+t.id))) {
     const button = document.createElement('button');
     button.textContent = teip.name+' · '+group.name;
     button.onclick = () => { dialog.close(); showTeip(group,teip); };
     list.append(button);
    }
   }
   const savedKeys=new Set(saved.map(placeKey));
   const places=[...saved,...temporary.filter(mark=>!savedKeys.has(placeKey(mark)))];
   for (const mark of places) {
    const place = settlementsIndex.get(mark.id);
    const onlyHere=!savedKeys.has(placeKey(mark));
    const row = document.createElement('div');
    const button = document.createElement('button');
    button.textContent = place.name+' · '+mark.kind+(onlyHere?' · В этой вкладке':'');
    button.onclick = () => { dialog.close(); showPlace(place); };
    const remove = document.createElement('button');
    remove.textContent = 'Убрать';
    remove.setAttribute('aria-label',`Убрать отметку ${place.name} · ${mark.kind}`);
    remove.dataset.removePlace='';
    remove.onclick = () => void changePlace(mark,false,onlyHere);
    row.append(button);
    if (canEdit || onlyHere) row.append(remove);
    list.append(row);
   }
   if (places.length) {
    const show = document.createElement('button');
    show.type = 'button'; show.className = 'access-primary'; show.textContent = 'Показать мои места на карте';
    show.onclick = () => { dialog.close(); showMarkers(places); };
    list.append(show);
   }
   form.hidden=!canEdit;
   status.textContent = canEdit
    ? (places.length ? 'Отметки доступны вашей семье после входа.' : 'Добавьте знакомое место. Отметки доступны вашей семье после входа.')
    : 'Семейные отметки доступны для просмотра.';
  }
  select.replaceChildren(...Array.from(settlementsIndex.values(),place => new Option(place.name,place.id)));
  form.onsubmit = event => {
   event.preventDefault();
   void changePlace({id:select.value,kind:form.elements.kind.value},true);
  };
  disableChanges(false);render();
 } catch(error) {
  if (isCurrent()) status.textContent=error.message || 'Не удалось открыть семейную карту.';
 }
}

export function prepareFamilyView(dir, records) {
 const previous = JSON.parse(sessionStorage.getItem(key) || 'null');
 const teips = matchingTeips(records.map(person => person.teip));
 sessionStorage.setItem(key,JSON.stringify({dir,teips,places:previous?.dir===dir?previous.places:[]}));
}
