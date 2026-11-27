import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOwnerTreeRequest,
  countOwnerTreeBranches,
  createOwnerTree,
  earliestKnownOwnerAncestor,
  maxOwnerTreeDepth,
  normalizeOwnerTreeInput,
  ownerAccountErrorMessage,
  validateOwnerTreeInput,
} from '../../atlas/owner-account.mjs';

const validRequestId = 'b6db56da-1f57-4b39-92a8-29261ed2a840';

test('personal tree can be created without knowing a tukhum or teip', () => {
  const draft = normalizeOwnerTreeInput({ title: '  Семья Хьоти ', firstName: ' Ахмад ' });
  assert.deepEqual(draft, { title: 'Семья Хьоти', firstName: 'Ахмад', groupId: '', teipId: '' });
  assert.equal(validateOwnerTreeInput(draft), null);
  assert.deepEqual(buildOwnerTreeRequest(draft, validRequestId), {
    p_title: 'Семья Хьоти',
    p_first_name: 'Ахмад',
    p_request_id: validRequestId,
    p_atlas_group_id: null,
    p_atlas_teip_id: null,
  });
});

test('catalog origin values must form a valid optional group and teip pair', () => {
  assert.equal(validateOwnerTreeInput({ title: 'Древо', firstName: 'Хьамзат', teipId: 'shatoi-varandoy' }),
    'Сначала выберите тухум или оставьте происхождение пустым.');
  assert.match(validateOwnerTreeInput({ title: 'Древо', firstName: 'Хьамзат', groupId: 'invalid' }), /каталога/);
  assert.equal(validateOwnerTreeInput({ title: 'Древо', firstName: 'Хьамзат', groupId: 'shatoi', teipId: 'varand' }), null);
});

test('owner tree request uses the authenticated one-tree RPC with a stable idempotency key', async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: 'bb4c3040-cc60-4c02-aab7-c470f4ec5a40', error: null }; } };
  const id = await createOwnerTree(client, { title: 'Древо', firstName: 'Ахмад' }, validRequestId);
  assert.equal(id, 'bb4c3040-cc60-4c02-aab7-c470f4ec5a40');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'drewo_plus_create_tree');
  assert.equal(calls[0].args.p_request_id, validRequestId);
});

test('tree quota errors explain that an account already owns its one tree', async () => {
  assert.equal(ownerAccountErrorMessage({ code: '23505' }), 'У этого аккаунта уже есть древо. Откройте его или войдите в другой аккаунт.');
  const client = { rpc: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) };
  await assert.rejects(createOwnerTree(client, { title: 'Древо', firstName: 'Ахмад' }, validRequestId), error => error.code === '23505');
});

test('personal generation depth follows parent links and safely breaks malformed cycles', () => {
  assert.equal(maxOwnerTreeDepth([
    { id: 'a', parent_id: null }, { id: 'b', parent_id: 'a' }, { id: 'c', parent_id: 'b' }, { id: 'd', parent_id: null },
  ]), 3);
  assert.equal(maxOwnerTreeDepth([{ id: 'x', parent_id: 'y' }, { id: 'y', parent_id: 'x' }]), 2);
});

test('personal branch count and earliest known ancestor use only recorded parent and birth data', () => {
  const people = [
    { id: 'root', parent_id: null, name: 'Адам', born: null },
    { id: 'branch-a', parent_id: 'root', name: 'Муса', born: 1820 },
    { id: 'branch-b', parent_id: 'root', name: 'Иса', born: 1800 },
    { id: 'unknown', parent_id: 'branch-a', name: 'Саид', born: null },
  ];
  assert.equal(countOwnerTreeBranches(people), 2);
  assert.deepEqual(earliestKnownOwnerAncestor(people), { id: 'branch-b', name: 'Иса', born: 1800 });
  assert.equal(countOwnerTreeBranches([{ id: 'only-person', parent_id: null }]), 0);
  assert.equal(earliestKnownOwnerAncestor([{ id: 'root', name: 'Адам', born: null }]), null);
});
