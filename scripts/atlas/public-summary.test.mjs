import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSummary} from './public-summary.mjs';
const entry = n => ({treeDir:'drewo-'+n,aggregateConsent:true,active:true,groupId:'shatoi',teipId:'varand'});
const tree = async () => ({id:'root',sons:[{id:'child'}]});
test('small cohorts, missing consent, and demo do not publish',async()=>{
 const rows = [1,2,3,4].map(entry);
 rows.push({...entry(5),aggregateConsent:false},{...entry(6),treeDir:'drewo-reklama'});
 assert.deepEqual((await buildSummary(rows,tree)).scopes,{});
});
test('only catalog relations with sufficiently large groups are released',async()=>{
 const rows = [1,2,3,4,5,6].map(entry);
 rows[0].teipId = null;
 const {scopes} = await buildSummary(rows,tree);
 assert.equal(scopes.project.trees,'5–9');
 assert.equal(scopes.project.people,'10–19');
 assert.ok(scopes['group/shatoi']);
 assert.ok(!scopes['teip/shatoi/varand']);
 assert.ok(!JSON.stringify(scopes).includes('drewo-'));
});
