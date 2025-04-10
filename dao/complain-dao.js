const db = require('../startup/database');

// exports.createComplain = (saId, language, complain, category, status) => {
//     return new Promise((resolve, reject) => {
//         const sql =
//             "INSERT INTO dashcomplain (saId,  language, complain, complainCategory, status) VALUES (?, ?, ?, ?, ?)";
//         db.dash.query(sql, [saId, language, complain, category, status], (err, result) => {
//             if (err) {
//                 reject(err);
//             } else {
//                 resolve(result.insertId);
//             }
//         });
//     });
// };


exports.createComplain = (saId, language, complain, category, status, refNo) => {
    return new Promise((resolve, reject) => {
        const today = new Date();
        const datePrefix = today.toISOString().slice(2, 10).replace(/-/g, ""); // YYMMDD format
        console.log("datePrefix", datePrefix);

        // Query to find the last inserted refNo for today
        const checkSql = `SELECT refNo FROM dashcomplain WHERE refNo LIKE ? ORDER BY refNo DESC LIMIT 1`;
        db.dash.query(checkSql, [`SA${datePrefix}%`], (err, results) => {
            if (err) {
                return reject(err);
            }

            let newNumber = "0001"; // Default if no existing refNo found
            if (results.length > 0) {
                // Extract the last 4 digits and increment
                const lastRefNo = results[0].refNo;
                const lastNumber = parseInt(lastRefNo.slice(-4), 10); // Get last 4 digits as number
                newNumber = String(lastNumber + 1).padStart(4, "0"); // Increment and format to 4 digits
            }

            const refNo = `SA${datePrefix}${newNumber}`;

            // Insert the complaint with the generated refNo
            const insertSql = `INSERT INTO dashcomplain (saId, language, complain, complainCategory, status, refNo, adminStatus ) VALUES (?, ?, ?, ?, ?, ?, 'Assigned')`;
            db.dash.query(insertSql, [saId, language, complain, category, status, refNo], (err, result) => {
                if (err) {
                    return reject(err);
                } else {
                    resolve({ insertId: result.insertId, refNo });
                }
            });
        });
    });
};


// exports.createComplain = (saId, language, complain, category, status) => {
//     return new Promise((resolve, reject) => {
//         const today = new Date();
//         const datePrefix = today.toISOString().slice(2, 10).replace(/-/g, ""); // YYMMDD format

//         // Query to find the last inserted refNo for today
//         const checkSql = `SELECT refNo FROM dashcomplain WHERE refNo LIKE ? ORDER BY refNo DESC LIMIT 1`;
//         db.dash.query(checkSql, [`SA${datePrefix}%`], (err, results) => {
//             if (err) {
//                 return reject(err);
//             }

//             let newNumber = "0001"; // Default if no existing refNo found
//             if (results.length > 0) {
//                 const lastRefNo = results[0].refNo;
//                 const lastNumber = parseInt(lastRefNo.slice(-4), 10); // Get last 4 digits
//                 newNumber = String(lastNumber + 1).padStart(4, "0"); // Increment and format to 4 digits
//             }

//             const refNo = `SA${datePrefix}${newNumber}`;

//             // Format createdAt before inserting
//             const createdAt = moment().format("hh:mm A, D MMM YYYY"); // e.g., "09:55 AM, 5 Aug 2024"

//             // Insert the complaint with formatted createdAt
//             const insertSql = `INSERT INTO dashcomplain (saId, language, complain, complainCategory, status, refNo, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`;
//             db.dash.query(insertSql, [saId, language, complain, category, status, refNo, createdAt], (err, result) => {
//                 if (err) {
//                     return reject(err);
//                 } else {
//                     resolve({ insertId: result.insertId, refNo, createdAt });
//                 }
//             });
//         });
//     });
// };



exports.getAllComplaintsByUserId = async (userId) => {
    return new Promise((resolve, reject) => {
        const query = `
        SELECT id, language, complain, status, createdAt, complainCategory , reply ,refNo
        FROM dashcomplain 
        WHERE saId = ?
        ORDER BY createdAt DESC
      `;
        db.dash.query(query, [userId], (error, results) => {
            if (error) {
                console.error("Error fetching complaints:", error);
                reject(error);
            } else {
                resolve(results);
            }
        });
    });
};

exports.getComplainCategories = async (appName) => {
    return new Promise((resolve, reject) => {
        const query = `
                SELECT cc.id, cc.roleId, cc.appId, cc.categoryEnglish, cc.categorySinhala, cc.categoryTamil, ssa.appName
                FROM complaincategory cc
                JOIN systemapplications ssa ON cc.appId = ssa.id
                WHERE ssa.appName = ?
      `;
        db.admin.query(query, [appName], (error, results) => {
            if (error) {
                console.error("Error fetching complaints:", error);
                reject(error);
            } else {
                // Log the entire response to ensure the IDs are correct
                console.log("Fetched categories:", results);
                resolve(results);
            }
        });
    });
};

