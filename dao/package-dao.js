const db = require("../startup/database");

// exports.getAllPackages = async () => {
//     return new Promise((resolve, reject) => {
//         const query = `
//         SELECT id, name, status, total, created_at AS createdAt, description, portion, period
//         FROM marketplacepackages
//         `;

//         db.marketPlace.query(query, (error, results) => {
//             if (error) {
//                 console.error("Error fetching packages:", error);
//                 reject(error);
//             } else {
//                 resolve(results);
//             }
//         });
//     });
// };

exports.getAllPackages = async () => {
    return new Promise((resolve, reject) => {
        const query = `
        SELECT id, displayName, status, total, created_at AS createdAt, description, discount, subTotal
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
              pd.mpItemId,  
            pd.quantityType,
            pd.price 
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



// exports.getCropGroupForMarketplaceItem = async (marketplaceItemId) => {
//     return new Promise((resolve, reject) => {
//         const query = `
//         SELECT 
//             cg.id,
//             cg.cropNameEnglish
//         FROM marketplaceitems mi
//         JOIN cropvariety cv ON mi.cropId = cv.id
//         JOIN cropgroup cg ON cv.cropGroupId = cg.id
//         WHERE mi.id = ?
//         `;

//         // This query assumes your database connections can access both tables
//         // If they're in different databases, you might need to adjust this approach
//         db.marketPlace.query(query, [marketplaceItemId], (error, results) => {
//             if (error) {
//                 console.error("Error fetching crop group for marketplace item:", error);
//                 reject(error);
//             } else {
//                 if (results.length === 0) {
//                     resolve(null);
//                 } else {
//                     resolve(results[0]);
//                 }
//             }
//         });
//     });
// };

// exports.getCropGroupForMarketplaceItem = async (marketplaceItemId) => {
//     try {
//         const query = `
//         SELECT 
//             cg.id,
//             cg.cropNameEnglish
//         FROM market_place.marketplaceitems mi
//         LEFT JOIN plant_care.cropvariety cv ON mi.cropId = cv.id
//         LEFT JOIN plant_care.cropgroup cg ON cv.cropGroupId = cg.id
//         WHERE mi.id = ?
//         `;

//         const [results] = await db.marketPlace.promise().query(query, [marketplaceItemId]);

//         if (!results.length) {
//             console.warn("No crop group found for marketplace item:", marketplaceItemId);
//             return null;
//         }

//         return results[0];
//     } catch (error) {
//         console.error("Error fetching crop group for marketplace item:", error);
//         throw new Error("Database error: " + error.sqlMessage);
//     }
// };

// exports.getCropGroupForMarketplaceItem = async (marketplaceItemId) => {
//     try {
//         const query = `
//        SELECT DISTINCT 
//     cg.id,
//     cg.cropNameEnglish
// FROM plant_care.cropgroup cg
// LEFT JOIN plant_care.cropvariety cv ON cg.id = cv.cropGroupId
// LEFT JOIN market_place.marketplaceitems mi ON cv.id = mi.cropId
// ORDER BY cg.cropNameEnglish;


//         `;

//         const [results] = await db.marketPlace.promise().query(query, [marketplaceItemId]);
//         console.log("Query results:", results);


//         return results; // Return all results, not just the first one
//     } catch (error) {
//         console.error("Error fetching crop groups for marketplace item:", error);
//         throw new Error("Database error: " + error.sqlMessage);
//     }
// };




// exports.getMarketplaceItemDetails = async (itemId) => {
//     return new Promise((resolve, reject) => {
//         const query = `
//         SELECT 
//           id,
//           displayName,
//           normalPrice, 
//           discountedPrice, 
//           unitType, 
//           startValue, 
//           changeby
//         FROM marketplaceitems
//         WHERE id = ?;
//         `;

//         console.log("Executing query:", query);
//         console.log("With itemId:", itemId);

//         db.marketPlace.query(query, [itemId], (error, results) => {
//             if (error) {
//                 console.error("Error fetching marketplace item details:", error);
//                 reject(error);
//             } else {
//                 resolve(results.length > 0 ? results[0] : null);
//             }
//         });
//     });
// };


exports.getMarketplaceItemDetails = async (mpItemId) => {
    return new Promise((resolve, reject) => {
        const query = `
        SELECT 
          id,
          displayName,
          normalPrice, 
          discountedPrice, 
          unitType, 
          startValue, 
          changeby
        FROM marketplaceitems
        WHERE id = ?;
        `;

        console.log("Executing query:", query);
        console.log("With itemId:", mpItemId);

        db.marketPlace.query(query, [mpItemId], (error, results) => {
            if (error) {
                console.error("Error fetching marketplace item details:", error);
                reject(error);
            } else {
                resolve(results.length > 0 ? results[0] : null);
            }
        });
    });
};

// exports.getMarketplaceItemDetails = async (mpItemId) => {
//     try {
//         const query = `
//         SELECT
//           id,
//           displayName,
//           normalPrice,
//           discountedPrice,
//           unitType,
//           startValue,
//           changeby
//         FROM marketplaceitems
//         WHERE id = ?;
//         `;

//         console.log("Executing query:", query);
//         console.log("With itemId:", mpItemId);

//         // Using async/await for better handling
//         const [results] = await db.marketPlace.promise().query(query, [mpItemId]);

//         // Return the first result if available, else null
//         return results.length > 0 ? results[0] : null;
//     } catch (error) {
//         console.error("Error fetching marketplace item details:", error);
//         throw new Error("Database error: " + error.message);
//     }
// };


exports.getAllCrops = async () => {
    try {
        const query = `
        SELECT 
            id, varietyId, displayName, category, 
            normalPrice, discountedPrice, discount, 
            promo, unitType, startValue, changeby
        FROM marketplaceitems;
       
        `;  // SQL query to fetch crops from the marketplaceitems table

        console.log("Executing query:", query);  // Debugging SQL query
        const [results] = await db.marketPlace.promise().query(query);  // Run the query

        console.log("Results fetched from DB:", results); // Check what the query returns
        return results;  // Return the results from the DB
    } catch (error) {
        console.error("Error fetching crops:", error);
        throw new Error("Database error: " + error.message);  // Throw the error to be handled in the controller
    }
};



exports.getCropById = async (cropId) => {
    try {
        const query = `
            SELECT 
                id, cropId, displayName, category, 
                normalPrice, discountedPrice, discount, 
                promo, unitType, startValue, changeby, displayType 
            FROM marketplaceitems 
            WHERE cropId = ?;
        `;  // SQL query to fetch the crop with the specific cropId

        console.log("Executing query:", query);  // Debugging SQL query
        const [results] = await db.marketPlace.promise().query(query, [cropId]);  // Run the query with cropId as a parameter

        console.log("Result fetched from DB:", results); // Check what the query returns
        return results[0];  // Return the first result (single crop)
    } catch (error) {
        console.error("Error fetching crop by ID:", error);
        throw new Error("Database error: " + error.message);  // Throw the error to be handled in the controller
    }
};
