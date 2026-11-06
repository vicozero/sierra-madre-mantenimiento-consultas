"use strict";
// PWA Service Worker con offline capability para Sierra Madre
// Cachea activos y datos de API para modo offline

const CACHE_NAME = 'sierra-madre-v2';
const OFFLINE_CACHE = 'sierra-madre-offline';
const DYNAMIC_CACHE = 'sierra-madre-dynamic';

// Archivos para cacheo estático durante el install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/portal_consultas_github/',
  '/static/css/main.css',
  '/static/css/audit.css',
  '/static/js/app.js',
  '/static/js/app.js.classification',
  '/static/logo.png',
  '/favicon.ico',
  '/site.webmanifest'
];

// Rutas de API que cacheamos para offline
const API_ENDPOINTS = [
  '/api/portal',
  '/api/users',
  '/api/equipment'
];

// Evento install: cachear activos esenciales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Cacheando activos estáticos');
      return cache.addAll(STATIC_ASSETS);
    })
    .then(() => self.skipWaiting())
  );
});

// Evento activate: limpiar caches antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => {
          // Eliminar caches que no sean el actual
          return key !== CACHE_NAME && key.startsWith('sierra-madre');
        }).map(key => caches.delete(key))
      );
    })
    .then(() => {
      // Tomar el control de todos los clients
      return self.clients.claim();
    })
  );
});

// Evento fetch: estrategia cache-first para activos, network-first para API
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo manejar peticiones GET de mismo origen
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Peticiones de API: estrategia network-first con fallback a cache
  if (API_ENDPOINTS.some(ep => url.pathname.startsWith(ep))) {
    event.respondWith(
      fetch(req).then(response => {
        // Cachear respuesta exitosa en cache dinámico
        if (response.ok) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(req, clone);
          });
        }
        return response;
      }).catch(() => {
        // Si falla la red, intentar desde cache dinámico
        return caches.match(req).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si no hay cache, retornar offline page
          return caches.match('/index.html').then(() => {
            // Para peticiones API sin cache, retornar estructura offline
            if (url.pathname.startsWith('/api/')) {
              return new Response(
                JSON.stringify({ offline: true, error: 'Sin conexión, datos en caché disponibles' }),
                { headers: { 'Content-Type': 'application/json' } }
              );
            }
          });
        });
      })
    );
    return;
  }

  // Recursos estáticos: estrategia cache-first
  event.respondWith(
    caches.match(req).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      // Si no está en cache, intentar network y cachear para luego
      return fetch(req).then(networkResponse => {
        // Cachear en cache dinámico si es exitoso
        if (networkResponse.ok && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(req, clone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Sin red - intentar desde cache estático
        return caches.match(req).then(() => {
          // Si no hay nada, retornar página offline
          return caches.match('/index.html');
        });
      });
    })
  );
});

// Sincronización en background cuando vuelve la conexión
self.addEventListener('sync', event => {
  if (event.tag === 'sierra-madre-sync-pilot') {
    event.waitUntil(
      // Reenviar operaciones pendientes al servidor
      syncPilotOperations()
    );
  }
});

// Función asíncrona para sincronizar operaciones pendientes
async function syncPilotOperations() {
  try {
    // Obtener operaciones almacenadas en IndexedDB o localStorage
    const pendingOps = await getPendingPilotOperations();

    for (const operation of pendingOps) {
      try {
        const response = await fetch('/api/portal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: 'retry_pending',
            operation: operation
          })
        });

        if (response.ok) {
          // Remover operación sincronizada
          await removePendingPilotOperation(operation.uuid);
        }
      } catch (err) {
        console.error('[SW] Error syncing operation:', err);
      }
    }
  } catch (err) {
    console.error('[SW] Error en syncPilotOperations:', err);
  }
}

// Mock functions para IndexedDB operations
// En producción, estas conectarían con el vrai IndexedDB
async function getPendingPilotOperations() {
  // Retornar operaciones pendientes de localStorage
  const stored = localStorage.getItem('pilot_pending_ops');
  return stored ? JSON.parse(stored) : [];
}

async function removePendingPilotOperation(uuid) {
  let ops = await getPendingPilotOperations();
  ops = ops.filter(op => op.uuid !== uuid);
  localStorage.setItem('pilot_pending_ops', JSON.stringify(ops));
}

// Mensaje para comunicarse con la página principal
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'check-pwa-status') {
    event.respondWith(
      Promise.resolve({
        isOnline: navigator.onLine,
        cachesAvailable: 'caches' in window,
        serviceWorkerActive: navigator.serviceWorker.controller !== null
      })
    );
  }
});

self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Actualización de Sierra Madre',
    icon: '/static/logo.png',
    vibrate: [200, 100, 200],
    data: { dateOfArrival: Date.now() }
  };
  event.waitUntil(self.registration.showNotification('Sierra Madre', options));
});