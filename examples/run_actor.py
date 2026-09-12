# Python example: run the Maritime Sanctions Monitor via the apify-client SDK.
# Install: pip install apify-client
# Usage:   APIFY_TOKEN=your_token python examples/run_actor.py

import os

from apify_client import ApifyClient

client = ApifyClient(token=os.environ["APIFY_TOKEN"])

run_input = {
    "maxItems": 100,
    "onlyNew": True,
    "enrichWithUnConsolidatedList": True,
    "programFilter": ["IRAN", "RUSSIA-EO14024"],
}

run = client.actor("dR68wHyuOLS2WEhmo").call(run_input=run_input)

items = client.dataset(run["defaultDatasetId"]).list_items().items

for item in items:
    imo = item.get("imoNumber") or "n/a"
    programs = ", ".join(item.get("programs", []))
    print(f"{item['vesselName']} (IMO {imo}) - {item['event_type']} - programs: {programs}")

print(f"Total vessel records: {len(items)}")
