import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync('catalogue-manifest.json','utf8'));
const origin={Origin:'http://localhost:8788'};
test('complete imported catalogue, category filtering, pagination and stock management',async({page,request})=>{
 const first=await (await request.get('/api/products?page=1')).json();expect(first.total).toBeGreaterThanOrEqual(manifest.sellable_formats);expect(first.items).toHaveLength(24);expect(first.pages).toBeGreaterThan(500);expect(first.items.every(p=>p.category==='Autres soins')).toBeTruthy();
 const second=await (await request.get('/api/products?page=2')).json();expect(first.items.map(p=>p.id).filter(id=>second.items.some(p=>p.id===id))).toHaveLength(0);
 const last=await (await request.get('/api/products?page=999999')).json();expect(last.page).toBe(last.pages);expect(last.items.length).toBeGreaterThan(0);
 const collections=await (await request.get('/api/collections')).json();expect(collections).toHaveLength(manifest.collections);
 const filtered=await (await request.get('/api/products?page=1&collection=a-derma')).json();expect(filtered.total).toBeGreaterThan(0);expect(filtered.total).toBeLessThan(100);
 expect((await (await request.get('/api/products?page=1&q=%27%20OR%201%3D1--')).json()).total).toBe(0);
 expect((await (await request.get('/api/products?page=1&q=%25')).json()).total).toBeLessThan(first.total);
 const candidate=second.items.find(p=>p.source_variant_id);expect(candidate).toBeTruthy();const original=await (await request.get('/api/products/'+candidate.id)).json();expect(original.stock).toBe(10);expect(original.price).toBeGreaterThan(0);expect(JSON.parse(original.images_json).length).toBeGreaterThan(0);
 // Exercise search and an exact collection through the real UI.
 await page.goto('/');await expect(page.locator('#products .product')).toHaveCount(24);await expect(page.locator('#collection-filter option')).toHaveCount(692);
 await page.locator('#collection-filter').selectOption('a-derma');await expect(page.locator('#catalogue-count')).toHaveText(filtered.total+' références et formats');
 await page.locator('#collection-filter').selectOption('');await page.getByRole('button',{name:'Suivant →',exact:true}).click();await expect(page.locator('#catalogue-pagination')).toContainText('Page 2 /');
 await page.getByRole('button',{name:`Ajouter ${candidate.name} au panier`,exact:true}).click();
 // The cart must resolve its own IDs, even after the visible catalogue changes.
 await page.getByLabel('Rechercher un produit').fill('zzzz-nothing-exists');await expect(page.getByRole('heading',{name:'Aucun soin trouvé'})).toBeVisible();
 await page.getByRole('button',{name:/Panier/}).click();await expect(page.locator('dialog')).toContainText(candidate.name);await expect(page.getByRole('button',{name:'Confirmer ma commande'})).toBeVisible();await page.getByRole('button',{name:'Fermer',exact:true}).click();
 // A real imported format can be ordered; price is still enforced on the server.
 try{
 const created=await request.post('/api/orders',{headers:origin,data:{name:'Test catalogue',phone:'0612345678',city:'Rabat',address:'Adresse de test',items:[{id:candidate.id,quantity:1}],total:1}});expect(created.status()).toBe(201);expect((await created.json()).total).toBe(original.price);
 expect((await (await request.get('/api/products/'+candidate.id)).json()).stock).toBe(9);
 await request.post('/api/login',{headers:origin,data:{password:'local-test-password-only'}});
 await page.goto('/admin');await page.getByLabel('Mot de passe administrateur').fill('local-test-password-only');await page.getByRole('button',{name:'Se connecter'}).click();
 await page.getByLabel('Rechercher une référence').fill(candidate.name);await page.locator('#admin-search').getByRole('button',{name:'Rechercher',exact:true}).click();await page.locator(`[data-edit="${candidate.id}"]`).click();await expect(page.getByLabel('Stock',{exact:true})).toHaveValue('9');await page.getByLabel('Stock',{exact:true}).fill('7');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.locator('dialog')).not.toBeVisible();expect((await (await request.get('/api/products/'+candidate.id)).json()).stock).toBe(7);
 }finally{await request.post('/api/login',{headers:origin,data:{password:'local-test-password-only'}});const restore=await request.post('/api/admin/products',{headers:origin,data:original});expect(restore.ok()).toBeTruthy();}
});

test('thirteen source categories and the compact category menu remain accessible',async({page,request})=>{
 const counts=JSON.parse(fs.readFileSync('navigation-category-counts.json','utf8'));
 const names=Object.keys(counts);
 for(const name of names){const r=await request.get('/api/products?'+new URLSearchParams({page:1,category:name}));expect(r.ok(),name).toBeTruthy();const data=await r.json();expect(data.total,name).toBe(counts[name].formats);expect(data.items.length,name).toBeGreaterThan(0);}
 await page.goto('/');await expect(page.locator('.menu-category:visible')).toHaveCount(13);await expect(page.locator('.category-book')).toHaveCount(0);
 for(const name of names)await expect(page.getByRole('button',{name:'Découvrir '+name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Découvrir Sport',exact:true}).click();await expect(page.locator('#catalogue-count')).toHaveText(counts.Sport.formats+' références et formats');
 await page.getByRole('button',{name:'Découvrir Minceur',exact:true}).click();await expect(page.locator('#catalogue-count')).toHaveText(counts.Minceur.formats+' références et formats');
 await page.getByRole('button',{name:'Découvrir K-beauty',exact:true}).click();await expect(page.locator('#catalogue-count')).toHaveText(counts['K-beauty'].formats+' références et formats');
 await expect(page.locator('[data-filter]')).toHaveCount(14);
});
