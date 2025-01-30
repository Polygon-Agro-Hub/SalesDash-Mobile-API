exports.validateCustomerData = (req, res, next) => {
    const { firstName, lastName, phoneNumber, email, buildingType } = req.body;

    // Check if all required fields are present
    if (!firstName || !lastName || !phoneNumber || !email || !buildingType) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate phone number format
    const phoneRegex = /^[0-9]{3}[0-9]{7}$/;
    if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Validate email format
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    next();
};
