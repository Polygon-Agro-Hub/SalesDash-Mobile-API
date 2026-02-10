const db = require("../startup/database");



exports.getAllPackages = async (filters = {}) => {
   

    return new Promise((resolve, reject) => {
        // Base query with required filters
        let query = `
        SELECT DISTINCT 
            mp.id, 
            mp.displayName, 
            mp.image, 
            mp.status, 
            mp.created_at AS createdAt, 
            mp.description, 
            mp.productPrice, 
            mp.packingFee, 
            mp.serviceFee,
            mp.isValid,
            COUNT(dpi.id) as itemCount
        FROM marketplacepackages mp
        INNER JOIN definepackage dp ON mp.id = dp.packageId
        INNER JOIN definepackageitems dpi ON dp.id = dpi.definePackageId
        WHERE mp.isValid = 1
        `;

        const queryParams = [];

        // Add status filter
        if (filters.status) {
            query += ` AND mp.status = ?`;
            queryParams.push(filters.status);
        }

        // Add price range filters
        if (filters.minPrice !== null) {
            query += ` AND mp.productPrice >= ?`;
            queryParams.push(filters.minPrice);
        }

        if (filters.maxPrice !== null) {
            query += ` AND mp.productPrice <= ?`;
            queryParams.push(filters.maxPrice);
        }

        // Add search filter (searches in displayName and description)
        if (filters.search) {
            query += ` AND (mp.displayName LIKE ? OR mp.description LIKE ?)`;
            const searchTerm = `%${filters.search}%`;
            queryParams.push(searchTerm, searchTerm);
        }

        // Group by to handle DISTINCT with COUNT
        query += ` GROUP BY mp.id, mp.displayName, mp.image, mp.status, mp.created_at, mp.description, mp.productPrice, mp.packingFee, mp.serviceFee, mp.isValid`;

        // Add ordering
        query += ` ORDER BY mp.displayName ASC`;

        // Add pagination
        if (filters.limit) {
            query += ` LIMIT ? OFFSET ?`;
            queryParams.push(filters.limit, filters.offset || 0);
        }


        db.marketPlace.query(query, queryParams, (error, results) => {
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


        db.marketPlace.query(query, [packageId], (error, results) => {
            if (error) {
                console.error("Error fetching package details:", error);
                reject(error);
            } else {
                
                resolve(results.length > 0 ? results[0] : null);
            }
        });
    });
};



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

       
        const [results] = await db.marketPlace.promise().query(query, [customerId]);

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
        `;  

    
        const [results] = await db.marketPlace.promise().query(query, [id]);  

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

        db.marketPlace.query(query, [packageId, productId], (error, results) => {
            if (error) {
                console.error("Error fetching package item details:", error);
                reject(error);
            } else {
                
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