
self.addEventListener('install', (event) => {
    console.log('Service Worker installing.');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activating.');
    event.waitUntil(clients.claim());
});

self.addEventListener('push', function (event) {
    if (event.data) {
        try {
            const data = event.data.json();
            const options = {
                body: data.body,
                icon: data.icon || '/icon-192x192.png',
                badge: '/icon-192x192.png',
                vibrate: [100, 50, 100],
                data: {
                    dateOfArrival: Date.now(),
                    url: data.url || '/'
                },
                // iOS requires this for some background processing
                requireInteraction: false
            };

            event.waitUntil(
                self.registration.showNotification(data.title, options)
            );
        } catch (e) {
            console.error('Push handling error:', e);
        }
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        })
            .then(function (clientList) {
                // Focus existing window if available
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    if (client.url && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window
                if (clients.openWindow && event.notification.data.url) {
                    return clients.openWindow(event.notification.data.url);
                }
            })
    );
});
// Handle Push Subscription Rotation (Background)
self.addEventListener('pushsubscriptionchange', function (event) {
    console.log('[SW] Push Subscription Change detected');

    event.waitUntil(
        self.registration.pushManager.getSubscription()
            .then(function (oldSubscription) {
                // Re-subscribe
                // Note: We need the VAPID key here? 
                // We can retrieve options from the old subscription if available, or we hardcode?
                // "getSubscription().options" isn't fully reliable.
                // But usually we can just call subscribe again.

                return self.registration.pushManager.subscribe(event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true })
                    .then(function (newSubscription) {
                        console.log('[SW] Renewed Subscription:', newSubscription.endpoint);

                        // Sync to server
                        return fetch('/api/push/update-token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                oldEndpoint: event.oldSubscription ? event.oldSubscription.endpoint : (oldSubscription ? oldSubscription.endpoint : null),
                                newSubscription: newSubscription
                            })
                        });
                    });
            })
    );
});
