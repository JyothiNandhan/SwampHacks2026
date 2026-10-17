import type {NextConfig} from 'next';
import path from 'node:path';
const config:NextConfig={outputFileTracingRoot:path.resolve(import.meta.dirname,'../..'),poweredByHeader:false,async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Frame-Options',value:'DENY'}]}];}};
export default config;
