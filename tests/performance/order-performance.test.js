const { performance } = require('perf_hooks');

// Mock all database connections FIRST
jest.mock('../../startup/database', () => ({
  plantcare: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  collectionofficer: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  marketPlace: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  admin: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  closeAllPools: jest.fn().mockResolvedValue(),
  closePool: jest.fn().mockResolvedValue()
}));

// Mock other dependencies
jest.mock('../../dao/orders-dao');

// Import after mocks
const orderEp = require('../../end-point/order-ep');
const ordersDao = require('../../dao/orders-dao');
const db = require('../../startup/database');

// Mock express response and request
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (body = {}, params = {}, query = {}, user = {}) => ({ body, params, query, user });

describe('Performance Tests - Order Endpoints', () => {
  let req;
  let res;

  const measureExecutionTime = async (fn) => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    return { executionTime: end - start, result };
  };

  afterAll(async () => {
    if (db.closeAllPools) await db.closeAllPools();
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(() => {
    res = mockResponse();
    jest.clearAllMocks();
  });

  describe('getOrderById Performance', () => {
    it('should handle fetching order by id quickly (< 50ms)', async () => {
      ordersDao.getOrderById.mockResolvedValue({ id: 50, total: 1500 });
      req = mockRequest({}, { orderId: "50" });

      const { executionTime } = await measureExecutionTime(async () => {
        await orderEp.getOrderById(req, res);
      });

      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getOrderByCustomerId Performance', () => {
    it('should handle fetching orders by customer quickly (< 50ms)', async () => {
      ordersDao.getOrderByCustomerId.mockResolvedValue({ orders: [{ id: 50, total: 1500 }], totalCount: 1 });
      req = mockRequest({}, { id: "373" });

      const { executionTime } = await measureExecutionTime(async () => {
        await orderEp.getOrderByCustomerId(req, res);
      });

      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Stress Test - getOrderById Concurrent Load', () => {
    it('should handle 50 concurrent getOrderById requests efficiently', async () => {
      ordersDao.getOrderById.mockResolvedValue({ id: 50, total: 1500 });
      
      const createRequest = () => {
        const mockRes = mockResponse();
        const mockReq = mockRequest({}, { orderId: "50" });
        return orderEp.getOrderById(mockReq, mockRes);
      };

      const requests = Array(50).fill().map(() => createRequest());

      const startTime = performance.now();
      await Promise.all(requests);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(500);
    });
  });
});
