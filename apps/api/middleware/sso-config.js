'use strict';
// Desactivado por defecto; producción requiere configuración explícita.
function config(env=process.env){
 if(env.COPA_SSO_ENSAYO_LOCAL==='si'){
  if(env.COPA_SSO_MODE)throw Error('Configuración de entornos incompatible');
  return {internal:'http://127.0.0.1:38966',external:'http://127.0.0.1:3006',identityOrigin:'http://127.0.0.1:38966',cookieName:'imi_sso_ensayo'};
 }
 if(!env.COPA_SSO_MODE)return null;
 if(!['staging','production'].includes(env.COPA_SSO_MODE))throw Error('Modo SSO inválido');
 if(env.COPA_SSO_MODE==='production'&&env.COPA_SSO_PRODUCTION_ENABLED!=='si')throw Error('SSO de producción no habilitado');
 let internal,external;
 try{internal=new URL(env.COPA_SSO_INTERNAL_ORIGIN||'');external=new URL(env.COPA_SSO_PUBLIC_ORIGIN||'')}catch{throw Error('Configuración SSO de staging inválida')}
 if(internal.protocol!=='http:'||internal.hostname!=='127.0.0.1'||!internal.port||internal.pathname!=='/'||internal.username||internal.password||internal.search||internal.hash)throw Error('Servicio SSO interno inválido');
 if(external.protocol!=='https:'||external.pathname!=='/'||external.username||external.password||external.search||external.hash)throw Error('Origen público de staging inválido');
 if(env.COPA_SSO_MODE==='production'&&external.origin!=='https://appimi.corrientes.gob.ar')throw Error('Origen de producción inválido');
 return {internal:internal.origin,external:external.origin,identityOrigin:external.origin,cookieName:env.COPA_SSO_MODE==='production'?'imi_sso':'imi_sso_ensayo'};
}
function sessionCookie(req,sso){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(sso.cookieName+'=')&&/^[A-Za-z0-9_-]{43}$/.test(x.slice(sso.cookieName.length+1)))}
module.exports={config,sessionCookie};
