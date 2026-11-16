const usableStatuses=new Set(['ready','degraded','unavailable']);

export function completeAtlasEntrance(body,status){
 if(!body?.dataset||body.dataset.atlasEntrance!=='pending'||!usableStatuses.has(status))return false;
 body.dataset.atlasEntrance='revealed';
 return true;
}
