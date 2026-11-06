import {validImageReference,decodeImageUpload,readProductBody} from './product-images.js';
import {readSettings,publicSettings,validateSettings} from './store-settings.js';
import { catalogue } from './catalogue.js';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
async function sign(value,key){const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,enc.encode(value)));}
async function equal(a,b){const [x,y]=await Promise.all([a,b].map(s=>crypto.subtle.digest('SHA-256',enc.encode(s))));return hex(x)===hex(y);}
async function auth(req,env){if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return false;const token=(req.headers.get('Cookie')||'').match(/(?:^|; )session=([^;]+)/)?.[1];if(!token)return false;const [expiry,sig]=token.split('.');return Number(expiry)>Date.now()&& await equal(sig||'',await sign(expiry,env.SESSION_SECRET));}
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;
export default {async fetch(req,env){const url=new URL(req.url),p=url.pathname;
if(!p.startsWith('/api/')){const r=await env.ASSETS.fetch(req);const h=new Headers(r.headers);if((h.get('Content-Type')||'').includes('text/html'))h.set('Cache-Control','no-cache');h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','strict-origin-when-cross-origin');h.set('Content-Security-Policy',"default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return new Response(r.body,{status:r.status,headers:h});}
try {
if(!['GET','HEAD'].includes(req.method)&&req.headers.get('Origin')!==url.origin)return json({error:'Origine non autorisée.'},403);
if(req.method!=='GET'&&Number(req.headers.get('Content-Length')||0)>(p==='/api/admin/products'?650000:50000))return json({error:'Requête trop volumineuse.'},413);
if(/^\/api\/images\/[a-f0-9-]{36}$/.test(p)&&['GET','HEAD'].includes(req.method)){const image=await env.DB.prepare('SELECT data,mime FROM product_images WHERE id=?').bind(p.split('/').pop()).first();if(!image)return json({error:'Image introuvable.'},404);return new Response(req.method==='HEAD'?null:new Uint8Array(image.data),{headers:{'Content-Type':image.mime,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});}
if(p==='/api/settings'&&req.method==='GET')return json(publicSettings(await readSettings(env.DB)));
if(p==='/api/products'&&req.method==='GET')return json(await catalogue(env.DB,url));
if(p==='/api/collections'&&req.method==='GET')return json((await env.DB.prepare('SELECT id,handle,title FROM collections ORDER BY title COLLATE NOCASE').all()).results);
if(/^\/api\/products\/\d+$/.test(p)&&req.method==='GET'){
 const product=await env.DB.prepare('SELECT * FROM products WHERE id=? AND active=1 AND price IS NOT NULL').bind(Number(p.split('/').pop())).first();
 return product?json(product):json({error:'Produit introuvable.'},404);
}
if(p==='/api/login'&&req.method==='POST'){
 if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<16||!env.SESSION_SECRET)return json({error:'Administration non configurée.'},503);
 const ip=req.headers.get('CF-Connecting-IP')||'local', now=Date.now();
 const attempt=await env.DB.prepare('SELECT * FROM login_attempts WHERE ip=?').bind(ip).first();
 if(attempt&&now-attempt.started<900000&&attempt.attempts>=10)return json({error:'Trop de tentatives. Réessayez dans 15 minutes.'},429);
 await env.DB.prepare('INSERT INTO login_attempts(ip,attempts,started) VALUES (?,1,?) ON CONFLICT(ip) DO UPDATE SET attempts=CASE WHEN started<? THEN 1 ELSE attempts+1 END, started=CASE WHEN started<? THEN excluded.started ELSE started END').bind(ip,now,now-900000,now-900000).run();
 const b=await req.json();if(!await equal(String(b.password||''),env.ADMIN_PASSWORD))return json({error:'Mot de passe incorrect.'},401);
 await env.DB.prepare('DELETE FROM login_attempts WHERE ip=?').bind(ip).run();
 const exp=String(now+28800000);return json({ok:true},200,{'Set-Cookie':`session=${exp}.${await sign(exp,env.SESSION_SECRET)}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=28800`});
}
if(p==='/api/logout'&&req.method==='POST')return json({ok:true},200,{'Set-Cookie':'session=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0'});
if(p==='/api/orders'&&req.method==='POST'){
 const b=await req.json();if(!text(b.name,100)||(!/^\+?[\d\s()-]{9,20}$/.test(b.phone||'')||(b.phone.replace(/\D/g,'').length<9))||!text(b.city,100)||!text(b.address,500)||!Array.isArray(b.items)||!b.items.length||b.items.length>50)return json({error:'Vérifiez vos coordonnées et votre panier.'},400);
 const unique=new Set(),items=[];let total=0;
 for(const i of b.items){if(!Number.isInteger(i.id)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>20||unique.has(i.id))return json({error:'Panier invalide.'},400);unique.add(i.id);const product=await env.DB.prepare('SELECT * FROM products WHERE id=? AND active=1 AND price IS NOT NULL').bind(i.id).first();if(!product||product.stock<i.quantity)return json({error:'Un produit est indisponible. Actualisez votre panier.'},409);items.push({...product,quantity:i.quantity});total+=product.price*i.quantity;}
 const reference='PVC-'+crypto.randomUUID().slice(0,12).toUpperCase();
 // All statements are atomic. A stock guard rolls back the batch on a concurrent sale.
 const statements=[env.DB.prepare('INSERT INTO orders(reference,name,phone,city,address,total) VALUES (?,?,?,?,?,?)').bind(reference,b.name.trim(),b.phone.trim(),b.city.trim(),b.address.trim(),total)];
 for(const i of items){statements.push(env.DB.prepare('INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES ((SELECT id FROM orders WHERE reference=?),?,?,?,?)').bind(reference,i.id,i.name,i.price,i.quantity));statements.push(env.DB.prepare('UPDATE products SET stock=CASE WHEN stock>=? THEN stock-? ELSE NULL END WHERE id=?').bind(i.quantity,i.quantity,i.id));}
 await env.DB.batch(statements);return json({reference,total},201);
}
if(p.startsWith('/api/admin/')){
 if(!await auth(req,env))return json({error:'Connexion requise.'},401);
 if(p==='/api/admin/settings'&&req.method==='GET')return json(await readSettings(env.DB));
 if(p==='/api/admin/settings'&&req.method==='PUT'){const settings=validateSettings(await req.json());if(!settings)return json({error:'Vérifiez les coordonnées, les textes et le seuil de stock (1 à 1000).'},400);await env.DB.prepare('INSERT INTO store_settings(id,value) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(JSON.stringify(settings)).run();return json(settings);}
 if(p==='/api/admin/summary'&&req.method==='GET'){
 const settings=await readSettings(env.DB);
 const [products,orders,statuses,brands]=await Promise.all([
 env.DB.prepare('SELECT COUNT(*) total,SUM(active=1) published,SUM(stock=0) out_of_stock,SUM(stock>0 AND stock<=?) low_stock,SUM(stock) units,SUM(CASE WHEN active=1 THEN price*stock ELSE 0 END) stock_value FROM products').bind(settings.low_stock_threshold).first(),
 env.DB.prepare("SELECT COUNT(*) total,SUM(status='nouvelle') pending,SUM(CASE WHEN status='livrée' THEN total ELSE 0 END) revenue,SUM(CASE WHEN status IN ('nouvelle','confirmée','expédiée') THEN total ELSE 0 END) pipeline FROM orders").first(),
 env.DB.prepare('SELECT status,COUNT(*) count FROM orders GROUP BY status').all(),
 env.DB.prepare("SELECT brand,COUNT(*) count FROM products WHERE brand<>'' GROUP BY brand ORDER BY count DESC LIMIT 20").all()]);
 return json({products,orders,statuses:statuses.results,brands:brands.results});
 }
 if(p==='/api/admin/products'&&req.method==='GET'){if(url.searchParams.get('stock')==='low')url.searchParams.set('threshold',String((await readSettings(env.DB)).low_stock_threshold));return json(await catalogue(env.DB,url,true));}
 if(/^\/api\/admin\/products\/\d+$/.test(p)&&req.method==='GET'){
 const product=await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(Number(p.split('/').pop())).first();return product?json(product):json({error:'Produit introuvable.'},404);
 }
 if(p==='/api/admin/products'&&req.method==='POST'){
 let b;try{b=await readProductBody(req);}catch(error){return json({error:error.message==='Image trop volumineuse.'?error.message:'Données produit invalides.'},400);}
 if(!b||!text(b.name,250)||!text(b.category,80)||typeof b.brand!=='string'||b.brand.length>100||typeof b.description!=='string'||b.description.length>12000||!Number.isInteger(b.price)||b.price<1||b.price>10000000||!Number.isInteger(b.stock)||b.stock<0||b.stock>100000||typeof b.image!=='string'||b.image.length>2000||!validImageReference(b.image)||![0,1].includes(b.active)||(b.id!==undefined&&(!Number.isSafeInteger(b.id)||b.id<1)))return json({error:'Données produit invalides. Vérifiez les champs et la photo.'},400);
 const existing=b.id?await env.DB.prepare('SELECT image,images_json FROM products WHERE id=?').bind(b.id).first():null;if(b.id&&!existing)return json({error:'Produit introuvable.'},404);
 const upload=b.image_upload===undefined?null:decodeImageUpload(b.image_upload);if(b.image_upload!==undefined&&!upload)return json({error:'Photo invalide. Choisissez une image JPG, PNG ou WebP.'},400);
 if(b.image_mode!==undefined&&!['replace','append'].includes(b.image_mode))return json({error:'Choisissez le mode d’ajout de la photo.'},400);
 let gallery=[];try{gallery=JSON.parse(existing?.images_json||'[]').filter(image=>image&&validImageReference(image));}catch{}if(existing?.image&&!gallery.includes(existing.image))gallery.unshift(existing.image);
 let image=b.image;const statements=[];
 if(upload){const id=crypto.randomUUID(),path='/api/images/'+id;statements.push(env.DB.prepare('INSERT INTO product_images(id,data,mime) VALUES (?,?,?)').bind(id,Array.from(upload.bytes),upload.mime));if(b.image_mode==='append'&&existing?.image){image=existing.image;gallery.push(path);}else{image=path;gallery=[path,...gallery.filter(item=>item!==existing?.image)];}}
 else if(image!==existing?.image){gallery=image?[image,...gallery.filter(item=>item!==existing?.image&&item!==image)]:[];}
 const values=[b.name.trim(),b.brand.trim(),b.category,b.description,b.price,image,b.stock,b.active,JSON.stringify(gallery)];
 if(b.id)statements.push(env.DB.prepare('UPDATE products SET name=?,brand=?,category=?,description=?,price=?,image=?,stock=?,active=?,images_json=? WHERE id=?').bind(...values,b.id));else statements.push(env.DB.prepare('INSERT INTO products(name,brand,category,description,price,image,stock,active,images_json) VALUES (?,?,?,?,?,?,?,?,?)').bind(...values));
 await env.DB.batch(statements);return json({ok:true});}
 if(p==='/api/admin/orders'&&req.method==='GET'){const orders=(await env.DB.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all()).results;const items=(await env.DB.prepare('SELECT * FROM order_items WHERE order_id IN (SELECT id FROM orders ORDER BY id DESC LIMIT 500)').all()).results;return json(orders.map(o=>({...o,items:items.filter(i=>i.order_id===o.id)})));}
 if(p==='/api/admin/orders'&&req.method==='PATCH'){const b=await req.json();if(!['nouvelle','confirmée','expédiée','livrée','annulée'].includes(b.status)||!Number.isInteger(b.id))return json({error:'Statut invalide.'},400);await env.DB.prepare('UPDATE orders SET status=? WHERE id=?').bind(b.status,b.id).run();return json({ok:true});}
}
return json({error:'Introuvable.'},404);
}catch(e){console.error('API error',e.message);return json({error:'Opération impossible. Réessayez ou contactez la boutique.'},500);}
}};
