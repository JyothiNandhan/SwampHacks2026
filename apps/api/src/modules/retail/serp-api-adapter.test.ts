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

test('product-level quotes require explicit USD shipping, stock, and a supported retailer URL',async()=>{
 const fetchImpl=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({shopping_results:[{title:'Casio F91W-1',immersive_product_page_token:'token'}]})).mockResolvedValueOnce(Response.json({product_results:{stores:[
  {name:'Walmart',link:'https://www.walmart.com/ip/192953947?selectedSellerId=0',price:'$21.92',extracted_price:21.92,shipping:'+ $6.99',shipping_extracted:6.99,details_and_offers:['In stock online']},
  {name:'Walmart',link:'https://www.walmart.com/ip/999',price:'$21.92',extracted_price:21.92,shipping:'Free on orders over $35',details_and_offers:['In stock online']},
  {name:'Walmart - Marketplace Seller',link:'https://www.walmart.com/ip/192953947?selectedSellerId=123',price:'$21.92',extracted_price:21.92,shipping:'Free',details_and_offers:['In stock online']},
  {name:'Walmart',link:'https://www.walmart.com/ip/192953947',price:'$21.92',extracted_price:21.92,shipping:'Free',details_and_offers:['In stock online']},
  {name:'Untrusted',link:'https://untrusted.example/item',price:'$21.92',extracted_price:21.92,shipping:'Free',details_and_offers:['In stock online']}
 ]}}));
 const quotes=await new SerpApiAdapter({apiKey:'fixture',fetchImpl}).getStoreQuotes('Casio F91W-1','F91W-1');
 expect(quotes).toHaveLength(1);expect(quotes[0]).toMatchObject({source:'SERPAPI',priceCents:2192,shippingCents:699,inStock:true});
 expect(new URL(String(fetchImpl.mock.calls[1][0])).searchParams.get('engine')).toBe('google_product');
});
