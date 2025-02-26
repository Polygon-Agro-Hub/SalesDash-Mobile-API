// const jwt = require('jsonwebtoken');

// const auth = (req, res, next) => {
//     const authHeader = req.headers['authorization'];
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//         return res.status(401).json({ status: 'error', message: 'No token provided' });
//     }
//     const token = authHeader.split(' ')[1];

//     if (!token) {
//         return res.status(401).json({
//             status: 'error',
//             message: 'No token provided',
//         });
//     }

//     jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
//         if (err) {
//             console.error('Token verification error:', err);
//             return res.status(401).json({
//                 status: 'error',
//                 message: 'Invalid token',
//             });
//         }

//         console.log('Decoded token:', decoded); // Log the decoded token to see if it's correct

//         req.user = decoded;
//         next();
//     });
// };

// module.exports = auth;

// const jwt = require('jsonwebtoken');

// const auth = (req, res, next) => {
//     const token = req.headers['authorization']?.split(' ')[1]; // Should extract the token after "Bearer "

//     if (!token) {
//         return res.status(401).json({
//             status: 'error',
//             message: 'No token provided',
//         });
//     }

//     jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
//         if (err) {
//             console.error('Token verification error:', err);
//             return res.status(401).json({
//                 status: 'error',
//                 message: 'Invalid token',
//             });
//         }

//         console.log('Decoded token:', decoded); // Log the decoded token to see if it's correct

//         req.user = decoded;
//         next();
//     });
// };



// module.exports = auth;


const jwt = require('jsonwebtoken');

// const auth = (req, res, next) => {
//     const token = req.headers['authorization']?.split(' ')[1]; // Extract token from "Bearer <Token>"

//     if (!token) {
//         return res.status(401).json({
//             status: 'error',
//             message: 'No token provided',
//         });
//     }

//     jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
//         if (err) {
//             console.error('Token verification error:', err);
//             return res.status(401).json({
//                 status: 'error',
//                 message: 'Invalid token',
//             });
//         }

//         // Attach decoded token to request
//         req.user = decoded;
//         next();  // Continue to the next middleware or route handler
//     });
// };

const auth = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Extract token from "Bearer <Token>"

    if (!token) {
        console.error('No token provided');
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

        console.log('Decoded token:', decoded);
        // Attach decoded token to request
        req.user = decoded;
        next();  // Continue to the next middleware or route handler
    });
};

module.exports = auth;









