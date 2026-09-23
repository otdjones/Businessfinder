import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    getActorSchemaValidator,
    getDatasetSchemaValidator,
    getInputSchemaValidator,
    getOutputSchemaValidator,
} from '@apify/json_schemas';

async function readJson(relativePath) {
    return JSON.parse(await readFile(new URL(relativePath, import.meta.url), 'utf8'));
}

for (const [name, relativePath, getValidator] of [
    ['actor', '../.actor/actor.json', getActorSchemaValidator],
    ['input', '../.actor/input_schema.json', getInputSchemaValidator],
    ['output', '../.actor/output_schema.json', getOutputSchemaValidator],
    ['dataset', '../.actor/dataset_schema.json', getDatasetSchemaValidator],
]) {
    test(`${name} schema satisfies the current Apify specification`, async () => {
        const value = await readJson(relativePath);
        const validator = getValidator();
        assert.equal(validator(value), true, JSON.stringify(validator.errors, null, 2));
    });
}
