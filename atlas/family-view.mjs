import {groups,settlementsIndex,matchingTeips} from './family-geography.mjs';
import {readFamilySession,verifyFamilySession} from '../drewo/waydean-preview-family-auth.mjs?v=atlas-family-1';

// The handoff contains only catalog identifiers. Names, dates and coordinates of people stay in the editor.
const key = 'drewo-atlas:family-view';
export async function openFamilyView({dialog,showPlace,showTeip,showMarkers}) {
 const list = dialog.querySelector('.family-places');
 const status = dialog.querySelector('[role=status]');
 const form = dialog.querySelector('.family-place-form');
 const select = form.elements.place;
 list.replaceChildren();
 form.hidden = true;
 status.textContent = 'Проверяем семейный вход…';
 if (!dialog.open) dialog.showModal();
 try {
  const data = JSON.parse(sessionStorage.getItem(key) || 'null');
  if (!data || !/^drewo(?:-[a-z0-9-]+)?$/.test(data.dir)) throw new Error('Откройте «Мой род в атласе» из статистики своего древа.');
  const token = readFamilySession(sessionStorage,data.dir);
  if (!token) throw new Error('Для просмотра войдите в семейное древо.');
  await verifyFamilySession({endpoint:window.SUPABASE_CONFIG.publishDrewoUrl,treeDir:data.dir,token});
  if (!dialog.open) return;
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
   for (const mark of data.places || []) {
    const place = settlementsIndex.get(mark.id);
    if (!place) continue;
    const row = document.createElement('div');
    const button = document.createElement('button');
    button.textContent = place.name+' · '+mark.kind;
    button.onclick = () => { dialog.close(); showPlace(place); };
    const remove = document.createElement('button');
    remove.textContent = 'Убрать';
    remove.setAttribute('aria-label','Убрать отметку '+place.name);
    remove.onclick = () => {
     data.places = data.places.filter(item => item !== mark);
     sessionStorage.setItem(key,JSON.stringify(data)); render();
    };
    row.append(button,remove);list.append(row);
   }
   if (data.places?.length) {
    const show = document.createElement('button');
    show.type = 'button'; show.className = 'access-primary'; show.textContent = 'Показать мои места на карте';
    show.onclick = () => { dialog.close(); showMarkers(data.places.map(mark=>mark.id)); };
    list.append(show);
   }
   status.textContent = list.childElementCount ? 'Совпадения по названию тейпа и ваши отметки в этой вкладке.' : 'Добавьте знакомое место. Отметки видны только в этой вкладке.';
  }
  select.replaceChildren(...Array.from(settlementsIndex.values(),place => new Option(place.name,place.id)));
  form.onsubmit = event => {
   event.preventDefault();
   const id = select.value, kind = form.elements.kind.value;
   data.places ||= [];
   if (!data.places.some(mark => mark.id===id && mark.kind===kind)) data.places.push({id,kind});
   sessionStorage.setItem(key,JSON.stringify(data));render();
  };
  form.hidden=false;render();
 } catch(error) {status.textContent=error.message || 'Не удалось открыть семейную карту.';}
}

export function prepareFamilyView(dir, records) {
 const previous = JSON.parse(sessionStorage.getItem(key) || 'null');
 const teips = matchingTeips(records.map(person => person.teip));
 sessionStorage.setItem(key,JSON.stringify({dir,teips,places:previous?.dir===dir?previous.places:[]}));
}
