const twilio = require('twilio');
const fs = require('fs');
const path = require('path');

// Initialize Twilio Client using Environment Variables
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function deployStudio() {
    try {
        const serviceName = process.env.SERVICE_NAME;
        const flowSid = process.env.STUDIO_FLOW_SID;

        console.log(`Fetching Serverless details for service: ${serviceName}`);

        // 1. Get the Serverless Service SID
        const services = await client.serverless.v1.services.list();
        const service = services.find(s => s.uniqueName === serviceName || s.friendlyName === serviceName);

        if (!service) {
            throw new Error(`Serverless Service '${serviceName}' not found.`);
        }

        // 2. Get the active environment to retrieve the Domain and Environment SID
        const environments = await client.serverless.v1.services(service.sid).environments.list();
        if (environments.length === 0) {
            throw new Error(`No environments found for service ${service.sid}.`);
        }
        
        const env = environments[0]; 

        console.log(`Found Domain: ${env.domainName}`);
        console.log(`Found Environment SID: ${env.sid}`);

        // 3. Get all Functions in the service to map their paths (friendlyName) to their SIDs (ZH...)
        const functions = await client.serverless.v1.services(service.sid).functions.list();
        const functionMap = {};
        
        functions.forEach(f => {
            // The Twilio CLI Serverless plugin sets the friendlyName to the function's path
            functionMap[f.friendlyName] = f.sid;
        });

        console.log('Function mapping retrieved:', Object.keys(functionMap));

        // 4. Read and Parse the Studio Flow template
        const templatePath = path.join(__dirname, 'flow-template.json');
        const flowJsonString = fs.readFileSync(templatePath, 'utf8');
        const flowData = JSON.parse(flowJsonString);

        // 5. Traverse the Studio Flow states and update "run-function" widgets dynamically
        flowData.states.forEach(state => {
            if (state.type === 'run-function') {
                let functionPath = state.properties.url;

                // Extract the path if the template accidentally contains a fully qualified URL
                if (functionPath && functionPath.startsWith('http')) {
                    try {
                        functionPath = new URL(functionPath).pathname;
                    } catch (e) {
                        console.warn(`Could not parse URL for widget ${state.name}`);
                    }
                }

                // Identify the function_sid using the path
                const functionSid = functionMap[functionPath];

                if (functionSid) {
                    console.log(`Updating widget '${state.name}' -> mapped path '${functionPath}' to Function SID '${functionSid}'`);
                    
                    // Inject the dynamic values directly into the parsed JSON object
                    state.properties.service_sid = service.sid;
                    state.properties.environment_sid = env.sid;
                    state.properties.function_sid = functionSid;
                    state.properties.url = `https://${env.domainName}${functionPath}`;
                } else {
                    console.warn(`Warning: No matching Twilio Function found for path '${functionPath}' in widget '${state.name}'`);
                }
            }
        });

        // 6. Update and Publish the Studio Flow using the modified JSON object
        console.log(`Deploying updates to Studio Flow: ${flowSid}`);
        const flow = await client.studio.v2.flows(flowSid).update({
            status: 'published',
            commitMessage: `Automated deployment via GitHub Actions - ${new Date().toISOString()}`,
            definition: flowData // Pass the JSON object directly
        });

        console.log(`Success! Studio flow published. Revision: ${flow.revision}`);

    } catch (error) {
        console.error("Error during Studio deployment:", error);
        process.exit(1);
    }
}

deployStudio();