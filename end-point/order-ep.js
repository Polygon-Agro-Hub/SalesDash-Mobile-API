const orderDao = require('../dao/order-dao')

exports.createOrder = async (req, res) => {
  try {
    const salesAgentId = req.user.id; // Get salesAgentId from authenticated user
    const orderData = req.body;

    // Validate required fields
    if (!orderData || !orderData.customerId || !orderData.orderItems) {
      return res.status(400).json({ success: false, message: "Invalid order data" });
    }

    // Call DAO to place order
    const result = await orderDao.placeOrder(orderData, salesAgentId);

    return res.status(201).json({
      success: true,
      orderId: result.orderId,
      message: "Order created successfully"
    });
  } catch (error) {
    console.error("Error placing order:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error"
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
