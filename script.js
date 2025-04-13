'use strict';

// --- DOM Element References ---
const form = document.getElementById('ip-calculator-form');
const ipAddressInput = document.getElementById('ip-address');
const subnetInput = document.getElementById('subnet-input');
const useDefaultMaskCheckbox = document.getElementById('use-default-mask');
const errorDisplay = document.getElementById('error-display');
const resultsSection = document.getElementById('results-section');

// Result Display Elements
const networkIdResultDd = document.getElementById('network-id-result');
const subnetMaskResultDd = document.getElementById('subnet-mask-result');
const firstIpResultDd = document.getElementById('first-ip-result');
const lastIpResultDd = document.getElementById('last-ip-result');
const broadcastResultDd = document.getElementById('broadcast-result');
const nextNetworkResultDd = document.getElementById('next-network-result');
const hostsCountResultDd = document.getElementById('hosts-count-result');
const gatewayResultDd = document.getElementById('gateway-result');

// --- Utility Functions ---

/**
 * Converts a dotted-decimal IP string to a 32-bit integer.
 * @param {string} ipString - The IP address string (e.g., "192.168.1.1").
 * @returns {number|null} The integer representation or null if invalid.
 */
function ipToInt(ipString) {
    const octets = ipString.split('.');
    if (octets.length !== 4) return null;
    const num = octets.reduce((res, octet) => {
        const val = parseInt(octet, 10);
        // Ensure octet is a valid number and within range 0-255
        if (isNaN(val) || val < 0 || val > 255 || octet.length > 1 && octet.startsWith('0')) {
            // Invalid octet found (e.g., NaN, out of range, leading zeros like '01')
            return null; // Indicate failure
        }
        // Check if reduce already failed
        if (res === null) return null;
        return (res << 8) | val;
    }, 0);
     // Final check if reduction failed
    if (num === null) return null;
    return num >>> 0; // Treat as unsigned 32-bit
}


/**
 * Converts a 32-bit integer to a dotted-decimal IP string.
 * @param {number} ipInt - The 32-bit integer representation.
 * @returns {string} The IP address string.
 */
function intToIp(ipInt) {
    // Ensure we work with unsigned interpretation
    const unsignedInt = ipInt >>> 0;
    return [
        (unsignedInt >> 24) & 255,
        (unsignedInt >> 16) & 255,
        (unsignedInt >> 8) & 255,
        unsignedInt & 255
    ].join('.');
}

/**
 * Validates if a string is a potentially valid subnet mask (structurally).
 * Doesn't check for contiguous bits here, focuses on format.
 * @param {string} maskString - The mask string.
 * @returns {boolean} True if format is like an IP.
 */
function isValidIpFormat(ipString) {
     // Regex checks for XXX.XXX.XXX.XXX format where XXX is 1-3 digits
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ipString)) {
        return false;
    }
    // Check individual octet ranges
    return ipString.split('.').every(octet => {
        const val = parseInt(octet, 10);
        // Allow leading zeros here for flexibility, but check range
        return !isNaN(val) && val >= 0 && val <= 255;
    });
}


/**
 * Validates if a mask integer represents a valid subnet mask (contiguous 1s then 0s).
 * @param {number} maskInt - The mask as a 32-bit integer.
 * @returns {boolean} True if valid.
 */
function isMaskIntegerValid(maskInt) {
    const mask = maskInt >>> 0; // Ensure unsigned
    if (mask === 0) return true; // 0.0.0.0 is technically valid (though unusual)
    if (mask === 0xFFFFFFFF) return true; // 255.255.255.255 is valid

    // Check for contiguous 1s followed by 0s
    const inverted = ~mask >>> 0;
    // Add 1. If the original mask was valid, the result should be a power of 2.
    const invertedPlusOne = (inverted + 1) >>> 0;
    // A power of 2 has only one bit set. Check using: x & (x - 1) == 0
    return invertedPlusOne > 0 && (invertedPlusOne & (invertedPlusOne - 1)) === 0;
}

/**
 * Converts a CIDR prefix length to a 32-bit integer mask.
 * @param {number} cidr - The CIDR prefix length (0-32).
 * @returns {number|null} The mask integer or null if CIDR is invalid.
 */
function cidrToMaskInt(cidr) {
    if (isNaN(cidr) || cidr < 0 || cidr > 32) return null;
    if (cidr === 0) return 0;
    // Create mask by shifting -1 (all 1s) left by (32 - cidr) positions
    return (-1 << (32 - cidr)) >>> 0; // Ensure unsigned result
}

/**
 * Derives the CIDR prefix length from a valid mask integer.
 * @param {number} maskInt - The valid mask integer.
 * @returns {number} The CIDR prefix length.
 */
function maskIntToCidr(maskInt) {
    let cidr = 0;
    let mask = maskInt >>> 0;
    while (mask & 0x80000000) { // Count leading 1s
        cidr++;
        mask <<= 1;
    }
    return cidr;
}

/**
 * Determines the default subnet mask and CIDR based on IP address class.
 * @param {string} ipString - The IP address string.
 * @returns {{maskInt: number, cidr: number, maskStr: string}|null} Object with mask info or null if no standard default.
 */
function getDefaultMaskInfo(ipString) {
    const firstOctet = parseInt(ipString.split('.')[0], 10);
    if (isNaN(firstOctet)) return null;

    let cidr, maskStr;

    if (firstOctet >= 1 && firstOctet <= 126) { // Class A
        cidr = 8; maskStr = '255.0.0.0';
    } else if (firstOctet >= 128 && firstOctet <= 191) { // Class B
        cidr = 16; maskStr = '255.255.0.0';
    } else if (firstOctet >= 192 && firstOctet <= 223) { // Class C
        cidr = 24; maskStr = '255.255.255.0';
    } else {
        // No standard default mask for Class D (Multicast), E (Experimental), or Loopback (127.x.x.x)
        return null;
    }

    const maskInt = ipToInt(maskStr); // Convert default mask string to int
    if (maskInt === null) return null; // Should not happen if maskStr is correct

    return { maskInt, cidr, maskStr };
}

// --- Display Functions ---

/** Clears previous results and error messages. */
function clearOutput() {
    errorDisplay.textContent = '';
    errorDisplay.style.display = 'none';
    resultsSection.style.display = 'none';

    // Clear individual result fields
    const resultFields = [
        networkIdResultDd, subnetMaskResultDd, firstIpResultDd,
        lastIpResultDd, broadcastResultDd, nextNetworkResultDd,
        hostsCountResultDd, gatewayResultDd
    ];
    resultFields.forEach(field => field.textContent = '-');
}

/**
 * Displays an error message to the user.
 * @param {string} message - The error message to display.
 */
function displayError(message) {
    clearOutput(); // Clear any previous results first
    errorDisplay.textContent = message;
    errorDisplay.style.display = 'block';
}

/**
 * Displays the calculated subnetting results.
 * @param {object} results - An object containing the calculated data.
 */
function displayResults(results) {
    clearOutput(); // Clear any previous errors first

    networkIdResultDd.textContent = results.networkIdStr;
    subnetMaskResultDd.textContent = results.subnetMaskStr + ` / ${results.cidr}`;
    firstIpResultDd.textContent = results.firstIpStr;
    lastIpResultDd.textContent = results.lastIpStr;
    broadcastResultDd.textContent = results.broadcastStr;
    nextNetworkResultDd.textContent = results.nextNetworkStr;
    hostsCountResultDd.textContent = results.numHosts.toLocaleString(); // Format large numbers
    gatewayResultDd.textContent = results.gatewayIpStr;

    resultsSection.style.display = 'block';
}

// --- Core Calculation Logic ---

/**
 * Performs the subnet calculations based on IP and mask/CIDR.
 * @param {string} ipStr - The input IP address.
 * @param {string|number} subnetInfo - The subnet mask string, CIDR string (e.g., "/24"), or null/empty for default.
 * @param {boolean} useDefault - Flag indicating if default mask should be used when subnetInfo is empty.
 * @returns {object|null} An object with results or null if error.
 */
function calculateSubnet(ipStr, subnetInfo, useDefault) {
    const ipInt = ipToInt(ipStr);
    if (ipInt === null) {
        displayError(`عنوان IP المدخل "${ipStr}" غير صالح.`);
        return null;
    }

    let maskInt = null;
    let cidr = null;
    let maskStr = '';
    let source = ''; // To track where the mask came from

    // 1. Determine the Mask Integer and CIDR
    if ((subnetInfo === null || subnetInfo === '') && useDefault) {
        // Attempt to use default mask
        const defaultInfo = getDefaultMaskInfo(ipStr);
        if (defaultInfo) {
            maskInt = defaultInfo.maskInt;
            cidr = defaultInfo.cidr;
            maskStr = defaultInfo.maskStr;
            source = 'افتراضي';
        } else {
            const firstOctet = parseInt(ipStr.split('.')[0], 10);
            if (firstOctet >= 224 || firstOctet === 127 || firstOctet === 0) {
                 displayError(`لا يمكن استخدام قناع افتراضي لعناوين Class D/E أو Loopback/Reserved (${ipStr}). يرجى تحديد قناع.`);
            } else {
                displayError(`تعذر تحديد قناع افتراضي لـ ${ipStr}. يرجى إدخاله.`);
            }
            return null;
        }
    } else if (typeof subnetInfo === 'string' && subnetInfo.startsWith('/')) {
        // CIDR notation provided
        const parsedCidr = parseInt(subnetInfo.substring(1), 10);
        maskInt = cidrToMaskInt(parsedCidr);
        if (maskInt === null) {
            displayError(`صيغة CIDR المدخلة "${subnetInfo}" غير صالحة.`);
            return null;
        }
        cidr = parsedCidr;
        maskStr = intToIp(maskInt);
        source = 'CIDR';
    } else if (typeof subnetInfo === 'string' && isValidIpFormat(subnetInfo)) {
        // Dotted-decimal mask provided
        const tempMaskInt = ipToInt(subnetInfo);
        if (tempMaskInt === null || !isMaskIntegerValid(tempMaskInt)) {
            displayError(`قناع الشبكة المدخل "${subnetInfo}" غير صالح (يجب أن يكون بتنسيق IP وبتات 1 متتالية).`);
            return null;
        }
        maskInt = tempMaskInt;
        cidr = maskIntToCidr(maskInt);
        maskStr = subnetInfo;
        source = 'مدخل';
    } else if (subnetInfo !== null && subnetInfo !== '') {
         // Input provided but not valid default trigger, CIDR, or mask
         displayError(`قناع الشبكة / CIDR المدخل "${subnetInfo}" غير مفهوم أو غير صالح.`);
         return null;
    } else {
        // No mask/CIDR provided and default not requested
        displayError("يرجى إدخال قناع الشبكة / CIDR أو تحديد خيار القناع الافتراضي.");
        return null;
    }

    // 2. Perform Calculations
    const networkIdInt = (ipInt & maskInt) >>> 0;
    const wildcardInt = (~maskInt) >>> 0;
    const broadcastInt = (networkIdInt | wildcardInt) >>> 0;
    const networkSize = wildcardInt + 1; // Number of addresses in the block

    let firstIpInt = null;
    let lastIpInt = null;
    let numHosts = 0;

    // Determine usable range and host count based on CIDR
    if (cidr >= 31) { // /31 and /32 have no "usable" range in the traditional sense
        numHosts = (cidr === 31) ? 2 : 1; // /31 has 2 addresses, /32 has 1
        firstIpInt = networkIdInt;
        lastIpInt = broadcastInt; // For /31 & /32, first/last ARE network/broadcast
    } else {
        // /0 to /30
        firstIpInt = networkIdInt + 1;
        lastIpInt = broadcastInt - 1;
        // Host count = 2^(32-cidr) - 2 (for network and broadcast)
        // Use Math.pow or bit shift for efficiency if preferred: (1 << (32 - cidr)) - 2
        numHosts = Math.pow(2, 32 - cidr) - 2;
    }

    // Calculate next network ID
    let nextNetworkInt = null;
    // Check for potential overflow (if current network is the last possible one)
    if (networkIdInt < (0xFFFFFFFF - wildcardInt)) {
        nextNetworkInt = (networkIdInt + networkSize) >>> 0;
    }

    // 3. Format results
    const results = {
        ipStr: ipStr,
        subnetMaskStr: maskStr,
        cidr: cidr,
        maskSource: source, // 'افتراضي', 'CIDR', 'مدخل'
        networkIdStr: intToIp(networkIdInt),
        broadcastStr: intToIp(broadcastInt),
        firstIpStr: (cidr < 31 && firstIpInt <= lastIpInt) ? intToIp(firstIpInt) : 'لا يوجد (أو N/A)',
        lastIpStr: (cidr < 31 && firstIpInt <= lastIpInt) ? intToIp(lastIpInt) : 'لا يوجد (أو N/A)',
        gatewayIpStr: (cidr < 31 && firstIpInt <= lastIpInt) ? intToIp(firstIpInt) : 'لا يوجد (أو N/A)', // Suggest first usable as gateway
        numHosts: numHosts < 0 ? 0 : numHosts, // Ensure non-negative hosts
        nextNetworkStr: (nextNetworkInt !== null) ? intToIp(nextNetworkInt) : 'لا يوجد (الأخيرة)'
    };

     // Special labels for /31 and /32
     if (cidr === 31) {
         results.firstIpStr = `${intToIp(firstIpInt)} (نقطة 1)`;
         results.lastIpStr = `${intToIp(lastIpInt)} (نقطة 2)`;
         results.gatewayIpStr = 'لا ينطبق (/31)';
     } else if (cidr === 32) {
         results.firstIpStr = `نفس عنوان الشبكة (${intToIp(firstIpInt)})`;
         results.lastIpStr = `نفس عنوان الشبكة (${intToIp(lastIpInt)})`;
         results.gatewayIpStr = 'لا ينطبق (/32)';
     }


    return results;
}


// --- Event Listener ---
form.addEventListener('submit', (event) => {
    event.preventDefault(); // Stop form from submitting traditionally
    clearOutput(); // Clear previous results/errors

    const ipAddress = ipAddressInput.value.trim();
    const subnetValue = subnetInput.value.trim();
    const useDefault = useDefaultMaskCheckbox.checked;

    // Validate IP Address presence (further validation inside calculateSubnet)
    if (!ipAddress) {
        displayError("يرجى إدخال عنوان IP.");
        ipAddressInput.focus(); // Focus the IP input field
        return;
    }

    // Perform the calculation
    const results = calculateSubnet(ipAddress, subnetValue, useDefault);

    // Display results or handle errors (errors are displayed within calculateSubnet)
    if (results) {
        displayResults(results);
        // Optionally clear the default checkbox if a specific mask was used successfully
        // if (results.maskSource !== 'افتراضي') {
        //     useDefaultMaskCheckbox.checked = false;
        // }
    }
});

// Optional: Clear error when user starts typing again
ipAddressInput.addEventListener('input', () => { if (errorDisplay.style.display !== 'none') clearOutput(); });
subnetInput.addEventListener('input', () => { if (errorDisplay.style.display !== 'none') clearOutput(); });
useDefaultMaskCheckbox.addEventListener('change', () => { if (errorDisplay.style.display !== 'none') clearOutput(); });
