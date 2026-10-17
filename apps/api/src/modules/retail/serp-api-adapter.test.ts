import {expect,test,vi} from 'vitest';
import {SerpApiAdapter} from './serp-api-adapter.js';
const result={product_id:'123',title:'Watch',source:'Demo Store',price:'$249.99',extracted_price:249.99,product_link:'https://www.google.com/shopping/product/123'};
test('normalizes priced USD listings while retaining unknown eligibility fields',async()=>{
 const fetchImpl=vi.fn<typeof fetch>().mockResolvedValue(Response.json({shopping_results:[result]}));
 const offers=await new SerpApiAdapter({apiKey:'secret',fetchImpl}).searchOffers('Demo DW-1');
 expect(offers).toHaveLength(1);expect(offers[0]).toMatchObject({source:'SERPAPI',priceCents:24999,model:null,inStock:null,shippingCents:null,condition:'UNKNOWN'});
 const url=new URL(String(fetchImpl.mock.calls[0][0]));expect(url.searchParams.get('engine')).toBe('google_shopping');expect(url.searchParams.get('gl')).toBe('us');
});
test('rejects misleading prices and unsafe links without inventing offers',async()=>{
 const fetchImpl=vi.fn<typeof fetch>().mockResolvedValue(Response.json({shopping_results:[{...result,price:'€249.99'},{...result,extracted_price:1},{...result,product_link:'javascript:alert(1)'},{...result,product_link:'https://secret@store.example/item'}]}));
 expect(await new SerpApiAdapter({apiKey:'secret',fetchImpl}).searchOffers('Watch')).toEqual([]);
});
test('provider and network errors never expose secrets or raw response bodies',async()=>{
 for(const response of [Response.json({error:'secret raw body'}),new Response('secret',{status:401})]){
 const adapter=new SerpApiAdapter({apiKey:'secret',fetchImpl:vi.fn<typeof fetch>().mockResolvedValue(response)});
 await expect(adapter.searchOffers('Watch')).rejects.toThrow(/^SERPAPI_/);
 }
 const adapter=new SerpApiAdapter({apiKey:'secret',fetchImpl:vi.fn<typeof fetch>().mockRejectedValue(new Error('https://serpapi.com/?api_key=secret'))});
 await expect(adapter.searchOffers('Watch')).rejects.toThrow('SERPAPI_NETWORK_OR_RESPONSE_ERROR');
});
