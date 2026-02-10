
const axios = require('axios');
require('dotenv').config();


exports.sendSMS = async (phoneNumber, message) => {
    try {
        // Format phone number
        const formattedNumber = formatPhoneNumber(phoneNumber);

        if (!formattedNumber) {
            throw new Error(`Invalid phone number: ${phoneNumber}`);
        }

        const apiKey = process.env.SMS_API_KEY;
        const senderId = process.env.SMS_SENDER_ID || 'PolygonAgro';

        // Prepare request data
        const requestData = {
            source: senderId,
            destinations: [formattedNumber],
            content: { sms: message },
            transports: ["sms"]
        };

        const headers = {
            'Authorization': `Apikey ${apiKey}`,
            'Content-Type': 'application/json'
        };


        // Send SMS via ShoutOut API
        const response = await axios.post('https://api.getshoutout.com/coreservice/messages',
            requestData,
            { headers }
        );


        if (response.status >= 200 && response.status < 300) {

            return {
                success: true,
                phoneNumber: formattedNumber,
                message,
                response: response.data,
                provider: 'gateway',
                timestamp: new Date().toISOString()
            };
        } else {

            return {
                success: false,
                phoneNumber: formattedNumber,
                message,
                error: `Unexpected status: ${response.status}`,
                response: response.data,
                provider: 'gateway'
            };
        }

    } catch (error) {
        console.error(`❌ Failed to send SMS to ${phoneNumber}:`);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
            console.error('Response headers:', JSON.stringify(error.response.headers, null, 2));

            // Check for common API errors
            if (error.response.status === 401) {
                console.error('❌ AUTHENTICATION ERROR: Check your API key');
            } else if (error.response.status === 400) {
                console.error('❌ BAD REQUEST: Check your request format');
            } else if (error.response.status === 429) {
                console.error('❌ RATE LIMIT EXCEEDED: Too many requests');
            }
        } else if (error.request) {
            console.error('No response received:', error.request);
            console.error('❌ NETWORK ERROR: Check your internet connection and API URL');
        } else {
            console.error('Error setting up request:', error.message);
        }

        return {
            success: false,
            phoneNumber: phoneNumber,
            message,
            error: error.message,
            responseData: error.response?.data,
            responseStatus: error.response?.status,
            provider: 'gateway',
            timestamp: new Date().toISOString()
        };
    }
};

// Helper function to format phone number with better validation
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) {

        return null;
    }

    // Convert to string if it's a number
    phoneNumber = phoneNumber.toString();

    // Remove all non-digits
    let cleaned = phoneNumber.replace(/\D/g, '');




    if (cleaned.length < 9) {

        return null;
    }


    if (cleaned.startsWith('0')) {

        cleaned = '94' + cleaned.substring(1);

    } else if (cleaned.startsWith('94')) {

    } else if (cleaned.length === 9) {

        cleaned = '94' + cleaned;

    }

    // Add + prefix if not present
    if (!cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;

    }

    // Final validation
    if (cleaned.length < 12 || cleaned.length > 15) {

        return null;
    }

    return cleaned;
}