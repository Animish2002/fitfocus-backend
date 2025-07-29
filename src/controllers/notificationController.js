// controllers/notificationController.js
const webpush = require('web-push');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Configure web-push with your VAPID keys
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY 
);

const notificationController = {
  // Endpoint for frontend to subscribe
  async subscribe(req, res) {
    const userId = req.user.userId; // Assuming user is authenticated
    const subscription = req.body; // This is the PushSubscription object from the frontend

    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ message: 'Invalid subscription object.' });
    }

    try {
      // Check if subscription already exists for this user and endpoint
      const existingSubscription = await prisma.pushSubscription.findUnique({
        where: {
          userId_endpoint: { // Use the compound unique constraint
            userId: userId,
            endpoint: subscription.endpoint,
          },
        },
      });

      if (existingSubscription) {
        console.log(`User ${userId} already subscribed to this endpoint.`);
        return res.status(200).json({ message: 'Subscription already exists.' });
      }

      // Save the new subscription to the database
      await prisma.pushSubscription.create({
        data: {
          userId: userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      });

      res.status(201).json({ message: 'Subscription successful.' });
    } catch (error) {
      console.error('Error subscribing user:', error);
      res.status(500).json({ message: 'Failed to subscribe user.' });
    }
  },

  // Utility function to send a notification to a specific user
  async sendNotificationToUser(userId, title, body, url = '/') {
    try {
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId: userId },
      });

      if (subscriptions.length === 0) {
        console.log(`No push subscriptions found for user ${userId}.`);
        return;
      }

      const notificationPayload = JSON.stringify({
        title: title,
        body: body,
        icon: 'https://res.cloudinary.com/dkv3bx51z/image/upload/v1753765682/FitFocus_da7uvi.png',
        badge: 'https://res.cloudinary.com/dkv3bx51z/image/upload/v1753765772/bell_l81cml.png', // Path to a small badge icon (optional)
        data: {
          url: url, // URL to open when notification is clicked
          dateOfArrival: Date.now(),
          primaryKey: 1,
        },
      });

      // Send to all subscriptions for this user
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            notificationPayload
          );
          
        } catch (error) {
          console.error(`Error sending notification to endpoint ${sub.endpoint}:`, error);
          // If subscription is no longer valid, remove it from DB
          if (error.statusCode === 404 || error.statusCode === 410) {
            console.log(`Removing expired/invalid subscription for user ${userId}: ${sub.endpoint}`);
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          }
        }
      }
    } catch (error) {
      console.error(`Error in sendNotificationToUser for user ${userId}:`, error);
    }
  },

  // Example endpoint to trigger a test notification (for development/admin)
  async sendTestNotification(req, res) {
    const userId = req.user.userId; // Send to the requesting user for testing
    const { title, body, url } = req.body;

    if (!title || !body) {
      return res.status(400).json({ message: 'Title and body are required for a test notification.' });
    }

    await notificationController.sendNotificationToUser(userId, title, body, url);
    res.status(200).json({ message: 'Test notification attempt initiated.' });
  },
};

module.exports = notificationController;