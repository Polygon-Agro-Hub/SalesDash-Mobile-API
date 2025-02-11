const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');



require('dotenv').config();

const app = express();

// Middleware
app.use(
    cors({
        origin: "http://localhost:8081", // The client origin that is allowed to access the resource
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allowed methods
        credentials: true, // Allow credentials (cookies, auth headers)
    })
);
app.options(
    "*",
    cors({
        origin: "http://localhost:8081", // Allow the client origin for preflight
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allowed methods for the preflight response
        credentials: true,
    })
);




// Increase the payload limit
app.use(bodyParser.json({ limit: '10mb' })); // Adjust the limit as necessary
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

const userRoutes = require('./routes/user.routes')
app.use('/api/auth', userRoutes);

const customerRoutes = require('./routes/customer.routes')
app.use('/api/customer', customerRoutes);

const complainRoutes = require('./routes/complain.routes')
app.use("/api/complain", complainRoutes);



// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



