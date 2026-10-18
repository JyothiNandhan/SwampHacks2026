import { cookies } from 'next/headers';
import { accountSession, sessionCookie } from '../../../../lib/account-session';
import { applicationOrigin } from '../../../../lib/auth0';
import { backendOrigin, failure, sameOrigin } from '../../../../lib/backend';

const messages:Record<string,string>={GMAIL_NOT_CONFIGURED:'Gmail connection is not configured yet. Contact the workspace administrator.',GMAIL_RECONNECT_REQUIRED:'Google access expired or was revoked. Disconnect Gmail and connect it again.',GMAIL_CONSENT_REQUIRED:'Allow read-only Gmail access when connecting your account.',INVALID_OAUTH_STATE:'The Gmail connection expired. Start Connect Gmail again.',GMAIL_NOT_CONNECTED:'Connect Gmail first.',EMAIL_HAS_NO_RECEIPT:'No supported receipt was found in that email.',EXTRACTION_PROVIDER_FAILED:'Google connected, but receipt extraction is temporarily unavailable. Try again later.'};
class EmailActionError extends Error {}
async function backend(token:string,path:string,method:string,body?:unknown){
    const response=await fetch(`${backendOrigin()}/api/v1/email/gmail${path}`,{method,headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(60000)});
    const data=await response.json();
    if(!response.ok)throw new EmailActionError(messages[data?.error?.code]??'Gmail could not complete this action. Please try again.');
    if(data?.data?.errorCode)data.data.errorMessage=messages[data.data.errorCode]??'An email could not be imported. Please try again later.';
    return data;
}
type Context={params:Promise<{action:string}>};
export async function GET(request:Request,{params}:Context){
    const {action}=await params;
    if(action==='callback'){
        let origin:string;try{origin=applicationOrigin();}catch{return failure('The application URL is not configured.',503);}
        let result='error';
        try{
            const {token}=await accountSession();const url=new URL(request.url);
            const code=url.searchParams.get('code'),state=url.searchParams.get('state');
            if(token&&code&&code.length<=4096&&state&&/^[A-Za-z0-9_-]{43}$/.test(state)&&!url.searchParams.has('error')){
                await backend(token,'/callback','POST',{code,state});result='connected';
            }
        }catch{/* Never expose OAuth codes, tokens, or provider responses. */}
        return Response.redirect(`${origin}/?gmail=${result}`,303);
    }
    if(action!=='status')return failure('Unknown action.',404);
    try{const {token}=await accountSession();if(!token)return failure('Sign in first.',401);return Response.json(await backend(token,'','GET'),{headers:{'cache-control':'no-store'}});}
    catch(error){return failure(error instanceof EmailActionError?error.message:'Gmail is unavailable. Check your sign-in and try again.',502);}
}
export async function POST(request:Request,{params}:Context){
    if(!sameOrigin(request))return failure('Request origin was not accepted.',403);
    const {action}=await params;if(!['connect','disconnect','import'].includes(action))return failure('Unknown action.',404);
    try{
        const session=await accountSession();if(!session.token)return failure('Sign in first.',401);
        if(action==='connect'){
            applicationOrigin();
            // OAuth returns through a cross-site top-level GET. POST mutations still
            // require an exact Origin, so Lax here supports consent without opening CSRF.
            if(session.method==='token')(await cookies()).set(sessionCookie,session.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:3600});
        }
        const data=await backend(session.token,action==='disconnect'?'':`/${action}`,action==='disconnect'?'DELETE':'POST');
        return Response.json(data,{headers:{'cache-control':'no-store'}});
    }catch(error){return failure(error instanceof EmailActionError?error.message:'Gmail is unavailable. Check your sign-in and try again.',502);}
}
