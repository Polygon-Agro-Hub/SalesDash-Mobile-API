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
jest.mock('../../dao/customer-dao');

// Import after mocks
const customerEp = require('../../end-point/customer-ep');
const customerDao = require('../../dao/customer-dao');
const db = require('../../startup/database');

// Mock express response and request
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (body = {}, params = {}, query = {}, user = {}) => ({ body, params, query, user });

describe('Performance Tests - Customer Endpoints', () => {
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

  describe('checkCustomer Performance', () => {
    it('should handle checkCustomer quickly (< 50ms)', async () => {
      customerDao.findCustomerByPhoneOrEmail.mockResolvedValue({ phoneExists: false, emailExists: false });
      req = mockRequest({ phoneNumber: "94777999943" });

      const { executionTime } = await measureExecutionTime(async () => {
        await customerEp.checkCustomer(req, res);
      });

      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('addSavedAddress Performance', () => {
    it('should handle addSavedAddress quickly (< 50ms)', async () => {
      const mockAddress = {
        customerId: 373,
        saveAs: "Home",
        billingName: "Avishka",
        billingPhone1: "+94777999943",
        buildingType: "House",
        houseNo: "123",
        streetName: "Main Road",
        nearestCity: "Colombo",
      };
      customerDao.addSavedAddress.mockResolvedValue({ id: 1, ...mockAddress });
      req = mockRequest(mockAddress);

      const { executionTime } = await measureExecutionTime(async () => {
        await customerEp.addSavedAddress(req, res);
      });

      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('Stress Test - checkCustomer Concurrent Load', () => {
    it('should handle 50 concurrent checkCustomer requests efficiently', async () => {
      customerDao.findCustomerByPhoneOrEmail.mockResolvedValue({ phoneExists: false, emailExists: false });
      
      const createRequest = () => {
        const mockRes = mockResponse();
        const mockReq = mockRequest({ phoneNumber: "94777999943" });
        return customerEp.checkCustomer(mockReq, mockRes);
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
