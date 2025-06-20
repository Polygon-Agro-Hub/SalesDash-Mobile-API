// services/sms-service.js
const axios = require('axios');
require('dotenv').config();


// exports.sendSMS = async (phoneNumber, message) => {
//     try {
//         // Format phone number to ensure it's properly formatted
//         const formattedNumber = formatPhoneNumber(phoneNumber);

//         // Check if phone number is valid
//         if (!formattedNumber) {
//             throw new Error(`Invalid phone number: ${phoneNumber}`);
//         }

//         // Log for debugging
//         console.log(`Attempting to send SMS to ${formattedNumber}: "${message}"`);

//         // If SMS_PROVIDER is set to "mock" in .env, only log and don't actually send
//         if (process.env.SMS_PROVIDER === 'mock') {
//             console.log(`[SMS MOCK] Would send SMS to ${formattedNumber}: "${message}"`);
//             return {
//                 success: true,
//                 phoneNumber: formattedNumber,
//                 message,
//                 timestamp: new Date().toISOString(),
//                 provider: 'mock'
//             };
//         }

//         // Get API credentials from environment variables
//         const apiKey = process.env.SMS_API_KEY;
//         const apiUrl = process.env.SMS_API_URL;

//         // FIXED: Use a valid sender ID that's registered with your ShoutOut account
//         // The error indicates that "AGROSMS" is not recognized or approved
//         // Either use your ShoutOut-approved default sender ID or register AGROSMS properly
//         const senderId = process.env.SMS_SENDER_ID || 'AgroWorld'; // Consider changing this to your approved sender ID

//         if (!apiKey || !apiUrl) {
//             console.warn('SMS gateway credentials not configured, falling back to mock mode');
//             return {
//                 success: true,
//                 phoneNumber: formattedNumber,
//                 message,
//                 timestamp: new Date().toISOString(),
//                 provider: 'mock',
//                 note: 'Using mock due to missing configuration'
//             };
//         }

//         // API Call Configuration
//         const headers = {
//             'Authorization': `Apikey ${apiKey}`,
//             'Content-Type': 'application/json',
//             'Accept': 'application/json'
//         };

//         // Determine API endpoint
//         let apiEndpoint = apiUrl;
//         if (!apiEndpoint.includes('/coreservice/') && !apiEndpoint.includes('/v8/')) {
//             apiEndpoint = `${apiUrl}/coreservice/messages`;
//         }

//         console.log(`Using endpoint: ${apiEndpoint}`);
//         console.log(`Using source: ${senderId}`);

//         // IMPORTANT: Make sure the source is properly registered with ShoutOut
//         const response = await axios({
//             method: 'post',
//             url: apiEndpoint,
//             headers: headers,
//             data: {
//                 source: senderId,
//                 destinations: [formattedNumber],
//                 content: {
//                     sms: message
//                 },
//                 transports: ["sms"]
//             }
//         });

//         console.log('SMS Gateway Response:', response.data);

//         // Check if the response indicates success
//         const success = response.status >= 200 && response.status < 300;

//         if (success) {
//             console.log(`✅ Successfully sent SMS to ${formattedNumber}`);
//             return {
//                 success: true,
//                 phoneNumber: formattedNumber,
//                 message,
//                 response: response.data,
//                 timestamp: new Date().toISOString(),
//                 provider: 'gateway'
//             };
//         } else {
//             console.error(`❌ Failed to send SMS to ${formattedNumber}. Gateway response:`, response.data);
//             return {
//                 success: false,
//                 phoneNumber: formattedNumber,
//                 message,
//                 response: response.data,
//                 timestamp: new Date().toISOString(),
//                 provider: 'gateway'
//             };
//         }
//     } catch (error) {
//         console.error(`Error sending SMS to ${phoneNumber}:`, error);

//         // If the first method failed with specific error about the source
//         if (error.response && error.response.data &&
//             (error.response.data.description === 'invalid source' ||
//                 error.response.data.status === '1007')) {

//             console.error('ERROR: Invalid sender ID. Please check your SMS_SENDER_ID in the .env file.');
//             console.error('You must use a sender ID that is approved by ShoutOut for your account.');
//             console.error('To register a new sender ID, please contact ShoutOut support.');

//             // Try with a fallback sender ID if available
//             if (process.env.SMS_FALLBACK_SENDER_ID) {
//                 try {
//                     console.log(`Trying with fallback sender ID: ${process.env.SMS_FALLBACK_SENDER_ID}`);

//                     const apiKey = process.env.SMS_API_KEY;
//                     const apiUrl = process.env.SMS_API_URL;
//                     const fallbackSenderId = process.env.SMS_FALLBACK_SENDER_ID;
//                     const formattedNumber = formatPhoneNumber(phoneNumber);

//                     let apiEndpoint = apiUrl;
//                     if (!apiEndpoint.includes('/coreservice/') && !apiEndpoint.includes('/v8/')) {
//                         apiEndpoint = `${apiUrl}/coreservice/messages`;
//                     }

//                     const response = await axios({
//                         method: 'post',
//                         url: apiEndpoint,
//                         headers: {
//                             'Authorization': `Apikey ${apiKey}`,
//                             'Content-Type': 'application/json',
//                             'Accept': 'application/json'
//                         },
//                         data: {
//                             source: fallbackSenderId,
//                             destinations: [formattedNumber],
//                             content: {
//                                 sms: message
//                             },
//                             transports: ["sms"]
//                         }
//                     });

//                     console.log('Fallback SMS Gateway Response:', response.data);
//                     return {
//                         success: true,
//                         phoneNumber: formattedNumber,
//                         message,
//                         response: response.data,
//                         timestamp: new Date().toISOString(),
//                         provider: 'gateway-fallback'
//                     };
//                 } catch (fallbackError) {
//                     console.error('Fallback sender ID also failed:', fallbackError);
//                 }
//             }
//         }

//         // Try alternative methods if primary method fails with other errors
//         if (error.response && (error.response.status === 403 || error.response.status === 500)) {
//             try {
//                 console.log(`First method failed with ${error.response.status}, trying alternative method...`);

//                 const apiKey = process.env.SMS_API_KEY;
//                 const baseUrl = process.env.SMS_API_URL || 'https://api.getshoutout.com';
//                 const senderId = process.env.SMS_SENDER_ID || 'AgroWorld'; // Updated default
//                 const formattedNumber = formatPhoneNumber(phoneNumber);

//                 // Try v8 API
//                 try {
//                     const url = `${baseUrl}/v8/message`;
//                     const response = await axios.post(url, {
//                         sourceAddress: senderId,
//                         recipient: formattedNumber,
//                         content: message
//                     }, {
//                         headers: {
//                             'Authorization': `Apikey ${apiKey}`,
//                             'Content-Type': 'application/json'
//                         }
//                     });

//                     console.log('Alternative SMS Gateway Response (v8):', response.data);
//                     return {
//                         success: true,
//                         phoneNumber: formattedNumber,
//                         message,
//                         response: response.data,
//                         timestamp: new Date().toISOString(),
//                         provider: 'gateway-v8'
//                     };
//                 } catch (v8Error) {
//                     console.log('v8 endpoint failed, trying query parameter method');

//                     // Try with query parameters
//                     const url = `${baseUrl}/sms/send?apikey=${encodeURIComponent(apiKey)}&to=${encodeURIComponent(formattedNumber)}&from=${encodeURIComponent(senderId)}&text=${encodeURIComponent(message)}`;
//                     const response = await axios.get(url);

//                     console.log('Alternative SMS Gateway Response (query):', response.data);
//                     return {
//                         success: true,
//                         phoneNumber: formattedNumber,
//                         message,
//                         response: response.data,
//                         timestamp: new Date().toISOString(),
//                         provider: 'gateway-query'
//                     };
//                 }
//             } catch (altError) {
//                 console.error(`Alternative SMS methods also failed:`, altError);
//                 throw altError;
//             }
//         }

//         throw error;
//     }
// };

// // Helper function to ensure phone number is properly formatted
// function formatPhoneNumber(phoneNumber) {
//     if (!phoneNumber) return null;

//     // Remove any non-digit characters
//     let cleaned = phoneNumber.replace(/\D/g, '');

//     // If the number starts with a leading 0, replace it with the country code
//     if (cleaned.startsWith('0')) {
//         const countryCode = process.env.DEFAULT_COUNTRY_CODE || '94'; // Default to Sri Lanka
//         cleaned = countryCode + cleaned.substring(1);
//     }

//     // If the number doesn't start with +, add it
//     if (!cleaned.startsWith('+')) {
//         cleaned = '+' + cleaned;
//     }

//     return cleaned;
// }


exports.sendSMS = async (phoneNumber, message) => {
    try {
        // Format phone number
        const formattedNumber = formatPhoneNumber(phoneNumber);

        if (!formattedNumber) {
            throw new Error(`Invalid phone number: ${phoneNumber}`);
        }

        console.log(`Sending SMS to ${formattedNumber}: "${message}"`);

        // Enhanced debugging for environment variables
        console.log('=== ENVIRONMENT VARIABLES DEBUG ===');
        console.log(`SMS_PROVIDER: "${process.env.SMS_PROVIDER}"`);
        console.log(`SMS_PROVIDER type: ${typeof process.env.SMS_PROVIDER}`);
        console.log(`SMS_PROVIDER === 'gateway': ${process.env.SMS_PROVIDER === 'gateway'}`);
        console.log(`SMS_PROVIDER === 'mock': ${process.env.SMS_PROVIDER === 'mock'}`);

        const apiKey = process.env.SMS_API_KEY;
        const senderId = process.env.SMS_SENDER_ID || 'AgroWorld';

        console.log(`API Key exists: ${!!apiKey}`);
        console.log(`API Key type: ${typeof apiKey}`);
        console.log(`API Key length: ${apiKey ? apiKey.length : 0}`);
        console.log(`API Key first 20 chars: ${apiKey ? apiKey.substring(0, 20) + '...' : 'MISSING'}`);
        console.log(`Sender ID: "${senderId}"`);
        console.log('=====================================');

        // Check if API key is actually valid (not just truthy)
        // if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '' || apiKey === 'undefined' || apiKey === 'null') {
        //     console.warn('SMS gateway credentials not configured, falling back to mock mode');
        //     console.log(`[MOCK] SMS to ${formattedNumber}: "${message}"`);
        //     return {
        //         success: true,
        //         phoneNumber: formattedNumber,
        //         message,
        //         timestamp: new Date().toISOString(),
        //         provider: 'mock',
        //         note: 'Using mock due to missing configuration'
        //     };
        // }

        // Explicit mock mode check (only if explicitly set to 'mock')
        // if (process.env.SMS_PROVIDER && process.env.SMS_PROVIDER.toLowerCase().trim() === 'mock') {
        //     console.log('SMS_PROVIDER explicitly set to mock mode');
        //     console.log(`[MOCK] SMS to ${formattedNumber}: "${message}"`);
        //     return {
        //         success: true,
        //         phoneNumber: formattedNumber,
        //         message,
        //         provider: 'mock',
        //         note: 'Using mock mode as per SMS_PROVIDER setting'
        //     };
        // }

        // If we reach here, we should send real SMS
        console.log('✅ All checks passed, sending real SMS via gateway');

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

        console.log('Request Data:', JSON.stringify(requestData, null, 2));
        console.log('Request Headers (without API key):', {
            'Authorization': `Apikey ${apiKey.substring(0, 20)}...`,
            'Content-Type': 'application/json'
        });

        // Send SMS via ShoutOut API
        const response = await axios.post('https://api.getshoutout.com/coreservice/messages',
            requestData,
            { headers }
        );

        console.log('Response Status:', response.status);
        console.log('Response Data:', JSON.stringify(response.data, null, 2));

        if (response.status >= 200 && response.status < 300) {
            console.log(`✅ SMS sent successfully to ${formattedNumber}`);
            return {
                success: true,
                phoneNumber: formattedNumber,
                message,
                response: response.data,
                provider: 'gateway',
                timestamp: new Date().toISOString()
            };
        } else {
            console.log(`❌ Unexpected response status: ${response.status}`);
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
        console.log('❌ Phone number is null or undefined');
        return null;
    }

    // Convert to string if it's a number
    phoneNumber = phoneNumber.toString();

    // Remove all non-digits
    let cleaned = phoneNumber.replace(/\D/g, '');

    console.log(`Original phone: "${phoneNumber}", Cleaned: "${cleaned}"`);

    // Validate minimum length
    if (cleaned.length < 9) {
        console.log(`❌ Phone number too short: ${cleaned.length} digits`);
        return null;
    }

    // Handle Sri Lankan numbers
    if (cleaned.startsWith('0')) {
        // Remove leading 0 and add Sri Lanka country code
        cleaned = '94' + cleaned.substring(1);
        console.log(`Added Sri Lanka country code: ${cleaned}`);
    } else if (cleaned.startsWith('94')) {
        // Already has country code
        console.log(`Already has country code: ${cleaned}`);
    } else if (cleaned.length === 9) {
        // Assume it's a Sri Lankan number without leading 0
        cleaned = '94' + cleaned;
        console.log(`Added country code to 9-digit number: ${cleaned}`);
    }

    // Add + prefix if not present
    if (!cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
        console.log(`Added + prefix: ${cleaned}`);
    }

    // Final validation
    if (cleaned.length < 12 || cleaned.length > 15) {
        console.log(`❌ Invalid phone number length: ${cleaned.length}`);
        return null;
    }

    console.log(`✅ Final formatted number: ${cleaned}`);
    return cleaned;
}