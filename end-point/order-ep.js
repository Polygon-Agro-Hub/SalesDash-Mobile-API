const orderDao = require('../dao/orders-dao');
const orderValidationSchema = require('../Validations/Order-validation');

/**
 * Create a new order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
// exports.createOrder = async (req, res) => {
//   try {
//     // Validate the request body using the Joi schema
//     //  await orderValidationSchema.validateAsync(req.body);  // Validate async to handle validation errors properly

//     // Extract sales agent ID from the user (authenticated user)
//     const salesAgentId = req.user.id;



//     // Process the order using the DAO
//     const result = await orderDao.processOrder(req.body, salesAgentId);
//     console.log("-----------------", req.body)

//     // Send a successful response with the order ID or relevant result
//     res.status(201).json({
//       success: true,
//       message: 'Order created successfully',
//       data: result // Or you can return order ID here depending on your DAO response
//     });
//   } catch (error) {
//     // If validation fails or any other error occurs, catch it and send an error response
//     console.error('Error creating order:', error);

//     if (error.isJoi) {
//       // Handle Joi validation errors
//       return res.status(400).json({
//         success: false,
//         message: 'Validation failed',
//         error: error.details.map(err => err.message)  // Send detailed validation errors
//       });
//     }

//     // Handle any other errors
//     res.status(500).json({
//       success: false,
//       message: error.message || 'Failed to create order',
//       error: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// };


exports.createOrder = async (req, res) => {
  try {
    console.log('=== ENDPOINT DEBUG ===');
    console.log('Full request body:', req.body);
    console.log('Content-Type header:', req.headers['content-type']);
    console.log('Request method:', req.method);

    // Validate the request body using the Joi schema
    await orderValidationSchema.validateAsync(req.body);
    const salesAgentId = req.user.id;


    const { orderData } = req.body;

    console.log('Extracted orderData:', orderData);
    console.log('Extracted salesAgentId:', salesAgentId);
    console.log('=== ENDPOINT DEBUG END ===');

    // Validate required fields
    if (!orderData || !salesAgentId) {
      return res.status(400).json({
        success: false,
        message: 'orderData and salesAgentId are required'
      });
    }

    if (!orderData.userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required in orderData'
      });
    }

    console.log('before')
    const result = await orderDao.processOrder(orderData, salesAgentId);
    console.log('after')

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: result
    });

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
};




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


exports.getAllOrderDetails = async (req, res) => {
  try {
    const salesAgentId = req.user.id; // Assuming the decoded token is available in req.user

    console.log("id", salesAgentId);

    const orderDetails = await orderDao.getAllOrderDetails(salesAgentId);

    res.status(200).json({
      success: true,
      count: orderDetails.length,
      data: orderDetails,
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

exports.getOrderByCustomerId = async (req, res) => {
  try {
    const customerId = req.params.id;


    if (!customerId || isNaN(parseInt(customerId))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID'
      });
    }

    const orders = await orderDao.getOrderByCustomerId(customerId);

    if (orders.message) {
      return res.status(404).json({
        success: false,
        message: orders.message
      });
    }

    res.status(200).json({
      success: true,
      data: orders
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






