const db = require("../startup/database");

exports.getAllPackages = async () => {
    return new Promise((resolve, reject) => {
        const query = `
        SELECT id, name, status, total, created_at AS createdAt, description
        FROM marketplacepackages
        `;

        db.marketPlace.query(query, (error, results) => {
            if (error) {
                console.error("Error fetching packages:", error);
                reject(error);
            } else {
                resolve(results);
            }
        });
    });
};

// exports.getItemsByPackageId = async (packageId) => {
//     return new Promise((resolve, reject) => {
//         const query = `
//         SELECT mi.id, mi.displayName AS name, mi.unitType AS quantity 
//         FROM marketplaceitems mi
//         INNER JOIN packagedetails pd ON mi.id = pd.mpItemId
//         WHERE pd.packageId = ?
//         `;

//         db.marketPlace.query(query, [packageId], (error, results) => {
//             if (error) {
//                 console.error("Error fetching items for package:", error);
//                 reject(error);
//             } else {
//                 resolve(results);
//             }
//         });
//     });
// };

exports.getItemsByPackageId = async (packageId) => {
    return new Promise((resolve, reject) => {
        const query = `
        SELECT 
            mi.displayName AS name, 
            pd.quantity, 
            pd.quantityType 
        FROM marketplaceitems mi
        INNER JOIN packagedetails pd ON mi.id = pd.mpItemId
        WHERE pd.packageId = ?
        `;

        db.marketPlace.query(query, [packageId], (error, results) => {
            if (error) {
                console.error("Error fetching items for package:", error);
                reject(error);
            } else {
                resolve(results);
            }
        });
    });
};
