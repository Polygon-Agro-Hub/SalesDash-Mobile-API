const { performance } = require("perf_hooks");

// Mock database connections
jest.mock("../../startup/database", () => ({
    plantcare: {
        promise: () => ({ query: jest.fn() }),
        query: jest.fn(),
    },
    collectionofficer: {
        promise: () => ({ query: jest.fn() }),
        query: jest.fn(),
    },
    admin: {
        promise: () => ({ query: jest.fn() }),
        query: jest.fn(),
    },
    closeAllPools: jest.fn().mockResolvedValue(),
    closePool: jest.fn().mockResolvedValue(),
}));

// Mock other dependencies

jest.mock("../../dao/user-dao");
jest.mock("jsonwebtoken", () => ({
    sign: jest.fn(() => "mocked_token"),
    verify: jest.fn((token, secret, callback) =>
        callback(null, { id: 1, empId: "EMP001" }),
    ),
}));

// Import after mocks
const userAuthEp = require("../../end-point/user-ep");
const userDao = require("../../dao/user-dao");
const db = require("../../startup/database");

// Mock Helpers
const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    return res;
};

const mockRequest = (body = {}, user = {}) => ({ body, user });

// Performance Test Suite
describe("Performance Tests - User Authentication (user-ep)", () => {
    let req, res;
    let originalConsoleLog;
    let originalConsoleError;

    // Helper to measure execution time
    const measureExecutionTime = async (fn) => {
        const start = performance.now();
        const result = await fn();
        const end = performance.now();
        return { executionTime: end - start, result };
    };

    beforeAll(() => {
        originalConsoleLog = console.log;
        originalConsoleError = console.error;
        console.log = jest.fn();
        console.error = jest.fn();
    });

    afterAll(async () => {
        if (db.closeAllPools) await db.closeAllPools();
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        await new Promise((resolve) => setTimeout(resolve, 100));
    });

    beforeEach(() => {
        res = mockResponse();
        jest.clearAllMocks();
        process.env.JWT_SECRET = "test_secret";
        process.env.NODE_ENV = "test";
    });

    // LOGIN
    describe("Login Performance", () => {
        it("should handle successful login within acceptable time (< 100ms)", async () => {
            const mockResult = { empId: "EMP001", id: 1, passwordUpdate: 1 };
            userDao.loginUserDAO.mockResolvedValue(mockResult);
            req = mockRequest({ empId: "EMP001", password: "Password123" });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.login(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Login execution time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(100);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("should handle login validation error quickly (< 50ms)", async () => {
            req = mockRequest({ password: "Password123" });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.login(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Login validation error time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should handle "User not found" error quickly (< 50ms)', async () => {
            userDao.loginUserDAO.mockRejectedValue(new Error("User not found"));
            req = mockRequest({ empId: "EMP999", password: "Password123" });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.login(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ User not found response time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('should handle "Invalid password" error quickly (< 50ms)', async () => {
            userDao.loginUserDAO.mockRejectedValue(new Error("Invalid password"));
            req = mockRequest({ empId: "EMP001", password: "WrongPass1" });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.login(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Invalid password response time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('should handle "Account rejected" error quickly (< 50ms)', async () => {
            userDao.loginUserDAO.mockRejectedValue(
                new Error("This Employee ID is rejected"),
            );
            req = mockRequest({ empId: "EMP001", password: "Password123" });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.login(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Account rejected response time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should handle "Password not set" error quickly (< 50ms)', async () => {
            userDao.loginUserDAO.mockRejectedValue(
                new Error("Password not set for this account"),
            );
            req = mockRequest({ empId: "EMP001", password: "Password123" });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.login(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Password not set response time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    // GET USER PROFILE
    describe("Get User Profile Performance", () => {
        it("should retrieve user profile within acceptable time (< 50ms)", async () => {
            const mockProfile = {
                id: 1,
                firstName: "John",
                lastName: "Doe",
                empId: "EMP001",
                email: "john@example.com",
                city: "Colombo",
                status: "Approved",
                image: "profile.jpg",
            };
            userDao.getUserProfileDAO.mockResolvedValue(mockProfile);
            req = mockRequest({}, { id: 1 });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.getUserProfile(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Get profile execution time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should handle "User not found" error quickly (< 50ms)', async () => {
            userDao.getUserProfileDAO.mockRejectedValue(new Error("User not found"));
            req = mockRequest({}, { id: 99 });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.getUserProfile(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Profile not found response time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it("should handle database error quickly (< 50ms)", async () => {
            userDao.getUserProfileDAO.mockRejectedValue(new Error("Database error"));
            req = mockRequest({}, { id: 1 });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.getUserProfile(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Profile DB error response time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // GET PASSWORD
    describe("Get Password Performance", () => {
        it("should retrieve password info within acceptable time (< 50ms)", async () => {
            const mockData = {
                id: 1,
                empId: "EMP001",
                passwordUpdate: 1,
                createdAt: "2024-01-01T00:00:00.000Z",
            };
            userDao.getPasswordDAO.mockResolvedValue(mockData);
            req = mockRequest({}, { id: 1 });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.getPassword(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Get password info execution time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should handle "User not found" error quickly (< 50ms)', async () => {
            userDao.getPasswordDAO.mockRejectedValue(new Error("User not found"));
            req = mockRequest({}, { id: 99 });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.getPassword(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Password info not found response time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it("should handle database error quickly (< 50ms)", async () => {
            userDao.getPasswordDAO.mockRejectedValue(new Error("Database error"));
            req = mockRequest({}, { id: 1 });

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.getPassword(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Password info DB error response time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // UPDATE PASSWORD
    describe("Update Password Performance", () => {
        it("should handle successful password update within acceptable time (< 100ms)", async () => {
            userDao.updatePasswordDAO.mockResolvedValue({
                success: true,
                message: "Password updated successfully",
            });
            req = mockRequest(
                { oldPassword: "OldPass123", newPassword: "NewPass456" },
                { id: 1 },
            );

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.updatePassword(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Update password execution time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(100);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("should handle validation error quickly (< 50ms)", async () => {
            req = mockRequest({ newPassword: "NewPass456" }, { id: 1 }); // missing oldPassword

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.updatePassword(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Password validation error time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should handle "Old password mismatch" error quickly (< 50ms)', async () => {
            userDao.updatePasswordDAO.mockRejectedValue(
                new Error("Current Password does not match. Please Re-enter"),
            );
            req = mockRequest(
                { oldPassword: "WrongOld1", newPassword: "NewPass456" },
                { id: 1 },
            );

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.updatePassword(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Old password mismatch response time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should handle "Same password" error quickly (< 50ms)', async () => {
            userDao.updatePasswordDAO.mockRejectedValue(
                new Error("New password cannot be the same as the old password"),
            );
            req = mockRequest(
                { oldPassword: "SamePass1", newPassword: "SamePass1" },
                { id: 1 },
            );

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.updatePassword(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ Same password error response time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it("should handle database update error quickly (< 50ms)", async () => {
            userDao.updatePasswordDAO.mockRejectedValue(
                new Error("Database update error"),
            );
            req = mockRequest(
                { oldPassword: "OldPass123", newPassword: "NewPass456" },
                { id: 1 },
            );

            const { executionTime } = await measureExecutionTime(async () => {
                await userAuthEp.updatePassword(req, res);
                return res;
            });

            originalConsoleLog(
                `✅ DB update error response time: ${executionTime.toFixed(2)}ms`,
            );
            expect(executionTime).toBeLessThan(50);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // CONCURRENT OPERATIONS
    describe("Concurrent Operations Performance", () => {
        it("should handle 10 concurrent login requests efficiently", async () => {
            const mockResult = { empId: "EMP001", id: 1, passwordUpdate: 1 };
            userDao.loginUserDAO.mockResolvedValue(mockResult);

            const createLoginRequest = () => {
                const mockRes = mockResponse();
                const mockReq = mockRequest({
                    empId: "EMP001",
                    password: "Password123",
                });
                return userAuthEp.login(mockReq, mockRes);
            };

            const requests = Array(10)
                .fill(null)
                .map(() => createLoginRequest());

            const startTime = performance.now();
            await Promise.all(requests);
            const endTime = performance.now();
            const totalTime = endTime - startTime;

            originalConsoleLog(`✅ 10 concurrent logins: ${totalTime.toFixed(2)}ms`);
            originalConsoleLog(
                `✅ Average per request: ${(totalTime / 10).toFixed(2)}ms`,
            );
            originalConsoleLog(
                `✅ Throughput: ${(10 / (totalTime / 1000)).toFixed(2)} req/sec`,
            );

            expect(totalTime).toBeLessThan(500);
        });

        it("should handle 10 concurrent getUserProfile requests efficiently", async () => {
            const mockProfile = {
                id: 1,
                firstName: "John",
                lastName: "Doe",
                empId: "EMP001",
            };
            userDao.getUserProfileDAO.mockResolvedValue(mockProfile);

            const createProfileRequest = () => {
                const mockRes = mockResponse();
                const mockReq = mockRequest({}, { id: 1 });
                return userAuthEp.getUserProfile(mockReq, mockRes);
            };

            const requests = Array(10)
                .fill(null)
                .map(() => createProfileRequest());

            const startTime = performance.now();
            await Promise.all(requests);
            const endTime = performance.now();
            const totalTime = endTime - startTime;

            originalConsoleLog(
                `✅ 10 concurrent profile requests: ${totalTime.toFixed(2)}ms`,
            );
            originalConsoleLog(
                `✅ Average per request: ${(totalTime / 10).toFixed(2)}ms`,
            );
            originalConsoleLog(
                `✅ Throughput: ${(10 / (totalTime / 1000)).toFixed(2)} req/sec`,
            );

            expect(totalTime).toBeLessThan(500);
        });

        it("should handle 10 concurrent getPassword requests efficiently", async () => {
            const mockData = { id: 1, empId: "EMP001", passwordUpdate: 1 };
            userDao.getPasswordDAO.mockResolvedValue(mockData);

            const createPasswordRequest = () => {
                const mockRes = mockResponse();
                const mockReq = mockRequest({}, { id: 1 });
                return userAuthEp.getPassword(mockReq, mockRes);
            };

            const requests = Array(10)
                .fill(null)
                .map(() => createPasswordRequest());

            const startTime = performance.now();
            await Promise.all(requests);
            const endTime = performance.now();
            const totalTime = endTime - startTime;

            originalConsoleLog(
                `✅ 10 concurrent getPassword requests: ${totalTime.toFixed(2)}ms`,
            );
            originalConsoleLog(
                `✅ Average per request: ${(totalTime / 10).toFixed(2)}ms`,
            );
            originalConsoleLog(
                `✅ Throughput: ${(10 / (totalTime / 1000)).toFixed(2)} req/sec`,
            );

            expect(totalTime).toBeLessThan(500);
        });

        it("should handle 10 concurrent updatePassword requests efficiently", async () => {
            userDao.updatePasswordDAO.mockResolvedValue({
                success: true,
                message: "Password updated successfully",
            });

            const createUpdateRequest = () => {
                const mockRes = mockResponse();
                const mockReq = mockRequest(
                    { oldPassword: "OldPass123", newPassword: "NewPass456" },
                    { id: 1 },
                );
                return userAuthEp.updatePassword(mockReq, mockRes);
            };

            const requests = Array(10)
                .fill(null)
                .map(() => createUpdateRequest());

            const startTime = performance.now();
            await Promise.all(requests);
            const endTime = performance.now();
            const totalTime = endTime - startTime;

            originalConsoleLog(
                `✅ 10 concurrent updatePassword requests: ${totalTime.toFixed(2)}ms`,
            );
            originalConsoleLog(
                `✅ Average per request: ${(totalTime / 10).toFixed(2)}ms`,
            );
            originalConsoleLog(
                `✅ Throughput: ${(10 / (totalTime / 1000)).toFixed(2)} req/sec`,
            );

            expect(totalTime).toBeLessThan(500);
        });
    });

    // SEQUENTIAL LOAD
    describe("Sequential Load Performance", () => {
        it("should handle 20 sequential login requests with stable response times", async () => {
            const mockResult = { empId: "EMP001", id: 1, passwordUpdate: 1 };
            userDao.loginUserDAO.mockResolvedValue(mockResult);

            const times = [];
            for (let i = 0; i < 20; i++) {
                const mockRes = mockResponse();
                const mockReq = mockRequest({
                    empId: "EMP001",
                    password: "Password123",
                });
                const start = performance.now();
                await userAuthEp.login(mockReq, mockRes);
                times.push(performance.now() - start);
            }

            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const maxTime = Math.max(...times);
            const minTime = Math.min(...times);

            originalConsoleLog(`✅ 20 sequential logins:`);
            originalConsoleLog(`   - Average : ${avgTime.toFixed(2)}ms`);
            originalConsoleLog(`   - Min     : ${minTime.toFixed(2)}ms`);
            originalConsoleLog(`   - Max     : ${maxTime.toFixed(2)}ms`);

            expect(avgTime).toBeLessThan(100);
            expect(maxTime).toBeLessThan(200);
        });

        it("should handle 20 sequential updatePassword requests with stable response times", async () => {
            userDao.updatePasswordDAO.mockResolvedValue({
                success: true,
                message: "Password updated successfully",
            });

            const times = [];
            for (let i = 0; i < 20; i++) {
                const mockRes = mockResponse();
                const mockReq = mockRequest(
                    { oldPassword: "OldPass123", newPassword: "NewPass456" },
                    { id: 1 },
                );
                const start = performance.now();
                await userAuthEp.updatePassword(mockReq, mockRes);
                times.push(performance.now() - start);
            }

            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const maxTime = Math.max(...times);
            const minTime = Math.min(...times);

            originalConsoleLog(`✅ 20 sequential updatePassword requests:`);
            originalConsoleLog(`   - Average : ${avgTime.toFixed(2)}ms`);
            originalConsoleLog(`   - Min     : ${minTime.toFixed(2)}ms`);
            originalConsoleLog(`   - Max     : ${maxTime.toFixed(2)}ms`);

            expect(avgTime).toBeLessThan(100);
            expect(maxTime).toBeLessThan(200);
        });
    });

    // STRESS TEST
    describe("Stress Test", () => {
        it("should handle mixed workload of 60 requests efficiently", async () => {
            // Setup mocks
            userDao.loginUserDAO.mockResolvedValue({
                empId: "EMP001",
                id: 1,
                passwordUpdate: 1,
            });
            userDao.getUserProfileDAO.mockResolvedValue({
                id: 1,
                firstName: "John",
                lastName: "Doe",
                empId: "EMP001",
            });
            userDao.getPasswordDAO.mockResolvedValue({
                id: 1,
                empId: "EMP001",
                passwordUpdate: 1,
            });
            userDao.updatePasswordDAO.mockResolvedValue({
                success: true,
                message: "Password updated successfully",
            });

            const operations = [
                ...Array(20)
                    .fill(null)
                    .map(() => async () => {
                        const mockRes = mockResponse();
                        const mockReq = mockRequest({
                            empId: "EMP001",
                            password: "Password123",
                        });
                        await userAuthEp.login(mockReq, mockRes);
                    }),
                ...Array(20)
                    .fill(null)
                    .map(() => async () => {
                        const mockRes = mockResponse();
                        const mockReq = mockRequest({}, { id: 1 });
                        await userAuthEp.getUserProfile(mockReq, mockRes);
                    }),
                ...Array(10)
                    .fill(null)
                    .map(() => async () => {
                        const mockRes = mockResponse();
                        const mockReq = mockRequest({}, { id: 1 });
                        await userAuthEp.getPassword(mockReq, mockRes);
                    }),
                ...Array(10)
                    .fill(null)
                    .map(() => async () => {
                        const mockRes = mockResponse();
                        const mockReq = mockRequest(
                            { oldPassword: "OldPass123", newPassword: "NewPass456" },
                            { id: 1 },
                        );
                        await userAuthEp.updatePassword(mockReq, mockRes);
                    }),
            ];

            // Shuffle to simulate real-world mixed traffic
            const shuffledOps = operations.sort(() => Math.random() - 0.5);

            const startTime = performance.now();
            await Promise.all(shuffledOps.map((op) => op()));
            const endTime = performance.now();
            const totalTime = endTime - startTime;

            originalConsoleLog(
                `✅ Mixed workload (${operations.length} requests) completed in: ${totalTime.toFixed(2)}ms`,
            );
            originalConsoleLog(
                `✅ Throughput: ${(operations.length / (totalTime / 1000)).toFixed(2)} req/sec`,
            );

            expect(totalTime).toBeLessThan(3000);
        });
    });

    // MEMORY USAGE TEST
    describe("Memory Usage Tests", () => {
        it("should not leak memory during 50 repeated login requests", async () => {
            const mockResult = { empId: "EMP001", id: 1, passwordUpdate: 1 };
            userDao.loginUserDAO.mockResolvedValue(mockResult);

            const iterations = 50;
            const memorySnapshots = [];

            for (let i = 0; i < iterations; i++) {
                const memBefore = process.memoryUsage();
                const mockRes = mockResponse();
                const mockReq = mockRequest({
                    empId: "EMP001",
                    password: "Password123",
                });
                await userAuthEp.login(mockReq, mockRes);
                const memAfter = process.memoryUsage();
                memorySnapshots.push(memAfter.heapUsed - memBefore.heapUsed);

                if (i % 10 === 0) await new Promise((resolve) => setImmediate(resolve));
            }

            const avgDelta =
                memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length;
            const maxDelta = Math.max(...memorySnapshots);

            originalConsoleLog(`✅ Login memory usage:`);
            originalConsoleLog(
                `   - Avg heap increase per request: ${(avgDelta / 1024).toFixed(2)} KB`,
            );
            originalConsoleLog(
                `   - Max heap increase            : ${(maxDelta / 1024).toFixed(2)} KB`,
            );

            expect(avgDelta).toBeLessThan(500 * 1024);
        });

        it("should not leak memory during 50 repeated getUserProfile requests", async () => {
            const mockProfile = {
                id: 1,
                firstName: "John",
                lastName: "Doe",
                empId: "EMP001",
            };
            userDao.getUserProfileDAO.mockResolvedValue(mockProfile);

            const iterations = 50;
            const memorySnapshots = [];

            for (let i = 0; i < iterations; i++) {
                const memBefore = process.memoryUsage();
                const mockRes = mockResponse();
                const mockReq = mockRequest({}, { id: 1 });
                await userAuthEp.getUserProfile(mockReq, mockRes);
                const memAfter = process.memoryUsage();
                memorySnapshots.push(memAfter.heapUsed - memBefore.heapUsed);

                if (i % 10 === 0) await new Promise((resolve) => setImmediate(resolve));
            }

            const avgDelta =
                memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length;
            const maxDelta = Math.max(...memorySnapshots);

            originalConsoleLog(`✅ getUserProfile memory usage:`);
            originalConsoleLog(
                `   - Avg heap increase per request: ${(avgDelta / 1024).toFixed(2)} KB`,
            );
            originalConsoleLog(
                `   - Max heap increase            : ${(maxDelta / 1024).toFixed(2)} KB`,
            );

            expect(avgDelta).toBeLessThan(500 * 1024);
        });

        it("should not leak memory during 50 repeated updatePassword requests", async () => {
            userDao.updatePasswordDAO.mockResolvedValue({
                success: true,
                message: "Password updated successfully",
            });

            const iterations = 50;
            const memorySnapshots = [];

            for (let i = 0; i < iterations; i++) {
                const memBefore = process.memoryUsage();
                const mockRes = mockResponse();
                const mockReq = mockRequest(
                    { oldPassword: "OldPass123", newPassword: "NewPass456" },
                    { id: 1 },
                );
                await userAuthEp.updatePassword(mockReq, mockRes);
                const memAfter = process.memoryUsage();
                memorySnapshots.push(memAfter.heapUsed - memBefore.heapUsed);

                if (i % 10 === 0) await new Promise((resolve) => setImmediate(resolve));
            }

            const avgDelta =
                memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length;
            const maxDelta = Math.max(...memorySnapshots);

            originalConsoleLog(`✅ updatePassword memory usage:`);
            originalConsoleLog(
                `   - Avg heap increase per request: ${(avgDelta / 1024).toFixed(2)} KB`,
            );
            originalConsoleLog(
                `   - Max heap increase            : ${(maxDelta / 1024).toFixed(2)} KB`,
            );

            expect(avgDelta).toBeLessThan(500 * 1024);
        });
    });
});
