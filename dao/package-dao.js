const db = require("../startup/database");


// exports.getAllPackages = async () => {
//     return new Promise((resolve, reject) => {
//         const query = `
//         SELECT id, displayName, image, status, total, created_at AS createdAt, description, discount, subTotal
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

// exports.getAllPackages = async () => {
//     return new Promise((resolve, reject) => {
//         const query = `
//         SELECT id, displayName, image, status, total, created_at AS createdAt, description, discount, subTotal
//         FROM marketplacepackages
//         WHERE status = 'Enabled'
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

// exports.getAllPackages = async () => {
//     console.log("hitpack")
//     return new Promise((resolve, reject) => {
//         const query = `
//         SELECT id, displayName, image, status, created_at AS createdAt, description, productPrice, packingFee, serviceFee
//         FROM marketplacepackages
//         WHERE status = 'Enabled'
//         ORDER BY displayName ASC
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
    console.log("hitpack....")
    return new Promise((resolve, reject) => {
        const query = `
        SELECT DISTINCT 
            mp.id, 
            mp.displayName, 
            mp.image, 
            mp.status, 
            mp.created_at AS createdAt, 
            mp.description, 
            mp.productPrice, 
            mp.packingFee, 
            mp.serviceFee
        FROM marketplacepackages mp
        INNER JOIN definepackage dp ON mp.id = dp.packageId
        INNER JOIN definepackageitems dpi ON dp.id = dpi.definePackageId
        WHERE mp.status = 'Enabled'
        ORDER BY mp.displayName ASC
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


exports.getItemsByPackageId = async (packageId) => {
    return new Promise((resolve, reject) => {
        const query = `
        SELECT 
            pt.typeName AS name, 
            pd.id,
            pd.qty,
            pd.productTypeId
        FROM producttypes pt
        INNER JOIN packagedetails pd ON  pd.productTypeId = pt.id 
        WHERE pd.packageId = ?
        `;

        //  const query = `
        // SELECT 
        //     pd.productTypeId,
        //     pd.id,
        //     pd.qty
        // FROM packagedetails pd
        // WHERE pd.packageId = ?
        // `;

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

exports.getMarketplacePackage = async (packageId) => {
    return new Promise((resolve, reject) => {
        // Query the packages table instead of marketplaceitems
        const query = `
        SELECT 
          id,
          displayName,
        
          description
        FROM marketplacepackages
        WHERE id = ?;
        `;

        console.log("Executing query:", query);
        console.log("With packageId:", packageId);

        db.marketPlace.query(query, [packageId], (error, results) => {
            if (error) {
                console.error("Error fetching package details:", error);
                reject(error);
            } else {
                console.log("Query results:", results);
                resolve(results.length > 0 ? results[0] : null);
            }
        });
    });
};



// exports.getAllCrops = async () => {
//     try {
//         const query = `
//         SELECT 
//             id, varietyId, displayName, category,
//             normalPrice, discountedPrice, discount,
//             promo, unitType, startValue, changeby, tags
//         FROM marketplaceitems
//         ORDER BY displayName ASC;
//         `;

//         console.log("Executing query:", query);
//         const [results] = await db.marketPlace.promise().query(query);

//         console.log("Results fetched from DB:", results);
//         return results;
//     } catch (error) {
//         console.error("Error fetching crops:", error);
//         throw new Error("Database error: " + error.message);  // Throw the error to be handled in the controller
//     }
// };

// exports.getAllCrops = async (cusId) => {
//     let query;
//     let queryParams = [];

//     if (cusId && cusId.id) {
//         // If cusId is provided, filter by customer and category
//         const customerId = cusId.id;
//         query = `
//         SELECT 
//             mpi.id, mpi.varietyId, mpi.displayName, mpi.category,
//             mpi.normalPrice, mpi.discountedPrice, mpi.discount,
//             mpi.promo, mpi.unitType, mpi.startValue, mpi.changeby, mpi.tags
//         FROM marketplaceitems mpi
//         LEFT JOIN excludelist el ON el.mpItemId = mpi.id AND el.userId = ?
//         WHERE el.mpItemId IS NULL  
//         AND mpi.category = 'Retail'
//         ORDER BY mpi.displayName ASC;
//         `;
//         queryParams = [customerId]; // Using customerId for the query
//     } else {
//         // If cusId is not provided, fetch all marketplace items with 'Retail' category
//         query = `
//         SELECT 
//             id, varietyId, displayName, category,
//             normalPrice, discountedPrice, discount,
//             promo, unitType, startValue, changeby, tags
//         FROM marketplaceitems
//         WHERE category = 'Retail'
//         ORDER BY displayName ASC;
//         `;
//         queryParams = []; // No need for a customerId filter
//     }

//     try {
//         console.log("Executing query:", query);
//         const [results] = await db.marketPlace.promise().query(query, queryParams);

//         console.log("Results fetched from DB:", results);
//         return results;
//     } catch (error) {
//         console.error("Error fetching crops:", error);
//         throw new Error("Database error: " + error.message);  // Throw the error to be handled in the controller
//     }
// };

exports.getAllCrops = async (cusId) => {
    const customerId = cusId.id;
    try {
        const query = `
        SELECT 
            mpi.id, mpi.varietyId, mpi.displayName, mpi.category,
            mpi.normalPrice, mpi.discountedPrice, mpi.discount,
            mpi.promo, mpi.unitType, mpi.startValue, mpi.changeby, mpi.tags
        FROM marketplaceitems mpi
        LEFT JOIN excludelist el ON el.mpItemId = mpi.id AND el.userId = ?
        WHERE el.mpItemId IS NULL  
        AND mpi.category = 'Retail'
        ORDER BY mpi.displayName ASC;
        `;

        console.log("Executing query:", query);
        const [results] = await db.marketPlace.promise().query(query, [customerId]);

        console.log("Results fetched from DB:", results);
        return results;
    } catch (error) {
        console.error("Error fetching crops:", error);
        throw new Error("Database error: " + error.message);
    }
};


exports.getCropById = async (id) => {
    try {
        const query = `
            SELECT 
                id, varietyId, displayName, category, 
                normalPrice, discountedPrice, discount, 
                promo, unitType, startValue, changeby, displayType 
            FROM marketplaceitems 
            WHERE id = ?;
        `;  // SQL query to fetch the crop with the specific cropId

        console.log("Executing query:", query);  // Debugging SQL query
        const [results] = await db.marketPlace.promise().query(query, [id]);  // Run the query with cropId as a parameter

        console.log("Result fetched from DB:", results); // Check what the query returns
        return results[0];  // Return the first result (single crop)
    } catch (error) {
        console.error("Error fetching crop by ID:", error);
        throw new Error("Database error: " + error.message);  // Throw the error to be handled in the controller
    }
};

exports.getPackageItemByProductId = async (packageId, productId) => {
    return new Promise((resolve, reject) => {
        const query = `
        SELECT 
          pd.id,
          pd.packageId,
          pd.mpItemId,
          pd.quantity,
          pd.quantityType,
          pd.price,
          pd.discount,
          pd.discountedPrice,
          mi.displayName,
          mi.normalPrice as marketplacePrice,
          mi.discountedPrice as marketplaceDiscountedPrice,
          mi.unitType,
          mi.startValue,
          mi.changeby
        FROM market_place.packagedetails pd
        LEFT JOIN marketplaceitems mi ON pd.mpItemId = mi.id
        WHERE pd.packageId = ? AND pd.mpItemId = ?;
        `;

        console.log("Executing query:", query);
        console.log("With packageId:", packageId, "and productId (mpItemId):", productId);

        db.marketPlace.query(query, [packageId, productId], (error, results) => {
            if (error) {
                console.error("Error fetching package item details:", error);
                reject(error);
            } else {
                console.log("Query results:", results);
                if (results.length > 0) {
                    const result = results[0];
                    resolve({
                        id: result.id,
                        packageId: result.packageId,
                        mpItemId: result.mpItemId,
                        name: result.displayName,
                        displayName: result.displayName,
                        quantity: result.quantity,
                        quantityType: result.quantityType,
                        price: result.price,
                        discount: result.discount,
                        discountedPrice: result.discountedPrice,
                        normalPrice: result.marketplacePrice,
                        unitType: result.unitType,
                        startValue: result.startValue,
                        changeby: result.changeby
                    });
                } else {
                    resolve(null);
                }
            }
        });
    });
};
/////////// package

exports.getChangeByValue = async (mpItemId) => {
    return new Promise((resolve, reject) => {
        const query = `
        SELECT 
          id,
          
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