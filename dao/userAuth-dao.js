const db = require('../startup/database');
const bcrypt = require('bcrypt');

exports.loginUser = (username, password) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT username, password ,id  FROM salesagent WHERE username = ?';
    db.dash.query(sql, [username], async (err, results) => {
      if (err) {
        return reject(new Error('Database error'));
      }
      if (results.length === 0) {
        return reject(new Error('User not found'));
      }

      const user = results[0];

      try {
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          return reject(new Error('Invalid password'));
        }
        resolve({ success: true, username: user.username, id: user.id });
      } catch (bcryptErr) {
        return reject(new Error('Password comparison error'));
      }
    });
  });
};

exports.getUserProfile = (id) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        firstName, 
        lastName, 
        empId, 
        phoneNumber1, 
        phoneNumber2, 
        nic, 
        email, 
        houseNumber, 
        streetName, 
        city, 
        username
      FROM salesagent 
      WHERE id = ?
    `;
    db.dash.query(sql, [id], (err, results) => {
      if (err) {
        return reject(new Error('Database error'));
      }
      if (results.length === 0) {
        return reject(new Error('User not found'));
      }
      resolve(results[0]); // Return first matching result
    });
  });
};





exports.updateUserProfile = (id, updatedData) => {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE salesagent
      SET firstName = ?, lastName = ?, phoneNumber1 = ?, phoneNumber2 = ?,
          nic = ?, email = ?, houseNumber = ?, streetName = ?, city = ?,
          district = ?, province = ?
      WHERE id = ?`; // Change WHERE empId = ? to WHERE id = ?

    const values = [
      updatedData.firstName, updatedData.lastName, updatedData.phoneNumber1,
      updatedData.phoneNumber2, updatedData.nic, updatedData.email,
      updatedData.houseNumber, updatedData.streetName, updatedData.city,
      updatedData.district, updatedData.province, id // Use id here
    ];

    db.dash.query(sql, values, (err, results) => {
      if (err) return reject(new Error('Database update error'));
      if (results.affectedRows === 0) {
        return reject(new Error('User not found'));
      }
      resolve({ success: true, message: 'Profile updated successfully' });
    });
  });
};






