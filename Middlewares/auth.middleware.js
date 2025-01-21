const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    // Extract the token from the Authorization header
    const token = req.headers['authorization']?.split(' ')[1]; 

    if (!token) {
        return res.status(401).json({
            status: 'error',
            message: 'No token provided',
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error('Token verification error:', err);
            return res.status(401).json({
                status: 'error',
                message: 'Invalid token',
            });
        }

        // Log the decoded token to check its structure
        console.log('Decoded token:', decoded); 

        // Check if the collection officer ID is present in the decoded token
        if (!decoded.id) {
            return res.status(401).json({
                status: 'error',
                message: 'Marketplace user ID is missing in the token',
            });
        }

        // Attach the user information to the request object
        req.user = decoded; 
        next(); 
    });
};

module.exports = auth;
