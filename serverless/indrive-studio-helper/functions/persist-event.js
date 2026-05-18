const axios = require("axios");

exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
   response.appendHeader('Access-Control-Allow-Origin', '*');
  response.appendHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.appendHeader('Content-Type', 'application/json');
  response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');


  try {
    const {phoneNumber,name,country,vehicle,above18,driversLicense,vehicleRegistration} = event;
   
    const apiResponse = await axios
  .post(context.GOOGLE_SHEET_ENDPOINT, {
        phoneNumber,name,country,vehicle,above18,driversLicense,vehicleRegistration
  });

  console.log("✅ API Response:", apiResponse.data);
   

    response.setStatusCode(200);
    response.setBody({ status: "success", result:apiResponse.data });
    return callback(null, response);

  } catch (error) {
    console.error("❌ Error:", error.message);
    
    response.setStatusCode(500);
    response.setBody({ error: "Internal Server Error", message: error.message });
    return callback(null, response);
  }
};