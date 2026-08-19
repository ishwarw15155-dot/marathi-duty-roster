import crypto from "crypto";
const COOKIE="duty_session"; const MAX_AGE=60*60*8;
const secret=()=>process.env.DUTY_AUTH_SECRET||"CHANGE_THIS_SECRET_IN_VERCEL";
const b64=v=>Buffer.from(v).toString("base64url"); const unb64=v=>Buffer.from(v,"base64url").toString("utf8");
export function users(){return Array.from({length:5},(_,i)=>{const n=i+1;return {username:process.env[`USER${n}_USERNAME`]||`user${n}`,password:process.env[`USER${n}_PASSWORD`]||"",name:process.env[`USER${n}_NAME`]||`User ${n}`,role:process.env[`USER${n}_ROLE`]||"user"};});}
export function makeToken(user){const payload=b64(JSON.stringify({username:user.username,name:user.name,role:user.role,exp:Date.now()+MAX_AGE*1000}));const sig=crypto.createHmac("sha256",secret()).update(payload).digest("base64url");return `${payload}.${sig}`;}
export function verifyToken(token){if(!token)return null;const [payload,sig]=token.split(".");if(!payload||!sig)return null;const expected=crypto.createHmac("sha256",secret()).update(payload).digest("base64url");if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;try{const data=JSON.parse(unb64(payload));return data.exp&&Date.now()<=data.exp?data:null;}catch{return null;}}
export function readCookie(req,name){const raw=req.headers.cookie||"";const part=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${name}=`));return part?decodeURIComponent(part.slice(name.length+1)):null;}
export function setSession(res,user){res.setHeader("Set-Cookie",`${COOKIE}=${encodeURIComponent(makeToken(user))}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`);}
export function clearSession(res){res.setHeader("Set-Cookie",`${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);}
