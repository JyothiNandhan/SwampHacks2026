import { Auth0Client } from '@auth0/nextjs-auth0/server';

let client:Auth0Client|null=null;
export function auth0Configured(){
    return ['AUTH0_DOMAIN','AUTH0_CLIENT_ID','AUTH0_CLIENT_SECRET','AUTH0_SECRET','AUTH0_AUDIENCE','APP_BASE_URL'].every(name=>!!process.env[name]?.trim());
}
export function applicationOrigin(){
    const url=new URL(process.env.APP_BASE_URL??'');
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&url.protocol==='http:'&&url.hostname==='localhost')))throw new Error('Invalid application origin');
    return url.origin;
}
export function getAuth0(){
    if(!auth0Configured())return null;
    if(!client)client=new Auth0Client({appBaseUrl:applicationOrigin(),authorizationParameters:{audience:process.env.AUTH0_AUDIENCE,scope:'openid profile email offline_access'},enableAccessTokenEndpoint:false});
    return client;
}
