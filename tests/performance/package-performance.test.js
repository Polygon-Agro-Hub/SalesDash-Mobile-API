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
jest.mock('../../dao/package-dao');

// Import after mocks
const packageEp = require('../../end-point/package-ep');
const packageDao = require('../../dao/package-dao');
const db = require('../../startup/database');

// Mock express response and request
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (body = {}, params = {}, query = {}, user = {}) => ({ body, params, query, user });

describe('Performance Tests - Package Endpoints', () => {
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

  describe('getAllPackages Performance', () => {
    it('should handle fetching all packages quickly (< 50ms)', async () => {
      packageDao.getAllPackages.mockResolvedValue([{ id: 1, name: "Gold Package" }]);
      req = mockRequest({}, {}, { status: "Enabled" });

      const { executionTime } = await measureExecutionTime(async () => {
        await packageEp.getAllPackages(req, res);
      });

      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getItemsForPackage Performance', () => {
    it('should handle fetching items for package quickly (< 50ms)', async () => {
      packageDao.getItemsByPackageId.mockResolvedValue([{ id: 5, name: "NPK Fertilizer" }]);
      req = mockRequest({}, { packageId: 1 });

      const { executionTime } = await measureExecutionTime(async () => {
        await packageEp.getItemsForPackage(req, res);
      });

      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('validatePackageItems Performance', () => {
    it('should handle item validation quickly (< 50ms)', async () => {
      packageDao.checkDisabledItems.mockResolvedValue({ packageDisabled: false, disabledItems: [] });
      req = mockRequest({ packageId: 1, itemIds: [10, 20] });

      const { executionTime } = await measureExecutionTime(async () => {
        await packageEp.validatePackageItems(req, res);
      });

      expect(executionTime).toBeLessThan(50);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        hasDisabled: false
      }));
    });
  });

  describe('Stress Test - getAllPackages Concurrent Load', () => {
    it('should handle 50 concurrent getAllPackages requests efficiently', async () => {
      packageDao.getAllPackages.mockResolvedValue([{ id: 1, name: "Gold Package" }]);
      
      const createRequest = () => {
        const mockRes = mockResponse();
        const mockReq = mockRequest({}, {}, { status: "Enabled" });
        return packageEp.getAllPackages(mockReq, mockRes);
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
