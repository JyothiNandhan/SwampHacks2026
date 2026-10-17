import { ProductOfferSchema, type ProductOffer } from '@moneyback/contracts';

/** Errors deliberately exclude request URLs and provider bodies (which may contain credentials). */
export class SerpApiError extends Error {
  constructor(readonly code: string, readonly statusCode?: number) { super(code); this.name = 'SerpApiError'; }
}
export class SerpApiAdapter {
  constructor(private readonly options: {apiKey: string; fetchImpl?: typeof fetch; now?: () => Date}) {
    if (!options.apiKey.trim()) throw new SerpApiError('SERPAPI_NOT_CONFIGURED');
  }
  async searchOffers(query: string, limit = 5): Promise<ProductOffer[]> {
    if (!query.trim() || query.length > 300 || !Number.isInteger(limit) || limit < 1 || limit > 20) throw new SerpApiError('SERPAPI_INVALID_QUERY');
    const url = new URL('https://serpapi.com/search.json');
    for (const [key,value] of Object.entries({engine:'google_shopping',q:query,gl:'us',hl:'en',api_key:this.options.apiKey})) url.searchParams.set(key,value);
    let body: unknown;
    try {
      const response = await (this.options.fetchImpl ?? fetch)(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
      if (!response.ok) { await response.body?.cancel().catch(()=>undefined); throw new SerpApiError(response.status===401||response.status===403?'SERPAPI_UNAUTHORIZED':response.status===429?'SERPAPI_RATE_LIMITED':'SERPAPI_UPSTREAM_ERROR',response.status); }
      body = await response.json();
    } catch (error) { if (error instanceof SerpApiError) throw error; throw new SerpApiError('SERPAPI_NETWORK_OR_RESPONSE_ERROR'); }
    if (!body || typeof body!=='object') throw new SerpApiError('SERPAPI_INVALID_RESPONSE');
    const data = body as Record<string,unknown>;
    if (data.error) throw new SerpApiError('SERPAPI_PROVIDER_ERROR');
    if (!Array.isArray(data.shopping_results)) {
      if (data.search_information && typeof data.search_information==='object' && (data.search_information as Record<string,unknown>).shopping_results_state==='Fully empty') return [];
      throw new SerpApiError('SERPAPI_INVALID_RESPONSE');
    }
    const observedAt = (this.options.now ?? (()=>new Date()))().toISOString();
    const offers: ProductOffer[] = [];
    for (const value of data.shopping_results) {
      if (!value || typeof value!=='object') continue;
      const row=value as Record<string,unknown>;
      // Search listings do not prove model identity, stock, condition or shipping cost.
      // Keep unknowns explicit so these observations cannot automatically create savings.
      if (typeof row.price!=='string'||!/^\$[\d,]+(?:\.\d{1,2})?$/.test(row.price)||typeof row.extracted_price!=='number') continue;
      const cents=Math.round(row.extracted_price*100);
      if (!Number.isSafeInteger(cents)||cents<0||Math.abs(Number(row.price.replace(/[$,]/g,''))*100-cents)>0.001) continue;
      let productUrl: string;
      try {const parsed=new URL(String(row.product_link??row.link));if(parsed.protocol!=='https:'||parsed.username||parsed.password||['localhost','127.0.0.1','::1'].includes(parsed.hostname))continue;productUrl=parsed.toString();}catch{continue;}
      const parsed=ProductOfferSchema.safeParse({id:`serpapi:${String(row.product_id??row.position??offers.length)}:${observedAt}`,source:'SERPAPI',retailerName:row.source,productName:row.title,sku:null,model:null,gtin:null,condition:'UNKNOWN',priceCents:cents,shippingCents:null,currency:'USD',inStock:null,productUrl,observedAt});
      if (parsed.success) offers.push(parsed.data);
      if (offers.length>=limit) break;
    }
    return offers;
  }
}
