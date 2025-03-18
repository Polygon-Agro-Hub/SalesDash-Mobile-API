const orderDao =  require('../dao/order-dao')

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