// services/sms-service.js
const axios = require('axios');
require('dotenv').config();


exports.sendSMS = async (phoneNumber, message) => {
    try {
        // Format phone number to ensure it's properly formatted
        const formattedNumber = formatPhoneNumber(phoneNumber);

        // Check if phone number is valid
        if (!formattedNumber) {
            throw new Error(`Invalid phone number: ${phoneNumber}`);
        }

        // Log for debugging
        console.log(`Attempting to send SMS to ${formattedNumber}: "${message}"`);

        // If SMS_PROVIDER is set to "mock" in .env, only log and don't actually send
        if (process.env.SMS_PROVIDER === 'mock') {
            console.log(`[SMS MOCK] Would send SMS to ${formattedNumber}: "${message}"`);
            return {
                success: true,
                phoneNumber: formattedNumber,
                message,
                timestamp: new Date().toISOString(),
                provider: 'mock'
            };
        }

        // Get API credentials from environment variables
        const apiKey = process.env.SMS_API_KEY;
        const apiUrl = process.env.SMS_API_URL;

        // FIXED: Use a valid sender ID that's registered with your ShoutOut account
        // The error indicates that "AGROSMS" is not recognized or approved
        // Either use your ShoutOut-approved default sender ID or register AGROSMS properly
        const senderId = process.env.SMS_SENDER_ID || 'AgroWorld'; // Consider changing this to your approved sender ID

        if (!apiKey || !apiUrl) {
            console.warn('SMS gateway credentials not configured, falling back to mock mode');
            return {
                success: true,
                phoneNumber: formattedNumber,
                message,
                timestamp: new Date().toISOString(),
                provider: 'mock',
                note: 'Using mock due to missing configuration'
            };
        }

        // API Call Configuration
        const headers = {
            'Authorization': `Apikey ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // Determine API endpoint
        let apiEndpoint = apiUrl;
        if (!apiEndpoint.includes('/coreservice/') && !apiEndpoint.includes('/v8/')) {
            apiEndpoint = `${apiUrl}/coreservice/messages`;
        }

        console.log(`Using endpoint: ${apiEndpoint}`);
        console.log(`Using source: ${senderId}`);

        // IMPORTANT: Make sure the source is properly registered with ShoutOut
        const response = await axios({
            method: 'post',
            url: apiEndpoint,
            headers: headers,
            data: {
                source: senderId,
                destinations: [formattedNumber],
                content: {
                    sms: message
                },
                transports: ["sms"]
            }
        });

        console.log('SMS Gateway Response:', response.data);

        // Check if the response indicates success
        const success = response.status >= 200 && response.status < 300;

        if (success) {
            console.log(`✅ Successfully sent SMS to ${formattedNumber}`);
            return {
                success: true,
                phoneNumber: formattedNumber,
                message,
                response: response.data,
                timestamp: new Date().toISOString(),
                provider: 'gateway'
            };
        } else {
            console.error(`❌ Failed to send SMS to ${formattedNumber}. Gateway response:`, response.data);
            return {
                success: false,
                phoneNumber: formattedNumber,
                message,
                response: response.data,
                timestamp: new Date().toISOString(),
                provider: 'gateway'
            };
        }
    } catch (error) {
        console.error(`Error sending SMS to ${phoneNumber}:`, error);

        // If the first method failed with specific error about the source
        if (error.response && error.response.data &&
            (error.response.data.description === 'invalid source' ||
                error.response.data.status === '1007')) {

            console.error('ERROR: Invalid sender ID. Please check your SMS_SENDER_ID in the .env file.');
            console.error('You must use a sender ID that is approved by ShoutOut for your account.');
            console.error('To register a new sender ID, please contact ShoutOut support.');

            // Try with a fallback sender ID if available
            if (process.env.SMS_FALLBACK_SENDER_ID) {
                try {
                    console.log(`Trying with fallback sender ID: ${process.env.SMS_FALLBACK_SENDER_ID}`);

                    const apiKey = process.env.SMS_API_KEY;
                    const apiUrl = process.env.SMS_API_URL;
                    const fallbackSenderId = process.env.SMS_FALLBACK_SENDER_ID;
                    const formattedNumber = formatPhoneNumber(phoneNumber);

                    let apiEndpoint = apiUrl;
                    if (!apiEndpoint.includes('/coreservice/') && !apiEndpoint.includes('/v8/')) {
                        apiEndpoint = `${apiUrl}/coreservice/messages`;
                    }

                    const response = await axios({
                        method: 'post',
                        url: apiEndpoint,
                        headers: {
                            'Authorization': `Apikey ${apiKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        data: {
                            source: fallbackSenderId,
                            destinations: [formattedNumber],
                            content: {
                                sms: message
                            },
                            transports: ["sms"]
                        }
                    });

                    console.log('Fallback SMS Gateway Response:', response.data);
                    return {
                        success: true,
                        phoneNumber: formattedNumber,
                        message,
                        response: response.data,
                        timestamp: new Date().toISOString(),
                        provider: 'gateway-fallback'
                    };
                } catch (fallbackError) {
                    console.error('Fallback sender ID also failed:', fallbackError);
                }
            }
        }

        // Try alternative methods if primary method fails with other errors
        if (error.response && (error.response.status === 403 || error.response.status === 500)) {
            try {
                console.log(`First method failed with ${error.response.status}, trying alternative method...`);

                const apiKey = process.env.SMS_API_KEY;
                const baseUrl = process.env.SMS_API_URL || 'https://api.getshoutout.com';
                const senderId = process.env.SMS_SENDER_ID || 'AgroWorld'; // Updated default
                const formattedNumber = formatPhoneNumber(phoneNumber);

                // Try v8 API
                try {
                    const url = `${baseUrl}/v8/message`;
                    const response = await axios.post(url, {
                        sourceAddress: senderId,
                        recipient: formattedNumber,
                        content: message
                    }, {
                        headers: {
                            'Authorization': `Apikey ${apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    console.log('Alternative SMS Gateway Response (v8):', response.data);
                    return {
                        success: true,
                        phoneNumber: formattedNumber,
                        message,
                        response: response.data,
                        timestamp: new Date().toISOString(),
                        provider: 'gateway-v8'
                    };
                } catch (v8Error) {
                    console.log('v8 endpoint failed, trying query parameter method');

                    // Try with query parameters
                    const url = `${baseUrl}/sms/send?apikey=${encodeURIComponent(apiKey)}&to=${encodeURIComponent(formattedNumber)}&from=${encodeURIComponent(senderId)}&text=${encodeURIComponent(message)}`;
                    const response = await axios.get(url);

                    console.log('Alternative SMS Gateway Response (query):', response.data);
                    return {
                        success: true,
                        phoneNumber: formattedNumber,
                        message,
                        response: response.data,
                        timestamp: new Date().toISOString(),
                        provider: 'gateway-query'
                    };
                }
            } catch (altError) {
                console.error(`Alternative SMS methods also failed:`, altError);
                throw altError;
            }
        }

        throw error;
    }
};

// Helper function to ensure phone number is properly formatted
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;

    // Remove any non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');

    // If the number starts with a leading 0, replace it with the country code
    if (cleaned.startsWith('0')) {
        const countryCode = process.env.DEFAULT_COUNTRY_CODE || '94'; // Default to Sri Lanka
        cleaned = countryCode + cleaned.substring(1);
    }

    // If the number doesn't start with +, add it
    if (!cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
    }

    return cleaned;
}