import { ProductOfferSchema, type ProductOffer } from '@moneyback/contracts';

/** Errors deliberately exclude request URLs and provider bodies (which may contain credentials). */
export class SerpApiError extends Error {
  constructor(readonly code: string, readonly statusCode?: number) { super(code); this.name = 'SerpApiError'; }
}
export interface StoreQuote { source: 'SERPAPI'; retailerName: string; productUrl: string; priceCents: number; shippingCents: number; inStock: true; observedAt: string }
export class SerpApiAdapter {
  constructor(private readonly options: {apiKey: string; fetchImpl?: typeof fetch; now?: () => Date}) {
    if (!options.apiKey.trim()) throw new SerpApiError('SERPAPI_NOT_CONFIGURED');
  }
  private async request(params: Record<string,string>): Promise<Record<string,unknown>> {
    const url=new URL('https://serpapi.com/search.json');
    for(const [key,value] of Object.entries({...params,api_key:this.options.apiKey}))url.searchParams.set(key,value);
    try{
      const response=await(this.options.fetchImpl??fetch)(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!response.ok){await response.body?.cancel().catch(()=>undefined);throw new SerpApiError(response.status===401||response.status===403?'SERPAPI_UNAUTHORIZED':response.status===429?'SERPAPI_RATE_LIMITED':'SERPAPI_UPSTREAM_ERROR',response.status);}
      const body:unknown=await response.json();
      if(!body||typeof body!=='object'||Array.isArray(body))throw new SerpApiError('SERPAPI_INVALID_RESPONSE');
      const data=body as Record<string,unknown>;if(data.error)throw new SerpApiError('SERPAPI_PROVIDER_ERROR');return data;
    }catch(error){if(error instanceof SerpApiError)throw error;throw new SerpApiError('SERPAPI_NETWORK_OR_RESPONSE_ERROR');}
  }
  /** Product-level quotes remain separate evidence; search titles alone never establish identity. */
  async getStoreQuotes(query:string,model:string,maxCandidates=3):Promise<StoreQuote[]> {
    if(!query.trim()||query.length>300||!model.trim()||!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>3)throw new SerpApiError('SERPAPI_INVALID_QUERY');
    const search=await this.request({engine:'google_shopping',q:query,gl:'us',hl:'en'});
    if(!Array.isArray(search.shopping_results))return [];
    const normalized=model.toUpperCase().replace(/[^A-Z0-9]/g,'');
    const candidates=search.shopping_results.filter((row:Record<string,unknown>)=>row&&typeof row==='object'&&typeof row.immersive_product_page_token==='string'&&!row.second_hand_condition);
    const rank=(row:Record<string,unknown>)=>Number(/walmart|amazon/i.test(String(row.source)))*10+Number(String(row.title).toUpperCase().replace(/[^A-Z0-9]/g,'').includes(normalized));
    candidates.sort((a:Record<string,unknown>,b:Record<string,unknown>)=>rank(b)-rank(a));
    const quotes:StoreQuote[]=[];
    for(const candidate of candidates.slice(0,maxCandidates)){
    const details=await this.request({engine:'google_product',page_token:candidate.immersive_product_page_token,gl:'us',hl:'en'});
    const product=details.product_results as {stores?:unknown[]}|undefined;
    if(!Array.isArray(product?.stores))continue;
    const observedAt=quoteTimestamp(details.search_metadata,(this.options.now??(()=>new Date()))());if(!observedAt)continue;
    for(const value of product.stores){
      if(!value||typeof value!=='object')continue;const row=value as Record<string,unknown>;
      const price=usdCents(row.price,row.extracted_price);
      const shipping=typeof row.shipping==='string'&&/^free$/i.test(row.shipping)?0:usdCents(typeof row.shipping==='string'?row.shipping.replace(/^\+\s*/, ''):null,row.shipping_extracted);
      if(price===null||shipping===null||typeof row.name!=='string'||!Array.isArray(row.details_and_offers)||!row.details_and_offers.some(s=>typeof s==='string'&&/^in stock(?: online)?$/i.test(s)))continue;
      try{const url=new URL(String(row.link));if(url.protocol!=='https:'||url.username||url.password||!['walmart.com','www.walmart.com','amazon.com','www.amazon.com'].includes(url.hostname))continue;
        quotes.push({source:'SERPAPI',retailerName:row.name,productUrl:url.toString(),priceCents:price,shippingCents:shipping,inStock:true,observedAt});
      }catch{continue;}
    }
    }
    return quotes;
  }

  async searchOffers(query: string, limit = 5): Promise<ProductOffer[]> {
    if (!query.trim() || query.length > 300 || !Number.isInteger(limit) || limit < 1 || limit > 20) throw new SerpApiError('SERPAPI_INVALID_QUERY');
    const data = await this.request({engine:'google_shopping',q:query,gl:'us',hl:'en'});
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

function usdCents(formatted:unknown,extracted:unknown):number|null {
 if(typeof formatted!=='string'||!/^\$[\d,]+(?:\.\d{1,2})?$/.test(formatted)||typeof extracted!=='number')return null;
 const cents=Math.round(extracted*100);return Number.isSafeInteger(cents)&&cents>=0&&Math.abs(Number(formatted.replace(/[$,]/g,''))*100-cents)<0.001?cents:null;
}

function quoteTimestamp(metadata:unknown,now:Date):string|null {
 const created=metadata&&typeof metadata==='object'?(metadata as Record<string,unknown>).created_at:undefined;
 if(created===undefined)return now.toISOString();
 const time=typeof created==='string'?Date.parse(created):NaN;
 return Number.isFinite(time)&&time<=now.valueOf()+60000&&now.valueOf()-time<=3600000?new Date(time).toISOString():null;
}
