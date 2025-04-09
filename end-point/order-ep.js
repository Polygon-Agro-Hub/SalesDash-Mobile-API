const orderDao = require('../dao/order-dao')

// exports.createOrder = async (req, res) => {
//   try {
//     const salesAgentId = req.user.id; // Get salesAgentId from authenticated user
//     const orderData = req.body;

//     // Validate required fields
//     if (!orderData || !orderData.customerId || !orderData.orderItems) {
//       return res.status(400).json({ success: false, message: "Invalid order data" });
//     }

//     // Call DAO to place order
//     const result = await orderDao.placeOrder(orderData, salesAgentId);

//     return res.status(201).json({
//       success: true,
//       orderId: result.orderId,
//       message: "Order created successfully"
//     });
//   } catch (error) {
//     console.error("Error placing order:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Internal server error"
//     });
//   }
// };



/**
 * Create a new order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
// exports.createOrder = async (req, res) => {
//   const requestId = `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
//   const startTime = Date.now();
//   const salesAgentId = req.user.id;
//   const orderData = req.body;
  
//   // Log order creation start
//   console.log(`[${requestId}] Order creation started`, { 
//     salesAgentId, 
//     orderType: orderData.isCustomPackage ? 'custom' : 'package' 
//   });
  
//   try {
//     // Basic validation
//     if (!orderData.customerId) {
//       throw new Error('Customer ID is required');
//     }
    
//     if (!orderData.isCustomPackage && !orderData.isSelectPackage) {
//       throw new Error('Invalid order type - must specify isCustomPackage or isSelectPackage');
//     }
    
//     if (orderData.isCustomPackage && (!orderData.items || !orderData.items.length)) {
//       throw new Error('Items are required for custom package orders');
//     }
    
//     if (orderData.isSelectPackage && !orderData.packageId) {
//       throw new Error('Package ID is required for package orders');
//     }
    
//     // Process order with DAO
//     const result = await orderDao.processOrder(orderData, salesAgentId);
    
//     const processingTime = Date.now() - startTime;
//     console.log(`[${requestId}] Order created successfully in ${processingTime}ms`, { 
//       processingTime,
//       orderId: result.orderId 
//     });
    
//     res.status(201).json({
//       success: true,
//       message: 'Order created successfully',
//       data: result
//     });
//   } catch (error) {
//     const processingTime = Date.now() - startTime;
    
//     // Log detailed error info
//     console.error(`[${requestId}] Order creation failed after ${processingTime}ms: ${error.message}`, {
//       error: error.toString(),
//       stack: error.stack,
//       processingTime
//     });
    
//     // Send appropriate response to client
//     res.status(400).json({
//       success: false,
//       message: `Failed to create order: ${error.message}`,
//       error: error.message
//     });
//   }
// };


exports.createOrder = async (req, res) => {
  try {
    const orderData  = req.body;
    const salesAgentId = req.user.id; // Assuming agent ID comes from auth middleware
    
    console.log('Creating order with data:', orderData);

    const result = await orderDao.processOrder(orderData, salesAgentId);
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: result.orderId
      }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};




exports.getAllOrderDetails = (req, res) => {
  orderDao.getAllOrderDetails()
    .then(orderDetails => {
      res.status(200).json({
        success: true,
        count: orderDetails.length,
        data: orderDetails
      });
    })
    .catch(error => {
      console.error('Error fetching all order details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch order details',
        error: error.message
      });
    });
}


exports.getOrderById = async (req, res) => {
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

    // Get order items if needed
    // This is an example of how you might include order items
    // const orderItems = await orderItemDao.getOrderItemsByOrderId(orderId);

    res.status(200).json({
      success: true,
      data: order
      // data: { ...order, items: orderItems } // Uncomment if you want to include order items
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

    // Validate customerId
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