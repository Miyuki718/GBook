import {NextResponse,type NextRequest} from 'next/server';
export function proxy(request:NextRequest){const host=request.headers.get('host')||'',url=new URL(request.url);if(!/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(host)||host.split(':')[1]!==url.port||request.headers.get('sec-fetch-site')==='cross-site')return new NextResponse('仅允许从本机打开 GBook',{status:403});return NextResponse.next();}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
