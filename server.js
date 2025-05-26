// const express = require('express');
// const cors = require('cors');
// const bodyParser = require('body-parser');
// require('dotenv').config();
// const { plantcare, collectionofficer, marketPlace, dash, admin } = require('./startup/database');

// const app = express();

// // Base path for all routes
// const BASE_PATH = '/agro-api/salesdash';

// // CORS Configuration
// const corsOptions = {
//     origin: process.env.CLIENT_ORIGIN || "http://localhost:8081",
//     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//     credentials: true
// };

// // Middleware
// app.use(cors(corsOptions));
// app.options("*", cors(corsOptions));

// // Body Parser Configuration
// app.use(bodyParser.json({ limit: '10mb' }));
// app.use(bodyParser.urlencoded({ 
//     limit: '10mb', 
//     extended: true 
// }));

// // Health Check Endpoint
// app.get([`${BASE_PATH}/health`, `${BASE_PATH}/healthz`], (req, res) => {
//     const healthcheck = {
//         status: 'ok',
//         timestamp: new Date(),
//         uptime: process.uptime(),
//         service: 'SalesDash Mobile API',
//         environment: process.env.NODE_ENV || 'development'
//     };
//     res.status(200).json(healthcheck);
// });

// // Function to test database connections using the pool
// const testConnection = (pool, name) => {
//     return new Promise((resolve, reject) => {
//       pool.getConnection((err, connection) => {
//         if (err) {
//           console.error(`❌ Error connecting to the ${name} database:`, err.message);
//           reject(err);
//         } else {
//           console.log(`✅ Successfully connected to the MySQL database: ${name}`);
//           connection.release(); // Release the connection back to the pool
//           resolve();
//         }
//       });
//     });
//   };

//   // Test all database connections sequentially
//   const checkConnections = async () => {
//     console.log('🔄 Testing database connections...\n');
//     try {
//       await testConnection(plantcare, 'PlantCare');
//       await testConnection(collectionofficer, 'CollectionOfficer');
//       await testConnection(marketPlace, 'MarketPlace');
//       await testConnection(dash, 'Dash');
//       await testConnection(admin, 'Admin');
//       console.log('\n🎉 All databases connected successfully!\n');
//     } catch (error) {
//       console.error('\n⚠️ Some databases failed to connect. Check logs above.\n');
//     }
//   };

//   checkConnections();



// // Routes
// const routes = {
//     auth: require('./routes/user.routes'),
//     customer: require('./routes/customer.routes'),
//     complain: require('./routes/complain.routes'),
//     packages: require('./routes/package.routes')
// };

// // Route Registration with base path
// app.use(`${BASE_PATH}/api/auth`, routes.auth);
// app.use(`${BASE_PATH}/api/customer`, routes.customer);
// app.use(`${BASE_PATH}/api/complain`, routes.complain);
// app.use(`${BASE_PATH}/api/packages`, routes.packages);

// // Error Handler
// app.use((err, req, res, next) => {
//     console.error(err.stack);
//     res.status(500).send('Something broke!');
// });

// // Start server
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
//     console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
//     console.log(`Base Path: ${BASE_PATH}`);
//     console.log(`Health Check URL: ${BASE_PATH}/health`);
// });

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const { plantcare, collectionofficer, marketPlace, dash, admin } = require('./startup/database');

const app = express();

// Base path for all routes
const BASE_PATH = '/agro-api/salesdash';

// CORS Configuration
const corsOptions = {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:8081",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Health Check Endpoint
app.get([`${BASE_PATH}/health`, `${BASE_PATH}/healthz`], (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date(),
        uptime: process.uptime(),
        service: 'SalesDash Mobile API',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Function to test database connections using `pool.query()`
const testConnection = async (pool, name) => {
    try {
        const connection = await new Promise((resolve, reject) => {
            pool.getConnection((err, conn) => {
                if (err) reject(err); // Reject if an error occurs
                else resolve(conn); // Resolve with the connection
            });
        });

        if (!connection) {
            throw new Error(`No connection returned for ${name}`);
        }

        connection.query('SELECT 1', (err, results) => {
            if (err) {
                console.error(`❌ Query error for ${name}:`, err.message);
            } else {
                console.log(`✅ Successfully connected to MySQL database: ${name}`);
            }
            connection.release(); // Always release the connection
        });

    } catch (err) {
        console.error(`❌ Error connecting to ${name} database:`, err.message);
    }
};



// Test all database connections before starting the server
const checkConnections = async () => {
    console.log('🔄 Testing database connections...\n');
    try {
        await testConnection(plantcare, 'PlantCare');
        await testConnection(collectionofficer, 'CollectionOfficer');
        await testConnection(marketPlace, 'MarketPlace');
        await testConnection(dash, 'Dash');
        await testConnection(admin, 'Admin');
        console.log('\n🎉 All databases connected successfully!\n');
    } catch (error) {
        console.error('\n⚠️ Some databases failed to connect. Server will not start.\n');
        process.exit(1); // Stop the server if critical DB connections fail
    }
};


// Start server only if DB connections succeed
checkConnections().then(() => {
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

    // Start server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`📍 Base Path: ${BASE_PATH}`);
        console.log(`💓 Health Check URL: ${BASE_PATH}/health`);
    });
});

// dgsdgdsgdhdf

const cron = require('node-cron');
const notificationDao = require('./dao/notification-dao');

// Run every day at midnight
cron.schedule('00 18 * * *', async () => {
    try {
        await notificationDao.createPaymentReminders();
        console.log('Payment reminders created successfully');
    } catch (error) {
        console.error('Error creating payment reminders:', error);
    }
});

