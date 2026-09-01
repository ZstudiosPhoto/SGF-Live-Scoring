/* SGF Live Scoring - offline support
   Added 2026-09-01 so the app OPENS with no signal.

   Strategy, deliberately chosen to avoid making the "I'm seeing an old
   version" problem worse:
     - the page itself is NETWORK FIRST.  Online, you always get the newest
       deploy; the cache is only ever a fallback when the network fails.
     - the Firebase SDK and fonts are cache first (their URLs are versioned
       and never change).
     - the database and the Apps Script endpoint are never touched.
*/
var CACHE = 'sgf-offline-v1';

var CORE = [
  './',
  './sgf-logo.jpg',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

// Hosts whose responses are safe to keep. Everything else is left alone.
function cacheable(url){
  return url.origin === self.location.origin ||
         url.hostname === 'www.gstatic.com' ||
         url.hostname === 'fonts.googleapis.com' ||
         url.hostname === 'fonts.gstatic.com';
}
// Live data - must ALWAYS go to the network, never be served from a cache.
function liveData(url){
  return url.hostname.indexOf('firebaseio.com') > -1 ||
         url.hostname.indexOf('googleapis.com') > -1 && url.hostname !== 'fonts.googleapis.com' ||
         url.hostname.indexOf('script.google.com') > -1 ||
         url.hostname.indexOf('script.googleusercontent.com') > -1;
}

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // The SDK is fetched best-effort and NOT awaited: a slow or blocked CDN must
      // never hold up activation.  It is picked up by the runtime cache anyway.
      CORE.slice(1).forEach(function(u){ c.add(u).catch(function(){}); });
      return c.add('./').catch(function(){});
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; })
                            .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch(err){ return; }
  if (liveData(url)) return;                 // hands off the database and the sheet push

  var isPage = req.mode === 'navigate' || req.destination === 'document';

  if (isPage) {
    // NETWORK FIRST - a new deploy always wins while there is signal.
    e.respondWith(
      fetch(req).then(function(res){
        if (res && res.status === 200){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put('./', copy); });
        }
        return res;
      }).catch(function(){
        return caches.match('./').then(function(hit){
          return hit || caches.match(req) || Response.error();
        });
      })
    );
    return;
  }

  if (!cacheable(url)) return;

  // CACHE FIRST for versioned assets, refreshed quietly in the background.
  e.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if (res && res.status === 200){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});
