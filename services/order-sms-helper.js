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

function getColomboNow(dateObj = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(dateObj);
  const getPart = (type) =>
    parseInt(parts.find((p) => p.type === type).value, 10);
  const hourVal = getPart("hour");
  const hour = hourVal === 24 ? 0 : hourVal;
  return {
    year: getPart("year"),
    month: getPart("month") - 1,
    day: getPart("day"),
    hour,
    isAfterCutoff: hour >= 18,
  };
}

/**
 * Calculate Earliest Possible Schedule Date (E.P.S.D.)
 * - If order is placed before 6:00 PM: today + 3 days (13 Oct -> 16 Oct)
 * - If order is placed at or after 6:00 PM: today + 4 days (13 Oct -> 17 Oct)
 */
function getEarliestPossibleScheduleDate(
  orderPlacedTime = new Date(),
  isWholesale = false,
) {
  const now =
    orderPlacedTime instanceof Date
      ? orderPlacedTime
      : new Date(orderPlacedTime);
  const colomboNow = getColomboNow(now);
  const isAfter6PM = colomboNow.isAfterCutoff; // 6:00 PM cutoff rule in Colombo
  const extraDays = isWholesale
    ? (isAfter6PM ? 3 : 2)
    : (isAfter6PM ? 4 : 3);

  const epsd = new Date(
    colomboNow.year,
    colomboNow.month,
    colomboNow.day + extraDays,
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
  isPackage = 0,
  isFinalizeImdt = 1,
  orderPlacedTime = new Date(),
  isWholesale = false,
}) {
  const epsd = getEarliestPossibleScheduleDate(orderPlacedTime, isWholesale);
  const schedDate = parseDeliveryDate(deliveryDate);

  const isCard =
    paymentMethod && String(paymentMethod).toLowerCase().includes("card");
  const isImmediateFinalize =
    isFinalizeImdt === 1 || isFinalizeImdt === true || isFinalizeImdt === "1";
  const isPackageOrder =
    isPackage === 1 || isPackage === true || isPackage === "1";

  const baseDeliveryDate = schedDate || epsd;

  // Processing Date is lead time before Delivery Date (2 days for Wholesale, 3 days for Retail)
  const leadDays = isWholesale ? 2 : 3;
  const processingDate = new Date(baseDeliveryDate.getTime());
  processingDate.setDate(processingDate.getDate() - leadDays);

  // "At EPSD" = Delivery Date is the earliest possible date (or earlier)
  const isAtEPSD = !!schedDate && schedDate.getTime() <= epsd.getTime();

  // ── SCENARIO 5: Review and confirm before delivery ───────────────────────
  // Strictly for Package orders (isPackage = 1) where review before delivery was chosen
  if (isPackageOrder && !isImmediateFinalize) {
    // Date is Processing Date + 1 (i.e. Delivery Date - 2 for retail)
    const reviewDate = new Date(processingDate.getTime());
    reviewDate.setDate(reviewDate.getDate() + 1);
    const formattedDate = formatSmsDate(reviewDate);

    return {
      type: 5,
      scenario: "Review and confirm before delivery",
      message: `Dear Customer, You’ll receive an order review request via the Polygon Platform by 8:00 AM on ${formattedDate}. Please review and accept your order by 6:00 PM or it will be canceled.`,
    };
  }

  // ── SCENARIOS 1 & 2: Delivery Date = EPSD (Earlier Possible Date) ─────────
  if (isAtEPSD) {
    if (!isCard) {
      const formattedDeliveryDate = formatSmsDate(baseDeliveryDate);
      return {
        type: 1,
        scenario: "Delivery Date = EPSD - Cash",
        message:
          `Dear customer, your order has been successfully placed!\n` +
          `Invoice: #${invoiceNo}\n` +
          `Delivery Date: ${formattedDeliveryDate}\n` +
          `Thank you for choosing Polygon Holdings!\n` +
          `Support: +94 114313433`,
      };
    } else {
      return {
        type: 2,
        scenario: "Delivery Date = EPSD - Card",
        message: `Dear Customer, We’ve sent you an order confirmation request via the Polygon Platform. Please pay by 6:00 PM to confirm your order, or it will be cancelled.`,
      };
    }
  }

  // ── SCENARIOS 3 & 4: Delivery Date > EPSD (After E.P.S.D.) ─────────────────
  const formattedProcessingDate = formatSmsDate(processingDate);

  if (!isCard) {
    // Pay by cash
    return {
      type: 3,
      scenario: "Delivery Date > EPSD - Cash",
      message: `Dear Customer, You’ll receive an order confirmation request via the Polygon Platform by 8:00 AM on ${formattedProcessingDate}. Please confirm your order by 6:00 PM or it will be canceled.`,
    };
  } else {
    // Card (in-app, Customer has to pay on the Processing Date)
    return {
      type: 4,
      scenario: "Delivery Date > EPSD - Card",
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
  isPackage,
  isFinalizeImdt,
  orderPlacedTime,
  isWholesale,
}) {
  const result = generateOrderConfirmationSMS({
    invoiceNo,
    deliveryDate,
    paymentMethod,
    isPackage,
    isFinalizeImdt,
    orderPlacedTime,
    isWholesale,
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
