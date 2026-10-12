const smsService = require("./sms-service");

/**
 * Format a Date object cleanly for SMS, e.g. "15 Oct 2026"
 */
function formatSmsDate(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);

  const day = String(d.getDate()).padStart(2, "0");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Parse an incoming date string/Date object into a normalized Date (00:00:00).
 */
function parseDeliveryDate(rawDate) {
  if (!rawDate) return null;
  if (rawDate instanceof Date) {
    const d = new Date(rawDate.getTime());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const str = String(rawDate).trim();
  if (str.includes("-")) {
    const parts = str.split("T")[0].split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d, 0, 0, 0, 0);
    }
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }
  return null;
}

/**
 * Calculate Earliest Possible Schedule Date (E.P.S.D.)
 * - If order is placed before 6:00 PM: today + 3 days
 * - If order is placed at or after 6:00 PM: today + 4 days
 */
function getEarliestPossibleScheduleDate(orderPlacedTime = new Date()) {
  const now =
    orderPlacedTime instanceof Date
      ? orderPlacedTime
      : new Date(orderPlacedTime);
  const isAfter6PM = now.getHours() >= 18; // 6:00 PM cutoff rule
  const extraDays = isAfter6PM ? 4 : 3;

  const epsd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + extraDays,
  );
  epsd.setHours(0, 0, 0, 0);
  return epsd;
}

/**
 * Generate the SMS text based on the 5 business scenarios:
 *
 * 1. Finalize Immediately, Delivery Date = EPSD, Cash
 * 2. Finalize Immediately, Delivery Date = EPSD, Card
 * 3. Finalize Immediately, Delivery Date > EPSD, Cash
 * 4. Finalize Immediately, Delivery Date > EPSD, Card
 * 5. Review and confirm before delivery (isFinalizeImdt === 0)
 */
function generateOrderConfirmationSMS({
  invoiceNo,
  deliveryDate,
  paymentMethod,
  isFinalizeImdt = 1,
  orderPlacedTime = new Date(),
}) {
  const epsd = getEarliestPossibleScheduleDate(orderPlacedTime);
  const schedDate = parseDeliveryDate(deliveryDate);

  const isCard =
    paymentMethod && String(paymentMethod).toLowerCase().includes("card");
  const isImmediateFinalize =
    isFinalizeImdt === 1 || isFinalizeImdt === true || isFinalizeImdt === "1";

  const baseDeliveryDate = schedDate || epsd;

  // Check if Delivery Date equals EPSD
  const isAtEPSD =
    schedDate &&
    schedDate.getFullYear() === epsd.getFullYear() &&
    schedDate.getMonth() === epsd.getMonth() &&
    schedDate.getDate() === epsd.getDate();

  // Processing Date is 2 days before Delivery Date (Delivery Date - 2)
  const processingDate = new Date(baseDeliveryDate.getTime());
  processingDate.setDate(processingDate.getDate() - 2);

  // ── SCENARIO 5: Review and confirm before delivery ───────────────────────
  if (!isImmediateFinalize) {
    // Processing Date + 1 (i.e. Delivery Date - 2 + 1 = Delivery Date - 1)
    const processingDatePlusOne = new Date(processingDate.getTime());
    processingDatePlusOne.setDate(processingDatePlusOne.getDate() + 1);
    const formattedDate = formatSmsDate(processingDatePlusOne);

    return {
      type: 5,
      scenario: "Review and confirm before delivery",
      message: `Dear Customer, You’ll receive an order confirmation request via the Polygon Platform by 8:00 AM on ${formattedDate}. Please pay by 6:00 PM to confirm your order, or it will be canceled.`,
    };
  }

  // ── SCENARIOS 1 & 2: Finalize Immediately & Delivery Date = EPSD ─────────
  if (isAtEPSD) {
    if (!isCard) {
      // Scenario 1: Cash
      const formattedDeliveryDate = formatSmsDate(baseDeliveryDate);
      return {
        type: 1,
        scenario: "Finalize Immediately - Delivery Date = EPSD - Cash",
        message:
          `Dear customer, your order has been successfully placed!\n` +
          `Invoice: #${invoiceNo}\n` +
          `Delivery Date: ${formattedDeliveryDate}\n` +
          `Thank you for choosing Polygon Holdings!\n` +
          `Support: +94 114313433`,
      };
    } else {
      // Scenario 2: Card (In-app, Customer has to pay today)
      return {
        type: 2,
        scenario: "Finalize Immediately - Delivery Date = EPSD - Card",
        message: `Dear Customer, We’ve sent you an order confirmation request via the Polygon Platform. Please pay by 6:00 PM to confirm your order, or it will be cancelled.`,
      };
    }
  }

  // ── SCENARIOS 3 & 4: Finalize Immediately & Delivery Date > EPSD ─────────
  const formattedProcessingDate = formatSmsDate(processingDate);

  if (!isCard) {
    // Scenario 3: Cash
    return {
      type: 3,
      scenario: "Finalize Immediately - Delivery Date > EPSD - Cash",
      message: `Dear Customer, You’ll receive an order confirmation request via the Polygon Platform by 8:00 AM on ${formattedProcessingDate}. Please confirm your order by 6:00 PM or it will be canceled.`,
    };
  } else {
    // Scenario 4: Card (In-app, Customer has to pay on the Processing changing date)
    return {
      type: 4,
      scenario: "Finalize Immediately - Delivery Date > EPSD - Card",
      message: `Dear Customer, You’ll receive an order confirmation request via the Polygon Platform by 8:00 AM on ${formattedProcessingDate}. Please pay by 6:00 PM to confirm your order, or it will be canceled.`,
    };
  }
}

/**
 * Helper to build and dispatch order confirmation SMS to customer
 */
async function sendOrderConfirmationSMSHelper({
  phoneNumber,
  invoiceNo,
  deliveryDate,
  paymentMethod,
  isFinalizeImdt,
  orderPlacedTime,
}) {
  const result = generateOrderConfirmationSMS({
    invoiceNo,
    deliveryDate,
    paymentMethod,
    isFinalizeImdt,
    orderPlacedTime,
  });

  console.log(
    `📱 [Order SMS] Dispatching Type ${result.type} (${result.scenario}) to ${phoneNumber}`,
  );
  console.log(`📱 [Order SMS Content]:\n${result.message}`);

  const smsResult = await smsService.sendSMS(phoneNumber, result.message);
  return {
    ...smsResult,
    smsType: result.type,
    scenario: result.scenario,
  };
}

module.exports = {
  formatSmsDate,
  parseDeliveryDate,
  getEarliestPossibleScheduleDate,
  generateOrderConfirmationSMS,
  sendOrderConfirmationSMSHelper,
};
