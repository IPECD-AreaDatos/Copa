'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {config}=require('../middleware/sso-config');
test('solo habilita staging con servicio interno local y un origen HTTPS explícito',()=>{
 assert.equal(config({}),null);
 assert.throws(()=>config({COPA_SSO_ENSAYO_LOCAL:'si',COPA_SSO_MODE:'production'}));
 const env={COPA_SSO_MODE:'staging',COPA_SSO_INTERNAL_ORIGIN:'http://127.0.0.1:39001',COPA_SSO_PUBLIC_ORIGIN:'https://staging.example.invalid'};
 assert.deepEqual(config(env),{internal:'http://127.0.0.1:39001',external:'https://staging.example.invalid',identityOrigin:'https://staging.example.invalid',cookieName:'imi_sso_ensayo'});
 for(const change of [{COPA_SSO_INTERNAL_ORIGIN:'http://example.invalid:1234'},{COPA_SSO_INTERNAL_ORIGIN:'http://127.0.0.1:1234/ruta'},{COPA_SSO_PUBLIC_ORIGIN:'http://staging.example.invalid'},{COPA_SSO_PUBLIC_ORIGIN:'https://staging.example.invalid/ruta'}])assert.throws(()=>config({...env,...change}));
});
test('producción requiere activación expresa y el dominio institucional',()=>{
 const env={COPA_SSO_MODE:'production',COPA_SSO_PRODUCTION_ENABLED:'si',COPA_SSO_INTERNAL_ORIGIN:'http://127.0.0.1:39001',COPA_SSO_PUBLIC_ORIGIN:'https://appimi.corrientes.gob.ar'};
 assert.equal(config(env).external,'https://appimi.corrientes.gob.ar');
 assert.equal(config(env).cookieName,'imi_sso');
 assert.throws(()=>config({...env,COPA_SSO_PRODUCTION_ENABLED:''}));
 assert.throws(()=>config({...env,COPA_SSO_PUBLIC_ORIGIN:'https://otro.example.invalid'}));
});
