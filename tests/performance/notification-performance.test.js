const { performance } = require('perf_hooks');

// Mock all database connections FIRST
jest.mock('../../startup/database', () => ({
  plantcare: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  collectionofficer: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  admin: { promise: () => ({ query: jest.fn() }), query: jest.fn() },
  closeAllPools: jest.fn().mockResolvedValue(),
  closePool: jest.fn().mockResolvedValue()
}));

// Mock other dependencies
jest.mock('../../dao/notification-dao');

// Import after mocks
const notificationEp = require('../../end-point/notification-ep');
const notificationDao = require('../../dao/notification-dao');
const db = require('../../startup/database');

// Mock express response and request
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (body = {}, params = {}, query = {}, user = {}) => ({ body, params, query, user });

describe('Performance Tests - Notification Endpoints', () => {
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

  describe('getNotifications Performance', () => {
    it('should handle fetching notifications quickly (< 50ms)', async () => {
      notificationDao.getNotificationsBySalesAgentDAO.mockResolvedValue({
        notifications: [{ id: 1, text: "Payment alert" }],
        unreadCount: 1,
      });
      req = mockRequest({}, {}, {}, { id: 2 });

      const { executionTime } = await measureExecutionTime(async () => {
        await notificationEp.getNotifications(req, res);
      });

      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Stress Test - getNotifications', () => {
    it('should handle 50 concurrent fetch requests efficiently', async () => {
      notificationDao.getNotificationsBySalesAgentDAO.mockResolvedValue({
        notifications: [{ id: 1, text: "Payment alert" }],
        unreadCount: 1,
      });
      
      const createRequest = () => {
        const mockRes = mockResponse();
        const mockReq = mockRequest({}, {}, {}, { id: 5 });
        return notificationEp.getNotifications(mockReq, mockRes);
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
