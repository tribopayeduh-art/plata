/* Localhost: recursos servidos pelo servidor, sem cache privado do GameShell. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await Promise.all(['Entry','General','Entry2','General2'].map(name=>caches.delete(name)));
 await self.clients.claim();
})()));
