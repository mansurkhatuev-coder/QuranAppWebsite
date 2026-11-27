import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeFamilyAggregateConsent,
  canPublishAggregateSummary,
  FAMILY_AGGREGATE_POLICY_VERSION,
} from '../../supabase/functions/publish-drewo/family-aggregate-consent.mjs';

test('only an editor can grant an explicit family aggregate attestation',()=>{
 assert.equal(FAMILY_AGGREGATE_POLICY_VERSION,'drewo-family-aggregate-v1');
 assert.equal(authorizeFamilyAggregateConsent({role:'super',treeDir:'drewo-family',decision:'grant',attested:true}).ok,false);
 assert.equal(authorizeFamilyAggregateConsent({role:'editor',treeDir:'drewo-family',decision:'grant'}).status,400);
 assert.equal(authorizeFamilyAggregateConsent({role:'editor',treeDir:'drewo-family',decision:'grant',attested:true}).ok,true);
});

test('an editor can revoke after lock, while a deleted or demo tree cannot manage consent',()=>{
 assert.equal(authorizeFamilyAggregateConsent({role:'editor',treeDir:'drewo-family',locked:true,decision:'grant',attested:true}).status,403);
 assert.equal(authorizeFamilyAggregateConsent({role:'editor',treeDir:'drewo-family',locked:true,decision:'revoke'}).ok,true);
 assert.equal(authorizeFamilyAggregateConsent({role:'editor',treeDir:'drewo-family',deleted:true}).ok,false);
 assert.equal(authorizeFamilyAggregateConsent({role:'editor',treeDir:'drewo-reklama'}).ok,false);
});

test('public aggregates require an explicit flag, matching private repo and GitHub private marker',()=>{
 const base={enabled:'true',configuredRepo:'owner/private-family-data',requestedRepo:'owner/private-family-data',repoIsPrivate:true};
 assert.equal(canPublishAggregateSummary(base),true);
 assert.equal(canPublishAggregateSummary({...base,enabled:'false'}),false);
 assert.equal(canPublishAggregateSummary({...base,configuredRepo:'owner/other'}),false);
 assert.equal(canPublishAggregateSummary({...base,repoIsPrivate:false}),false);
 assert.equal(canPublishAggregateSummary({...base,repoIsPrivate:null}),false);
});
