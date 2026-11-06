export const validImageReference=value=>{if(typeof value!=='string')return false;if(value==='')return true;if(/^\/api\/images\/[a-f0-9-]{36}$/.test(value))return true;try{return new URL(value).protocol==='https:';}catch{return false;}};
export function decodeImageUpload(upload){
 if(!upload||typeof upload.data!=='string'||upload.data.length>480000||!['image/webp','image/png','image/jpeg'].includes(upload.mime)||upload.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(upload.data))return null;
 let binary;try{binary=atob(upload.data);}catch{return null;}const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(!bytes.length||bytes.length>350*1024)return null;
 const ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end));const valid=upload.mime==='image/webp'?bytes.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':upload.mime==='image/png'?bytes[0]===137&&ascii(1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10:bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 return valid?{bytes,mime:upload.mime}:null;
}
export async function readProductBody(request){const reader=request.body?.getReader();if(!reader)throw Error('Corps de requête vide.');const chunks=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>650000){await reader.cancel();throw Error('Image trop volumineuse.');}chunks.push(value);}const data=new Uint8Array(length);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(data));}
