const CACHE_NAME = 'dynmap-tile-cache-v1';
const TILE_PATH_PREFIX = '/tiles/'; // Adjust if your tile URLs have a different base path relative to the domain root

// Install event: Pre-caching can be done here if needed, but for dynamic tiles,
// we'll cache on demand during fetch.
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  // event.waitUntil(caches.open(CACHE_NAME).then(cache => {
  //   // Optional: Pre-cache essential assets like core JS/CSS if desired
  //   // return cache.addAll(['/', '/index.html', '/css/dynmap_style.css', '/js/map.js']);
  // }));
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
});

// Activate event: Clean up old caches.
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        // Tell the active service worker to take control of the page immediately.
        return self.clients.claim();
    })
  );
});

// Fetch event: Intercept requests and apply caching strategy.
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Use Stale-While-Revalidate for map tiles
  if (requestUrl.pathname.startsWith(TILE_PATH_PREFIX)) {
    event.respondWith(handleTileRequest(event));
  } else {
    // For non-tile requests, just fetch from network (or use Cache First if desired)
    // console.log('Service Worker: Passing through non-tile request:', event.request.url);
    event.respondWith(fetch(event.request));
  }
});

// Handles tile requests using Stale-While-Revalidate strategy
async function handleTileRequest(event) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(event.request);

  // Start the network request promise for background revalidation/update
  const networkFetchPromise = fetch(event.request);

  // Use waitUntil to allow the background update to complete independently
  event.waitUntil(
    (async () => {
      try {
        const networkResponse = await networkFetchPromise; // Await the fetch *here* for the background task

        // Check if the fetch was successful (status 200) before trying to cache
        if (networkResponse && networkResponse.status === 200) {
          try {
            // Clone the response before putting it in the cache
            await cache.put(event.request, networkResponse.clone());
            // console.log('Service Worker: Cache updated in background:', event.request.url);
          } catch (cacheError) {
            // Log caching errors but don't let them break the main flow
            console.error('Service Worker: Failed to put item in cache during background update:', event.request.url, cacheError);
          }
        } else if (networkResponse) {
           // Log other statuses received during revalidation but don't cache them
           console.log(`Service Worker: Received status ${networkResponse.status} during revalidation for:`, event.request.url);
           // Optionally handle 404s by removing from cache if desired:
           // if (networkResponse.status === 404) { await cache.delete(event.request); }
        }
      } catch (fetchError) {
        // Log background fetch errors but don't let them break the main flow
        console.warn('Service Worker: Network fetch failed during background revalidation:', event.request.url, fetchError);
      }
    })() // Immediately invoke the async function for waitUntil
  );

  // If cache hit, return the cached response immediately.
  if (cachedResponse) {
    // console.log('Service Worker: Serving tile from cache (stale):', event.request.url);
    return cachedResponse;
  }

  // If cache miss, await the network fetch promise from above and return its response.
  try {
    // console.log('Service Worker: Cache miss, awaiting network fetch:', event.request.url);
    const networkResponse = await networkFetchPromise; // Await the same promise initiated earlier

    // Check if network response is valid before returning it for a cache miss
    if (!networkResponse || networkResponse.status !== 200) {
       console.error('Service Worker: Cache miss and network fetch failed/invalid:', event.request.url, networkResponse ? `Status: ${networkResponse.status}` : 'No response');
       // Return a specific error response instead of the bad network response
       return new Response(`Tile fetch failed: Not in cache and network error/invalid status (${networkResponse?.status || 'N/A'}).`, {
           status: networkResponse?.status || 500, // Use network status or generic server error
           statusText: networkResponse?.statusText || 'Not in cache and network error/invalid status.'
       });
    }
    // Network response is valid (status 200), return it
    return networkResponse;
  } catch (error) {
    // Catch errors specifically from awaiting the networkFetchPromise on cache miss
    console.error('Service Worker: Cache miss and network fetch failed:', event.request.url, error);
    // Return a generic error response
    return new Response('Tile fetch failed: Not in cache and network error.', {
      status: 408, // Request Timeout might be appropriate
      statusText: 'Not in cache and network error.'
    });
  }
}
