const db = require('../startup/database');
const bcrypt = require('bcrypt');

exports.loginUser = (username, password) => {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT username, password FROM salesagent WHERE username = ?';
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
          resolve({ success: true, username: user.username });
        } catch (bcryptErr) {
          return reject(new Error('Password comparison error'));
        }
      });
    });
  };