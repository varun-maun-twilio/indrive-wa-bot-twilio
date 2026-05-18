exports.handler = async function(context, event, callback) {
  // Create a custom Twilio Response object
  const response = new Twilio.Response();

  // The URL of the protected media file
  const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${context.ACCOUNT_SID}/Messages/${event.messageSid}/Media/${event.mediaSid}`;

  // 1. Retrieve credentials. 
  // We use context to pull from Twilio Environment Variables.
  // Fallbacks to event parameters are included for testing purposes.
  const username = context.ACCOUNT_SID;
  const password = context.AUTH_TOKEN;

  // Fail early if credentials are missing
  if (!username || !password) {
    response.setStatusCode(401);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody({ error: 'Missing authentication credentials.' });
    return callback(null, response);
  }

  try {
    // 2. Construct the Basic Auth header
    const authString = `${username}:${password}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    // 3. Fetch the media file, passing the Authorization header
    const mediaReq = await fetch(mediaUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader
      }
    });
    
    // Check if the external server accepted our credentials and found the file
    if (!mediaReq.ok) {
      throw new Error(`Failed to fetch media: ${mediaReq.statusText} (Status: ${mediaReq.status})`);
    }

    // 4. Convert the response to an ArrayBuffer, then to a Node.js Buffer
    const arrayBuffer = await mediaReq.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 5. Get the content type from the original request so we forward the correct MIME type
    const contentType = mediaReq.headers.get('content-type') || 'application/octet-stream';

    // 6. Set the headers and the body to return to the caller
    response.appendHeader('Content-Type', contentType);
    response.setBody(buffer);

    return callback(null, response);

  } catch (error) {
    console.error('Error fetching external media:', error);
    
    response.setStatusCode(500);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody({ error: 'Failed to retrieve media file.' });
    
    return callback(null, response);
  }
};