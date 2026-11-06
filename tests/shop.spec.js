import { test, expect } from '@playwright/test';
const origin={Origin:'http://localhost:8788'};
test('secure catalogue, checkout, dashboard and inventory workflow',async({page,request})=>{
 let r=await request.get('/api/admin/orders');expect(r.status()).toBe(401);
 r=await request.post('/api/login',{headers:origin,data:{password:'wrong'}});expect(r.status()).toBe(401);
 r=await request.post('/api/login',{headers:origin,data:{password:'local-test-password-only'}});expect(r.ok()).toBeTruthy();
 const name='Soin test '+Date.now();
 r=await request.post('/api/admin/products',{headers:origin,data:{name,brand:'Marque test',category:'Visage',description:'Description de test',price:12345,image:'',stock:3,active:1}});expect(r.ok()).toBeTruthy();
 const products=await (await request.get('/api/products')).json();const p=products.find(p=>p.name===name);expect(p.price).toBe(12345);
 r=await request.post('/api/orders',{data:{}});expect(r.status()).toBe(403);
 r=await request.post('/api/orders',{headers:origin,data:{name:'Test',phone:'bad',city:'Rabat',address:'Adresse',items:[{id:p.id,quantity:1}]}});expect(r.status()).toBe(400);
 r=await request.post('/api/orders',{headers:origin,data:{name:'Test',phone:'0612345678',city:'Rabat',address:'Adresse test',items:[{id:p.id,quantity:4}]}});expect(r.status()).toBe(409);
 await page.goto('/');await expect(page.getByRole('heading',{name:'Le soin de vous. La beauté en plus.'})).toBeVisible();
 await page.getByRole('button',{name:`Ajouter ${name} au panier`}).click();await page.getByRole('button',{name:/Panier/}).click();
 await page.getByLabel('Nom complet').fill('Cliente test');await page.getByLabel('Téléphone',{exact:true}).fill('0612345678');await page.getByLabel('Ville',{exact:true}).fill('Rabat');await page.getByLabel('Adresse de livraison').fill('10 Rue des tests');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirmer ma commande'}).click();
 await expect(page.getByRole('heading',{name:'Merci pour votre confiance.'})).toBeVisible();const confirmation=await page.locator('dialog strong').textContent();
 const orders=await (await request.get('/api/admin/orders')).json();const o=orders.find(o=>o.reference===confirmation);expect(o.name).toBe('Cliente test');expect(o.total).toBe(12345);expect(o.items[0].quantity).toBe(1);
 expect((await (await request.get('/api/products')).json()).find(x=>x.id===p.id).stock).toBe(2);
 r=await request.patch('/api/admin/orders',{headers:origin,data:{id:o.id,status:'confirmée'}});expect(r.ok()).toBeTruthy();
 await page.goto('/admin');await page.getByLabel('Mot de passe administrateur').fill('local-test-password-only');await page.getByRole('button',{name:'Se connecter'}).click();await expect(page.getByRole('heading',{name:'Tableau de bord'})).toBeVisible();await expect(page.getByText(confirmation,{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/dashboard.png',fullPage:true});
 await page.goto('/');await page.screenshot({path:'test-results/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 // Tampered client totals are ignored, and only one concurrent buyer can take the last units.
 const order={name:'Test concurrence',phone:'0612345678',city:'Rabat',address:'Adresse test',total:1,items:[{id:p.id,quantity:2,price:1}]};
 const results=await Promise.all([request.post('/api/orders',{headers:origin,data:order}),request.post('/api/orders',{headers:origin,data:order})]);expect(results.filter(r=>r.status()===201)).toHaveLength(1);const successful=await results.find(r=>r.status()===201).json();expect(successful.total).toBe(24690);
 expect((await (await request.get('/api/products')).json()).find(x=>x.id===p.id).stock).toBe(0);
 r=await request.post('/api/admin/products',{headers:origin,data:{...p,active:0}});expect(r.ok()).toBeTruthy();
 await request.post('/api/logout',{headers:origin});expect((await request.get('/api/admin/orders')).status()).toBe(401);
});
