import 'server-only';
import { cookies } from 'next/headers';
import { getAuth0 } from './auth0';

export const sessionCookie='moneyback_session';
export async function accountSession(){
    const auth0=getAuth0();
    const session=await auth0?.getSession();
    if(session){
        const {token}=await auth0!.getAccessToken();
        return {token,method:'auth0' as const};
    }
    return {token:(await cookies()).get(sessionCookie)?.value,method:'token' as const};
}
