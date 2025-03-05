const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

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

// Body Parser Configuration
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ 
    limit: '10mb', 
    extended: true 
}));

// Health Check Endpoint
app.get([`${BASE_PATH}/health`, `${BASE_PATH}/healthz`], (req, res) => {
    const healthcheck = {
        status: 'ok',
        timestamp: new Date(),
        uptime: process.uptime(),
        service: 'SalesDash Mobile API',
        environment: process.env.NODE_ENV || 'development'
    };
    res.status(200).json(healthcheck);
});

// Routes
const routes = {
    auth: require('./routes/user.routes'),
    customer: require('./routes/customer.routes'),
    complain: require('./routes/complain.routes'),
    packages: require('./routes/package.routes')
};

// Route Registration with base path
app.use(`${BASE_PATH}/api/auth`, routes.auth);
app.use(`${BASE_PATH}/api/customer`, routes.customer);
app.use(`${BASE_PATH}/api/complain`, routes.complain);
app.use(`${BASE_PATH}/api/packages`, routes.packages);

// Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Base Path: ${BASE_PATH}`);
    console.log(`Health Check URL: ${BASE_PATH}/health`);
});
