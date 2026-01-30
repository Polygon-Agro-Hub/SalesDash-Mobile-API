const orderDao = require('../dao/orders-dao');
const orderValidationSchema = require('../Validations/Order-validation');
const smsService = require('../services/sms-service');

/**
 * Create a new order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */






// exports.createOrder = async (req, res) => {
//   try {
//     console.log('=== ENDPOINT DEBUG ===');
//     console.log('Full request body:', req.body);
//     console.log('Content-Type header:', req.headers['content-type']);
//     console.log('Request method:', req.method);

//     // Validate the request body using the Joi schema
//     await orderValidationSchema.validateAsync(req.body);
//     const salesAgentId = req.user.id;

//     const { orderData } = req.body;

//     console.log('Extracted orderData:', orderData);
//     console.log('Extracted salesAgentId:', salesAgentId);
//     console.log('=== ENDPOINT DEBUG END ===');

//     // Validate required fields
//     if (!orderData || !salesAgentId) {
//       return res.status(400).json({
//         success: false,
//         message: 'orderData and salesAgentId are required'
//       });
//     }

//     if (!orderData.userId) {
//       return res.status(400).json({
//         success: false,
//         message: 'userId is required in orderData'
//       });
//     }

//     console.log('before processOrder');
//     const result = await orderDao.processOrder(orderData, salesAgentId);
//     console.log('after processOrder');

//     // NOTE: SMS is already sent inside processOrder function
//     // No need to call it again here unless you want to send additional notifications

//     res.status(201).json({
//       success: true,
//       message: 'Order created successfully',
//       data: result
//     });

//   } catch (error) {
//     console.error('Error creating order:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to create order',
//       error: error.message
//     });
//   }
// };



// exports.getAllOrderDetails = (req, res) => {

//   const salesAgentId = req.user.id; // Assuming the decoded token is available in req.user

//   console.log("id", salesAgentId)

//   orderDao.getAllOrderDetails(salesAgentId)
//     .then(orderDetails => {
//       res.status(200).json({
//         success: true,
//         count: orderDetails.length,
//         data: orderDetails
//       });
//     })
//     .catch(error => {
//       console.error('Error fetching all order details:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to fetch order details',
//         error: error.message
//       });
//     });
// }

exports.createOrder = async (req, res) => {
  try {
    console.log('=== ENDPOINT DEBUG ===');
    console.log('Full request body:', req.body);
    console.log('Content-Type header:', req.headers['content-type']);
    console.log('Request method:', req.method);

    // Validate the request body using the Joi schema
    try {
      await orderValidationSchema.validateAsync(req.body);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: validationError.details ? validationError.details[0].message : validationError.message
      });
    }

    const salesAgentId = req.user.id;
    const { orderData } = req.body;

    console.log('Extracted orderData:', orderData);
    console.log('Extracted salesAgentId:', salesAgentId);
    console.log('=== ENDPOINT DEBUG END ===');

    // Validate required fields
    if (!orderData || !salesAgentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        error: 'orderData and salesAgentId are required'
      });
    }

    if (!orderData.userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing user information',
        error: 'userId is required in orderData'
      });
    }

    console.log('before processOrder');
    const result = await orderDao.processOrder(orderData, salesAgentId);
    console.log('after processOrder');

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: result
    });

  } catch (error) {
    console.error('Error creating order:', error);

    // Handle specific error types
    if (error.message.includes('User not found')) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'The specified user does not exist in the system'
      });
    }

    if (error.message.includes('connection') || error.message.includes('ECONNREFUSED')) {
      return res.status(503).json({
        success: false,
        message: 'Database connection failed',
        error: 'Unable to connect to the database. Please try again later.'
      });
    }

    if (error.message.includes('Transaction') || error.message.includes('rollback')) {
      return res.status(500).json({
        success: false,
        message: 'Transaction failed',
        error: 'Order processing was interrupted. Please try again.'
      });
    }

    if (error.message.includes('QR Code')) {
      return res.status(500).json({
        success: false,
        message: 'QR code generation failed',
        error: 'Failed to generate invoice QR code. Please contact support.'
      });
    }

    // Default error response
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message || 'An unexpected error occurred while processing your order'
    });
  }
};


exports.getAllOrderDetails = async (req, res) => {
  try {
    const salesAgentId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;

    console.log("id", salesAgentId, "page", page, "limit", limit);

    const result = await orderDao.getAllOrderDetails(salesAgentId, page, limit);

    res.status(200).json({
      success: true,
      count: result.orders.length,
      totalCount: result.totalCount,
      currentPage: page,
      totalPages: Math.ceil(result.totalCount / limit),
      hasMore: page < Math.ceil(result.totalCount / limit),
      data: result.orders,
    });
  } catch (error) {
    console.error('Error fetching all order details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: error.message,
    });
  }
};


exports.getOrderById = async (req, res) => {

  console.log(",,,,,")
  try {
    const orderId = req.params.orderId;

    // Validate orderId
    if (!orderId || isNaN(parseInt(orderId))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    const order = await orderDao.getOrderById(orderId);

    console.log("data order hhhhhhhhhhhh", order)

    if (order.message) {
      return res.status(404).json({
        success: false,
        message: order.message
      });
    }


    res.status(200).json({
      success: true,
      data: order

    });
  } catch (error) {
    console.error('Error fetching order by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: error.message
    });
  }
};

// exports.getOrderByCustomerId = async (req, res) => {
//   try {
//     const customerId = req.params.id;


//     if (!customerId || isNaN(parseInt(customerId))) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid customer ID'
//       });
//     }

//     const orders = await orderDao.getOrderByCustomerId(customerId);

//     if (orders.message) {
//       return res.status(404).json({
//         success: false,
//         message: orders.message
//       });
//     }

//     res.status(200).json({
//       success: true,
//       data: orders
//     });
//   } catch (error) {
//     console.error('Error fetching orders by customer ID:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch order details',
//       error: error.message
//     });
//   }
// };

exports.getOrderByCustomerId = async (req, res) => {
  try {
    const customerId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;

    if (!customerId || isNaN(parseInt(customerId))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID'
      });
    }

    if (page < 1 || limit < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page and limit must be positive integers'
      });
    }

    const result = await orderDao.getOrderByCustomerId(customerId, page, limit);

    if (result.message) {
      return res.status(404).json({
        success: false,
        message: result.message
      });
    }

    res.status(200).json({
      success: true,
      data: result.orders,
      totalCount: result.totalCount,
      currentPage: page,
      totalPages: Math.ceil(result.totalCount / limit),
      hasMore: page * limit < result.totalCount
    });
  } catch (error) {
    console.error('Error fetching orders by customer ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: error.message
    });
  }
};



exports.getCustomerDetailsCustomerId = async (req, res) => {
  try {
    const customerId = req.params.id;

    // Validate customerId
    if (!customerId || isNaN(parseInt(customerId))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID'
      });
    }

    // Make sure to import orderDao correctly
    const customerData = await orderDao.getDataCustomerId(customerId);

    console.log("customerDataaaaaaaaaaaaaaaa", customerData)

    if (customerData.message) {
      return res.status(404).json({
        success: false,
        message: customerData.message
      });
    }

    res.status(200).json({
      success: true,
      data: customerData
    });
  } catch (error) {
    console.error('Error fetching customer details by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer details',
      error: error.message
    });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    // Validate orderId
    if (!orderId || isNaN(parseInt(orderId))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    // Call DAO to cancel the order
    const result = await orderDao.cancelOrder(orderId);

    if (result.message && !result.success) {
      return res.status(404).json({
        success: false,
        message: result.message
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: result
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: error.message
    });
  }
};

exports.reportOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { reportStatus } = req.body;

    // Validate orderId and reportStatus
    if (!orderId || isNaN(parseInt(orderId))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    if (!reportStatus) {
      return res.status(400).json({
        success: false,
        message: 'Report status is required'
      });
    }

    // Call DAO to update the order report status
    const result = await orderDao.reportOrder(orderId, reportStatus);

    if (result.message && !result.success) {
      return res.status(404).json({
        success: false,
        message: result.message
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order report status updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update report status',
      error: error.message
    });
  }
};


exports.getAgentStats = async (req, res) => {
  try {
    // Get the salesAgentId from the authenticated user in the request
    const salesAgentId = req.user.id;

    if (!salesAgentId) {
      return res.status(400).json({
        success: false,
        message: 'Sales agent ID is required'
      });
    }

    // Get combined stats for the agent
    const stats = await orderDao.getCombinedStats(salesAgentId);

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error in getAgentStats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get sales agent stats',
      error: error.message
    });
  }
};

exports.getAgentAllStars = async (req, res) => {
  try {
    const salesAgentId = req.user.id;

    if (!salesAgentId) {
      return res.status(400).json({
        success: false,
        message: 'Sales agent ID is required'
      });
    }

    const stats = await orderDao.getAllAgentStats(salesAgentId);

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error in getAgentAllStars:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get sales agent stars data',
      error: error.message
    });
  }
};

exports.getOrderCountBySalesAgent = async (req, res) => {
  try {
    const salesAgentId = req.user.id; // Get from authenticated user
    const result = await orderDao.getOrderCountBySalesAgent(salesAgentId);


    return res.status(200).json({
      success: true,
      data: result

    });


  } catch (error) {
    console.error('Error in getOrderCountBySalesAgent:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order count by sales agent',
      error: error.message
    });

  }

};



exports.getReturnReason = async (req, res) => {
  try {
    const orderId = req.params.orderId; // Changed from req.params.id

    console.log("-----------------------", orderId)

    // Validate orderId
    if (!orderId || isNaN(parseInt(orderId))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    // Get return reason
    const returnReasonData = await orderDao.getReturnReason(orderId);

    if (returnReasonData.message) {
      return res.status(404).json({
        success: false,
        message: returnReasonData.message
      });
    }

    res.status(200).json({
      success: true,
      data: returnReasonData
    });
  } catch (error) {
    console.error('Error fetching return reason:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch return reason',
      error: error.message
    });
  }
};





exports.getHold = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    console.log("Checking hold status for orderId:", orderId);

    if (!orderId || isNaN(parseInt(orderId))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    const holdStatusData = await orderDao.getHold(orderId);

    console.log("----------------------", holdStatusData)

    if (!holdStatusData.success) {
      return res.status(404).json({
        success: false,
        message: holdStatusData.message
      });
    }

    res.status(200).json({
      success: true,
      data: holdStatusData
    });

  } catch (error) {
    console.error('Error fetching hold status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hold status',
      error: error.message
    });
  }
};


