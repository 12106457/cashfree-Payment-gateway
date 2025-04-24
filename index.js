const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const { Cashfree } = require("cashfree-pg"); 
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Function to generate a unique order ID
const generateOrderId = () => {
  const uniqueId = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(uniqueId).digest("hex");
  return hash.substr(0, 12);
};

Cashfree.XClientId = process.env.CLIENT_ID;
Cashfree.XClientSecret = process.env.CLIENT_SECRET;
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX;

app.get('/',(req,res)=>{
  res.send("Welcome to cashfree backend")
})


// Route to create a payment order
app.get("/payment", async (req, res) => {
  try {
    const orderId = await generateOrderId();

    const requestData = {
      customer_details: {
        customer_id: 'sai01',
        customer_phone: '9090990999',
        customer_name: 'Sai',
        customer_email: 'sai@gmail.com',
      },
      link_notify: {
        send_sms: true,
        send_email: true,
      },
      link_purpose: 'Test Payment', // ✅ FIXED here
      link_amount: 10.0,
      link_currency: 'INR',
      link_id: orderId, // optional
      return_url: 'myapp://payment/status',
    };

    const response = await axios.post(
      'https://sandbox.cashfree.com/pg/links', // use api.cashfree.com for production
      requestData,
      {
        headers: {
          'x-client-id': process.env.CLIENT_ID,
          'x-client-secret': process.env.CLIENT_SECRET,
          'x-api-version': '2022-09-01',
          'Content-Type': 'application/json',
        },
      }
    );

    const link = response.data.link_url;

    res.json({
      status: true,
      message: 'Created payment link successfully',
      data: {
        orderId,
        paymentLink: link,
        fullResponse: response.data,
      },
    });

  } catch (error) {
    console.error('Cashfree error:', error.response?.data || error.message);
    res.status(500).json({
      status: false,
      message: 'Failed to create payment link',
      error: error.response?.data || error.message,
    });
  }
});



// app.post("/verify", async (req, res) => {
//   // console.log("Incoming verify payload:", req.body);
//   const { order_id } = req.body;

//   try {
//     let version = "2023-08-01";
//     const response = await Cashfree.PGFetchOrder(version, order_id);
//     const orderData = response.data;

//     console.log("Order fetched successfully:", orderData);

//     if (orderData.order_status === "PAID") {
//       return res.json({ status: true, message: "Payment successful", order: orderData });
//     } else {
//       return res.json({ status: false, message: `Payment not successful. Status: ${orderData.order_status}`, order: orderData });
//     }
//   } catch (error) {
//     console.error("Error verifying order:", error.response?.data || error.message);
//     res.status(500).json({ error: "Failed to verify order" });
//   }
// });


app.post("/verify", async (req, res) => {
  const { order_id } = req.body;

  // 1. Validate input
  if (!order_id || typeof order_id !== "string") {
    return res.status(400).json({ error: "Invalid order_id" });
  }

  try {
    // 2. Fetch order status (latest API version)
    const version = "2024-01-01";
    const response = await Cashfree.PGFetchOrder(version, order_id, {
      timeout: 10000, // 10-second timeout
    });
    const orderData = response.data;

    console.log("Order status:", orderData.order_status);

    // 3. Handle status
    if (orderData.order_status === "PAID") {
      return res.json({ 
        status: true, 
        message: "Payment successful", 
        order: orderData 
      });
    } else {
      return res.json({ 
        status: false, 
        message: `Payment status: ${orderData.order_status}`,
        order: orderData 
      });
    }

  } catch (error) {
    console.error("Error:", {
      message: error.message,
      response: error.response?.data,
    });

    // 4. Specific error handling
    if (error.response?.status === 404) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (error.code === "ECONNABORTED") {
      return res.status(504).json({ error: "Cashfree API timeout" });
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/refund", async (req, res) => {
  const { order_id } = req.body;

  const options = {
    method: 'POST',
    headers: {
      'x-api-version': '2023-08-01',
      'x-client-id': process.env.CLIENT_ID,
      'x-client-secret': process.env.CLIENT_SECRET,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify({
      refund_amount: 1,
      refund_id: generateOrderId(),
      refund_note: "refund note for reference",
      refund_speed: "STANDARD",
    }),
    url: `https://sandbox.cashfree.com/pg/orders/${order_id}/refunds`,
  };

  try {
    const response = await axios(options);
    console.log("refund response:", response.data);
    res.json(response.data);
  } catch (error) {
    console.error("Refund error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});


app.get("/refund-verify", async (req, res) => {
  const { order_id,refund_id } = req.body;

  const options = {
    method: 'POST',
    headers: {
      'x-api-version': '2023-08-01',
      'x-client-id': process.env.CLIENT_ID,
      'x-client-secret': process.env.CLIENT_SECRET,
      'Content-Type': 'application/json',
    },
    url: `https://sandbox.cashfree.com/pg/orders/${order_id}/refunds/${refund_id}`,
  };

  try {
    const response = await axios(options);
    console.log("refund status response:", response.data);
    res.json({status:true,message:"fetch refund data successfully",data:response.data});
  } catch (error) {
    console.error("Refund error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
});


app.listen(8000, () => {
  console.log("Server is running at 8000");
});
