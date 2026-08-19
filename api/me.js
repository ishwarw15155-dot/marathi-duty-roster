import {readCookie,verifyToken} from "./_auth.js";
export default function handler(req,res){const user=verifyToken(readCookie(req,"duty_session"));if(!user)return res.status(401).json({error:"Not logged in"});return res.status(200).json({user});}
