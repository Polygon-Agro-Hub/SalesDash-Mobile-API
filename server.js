const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

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

// Routes
const routes = {
    auth: require('./routes/user.routes'),
    customer: require('./routes/customer.routes'),
    complain: require('./routes/complain.routes'),
    packages: require('./routes/package.routes')
};

// Route Registration
app.use('/api/auth', routes.auth);
app.use('/api/customer', routes.customer);
app.use('/api/complain', routes.complain);
app.use('/api/packages', routes.packages);

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
});
