const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const { plantcare, collectionofficer, marketPlace, admin } = require('./startup/database');
const { initializeSocket, setIO } = require('./config/socket.config');

const app = express();
// Create HTTP server
const server = http.createServer(app);

const BASE_PATH = '/agro-api/salesdash';

const corsOptions = {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:8081",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

app.get([`${BASE_PATH}/health`, `${BASE_PATH}/healthz`], (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date(),
        uptime: process.uptime(),
        service: 'SalesDash Mobile API',
        environment: process.env.NODE_ENV || 'development',
        socketIO: 'enabled'
    });
});

const DatabaseConnection = (db, name) => {
    db.getConnection((err, connection) => {
        if (err) {
            console.error(`Error getting connection from ${name}:`, err);
        } else {
            connection.ping((err) => {
                if (err) {
                    console.error(`Error pinging ${name} database:`, err);
                } else {
                    console.log(`Ping to ${name} database successful.`);
                }
                connection.release();
            });
        }
    });
};

// Initial database connections
DatabaseConnection(plantcare, "PlantCare");
DatabaseConnection(collectionofficer, "CollectionOfficer");
DatabaseConnection(marketPlace, "MarketPlace");
DatabaseConnection(admin, "Admin");

// Initialize Socket.IO
const io = initializeSocket(server);
setIO(io); // Store io instance for global access
console.log('✅ Socket.IO initialized');

// Routes
const routes = {
    auth: require('./routes/user.routes'),
    customer: require('./routes/customer.routes'),
    complain: require('./routes/complain.routes'),
    packages: require('./routes/package.routes'),
    orders: require('./routes/order.routes'),
    notifications: require('./routes/notification.routes')
};

app.use(`${BASE_PATH}/api/auth`, routes.auth);
app.use(`${BASE_PATH}/api/customer`, routes.customer);
app.use(`${BASE_PATH}/api/complain`, routes.complain);
app.use(`${BASE_PATH}/api/packages`, routes.packages);
app.use(`${BASE_PATH}/api/orders`, routes.orders);
app.use(`${BASE_PATH}/api/notifications`, routes.notifications);

// Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start server with Socket.IO
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Base Path: ${BASE_PATH}`);
    console.log(`💓 Health Check URL: ${BASE_PATH}/health`);
    console.log(`🔌 Socket.IO Path: ${BASE_PATH}/socket.io`);
});

// Cron Jobs
const cron = require('node-cron');
const notificationDao = require('./dao/notification-dao');

// Run every day at 6 PM (18:00)
cron.schedule('00 18 * * *', async () => {
    try {
        console.log('⏰ Running payment reminders cron job...');
        const result = await notificationDao.createPaymentReminders(io);
        console.log(`✅ Payment reminders created successfully - Notifications: ${result.notificationCount}, SMS: ${result.smsCount}`);
    } catch (error) {
        console.error('❌ Error creating payment reminders:', error);
    }
});

// Uncomment for testing - runs every 30 seconds
// cron.schedule('*/30 * * * * *', async () => {
//     try {
//         console.log('⏰ Running test payment reminders...');
//         const result = await notificationDao.createPaymentReminders(io);
//         console.log(`✅ Test reminders created - Notifications: ${result.notificationCount}, SMS: ${result.smsCount}`);
//     } catch (error) {
//         console.error('❌ Error in test reminders:', error);
//     }
// });

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        // Close database connections
        plantcare.end();
        collectionofficer.end();
        marketPlace.end();
        admin.end();
    });
});

module.exports = { app, server, io };