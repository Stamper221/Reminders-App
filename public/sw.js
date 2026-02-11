
self.addEventListener('push', function (event) {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: data.icon || '/icon-192x192.png',
            badge: '/icon-192x192.png',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                url: data.url || '/'
            }
        };

        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
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
                if (clientList.length > 0) {
                    let client = clientList[0];
                    // Focus existing window
                    for (let i = 0; i < clientList.length; i++) {
                        if (clientList[i].focused) {
                            return clientList[i].focus();
                        }
                    }
                    return client.focus();
                }
                if (clients.openWindow && event.notification.data.url) {
                    return clients.openWindow(event.notification.data.url);
                }
            })
    );
});
