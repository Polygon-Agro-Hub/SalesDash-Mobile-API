const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Should extract the token after "Bearer "

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

        console.log('Decoded token:', decoded); // Log the decoded token to see if it's correct

        req.user = decoded;
        next();
    });
};

module.exports = auth;
