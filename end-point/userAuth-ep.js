const userDao = require('../dao/userAuth-dao');
const jwt = require('jsonwebtoken');


exports.login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  try {
    const result = await userDao.loginUser(username, password);

    // Create JWT token
    const token = jwt.sign(
      { username: result.username },
      process.env.JWT_SECRET ,                    
      { expiresIn: '1h' }            
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { username: result.username, token } // Returning the token
    });
  } catch (err) {
    return res.status(401).json({ success: false, message: err.message });
  }
};
