import { afterEach, expect, test, vi } from 'vitest';
import { applicationOrigin, auth0Configured, getAuth0 } from './auth0';

afterEach(()=>vi.unstubAllEnvs());
test('keeps the existing dashboard available while Auth0 is unconfigured',()=>{
    for(const name of ['AUTH0_DOMAIN','AUTH0_CLIENT_ID','AUTH0_CLIENT_SECRET','AUTH0_SECRET','AUTH0_AUDIENCE','APP_BASE_URL'])vi.stubEnv(name,'');
    expect(auth0Configured()).toBe(false);expect(getAuth0()).toBeNull();
    vi.stubEnv('AUTH0_DOMAIN','tenant.auth0.com');expect(auth0Configured()).toBe(false);
});
test('uses a configured HTTPS origin and rejects credential URLs or production HTTP',()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('APP_BASE_URL','https://moneybackos.us');
    expect(applicationOrigin()).toBe('https://moneybackos.us');
    for(const value of ['http://moneybackos.us','https://user:secret@moneybackos.us','https://moneybackos.us/path','https://moneybackos.us/?code=secret']){
        vi.stubEnv('APP_BASE_URL',value);expect(()=>applicationOrigin()).toThrow();
    }
    vi.stubEnv('NODE_ENV','development');vi.stubEnv('APP_BASE_URL','http://localhost:3000');expect(applicationOrigin()).toBe('http://localhost:3000');
});
