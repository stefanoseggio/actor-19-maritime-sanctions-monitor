// Node.js (CommonJS) example: run the Maritime Sanctions Monitor via the apify-client SDK.
// Install: npm install apify-client
// Usage:   APIFY_TOKEN=your_token node examples/run-actor.js

const { ApifyClient } = require('apify-client');

const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

async function main() {
    const run = await client.actor('dR68wHyuOLS2WEhmo').call({
        maxItems: 100,
        onlyNew: true,
        enrichWithUnConsolidatedList: true,
        programFilter: ['IRAN', 'RUSSIA-EO14024'],
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    for (const item of items) {
        console.log(
            `${item.vesselName} (IMO ${item.imoNumber ?? 'n/a'}) - ${item.event_type} - programs: ${(item.programs || []).join(', ')}`,
        );
    }

    console.log(`Total vessel records: ${items.length}`);
}

main().catch((err) => {
    console.error('Actor run failed:', err);
    process.exit(1);
});
