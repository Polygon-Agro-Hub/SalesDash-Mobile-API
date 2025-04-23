const db = require('../startup/database');


exports.createComplain = (saId, language, complain, category, status, refNo) => {
    return new Promise((resolve, reject) => {
        const today = new Date();
        const datePrefix = today.toISOString().slice(2, 10).replace(/-/g, "");
        console.log("datePrefix", datePrefix);


        const checkSql = `SELECT refNo FROM dashcomplain WHERE refNo LIKE ? ORDER BY refNo DESC LIMIT 1`;
        db.dash.query(checkSql, [`SA${datePrefix}%`], (err, results) => {
            if (err) {
                return reject(err);
            }

            let newNumber = "0001";
            if (results.length > 0) {
                // Extract the last 4 digits and increment
                const lastRefNo = results[0].refNo;
                const lastNumber = parseInt(lastRefNo.slice(-4), 10);
                newNumber = String(lastNumber + 1).padStart(4, "0");
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

                console.log("Fetched categories:", results);
                resolve(results);
            }
        });
    });
};

