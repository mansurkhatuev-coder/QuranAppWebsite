import {groups,sites} from './catalog.mjs';
import {settlements} from './settlements.mjs';

export {groups};
export const settlementsIndex = new Map([...settlements,...sites].map(place=>[place.id,place]));
const familyPlaceKinds = new Set(['Родное место', 'Место рождения', 'Переселение']);
export function isFamilyPlace(mark) {
 return settlementsIndex.has(mark?.id) && familyPlaceKinds.has(mark.kind);
}
export function matchingTeips(names) {
 const normalize = value => String(value || '').trim().toLocaleLowerCase('ru');
 const present = new Set(names.map(normalize).filter(Boolean));
 return groups.flatMap(group => group.teips.filter(teip => present.has(normalize(teip.name))).map(teip => group.id+'/'+teip.id));
}
