## Active retail search provider

The backend integration uses `SERPAPI_API_KEY` for SerpApi Google Shopping searches.
`SerpApiAdapter.searchOffers()` returns USD price observations labeled `SERPAPI`.
Search results do not establish exact model identity, condition, stock or shipping;
these unknown fields prevent automatic savings claims. Bright Data refresh remains
available for configured retailer URLs. Apply DB migration 002 before persisting
SerpApi observations. Keep all provider keys on the API server.

The following standalone Best Buy adapter documentation describes legacy code;
`BESTBUY_API_KEY` is no longer read by the active integration.

# Retail adapters (T06 and T10)

This module converts external retailer payloads into the canonical
`ProductOfferSchema`. It does not persist observations or register server routes;
those integrations belong to later tasks and the central server owner.

## Environment

- `BESTBUY_API_KEY`: server-side Best Buy Developer API key.
- `BRIGHTDATA_API_KEY`: server-side Bright Data API key.
- `BRIGHTDATA_AMAZON_DATASET_ID`: configured Amazon product scraper ID.
- `BRIGHTDATA_WALMART_DATASET_ID`: configured Walmart product scraper ID.

Never expose these values to a browser or include credentialed request URLs in logs.

## T06 example

```ts
const bestBuy = new BestBuyAdapter({ apiKey: process.env.BESTBUY_API_KEY ?? '' });
const offer = await bestBuy.getOfferBySku('6577010');
const matches = await bestBuy.searchOffers('smart watch', 10);
```

## T10 example

```ts
const brightData = new BrightDataAdapter({
  apiKey: process.env.BRIGHTDATA_API_KEY ?? '',
  datasetIds: {
    amazon: process.env.BRIGHTDATA_AMAZON_DATASET_ID,
    walmart: process.env.BRIGHTDATA_WALMART_DATASET_ID
  }
});
const offers = await brightData.collectOffers('amazon', [
  'https://www.amazon.com/dp/B0EXAMPLE1'
]);
```

`collectOffers` triggers `POST /datasets/v3/trigger`, polls the returned snapshot
through `GET /datasets/v3/progress/:snapshotId`, and downloads JSON results from
`GET /datasets/v3/snapshot/:snapshotId`. Polling is bounded and failed/canceled
snapshots return sanitized errors.

## Verification

```bash
pnpm --filter @moneyback/api test -- src/modules/retail
pnpm check
```

All automated tests use frozen provider fixtures and mocked HTTP calls. Live provider
testing is deferred until credentials and approved dataset IDs are configured.
