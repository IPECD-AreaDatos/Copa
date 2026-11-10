'use strict';

// Production's SSO flag is loaded from the shared .env file by db.js. Unit tests
// exercise both modes explicitly, so start the suite with runtime SSO disabled.
// Empty values keep dotenv from reloading production flags later in the suite.
process.env.COPA_SSO_ENSAYO_LOCAL = '';
process.env.COPA_SSO_MODE = '';
process.env.COPA_SSO_PRODUCTION_ENABLED = '';
