import { log } from '@crawlee/core';
import { Actor } from 'apify';

import { executeBusinessfinder, MAPS_ACTOR_ID } from './actor.js';
import { createGmailSender } from './gmail.js';
import { InputError } from './input.js';
import { enrichWebsite } from './website.js';

await Actor.init();

async function readAllDatasetItems(datasetId) {
    const dataset = await Actor.openDataset(datasetId);
    const items = [];
    const limit = 1000;
    for (let offset = 0; ; offset += limit) {
        const page = await dataset.getData({ offset, limit, clean: true });
        items.push(...page.items);
        if (page.items.length < limit) break;
    }
    return items;
}

Actor.on('aborting', async () => {
    log.warning('Run is being aborted; stopping promptly.');
    await Actor.exit();
});

try {
    const result = await executeBusinessfinder({
        getInput: () => Actor.getInput(),
        runMaps: async (input) => {
            log.info('Starting Google Maps discovery.', {
                actor: MAPS_ACTOR_ID,
                searchTerms: input.searchStringsArray.length,
                perSearchLimit: input.maxCrawledPlacesPerSearch,
            });
            const run = await Actor.call(MAPS_ACTOR_ID, input);
            return {
                items: await readAllDatasetItems(run.defaultDatasetId),
                runId: run.id,
            };
        },
        enrichWebsite,
        getEmailSender: () => createGmailSender(process.env),
        delay: (milliseconds) =>
            new Promise((resolve) => {
                setTimeout(resolve, milliseconds);
            }),
        pushData: (lead) => Actor.pushData(lead),
        setSummary: (summary) => Actor.setValue('RUN_SUMMARY', summary),
    });
    log.info('Businessfinder completed.', result.summary);
} catch (error) {
    if (error instanceof InputError) {
        log.error('Businessfinder input was rejected.', { code: error.code, message: error.message });
    } else {
        log.exception(error, 'Businessfinder failed.');
    }
    throw error;
} finally {
    await Actor.exit();
}
