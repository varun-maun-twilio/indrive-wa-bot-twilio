const twilio = require('twilio');
const fs = require('fs');
const path = require('path');

/**
 * Looks up the Twilio Serverless service by friendly name and returns its
 * production environment domain, e.g. "indrive-wa-bot-1234-prod.twil.io".
 * This domain is unique per account, so it must be resolved at deploy time
 * rather than hardcoded in the flow template.
 */
async function getServerlessDomain(client, serviceFriendlyName) {
  const services = await client.serverless.v1.services.list();
  const service = services.find(s => s.friendlyName === serviceFriendlyName);

  if (!service) {
    throw new Error(
      `Serverless service "${serviceFriendlyName}" not found. ` +
      `Deploy functions before deploying the Studio flow.`
    );
  }

  // The production environment has the tag "production" in twilio-run deploys
  const environments = await client.serverless.v1
    .services(service.sid)
    .environments.list();

  const prodEnv = environments.find(e => e.uniqueName === 'production') || environments[0];

  if (!prodEnv) {
    throw new Error(`No environments found for service "${serviceFriendlyName}"`);
  }

  console.log(
    `  Serverless service : ${service.sid} (${service.friendlyName})\n` +
    `  Environment        : ${prodEnv.uniqueName}\n` +
    `  Domain             : ${prodEnv.domainName}`
  );

  return {serverlessDomain: prodEnv.domainName};
}

async function deployFlow(accountConfig) {
  const { alias, flowFriendlyName, serverlessServiceName, conversationWidgets} = accountConfig;

  // Credentials are env vars named by account alias
  const envKey = alias.toUpperCase().replace(/-/g, '_');
  const accountSid = process.env[`TWILIO_ACCOUNT_SID_${envKey}`];
  const authToken  = process.env[`TWILIO_AUTH_TOKEN_${envKey}`];

  if (!accountSid || !authToken) {
    throw new Error(`Missing credentials for account alias: ${alias}`);
  }

  const client = twilio(accountSid, authToken);

  // ── 1. Resolve the serverless domain for this account ─────────────────────
  console.log(`[${alias}] Resolving serverless domain for "${serverlessServiceName}"...`);
  const {serverlessDomain} = await getServerlessDomain(client, serverlessServiceName);

  // ── 2. Load template and substitute all placeholders ──────────────────────
  let flowJson = fs.readFileSync(
    path.join(__dirname, '../studio/flow-template.json'), 'utf8'
  );

  flowJson = flowJson
    .replace(/{{SERVERLESS_DOMAIN}}/g, serverlessDomain)     // e.g. used in run-function widget URLs
    .replace(/{{SERVERLESS_SERVICE_SID}}/g, "TEST3")
    .replace(/{{SERVERLESS_ENV_SID}}/g, "TEST4")
    .replace(/{{SERVERLESS_FN_PERSIST_SID}}/g, "TEST2");

  const flowDefinition = JSON.parse(flowJson);

  for(const widgetName of Object.keys(conversationWidgets)) {
    const widget = flowDefinition.states.find(s => s.name === widgetName);
    if (widget) {
        if(conversationWidgets[widgetName].contentTemplateSid){
           widget.properties.message_type = "content_template";
           widget.properties.content_sid = conversationWidgets[widgetName].contentTemplateSid;
           console.log(`Updated widget "${widgetName}" with content template SID: ${conversationWidgets[widgetName].contentTemplateSid}`);
        }
        else{
              widget.properties.message_type = "custom";
              widget.properties.body = conversationWidgets[widgetName].body;
              console.log(`Updated widget "${widgetName}" with custom message body: ${conversationWidgets[widgetName].body}`);
        }
        
    }
    }

    console.log(`[${alias}] Final flow definition:`, JSON.stringify(flowDefinition, null, 2));

  // ── 3. Upsert: update existing flow or create new ─────────────────────────
  console.log(`[${alias}] Deploying Studio flow "${flowFriendlyName}"...`);
  const flows = await client.studio.v2.flows.list();
  const existing = flows.find(f => f.friendlyName === flowFriendlyName);

  /*
  if (existing) {
    console.log(`[${alias}] Updating existing flow: ${existing.sid}`);
    await client.studio.v2.flows(existing.sid).update({
      commitMessage: `Deploy from GitHub Actions - ${process.env.GITHUB_SHA || 'local'}`,
      friendlyName: flowFriendlyName,
      status: 'published',
      definition: flowDefinition,
    });
    console.log(`[${alias}] ✓ Flow updated: ${existing.sid}`);
  } else {
    console.log(`[${alias}] Creating new flow...`);
    const newFlow = await client.studio.v2.flows.create({
      commitMessage: `Initial deploy from GitHub Actions - ${process.env.GITHUB_SHA || 'local'}`,
      friendlyName: flowFriendlyName,
      status: 'published',
      definition: flowDefinition,
    });
    console.log(`[${alias}] ✓ Flow created: ${newFlow.sid}`);
  }
    */
}

// ── Entrypoint ────────────────────────────────────────────────────────────────
const alias = process.argv[2];
if (!alias) throw new Error('Usage: node deployFlow.js <account-alias>');

const accounts = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../config/accounts.json'), 'utf8')
);
const accountConfig = accounts.find(a => a.alias === alias);
if (!accountConfig) throw new Error(`No account config found for alias: ${alias}`);

deployFlow(accountConfig).catch(err => {
  console.error(`[${alias}] ✗ Deploy failed:`, err.message);
  process.exit(1);
});