const userAuthEp = require("../../end-point/user-ep");
const userDao = require("../../dao/user-dao");
const jwt = require("jsonwebtoken");

jest.mock("jsonwebtoken");
jest.mock("../../dao/user-dao", () => ({
    loginUserDAO: jest.fn(),
    getUserProfileDAO: jest.fn(),
    getPasswordDAO: jest.fn(),
    updatePasswordDAO: jest.fn(),
}));

const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    return res;
};

const mockRequest = (body = {}, user = {}) => ({ body, user });

describe("User Authentication Endpoints (user-ep)", () => {
    let req, res;

    beforeEach(() => {
        res = mockResponse();
        jest.clearAllMocks();
    });

    describe("login", () => {
        beforeEach(() => {
            process.env.JWT_SECRET = "test_secret";
            process.env.NODE_ENV = "test";
        });

        it("should return 400 when empId is missing", async () => {
            req = mockRequest({ password: "Password123" });

            await userAuthEp.login(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "Validation error",
                    errors: expect.any(Array),
                }),
            );
        });

        it("should return 400 when password is missing", async () => {
            req = mockRequest({ empId: "EMP001" });

            await userAuthEp.login(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "Validation error",
                    errors: expect.any(Array),
                }),
            );
        });

        it("should return 400 when both empId and password are missing", async () => {
            req = mockRequest({});

            await userAuthEp.login(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: "Validation error",
                }),
            );
        });

        it('should return 401 with "Invalid Employee ID" when user is not found', async () => {
            req = mockRequest({ empId: "EMP001", password: "Password123" });
            userDao.loginUserDAO.mockRejectedValue(new Error("User not found"));

            await userAuthEp.login(req, res);

            expect(userDao.loginUserDAO).toHaveBeenCalledWith(
                "EMP001",
                "Password123",
            );
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Invalid Employee ID",
            });
        });

        it('should return 401 with "Invalid password" when password is wrong', async () => {
            req = mockRequest({ empId: "EMP001", password: "WrongPass1" });
            userDao.loginUserDAO.mockRejectedValue(new Error("Invalid password"));

            await userAuthEp.login(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Invalid password",
            });
        });

        it('should return 403 with statusType "rejected" when account is rejected', async () => {
            req = mockRequest({ empId: "EMP001", password: "Password123" });
            userDao.loginUserDAO.mockRejectedValue(
                new Error("This Employee ID is rejected"),
            );

            await userAuthEp.login(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "This Employee ID is rejected",
                statusType: "rejected",
            });
        });

        it('should return 403 with statusType "not_approved" when account is pending', async () => {
            req = mockRequest({ empId: "EMP001", password: "Password123" });
            userDao.loginUserDAO.mockRejectedValue(
                new Error("This Employee ID is not approved"),
            );

            await userAuthEp.login(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "This Employee ID is not approved",
                statusType: "not_approved",
            });
        });

        it('should return 403 with statusType "password_not_set" when no password exists', async () => {
            req = mockRequest({ empId: "EMP001", password: "Password123" });
            userDao.loginUserDAO.mockRejectedValue(
                new Error("Password not set for this account"),
            );

            await userAuthEp.login(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message:
                    "Password not set for this account. Please contact administrator.",
                statusType: "password_not_set",
            });
        });

        it("should return 200, set cookie, and return token on successful login", async () => {
            req = mockRequest({ empId: "EMP001", password: "Password123" });

            const mockResult = { empId: "EMP001", id: 1, passwordUpdate: 1 };
            userDao.loginUserDAO.mockResolvedValue(mockResult);
            jwt.sign.mockReturnValue("mocked_token");

            await userAuthEp.login(req, res);

            expect(userDao.loginUserDAO).toHaveBeenCalledWith(
                "EMP001",
                "Password123",
            );
            expect(jwt.sign).toHaveBeenCalledWith(
                { empId: "EMP001", id: 1, passwordUpdate: 1 },
                "test_secret",
                { expiresIn: "8h" },
            );
            expect(res.cookie).toHaveBeenCalledWith(
                "authToken",
                "mocked_token",
                expect.objectContaining({ httpOnly: true, sameSite: "Strict" }),
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Login successful",
                data: {
                    empId: "EMP001",
                    token: "mocked_token",
                    id: 1,
                    passwordUpdate: 1,
                },
            });
        });
    });

    describe("getUserProfile", () => {
        it("should return 200 with full user profile data on success", async () => {
            const mockProfile = {
                id: 1,
                firstName: "John",
                lastName: "Doe",
                empType: "Field",
                empId: "EMP001",
                phoneCode1: "+94",
                phoneNumber1: "771234567",
                phoneCode2: null,
                phoneNumber2: null,
                nic: "123456789V",
                email: "john@example.com",
                houseNumber: "12A",
                streetName: "Main St",
                city: "Colombo",
                district: "Colombo",
                province: "Western",
                country: "Sri Lanka",
                accHolderName: "John Doe",
                accNumber: "1234567890",
                bankName: "BOC",
                branchName: "Colombo",
                status: "Approved",
                image: "profile.jpg",
                createdAt: "2024-01-01T00:00:00.000Z",
            };
            req = mockRequest({}, { id: 1 });
            userDao.getUserProfileDAO.mockResolvedValue(mockProfile);

            await userAuthEp.getUserProfile(req, res);

            expect(userDao.getUserProfileDAO).toHaveBeenCalledWith(1);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Profile fetched successfully",
                data: mockProfile,
            });
        });

        it("should return 500 when user is not found", async () => {
            req = mockRequest({}, { id: 99 });
            userDao.getUserProfileDAO.mockRejectedValue(new Error("User not found"));

            await userAuthEp.getUserProfile(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "User not found",
            });
        });

        it("should return 500 on a database error", async () => {
            req = mockRequest({}, { id: 1 });
            userDao.getUserProfileDAO.mockRejectedValue(new Error("Database error"));

            await userAuthEp.getUserProfile(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Database error",
            });
        });
    });

    describe("getPassword", () => {
        it("should return 200 with password-update info on success", async () => {
            const mockData = {
                id: 1,
                empId: "EMP001",
                passwordUpdate: 1,
                createdAt: "2024-01-01T00:00:00.000Z",
            };
            req = mockRequest({}, { id: 1 });
            userDao.getPasswordDAO.mockResolvedValue(mockData);

            await userAuthEp.getPassword(req, res);

            expect(userDao.getPasswordDAO).toHaveBeenCalledWith(1);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Profile fetched successfully",
                data: mockData,
            });
        });

        it("should return 500 when user is not found", async () => {
            req = mockRequest({}, { id: 99 });
            userDao.getPasswordDAO.mockRejectedValue(new Error("User not found"));

            await userAuthEp.getPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "User not found",
            });
        });

        it("should return 500 on a database error", async () => {
            req = mockRequest({}, { id: 1 });
            userDao.getPasswordDAO.mockRejectedValue(new Error("Database error"));

            await userAuthEp.getPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Database error",
            });
        });
    });

    describe("updatePassword", () => {
        it("should return 400 when oldPassword is missing", async () => {
            req = mockRequest({ newPassword: "NewPass456" }, { id: 1 });

            await userAuthEp.updatePassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "error",
                    message: "Validation failed",
                    errors: expect.any(Array),
                }),
            );
        });

        it("should return 400 when newPassword is missing", async () => {
            req = mockRequest({ oldPassword: "OldPass123" }, { id: 1 });

            await userAuthEp.updatePassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "error",
                    message: "Validation failed",
                    errors: expect.any(Array),
                }),
            );
        });

        it("should return 400 when both passwords are missing", async () => {
            req = mockRequest({}, { id: 1 });

            await userAuthEp.updatePassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "error",
                    message: "Validation failed",
                }),
            );
        });

        it("should return 200 on successful password update", async () => {
            req = mockRequest(
                { oldPassword: "OldPass123", newPassword: "NewPass456" },
                { id: 1 },
            );
            userDao.updatePasswordDAO.mockResolvedValue({
                success: true,
                message: "Password updated successfully",
            });

            await userAuthEp.updatePassword(req, res);

            expect(userDao.updatePasswordDAO).toHaveBeenCalledWith(
                1,
                "OldPass123",
                "NewPass456",
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Password updated successfully",
            });
        });

        it("should return 500 when old password does not match", async () => {
            req = mockRequest(
                { oldPassword: "WrongOld1", newPassword: "NewPass456" },
                { id: 1 },
            );
            userDao.updatePasswordDAO.mockRejectedValue(
                new Error("Current Password does not match. Please Re-enter"),
            );

            await userAuthEp.updatePassword(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: "Current Password does not match. Please Re-enter",
            });
        });

        it("should return 500 when new password is the same as old password", async () => {
            req = mockRequest(
                { oldPassword: "SamePass1", newPassword: "SamePass1" },
                { id: 1 },
            );
            userDao.updatePasswordDAO.mockRejectedValue(
                new Error("New password cannot be the same as the old password"),
            );

            await userAuthEp.updatePassword(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: "New password cannot be the same as the old password",
            });
        });

        it("should return 500 when user is not found", async () => {
            req = mockRequest(
                { oldPassword: "OldPass123", newPassword: "NewPass456" },
                { id: 99 },
            );
            userDao.updatePasswordDAO.mockRejectedValue(new Error("User not found"));

            await userAuthEp.updatePassword(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
        });

        it("should return 500 on a database update error", async () => {
            req = mockRequest(
                { oldPassword: "OldPass123", newPassword: "NewPass456" },
                { id: 1 },
            );
            userDao.updatePasswordDAO.mockRejectedValue(
                new Error("Database update error"),
            );

            await userAuthEp.updatePassword(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: "Database update error" });
        });

        it("should return 500 on a password hashing error", async () => {
            req = mockRequest(
                { oldPassword: "OldPass123", newPassword: "NewPass456" },
                { id: 1 },
            );
            userDao.updatePasswordDAO.mockRejectedValue(
                new Error("Password hashing error"),
            );

            await userAuthEp.updatePassword(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: "Password hashing error",
            });
        });

        it("should return 500 when DB update affected 0 rows", async () => {
            req = mockRequest(
                { oldPassword: "OldPass123", newPassword: "NewPass456" },
                { id: 1 },
            );
            userDao.updatePasswordDAO.mockRejectedValue(
                new Error("Failed to update password"),
            );

            await userAuthEp.updatePassword(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: "Failed to update password",
            });
        });
    });
});
