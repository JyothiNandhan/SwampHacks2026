import { NextResponse, type NextRequest } from 'next/server';
import { getAuth0 } from './lib/auth0';

export async function middleware(request:NextRequest){
    const auth0=getAuth0();
    if(!auth0){
        if(request.nextUrl.pathname.startsWith('/auth/'))return NextResponse.json({error:{message:'Sign-in is not configured yet. Contact the workspace administrator.'}},{status:503});
        return NextResponse.next();
    }
    const response=await auth0.middleware(request);
    if(request.nextUrl.pathname==='/auth/logout')response.cookies.delete('moneyback_session');
    return response;
}
export const config={runtime:'nodejs',matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
