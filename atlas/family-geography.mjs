import {groups,sites} from './catalog.mjs';
import {settlements} from './settlements.mjs';

export {groups};
export const settlementsIndex = new Map([...settlements,...sites].map(place=>[place.id,place]));
export function matchingTeips(names) {
 const normalize = value => String(value || '').trim().toLocaleLowerCase('ru');
 const present = new Set(names.map(normalize).filter(Boolean));
 return groups.flatMap(group => group.teips.filter(teip => present.has(normalize(teip.name))).map(teip => group.id+'/'+teip.id));
}
