import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { expect, test } from 'vitest';
import { createAuth0Verifier } from './auth0.js';

test('verifies signed Auth0 API tokens and rejects wrong issuer, audience, expiry and algorithm',async()=>{
  const {publicKey,privateKey}=await generateKeyPair('RS256');
  const keys=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'test',alg:'RS256',use:'sig'}]});
  const verify=createAuth0Verifier('https://tenant.auth0.com/','https://moneyback-api',keys);
  async function sign(issuer:string,audience:string,expiry='2m'){
    return new SignJWT({roles:['admin'],email:'someone@example.com'}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('auth0|test').setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  }
  expect(await verify(await sign('https://tenant.auth0.com/','https://moneyback-api'))).toEqual({issuer:'https://tenant.auth0.com/',subject:'auth0|test'});
  await expect(verify(await sign('https://evil.example/','https://moneyback-api'))).rejects.toMatchObject({statusCode:401});
  await expect(verify(await sign('https://tenant.auth0.com/','client-id'))).rejects.toMatchObject({statusCode:401});
  await expect(verify(await sign('https://tenant.auth0.com/','https://moneyback-api','-1m'))).rejects.toMatchObject({statusCode:401});
  const unsigned=Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:'auth0|test'})).toString('base64url')+'.';
  await expect(verify(unsigned)).rejects.toMatchObject({statusCode:401});
});
