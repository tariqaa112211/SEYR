const CACHE='seyr-v18';
self.addEventListener('install',event=>{self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('seyr-')&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(request.mode==='navigate'||url.pathname==='/'||url.pathname.endsWith('.html')){
  event.respondWith((async()=>{try{return await fetch(request,{cache:'no-store'});}catch(error){return await caches.match(request)||new Response('SEYR is offline. Please reconnect and refresh.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}})());
 }
});
