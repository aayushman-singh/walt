// Import Cashfree SDK (version >=5 uses new API)
import { Cashfree, CFEnvironment } from "cashfree-pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "./logger.js";

// Ensure .env in backend/ is loaded before we read credentials (server imports this
// module before calling dotenv.config in server.js)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

// Validate imports
if (!Cashfree) {
  throw new Error("Failed to import Cashfree from cashfree-pg. Please ensure the package is installed: npm install cashfree-pg");
}

if (!CFEnvironment) {
  throw new Error("CFEnvironment is undefined. The cashfree-pg package may not be properly installed or is an incompatible version. Please check: npm list cashfree-pg");
}

// Determine environment first
const environment = (process.env.CASHFREE_ENVIRONMENT === "PRODUCTION" || process.env.X_ENVIRONMENT === "PRODUCTION")
  ? CFEnvironment.PRODUCTION 
  : CFEnvironment.SANDBOX;

// Get credentials from environment
// If SANDBOX, prefer *_TEST variants when provided
const useTestCreds = environment === CFEnvironment.SANDBOX;
const xClientId = useTestCreds
  ? (process.env.CASHFREE_X_CLIENT_ID_TEST || process.env.X_CLIENT_ID_TEST || process.env.CASHFREE_X_CLIENT_ID || process.env.X_CLIENT_ID || "")
  : (process.env.CASHFREE_X_CLIENT_ID || process.env.X_CLIENT_ID || "");
const xClientSecret = useTestCreds
  ? (process.env.CASHFREE_X_CLIENT_SECRET_TEST || process.env.X_CLIENT_SECRET_TEST || process.env.CASHFREE_X_CLIENT_SECRET || process.env.X_CLIENT_SECRET || "")
  : (process.env.CASHFREE_X_CLIENT_SECRET || process.env.X_CLIENT_SECRET || "");

// Log credential presence (values masked) to help debug startup
const masked = (v) => {
  if (!v) return "";
  if (v.length <= 8) return `${v[0]}***${v.slice(-1)}`;
  return `${v.slice(0, 4)}***${v.slice(-4)}`;
};
logger.info(
  {
    environment: environment === CFEnvironment.PRODUCTION ? "PRODUCTION" : "SANDBOX",
    useTestCreds,
    xClientId: masked(xClientId),
    xClientSecret: masked(xClientSecret),
  },
  "[Cashfree] credentials loaded"
);

// Get API version (use current date in YYYY-MM-DD format)
// Use a stable, supported API version (per Cashfree PG docs)
const getApiVersion = () => "2023-08-01";

// Initialize Cashfree instance
// Version >=5 requires creating an instance with environment and credentials
const cashfree = new Cashfree(environment, xClientId, xClientSecret);
// Set API version expected by SDK (Cashfree v5 reads this property)
cashfree.XApiVersion = getApiVersion();

/**
 * Create a payment order
 */
export async function createOrder(userId, orderAmount, orderCurrency = "INR", customerDetails, metadata = {}) {
  try {
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const normalizedAmount = Number(Number(orderAmount).toFixed(2));
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      throw new Error(`Invalid order amount: ${orderAmount}`);
    }
    if (normalizedAmount < 1) {
      return {
        success: false,
        error: `Order amount below Cashfree minimum (₹1). Amount: ${normalizedAmount}`
      };
    }

    // Sanitize metadata for Cashfree schema
    const orderMeta = {
      return_url: metadata.returnUrl || `${process.env.FRONTEND_URL || 'https://walt.aayushman.dev'}/payment/callback?order_id={order_id}`,
      notify_url: metadata.notifyUrl || `${process.env.BACKEND_URL || 'https://api-walt.aayushman.dev'}/api/payment/webhook`,
    };

    const request = {
      order_amount: normalizedAmount,
      order_currency: orderCurrency,
      order_id: orderId,
      customer_details: {
        customer_id: customerDetails.customer_id || userId,
        customer_email: customerDetails.customer_email || customerDetails.customerEmail,
        customer_phone: customerDetails.customer_phone || customerDetails.customerPhone,
        customer_name: customerDetails.customer_name || customerDetails.customerName || customerDetails.customer_email || "Customer"
      },
      order_meta: orderMeta
    };

    // Log sanitized request (mask phone/email) to debug shape issues
    const maskPhone = (p) => (p ? `${String(p).slice(0, 3)}***${String(p).slice(-2)}` : "");
    const maskedRequest = {
      ...request,
      customer_details: {
        ...request.customer_details,
        customer_email: request.customer_details.customer_email
          ? `${request.customer_details.customer_email.slice(0, 2)}***`
          : undefined,
        customer_phone: maskPhone(request.customer_details.customer_phone)
      }
    };
    logger.info({ request: maskedRequest }, "[Cashfree] createOrder request");

    const response = await cashfree.PGCreateOrder(request);
    
    return {
      success: true,
      orderId: orderId,
      cashfreeOrderId: response.data?.order_id,
      paymentSessionId: response.data?.payment_session_id,
      paymentLink: response.data?.payment_link,
      data: response.data
    };
  } catch (error) {
    const respData = error.response?.data;
    logger.error({ err: error, responseData: respData }, 'Cashfree create order error');
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to create order'
    };
  }
}

/**
 * Fetch order details
 */
export async function fetchOrder(orderId) {
  try {
    const response = await cashfree.PGFetchOrder(orderId);
    
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    logger.error({ err: error }, 'Cashfree fetch order error');
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to fetch order'
    };
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(signature, rawBody, timestamp) {
  try {
    cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp);
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Webhook verification error');
    return {
      success: false,
      error: error.message || 'Webhook verification failed'
    };
  }
}

