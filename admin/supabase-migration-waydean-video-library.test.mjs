import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./supabase-migration-waydean-video-library.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/apply-waydean-video-library-migration.yml", import.meta.url), "utf8");

test("private video storage has restrictive owner guards even if broad permissive policies exist", () => {
  for (const action of ["read", "upload", "update", "delete"]) {
    const policy = new RegExp(
      "create\\s+policy\\s+\"Waydean video owner " + action + " guard\"\\s+on\\s+storage\\.objects\\s+as\\s+restrictive",
      "i"
    );
    assert.match(migration, policy);
    const name = "create policy \"Waydean video owner " + action + " guard\"";
    const policyStart = migration.toLowerCase().indexOf(name.toLowerCase());
    const policyEnd = migration.indexOf(";", policyStart);
    const body = migration.slice(policyStart, policyEnd + 1);
    assert.match(body, /\bto\s+public\b/i);
    assert.match(body, /bucket_id\s*=\s*'waydean-videos'/i);
    assert.match(body, /foldername\(name\)\)\[1\]\s*=\s*\(select auth\.uid\(\)::text\)/i);
  }
  assert.match(workflow, /public_guard_count/);
  assert.match(workflow, /p\.roles\s*@>\s*ARRAY\['public'\]::name\[\]/);
});
