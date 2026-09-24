import { log } from '@crawlee/core';
import { Actor } from 'apify';

import { executeBusinessfinder, MAPS_ACTOR_ID } from './actor.js';
import { createEmailDomainVerifier } from './email-verification.js';
import { createGmailSender } from './gmail.js';
import { InputError } from './input.js';
import { renderRunReport } from './report.js';
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
    const verifyContacts = createEmailDomainVerifier();
    const historyStore = await Actor.openKeyValueStore('businessfinder-lead-history');
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
        verifyContacts,
        getEmailSender: () => createGmailSender(process.env),
        delay: (milliseconds) =>
            new Promise((resolve) => {
                setTimeout(resolve, milliseconds);
            }),
        pushData: (lead, qualified) =>
            Actor.pushData(lead, qualified ? 'qualified-lead' : 'unqualified-candidate'),
        getSeenLeadKeys: async (scopeKey) => (await historyStore.getValue(scopeKey)) ?? [],
        rememberSeenLeadKeys: async (scopeKey, keys) => {
            const existing = (await historyStore.getValue(scopeKey)) ?? [];
            const combined = [...new Set([...existing, ...keys])].slice(-50000);
            await historyStore.setValue(scopeKey, combined);
        },
        setSummary: async (summary) => {
            await Actor.setValue('RUN_SUMMARY', summary);
            await Actor.setValue('RUN_REPORT', renderRunReport(summary), {
                contentType: 'text/markdown; charset=utf-8',
            });
        },
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
