const userDao = require('../dao/userAuth-dao');
const jwt = require('jsonwebtoken');
const asyncHandler = require("express-async-handler");



exports.login = async (req, res) => {
  const { username, password } = req.body;
  console.log('req.body', req.body) 

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  try {
    const result = await userDao.loginUser(username, password);
    console.log('====================================');
    console.log(result);
    console.log('====================================');

    // Create JWT token
    const token = jwt.sign(
      { username: result.username, id: result.id, passwordUpdate: result.passwordUpdate },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { username: result.username, token, id: result.id, passwordUpdate: result.passwordUpdate } // Return the token and passwordUpdate status
    });
  } catch (err) {
    return res.status(401).json({ success: false, message: err.message });
  }
};


exports.getUserProfile = asyncHandler(async (req, res) => {
  // Extract id from the decoded JWT token in req.user
  const id = req.user.id;
  console.log(req.user) // Assuming req.user has been populated by the auth middleware

  try {
    // Call the DAO function to get user profile by ID
    const user = await userDao.getUserProfile(id);

    return res.status(200).json({
      success: true,
      message: 'Profile fetched successfully',
      data: user, // Return the user data
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
exports.updateUserProfile = asyncHandler(async (req, res) => {
  const id = req.user.id; // Assuming you are using empId from the token payload

  const updatedData = req.body; // Get the updated data from request body

  const results = await userDao.updateUserProfile(id, updatedData);

  if (results.affectedRows === 0) {
    return res.status(404).json({
      status: "error",
      message: "User not found or no changes made",
    });
  }

  return res.status(200).json({
    status: "success",
    message: "User profile updated successfully",
  });
});


exports.updatePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.id; // Assuming `id` is available in `req.user` from authentication middleware

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old password and new password are required' });
  }

  try {
    const result = await userDao.updatePassword(userId, oldPassword, newPassword);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};