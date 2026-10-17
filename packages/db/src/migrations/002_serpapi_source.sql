ALTER TABLE product_offers DROP CONSTRAINT product_offers_source_check;
ALTER TABLE product_offers ADD CONSTRAINT product_offers_source_check CHECK (source IN ('BEST_BUY','BRIGHT_DATA','SERPAPI','FIXTURE'));
ALTER TABLE price_time_series DROP CONSTRAINT price_time_series_source_check;
ALTER TABLE price_time_series ADD CONSTRAINT price_time_series_source_check CHECK (source IN ('BEST_BUY','BRIGHT_DATA','SERPAPI','FIXTURE'));
